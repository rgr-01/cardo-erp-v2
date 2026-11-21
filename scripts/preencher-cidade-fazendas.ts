/**
 * Preenche cidade/UF das fazendas que têm coordenada: acha o município cujo
 * limite (malha pública do IBGE) contém o ponto. Só baixa dados públicos;
 * nenhuma coordenada de cliente sai da máquina. Fora de qualquer limite
 * (a malha "mínima" é simplificada), cai no município de centro mais próximo.
 * Não mexe no cadastro do cliente (usado em NF-e).
 *
 *   npx tsx scripts/preencher-cidade-fazendas.ts <municipios.csv> <estados.csv>          # simulação
 *   npx tsx scripts/preencher-cidade-fazendas.ts <municipios.csv> <estados.csv> --aplicar
 *
 * municipios.csv / estados.csv: github.com/kelvins/municipios-brasileiros (pasta csv).
 */
import "dotenv/config";
import { readFileSync } from "fs";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const [arqMunicipios, arqEstados] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const APLICAR = process.argv.includes("--aplicar");
if (!arqMunicipios || !arqEstados) throw new Error("Informe municipios.csv e estados.csv.");

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const linhas = (arq: string) =>
  readFileSync(arq, "utf-8").replace(/^﻿/, "").trim().split(/\r?\n/).slice(1).map((l) => l.split(","));

const ufPorCodigo = new Map(linhas(arqEstados).map(([codigo, uf]) => [codigo, uf]));
const municipios = linhas(arqMunicipios).map(([codigo, nome, lat, lng, , codUf]) => ({
  codigo,
  nome,
  uf: ufPorCodigo.get(codUf) ?? "",
  lat: Number(lat),
  lng: Number(lng),
}));

// Distância aproximada em km (equirretangular: sobra precisão pra esse uso).
function km(lat1: number, lng1: number, lat2: number, lng2: number) {
  const x = ((lng2 - lng1) * Math.PI) / 180 * Math.cos((((lat1 + lat2) / 2) * Math.PI) / 180);
  const y = ((lat2 - lat1) * Math.PI) / 180;
  return Math.sqrt(x * x + y * y) * 6371;
}

function maisProximos(lat: number, lng: number, n: number) {
  return municipios
    .map((m) => ({ ...m, distancia: km(lat, lng, m.lat, m.lng) }))
    .sort((a, b) => a.distancia - b.distancia)
    .slice(0, n);
}

type Anel = number[][];
type Poligono = { codigo: string; aneis: Anel[]; minX: number; maxX: number; minY: number; maxY: number };

function dentroDoAnel(x: number, y: number, anel: Anel) {
  let dentro = false;
  for (let i = 0, j = anel.length - 1; i < anel.length; j = i++) {
    const [xi, yi] = anel[i];
    const [xj, yj] = anel[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) dentro = !dentro;
  }
  return dentro;
}

const poligonosPorUf = new Map<string, Poligono[]>();

async function carregarUf(codUf: string): Promise<Poligono[]> {
  const cache = poligonosPorUf.get(codUf);
  if (cache) return cache;
  const url = `https://servicodados.ibge.gov.br/api/v3/malhas/estados/${codUf}?intrarregiao=municipio&formato=application/vnd.geo+json&qualidade=minima`;
  const geo = (await (await fetch(url)).json()) as {
    features: { properties: { codarea: string }; geometry: { type: string; coordinates: unknown } }[];
  };
  const lista: Poligono[] = [];
  for (const f of geo.features) {
    const partes = (f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates) as Anel[][];
    for (const aneis of partes) {
      const pts = aneis[0];
      lista.push({
        codigo: f.properties.codarea,
        aneis,
        minX: Math.min(...pts.map((p) => p[0])),
        maxX: Math.max(...pts.map((p) => p[0])),
        minY: Math.min(...pts.map((p) => p[1])),
        maxY: Math.max(...pts.map((p) => p[1])),
      });
    }
  }
  poligonosPorUf.set(codUf, lista);
  return lista;
}

async function municipioDoPonto(lat: number, lng: number) {
  const candidatos = maisProximos(lat, lng, 40);
  // UFs dos 40 municípios de centro mais próximo cobrem as divisas de estado.
  for (const codUf of new Set(candidatos.map((c) => c.codigo.slice(0, 2)))) {
    for (const p of await carregarUf(codUf)) {
      if (lng < p.minX || lng > p.maxX || lat < p.minY || lat > p.maxY) continue;
      if (dentroDoAnel(lng, lat, p.aneis[0]) && !p.aneis.slice(1).some((b) => dentroDoAnel(lng, lat, b))) {
        const m = municipios.find((x) => x.codigo === p.codigo);
        if (m) return { ...m, distancia: km(lat, lng, m.lat, m.lng), porLimite: true };
      }
    }
  }
  return { ...candidatos[0], porLimite: false };
}

async function main() {
  const fazendas = await prisma.fazenda.findMany({
    where: { cidade: null, latitude: { not: null }, longitude: { not: null } },
    select: { id: true, nome: true, latitude: true, longitude: true },
  });
  console.log(`Fazendas sem cidade e com coordenada: ${fazendas.length}`);

  const resultados: ({ id: string } & Awaited<ReturnType<typeof municipioDoPonto>>)[] = [];
  for (const f of fazendas) resultados.push({ id: f.id, ...(await municipioDoPonto(f.latitude!, f.longitude!)) });
  const contagem = new Map<string, number>();
  for (const r of resultados) contagem.set(`${r.nome}/${r.uf}`, (contagem.get(`${r.nome}/${r.uf}`) ?? 0) + 1);
  console.table([...contagem].sort((a, b) => b[1] - a[1]).slice(0, 25).map(([cidade, n]) => ({ cidade, fazendas: n })));
  console.log(
    `Municípios distintos: ${contagem.size}. Achados pelo limite: ${resultados.filter((r) => r.porLimite).length}; ` +
      `pelo centro mais próximo (fora de qualquer limite): ${resultados.filter((r) => !r.porLimite).length}`
  );

  if (process.argv.includes("--debug")) {
    const fora = resultados.filter((r) => !r.porLimite).slice(0, 8);
    for (const r of fora) {
      const f = fazendas.find((x) => x.id === r.id)!;
      console.log(f.latitude, f.longitude, "->", r.nome, r.uf, Math.round(r.distancia), "km");
    }
  }
  if (!APLICAR) return console.log("Simulação: nada foi gravado. Use --aplicar.");
  for (const r of resultados) {
    await prisma.fazenda.update({ where: { id: r.id }, data: { cidade: r.nome, uf: r.uf } });
  }
  console.log(`Atualizadas ${resultados.length} fazendas.`);
}

main().finally(() => prisma.$disconnect());
