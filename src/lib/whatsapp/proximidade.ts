// Cliente mais próximo de uma localização mandada no WhatsApp — usado no
// check-in pra confirmar "você está na Fazenda X?" em vez de pedir o nome.

import { prisma } from "@/lib/prisma";

// Localização mandada há mais tempo que isso não serve pra check-in (o
// consultor já pode estar em outra fazenda).
export const VALIDADE_LOCALIZACAO_MS = 2 * 60 * 60 * 1000;

export type Localizacao = { latitude: number; longitude: number; recebidaEm?: number };

export function localizacaoRecente(loc: Localizacao | null | undefined): Localizacao | undefined {
  if (!loc?.recebidaEm) return undefined; // sem data = salva antes do prazo existir
  return Date.now() - loc.recebidaEm <= VALIDADE_LOCALIZACAO_MS ? loc : undefined;
}

// Distância em km entre duas coordenadas (fórmula de Haversine).
export function distanciaKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// Candidato de check-in: o cliente (coordenada do cadastro dele) ou uma
// fazenda específica do cliente (coordenada da fazenda). Quando vem a
// fazenda, o agente já sabe de qual fazenda é a visita sem perguntar.
export type ClienteProximo = {
  id: string;
  nome: string;
  fazenda: { id: string; nome: string } | null;
  distancia_km: number;
};

export async function clientesProximos(
  latitude: number,
  longitude: number,
  limite = 5
): Promise<ClienteProximo[]> {
  const comCoordenada = { latitude: { not: null }, longitude: { not: null } };
  const [clientes, fazendas] = await Promise.all([
    prisma.cliente.findMany({
      where: comCoordenada,
      select: { id: true, nome: true, latitude: true, longitude: true },
    }),
    prisma.fazenda.findMany({
      where: comCoordenada,
      select: {
        id: true,
        nome: true,
        latitude: true,
        longitude: true,
        cliente: { select: { id: true, nome: true } },
      },
    }),
  ]);
  const km = (lat: number, lon: number) =>
    Math.round(distanciaKm(latitude, longitude, lat, lon) * 10) / 10;
  return [
    ...clientes.map((c) => ({
      id: c.id,
      nome: c.nome,
      fazenda: null,
      distancia_km: km(c.latitude!, c.longitude!),
    })),
    ...fazendas.map((f) => ({
      id: f.cliente.id,
      nome: f.cliente.nome,
      fazenda: { id: f.id, nome: f.nome },
      distancia_km: km(f.latitude!, f.longitude!),
    })),
  ]
    .sort((a, b) => a.distancia_km - b.distancia_km)
    .slice(0, limite);
}

// Marcação que acompanha a localização recebida, já com os candidatos — o
// agente pergunta "está na X?" sem precisar chamar ferramenta.
export async function descreverLocalizacao(loc: Localizacao): Promise<string> {
  const proximos = await clientesProximos(loc.latitude, loc.longitude, 3).catch(() => []);
  const perto = proximos.filter((c) => c.distancia_km <= 5);
  if (perto.length === 0) {
    return "[o consultor enviou a localização atual; nenhum cliente com localização cadastrada num raio de 5 km]";
  }
  const lista = perto
    .map((c) =>
      c.fazenda
        ? `${c.fazenda.nome} do cliente ${c.nome} (cliente id ${c.id}, fazenda_id ${c.fazenda.id}, ${c.distancia_km} km)`
        : `${c.nome} (id ${c.id}, ${c.distancia_km} km)`
    )
    .join("; ");
  return `[o consultor enviou a localização atual; clientes cadastrados mais próximos: ${lista}]`;
}
