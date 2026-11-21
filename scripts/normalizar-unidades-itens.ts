/**
 * Normaliza PropostaItem.unidade pros valores padronizados do sistema
 * (Lt, ml, Kg, g, Ton, Sc, Cx, Un, Dose — ver lib/unidades.ts). Itens antigos
 * foram digitados livremente ("litro", "L", "kg", "saca"...); este script só
 * troca o texto, não mexe em quantidade nem preço.
 *
 * npx tsx scripts/normalizar-unidades-itens.ts           # simulação
 * npx tsx scripts/normalizar-unidades-itens.ts --aplicar # aplica de verdade
 */
import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { UNIDADES_ITEM, type UnidadeItem } from "../src/lib/unidades";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL, max: 1 }) });

const normalizar = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

// Chaves já normalizadas (sem acento/maiúscula) → unidade padrão. Cobre as
// variações mais comuns; o que não bater aqui entra em "semCorrespondencia"
// pra revisar na mão em vez de adivinhar.
const MAPA: Record<string, UnidadeItem> = {
  l: "Lt", lt: "Lt", lts: "Lt", litro: "Lt", litros: "Lt",
  ml: "ml", mls: "ml", mililitro: "ml", mililitros: "ml",
  kg: "Kg", kgs: "Kg", quilo: "Kg", quilos: "Kg", quilograma: "Kg", quilogramas: "Kg",
  g: "g", gr: "g", grama: "g", gramas: "g",
  ton: "Ton", t: "Ton", tonelada: "Ton", toneladas: "Ton",
  sc: "Sc", saco: "Sc", sacos: "Sc", saca: "Sc", sacas: "Sc",
  cx: "Cx", caixa: "Cx", caixas: "Cx",
  un: "Un", und: "Un", unid: "Un", uni: "Un", unidade: "Un", unidades: "Un",
  ds: "Dose", dose: "Dose", doses: "Dose",
};

async function main() {
  const itens = await prisma.propostaItem.findMany({
    where: { unidade: { not: null } },
    select: { id: true, unidade: true },
  });

  const plano: { id: string; de: string; para: UnidadeItem }[] = [];
  const semCorrespondencia = new Set<string>();
  for (const item of itens) {
    const bruto = item.unidade!.trim();
    if (!bruto) continue;
    if ((UNIDADES_ITEM as readonly string[]).includes(bruto)) continue; // já padronizado
    const novo = MAPA[normalizar(bruto)];
    if (!novo) {
      semCorrespondencia.add(bruto);
      continue;
    }
    plano.push({ id: item.id, de: bruto, para: novo });
  }

  console.log(
    JSON.stringify(
      { totalComUnidade: itens.length, aAtualizar: plano.length, semCorrespondencia: [...semCorrespondencia], plano },
      null,
      2
    )
  );
  if (!process.argv.includes("--aplicar")) return;

  await prisma.$transaction(plano.map((p) => prisma.propostaItem.update({ where: { id: p.id }, data: { unidade: p.para } })));
  console.log(`Atualização concluída: ${plano.length} item(ns).`);
}

main()
  .catch((erro) => {
    console.error(erro instanceof Error ? erro.message : "Falha na normalização");
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
