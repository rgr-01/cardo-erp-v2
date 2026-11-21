// Fila do webhook do WhatsApp (o serviço roda com uma réplica só).
//
// Na fazenda quase nunca tem internet: o consultor grava áudio, tira foto e
// escreve o dia todo, e o WhatsApp manda tudo de uma vez quando o sinal volta.
// Por isso:
//
// - Persistência: toda mensagem é gravada no banco antes do 200 pro provedor.
//   Se o servidor reiniciar no meio da rajada, a varredura retoma daqui.
// - Deduplicação: reentrega do provedor (mesmo id) não é processada de novo —
//   senão um relatório ou despesa podia ser gravado duas vezes.
// - Agrupamento: mensagens do mesmo número que chegam juntas viram UM lote,
//   e o agente responde uma vez só sobre tudo (em vez de um resumo pela metade
//   a cada áudio). Rajada que estava presa no celular espera mais, porque o
//   restante ainda pode estar subindo num sinal fraco.
// - Fila por número: lotes da mesma pessoa rodam em ordem. Em paralelo, os
//   dois liam o mesmo estado da conversa e o último a salvar apagava o outro.

import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import type { MensagemRecebida } from "@/lib/whatsapp/tipos";
import { refSemBase64 } from "@/lib/whatsapp/vinculo";
import { processarLote } from "@/lib/whatsapp/conversa";

// Enviada há mais que isso antes de chegar = estava presa no celular sem sinal.
export const ATRASO_OFFLINE_MS = 2 * 60 * 1000;

// Silêncio esperado depois da última mensagem antes de processar o lote.
const ESPERA_AO_VIVO_MS = 2500;
const ESPERA_OFFLINE_MS = 20 * 1000;
// Teto: mensagem chegando sem parar não segura o lote pra sempre.
const ESPERA_MAX_MS = 90 * 1000;

const MAX_POR_LOTE = 60;
const MAX_TENTATIVAS = 3;
// Lote "processando" há mais que isso = o servidor caiu no meio; pode retomar.
const TRAVA_EXPIRADA_MS = 10 * 60 * 1000;
const INTERVALO_VARREDURA_MS = 60 * 1000;
const RETENCAO_MS = 3 * 24 * 60 * 60 * 1000;

const TTL_DEDUP_MS = 30 * 60 * 1000;
const MAX_IDS = 2000;

const idsVistos = new Map<string, number>();

// Filtro rápido em memória pra reentregas imediatas; a chave primária no
// banco cobre o resto (inclusive depois de reiniciar).
function mensagemRepetida(id: string | undefined): boolean {
  if (!id) return false;
  const agora = Date.now();

  if (idsVistos.size >= MAX_IDS) {
    for (const [chave, visto] of idsVistos) {
      if (agora - visto > TTL_DEDUP_MS || idsVistos.size >= MAX_IDS) {
        idsVistos.delete(chave);
      } else {
        break;
      }
    }
  }

  const visto = idsVistos.get(id);
  if (visto !== undefined && agora - visto < TTL_DEDUP_MS) return true;
  idsVistos.set(id, agora);
  return false;
}

// Versão completa (com o base64 da mídia) das mensagens ainda não
// processadas. O banco guarda a foto sem base64 — ela é baixada de novo pela
// mensagem original —, mas o caminho normal usa a daqui, sem baixar.
const completas = new Map<string, MensagemRecebida>();

// Foto não vai com base64 pro banco (pesa); áudio vai, pra transcrição não
// depender de baixar de novo se o servidor reiniciar.
function paraBanco(msg: MensagemRecebida): Prisma.InputJsonValue {
  const midia = msg.midia && msg.tipo !== "audio" ? refSemBase64(msg.midia) : msg.midia;
  return JSON.parse(JSON.stringify({ ...msg, midia })) as Prisma.InputJsonValue;
}

// Grava as mensagens do webhook e agenda o processamento. Devolve só depois
// de gravar — o 200 pro provedor sai com tudo já seguro no banco.
export async function receberMensagens(mensagens: MensagemRecebida[]): Promise<void> {
  const novas = mensagens
    .filter((msg) => !mensagemRepetida(msg.id))
    .map((msg) => ({ chave: msg.id ?? `sem-id-${crypto.randomUUID()}`, msg }));
  if (novas.length === 0) return;

  const existentes = await prisma.whatsAppMensagemRecebida.findMany({
    where: { id: { in: novas.map((n) => n.chave) } },
    select: { id: true },
  });
  const jaVistas = new Set(existentes.map((e) => e.id));
  const inserir = novas.filter((n) => !jaVistas.has(n.chave));
  if (inserir.length === 0) return;

  // A fila fica na empresa do número vinculado (sem vínculo: a padrão).
  const vinculos = await prisma.whatsAppVinculo.findMany({
    where: { waId: { in: [...new Set(inserir.map(({ msg }) => msg.waId))] } },
    select: { waId: true, empresaId: true },
  });
  const empresaDoNumero = new Map(vinculos.map((v) => [v.waId, v.empresaId]));

  await prisma.whatsAppMensagemRecebida.createMany({
    data: inserir.map(({ chave, msg }) => ({
      id: chave,
      waId: msg.waId,
      ...(empresaDoNumero.has(msg.waId) ? { empresaId: empresaDoNumero.get(msg.waId) } : {}),
      mensagem: paraBanco(msg),
      enviadaEm: new Date(msg.enviadaEm),
    })),
    skipDuplicates: true,
  });

  const agora = Date.now();
  for (const { chave, msg } of inserir) {
    completas.set(chave, msg);
    agendarLote(msg.waId, agora - msg.enviadaEm > ATRASO_OFFLINE_MS);
  }
}

const lotes = new Map<string, { timer: ReturnType<typeof setTimeout>; desde: number }>();

function agendarLote(waId: string, atrasada: boolean) {
  const atual = lotes.get(waId);
  const desde = atual?.desde ?? Date.now();
  if (atual) clearTimeout(atual.timer);

  const espera = atrasada ? ESPERA_OFFLINE_MS : ESPERA_AO_VIVO_MS;
  const restante = Math.max(0, desde + ESPERA_MAX_MS - Date.now());
  const timer = setTimeout(() => {
    lotes.delete(waId);
    void enfileirarPorNumero(waId, () => processarPendentes(waId));
  }, Math.min(espera, restante));
  lotes.set(waId, { timer, desde });
}

async function processarPendentes(waId: string): Promise<void> {
  const agora = Date.now();
  const linhas = await prisma.whatsAppMensagemRecebida.findMany({
    where: {
      waId,
      processadaEm: null,
      tentativas: { lt: MAX_TENTATIVAS },
      OR: [
        { processandoDesde: null },
        { processandoDesde: { lt: new Date(agora - TRAVA_EXPIRADA_MS) } },
      ],
    },
    orderBy: [{ enviadaEm: "asc" }, { recebidaEm: "asc" }],
    take: MAX_POR_LOTE,
  });
  if (linhas.length === 0) return;

  const ids = linhas.map((l) => l.id);
  await prisma.whatsAppMensagemRecebida.updateMany({
    where: { id: { in: ids } },
    data: { processandoDesde: new Date(), tentativas: { increment: 1 } },
  });

  const mensagens = linhas.map(
    (l) => completas.get(l.id) ?? (l.mensagem as unknown as MensagemRecebida)
  );
  const atrasada = linhas.some(
    (l) => l.recebidaEm.getTime() - l.enviadaEm.getTime() > ATRASO_OFFLINE_MS
  );

  try {
    await processarLote(waId, mensagens, { atrasada });
    await prisma.whatsAppMensagemRecebida.updateMany({
      where: { id: { in: ids } },
      data: { processadaEm: new Date() },
    });
  } catch (error) {
    console.error("[WhatsApp fila] erro ao processar lote:", error);
    // Solta a trava: a varredura tenta de novo (até MAX_TENTATIVAS).
    await prisma.whatsAppMensagemRecebida
      .updateMany({ where: { id: { in: ids } }, data: { processandoDesde: null } })
      .catch(() => {});
  } finally {
    for (const id of ids) completas.delete(id);
  }

  // Rajada maior que um lote: o resto vem logo em seguida.
  if (linhas.length === MAX_POR_LOTE) {
    void enfileirarPorNumero(waId, () => processarPendentes(waId));
  }
}

const filas = new Map<string, Promise<void>>();

function enfileirarPorNumero(waId: string, tarefa: () => Promise<void>): Promise<void> {
  const anterior = filas.get(waId) ?? Promise.resolve();
  // `anterior` nunca rejeita (o catch abaixo segura), então a próxima sempre roda.
  const atual = anterior.then(tarefa).catch((error) => {
    console.error("[WhatsApp fila] erro ao processar mensagem:", error);
  });
  filas.set(waId, atual);
  // Limpa a entrada quando a fila daquele número esvazia.
  void atual.then(() => {
    if (filas.get(waId) === atual) filas.delete(waId);
  });
  return atual;
}

// Retoma o que ficou pendente (servidor reiniciou, lote deu erro) e apaga o
// histórico antigo da fila. Roda no boot (instrumentation.ts) e a cada minuto.
async function varrer(): Promise<void> {
  const agora = Date.now();
  const pendentes = await prisma.whatsAppMensagemRecebida.findMany({
    where: {
      processadaEm: null,
      tentativas: { lt: MAX_TENTATIVAS },
      recebidaEm: { lt: new Date(agora - ESPERA_MAX_MS) },
      OR: [
        { processandoDesde: null },
        { processandoDesde: { lt: new Date(agora - TRAVA_EXPIRADA_MS) } },
      ],
    },
    select: { waId: true },
    distinct: ["waId"],
  });
  for (const { waId } of pendentes) {
    if (lotes.has(waId) || filas.has(waId)) continue; // já vai rodar
    void enfileirarPorNumero(waId, () => processarPendentes(waId));
  }

  await prisma.whatsAppMensagemRecebida.deleteMany({
    where: { recebidaEm: { lt: new Date(agora - RETENCAO_MS) } },
  });
}

const globalVarredura = globalThis as unknown as { __varreduraWhatsApp?: boolean };

export function iniciarVarreduraFila(): void {
  if (globalVarredura.__varreduraWhatsApp) return;
  globalVarredura.__varreduraWhatsApp = true;
  const rodar = () =>
    varrer().catch((error) => console.error("[WhatsApp fila] falha na varredura:", error));
  setTimeout(rodar, 5000);
  setInterval(rodar, INTERVALO_VARREDURA_MS).unref?.();
}
