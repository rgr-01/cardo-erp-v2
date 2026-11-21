// Combinados das visitas ("volto quinta pra ver a aplicação", "levar amostra
// de solo"): o bot registra (registrar_combinado), mostra ao preparar a
// próxima visita do cliente (contexto_cliente), lembra no dia pelo WhatsApp
// (api/cron/agenda-bot) e dá baixa quando o consultor conta que fez.
import { prisma } from "@/lib/prisma";

export async function criarCombinado(dados: {
  texto: string;
  clienteId: string;
  consultorId: string;
  relatorioId?: string | null;
  dataPrevista?: Date | null;
}) {
  return prisma.combinado.create({
    data: {
      texto: dados.texto.trim().slice(0, 500),
      clienteId: dados.clienteId,
      consultorId: dados.consultorId,
      relatorioId: dados.relatorioId ?? null,
      dataPrevista: dados.dataPrevista ?? null,
    },
    select: { id: true, texto: true, dataPrevista: true },
  });
}

export async function combinadosPendentes(filtro: { clienteId?: string; consultorId?: string; ate?: Date }) {
  return prisma.combinado.findMany({
    where: {
      status: "PENDENTE",
      ...(filtro.clienteId ? { clienteId: filtro.clienteId } : {}),
      ...(filtro.consultorId ? { consultorId: filtro.consultorId } : {}),
      ...(filtro.ate ? { dataPrevista: { lte: filtro.ate } } : {}),
    },
    orderBy: [{ dataPrevista: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
    select: {
      id: true, texto: true, dataPrevista: true, createdAt: true, consultorId: true,
      cliente: { select: { id: true, nome: true } },
    },
    take: 50,
  });
}

export async function concluirCombinado(id: string, status: "FEITO" | "CANCELADO") {
  return prisma.combinado.update({
    where: { id },
    data: { status, concluidoEm: new Date() },
    select: { id: true, texto: true, status: true, consultorId: true },
  });
}
