// Cliente para a Evolution API v2 (WhatsApp não-oficial, self-hosted).
// Rotas confirmadas no código-fonte da Evolution:
//   POST /message/sendText/{instancia}              body { number, text }
//   POST /chat/getBase64FromMediaMessage/{instancia} body { message, convertToMp4 }
// Autenticação por header "apikey" (AUTHENTICATION_API_KEY do serviço).

import crypto from "node:crypto";
import { timestampEmMs, type MensagemRecebida, type Midia, type RefMidia } from "./tipos";

const BASE_URL = (process.env.EVOLUTION_API_URL || "").replace(/\/+$/, "");
const API_KEY = process.env.EVOLUTION_API_KEY || "";
const INSTANCIA = process.env.EVOLUTION_INSTANCE || "";
const WEBHOOK_TOKEN = process.env.WHATSAPP_WEBHOOK_TOKEN || "";

const TAMANHO_MAX_BYTES = 8 * 1024 * 1024; // mesmo teto das despesas/visitas

export function whatsappConfigurado(): boolean {
  return Boolean(BASE_URL && API_KEY && INSTANCIA);
}

// Número do próprio bot, exibido na tela pra quem for vincular saber pra onde
// mandar a mensagem. Não dá pra descobrir isso via API de forma confiável em
// toda config da Evolution, então é uma env var só de exibição.
export function numeroDoBot(): string | null {
  return process.env.WHATSAPP_NUMERO_BOT || null;
}

// A Evolution não assina o webhook (diferente da Meta, que manda HMAC).
// A proteção é um token compartilhado no header ou na query da URL cadastrada.
export function autorizarWebhook(request: Request, _bodyRaw: string): boolean {
  void _bodyRaw;
  if (!WEBHOOK_TOKEN) return false; // sem token configurado, recusa (falha fechado)

  const url = new URL(request.url);
  const recebido =
    request.headers.get("x-webhook-token") || url.searchParams.get("token") || "";
  if (!recebido) return false;

  const a = Buffer.from(recebido);
  const b = Buffer.from(WEBHOOK_TOKEN);
  if (a.byteLength !== b.byteLength) return false;
  return crypto.timingSafeEqual(a, b);
}

// Handshake de verificação é coisa da Meta; a Evolution não faz GET de validação.
export function responderVerificacao(_request: Request): Response | null {
  void _request;
  return null;
}

// true = a Evolution aceitou a mensagem.
export async function enviarMensagemTexto(waId: string, texto: string): Promise<boolean> {
  if (!whatsappConfigurado()) {
    console.warn("[Evolution] Envio ignorado — credenciais não configuradas.");
    return false;
  }
  try {
    const resp = await fetch(`${BASE_URL}/message/sendText/${INSTANCIA}`, {
      method: "POST",
      headers: { apikey: API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ number: waId, text: texto.slice(0, 4096) }),
    });
    if (!resp.ok) {
      const erro = await resp.text().catch(() => "");
      console.error("[Evolution] Falha ao enviar mensagem:", resp.status, erro);
      return false;
    }
    return true;
  } catch (error) {
    console.error("[Evolution] Erro de rede ao enviar mensagem:", error);
    return false;
  }
}

// Mensagem de voz (ogg/opus). A Evolution reencoda pro formato do WhatsApp
// com `encoding: true`, então aparece como áudio gravado, não como arquivo.
export async function enviarAudio(waId: string, audio: Buffer): Promise<boolean> {
  if (!whatsappConfigurado()) return false;
  try {
    const resp = await fetch(`${BASE_URL}/message/sendWhatsAppAudio/${INSTANCIA}`, {
      method: "POST",
      headers: { apikey: API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ number: waId, audio: audio.toString("base64"), encoding: true }),
    });
    if (!resp.ok) {
      const erro = await resp.text().catch(() => "");
      console.error("[Evolution] Falha ao enviar áudio:", resp.status, erro);
      return false;
    }
    return true;
  } catch (error) {
    console.error("[Evolution] Erro de rede ao enviar áudio:", error);
    return false;
  }
}

// Reage a uma mensagem do consultor (ex.: ✅ na descrição de foto anotada) —
// confirma sem mandar uma mensagem nova a cada descrição.
export async function reagir(waId: string, mensagemId: string, emoji: string): Promise<void> {
  if (!whatsappConfigurado()) return;
  try {
    const resp = await fetch(`${BASE_URL}/message/sendReaction/${INSTANCIA}`, {
      method: "POST",
      headers: { apikey: API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({
        key: { remoteJid: `${waId}@s.whatsapp.net`, fromMe: false, id: mensagemId },
        reaction: emoji,
      }),
    });
    if (!resp.ok) {
      const erro = await resp.text().catch(() => "");
      console.warn("[Evolution] Falha ao reagir:", resp.status, erro);
    }
  } catch (error) {
    console.warn("[Evolution] Erro de rede ao reagir:", error);
  }
}

// Mostra "digitando…" pro consultor enquanto o agente pensa. A Evolution segura
// a requisição pelo `delay` e depois volta pra "paused" — por isso não é
// aguardada; a mensagem de resposta chegando já apaga o indicador.
export function enviarDigitando(waId: string): void {
  if (!whatsappConfigurado()) return;
  fetch(`${BASE_URL}/chat/sendPresence/${INSTANCIA}`, {
    method: "POST",
    headers: { apikey: API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ number: waId, presence: "composing", delay: 25000 }),
  }).catch((error) => {
    console.warn("[Evolution] Falha ao enviar presença:", error);
  });
}

export async function enviarDocumento(
  waId: string,
  buffer: Buffer,
  nomeArquivo: string,
  mimetype: string,
  legenda?: string
): Promise<boolean> {
  if (!whatsappConfigurado()) {
    console.warn("[Evolution] Envio de documento ignorado — credenciais não configuradas.");
    return false;
  }
  try {
    const resp = await fetch(`${BASE_URL}/message/sendMedia/${INSTANCIA}`, {
      method: "POST",
      headers: { apikey: API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({
        number: waId,
        mediatype: "document",
        mimetype,
        fileName: nomeArquivo,
        caption: legenda,
        media: buffer.toString("base64"),
      }),
    });
    if (!resp.ok) {
      const erro = await resp.text().catch(() => "");
      console.error("[Evolution] Falha ao enviar documento:", resp.status, erro);
      return false;
    }
    return true;
  } catch (error) {
    console.error("[Evolution] Erro de rede ao enviar documento:", error);
    return false;
  }
}

export async function enviarImagem(
  waId: string,
  buffer: Buffer,
  mimetype: string,
  legenda?: string
): Promise<boolean> {
  if (!whatsappConfigurado()) {
    console.warn("[Evolution] Envio de imagem ignorado — credenciais não configuradas.");
    return false;
  }
  try {
    const resp = await fetch(`${BASE_URL}/message/sendMedia/${INSTANCIA}`, {
      method: "POST",
      headers: { apikey: API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({
        number: waId,
        mediatype: "image",
        mimetype,
        caption: legenda,
        media: buffer.toString("base64"),
      }),
    });
    if (!resp.ok) {
      const erro = await resp.text().catch(() => "");
      console.error("[Evolution] Falha ao enviar imagem:", resp.status, erro);
      return false;
    }
    return true;
  } catch (error) {
    console.error("[Evolution] Erro de rede ao enviar imagem:", error);
    return false;
  }
}

export async function baixarMidia(ref: RefMidia): Promise<Midia | null> {
  if (ref.transporte !== "evolution") return null;
  if (!whatsappConfigurado()) return null;

  // Caminho rápido: a Evolution já mandou o base64 embutido no webhook
  // (quando a instância está com webhook_base64 ligado).
  if (ref.base64) {
    return montarMidia(ref.base64, ref.mimetype);
  }

  try {
    const resp = await fetch(
      `${BASE_URL}/chat/getBase64FromMediaMessage/${INSTANCIA}`,
      {
        method: "POST",
        headers: { apikey: API_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ message: ref.mensagem, convertToMp4: false }),
      }
    );
    if (!resp.ok) {
      const erro = await resp.text().catch(() => "");
      console.error("[Evolution] Falha ao baixar mídia:", resp.status, erro);
      return null;
    }
    const dados = (await resp.json().catch(() => null)) as {
      base64?: string;
      mimetype?: string;
    } | null;
    if (!dados?.base64) return null;
    return montarMidia(dados.base64, dados.mimetype || ref.mimetype);
  } catch (error) {
    console.error("[Evolution] Erro de rede ao baixar mídia:", error);
    return null;
  }
}

function montarMidia(base64: string, mimetype?: string): Midia | null {
  // A Evolution às vezes devolve com o prefixo data: — tira antes de decodificar.
  const limpo = base64.includes(",") ? base64.slice(base64.indexOf(",") + 1) : base64;
  const buffer = Buffer.from(limpo, "base64");
  if (buffer.byteLength === 0) return null;
  if (buffer.byteLength > TAMANHO_MAX_BYTES) {
    console.warn("[Evolution] Mídia acima de 8MB, descartada.");
    return null;
  }
  return { buffer, contentType: mimetype || "image/jpeg" };
}

// Opção que fecha uma enquete de múltipla escolha: enquanto ela não vem
// marcada, os votos (marca/desmarca) não chegam ao bot.
export const OPCAO_SALVAR = "✅ Salvar escolhas";
// Enquetes de múltipla escolha enviadas (id da mensagem → quando), pra saber
// que o voto ainda é parcial. Em memória: se o servidor reiniciar, o voto vale
// como final (comportamento de antes).
const enquetesMultiplas = new Map<string, number>();
const VALIDADE_ENQUETE_MS = 24 * 60 * 60 * 1000;

function idDaEnquete(dados: Record<string, unknown> | undefined): string | undefined {
  const msg = (dados?.message ?? {}) as { pollUpdateMessage?: { pollCreationMessageKey?: { id?: string } } };
  const atualizacoes = (Array.isArray(dados?.pollUpdates) ? dados?.pollUpdates : []) as { pollUpdateMessageKey?: { id?: string }; pollCreationMessageKey?: { id?: string } }[];
  return msg.pollUpdateMessage?.pollCreationMessageKey?.id ?? atualizacoes[0]?.pollCreationMessageKey?.id ?? (dados?.key as { id?: string } | undefined)?.id;
}

// Texto do voto pro bot, ou null se é voto parcial (múltipla sem "Salvar").
function textoDoVoto(dados: Record<string, unknown> | undefined, votadas: string[]): string | null {
  const id = idDaEnquete(dados);
  const salvou = votadas.includes(OPCAO_SALVAR);
  const escolhas = votadas.filter((o) => o !== OPCAO_SALVAR);
  if (id && enquetesMultiplas.has(id) && !salvou) return null;
  if (salvou && id) enquetesMultiplas.delete(id);
  return escolhas.length
    ? `[o consultor marcou na enquete${salvou ? " e salvou" : ""}: ${escolhas.join(", ")}]`
    : "[o consultor salvou a enquete sem marcar nada]";
}

// Voto de enquete: a Evolution manda o voto já decifrado em `pollUpdates`
// (evento messages.update) ou dentro da própria mensagem (pollUpdateMessage).
// Devolve os nomes das opções marcadas, ou null se o item não é voto.
function opcoesVotadas(dados: Record<string, unknown> | undefined): string[] | null {
  if (!dados) return null;
  const candidatos: unknown[] = [];
  const msg = (dados.message ?? {}) as Record<string, unknown>;
  const pollMsg = msg.pollUpdateMessage as Record<string, unknown> | undefined;
  if (pollMsg) candidatos.push(pollMsg.vote, pollMsg);
  for (const u of (Array.isArray(dados.pollUpdates) ? dados.pollUpdates : []) as Record<string, unknown>[]) candidatos.push(u.vote, u);
  if (dados.pollUpdate) candidatos.push((dados.pollUpdate as Record<string, unknown>).vote, dados.pollUpdate);
  if (!pollMsg && candidatos.length === 0) return null;
  // O mesmo voto chega em várias cópias: as ainda criptografadas (encPayload,
  // selectedOptions vazio) são ignoradas — vale só a que vem com os nomes.
  for (const c of candidatos) {
    const opcoes = (c as { selectedOptions?: unknown[] } | undefined)?.selectedOptions;
    if (Array.isArray(opcoes)) {
      const nomes = opcoes
        .map((o) => (typeof o === "string" ? o : (o as { name?: string; optionName?: string })?.name ?? (o as { optionName?: string })?.optionName))
        .filter((o): o is string => Boolean(o && !/^[A-Za-z0-9+/=]{30,}$/.test(o)));
      if (nomes.length) return nomes;
    }
  }
  return [];
}

// Enquete do WhatsApp (sendPoll): o consultor toca pra marcar/desmarcar.
// multipla = pode marcar várias. O voto volta pelo webhook (opcoesVotadas).
export async function enviarEnquete(waId: string, pergunta: string, opcoes: string[], multipla: boolean): Promise<boolean> {
  if (!whatsappConfigurado()) return false;
  // Múltipla escolha ganha o "Salvar" no fim: o voto só vale quando ele vem marcado.
  const valores = [...opcoes.slice(0, multipla ? 11 : 12).map((o) => o.slice(0, 100)), ...(multipla ? [OPCAO_SALVAR] : [])];
  try {
    const resp = await fetch(`${BASE_URL}/message/sendPoll/${INSTANCIA}`, {
      method: "POST",
      headers: { apikey: API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({
        number: waId,
        name: pergunta.slice(0, 255),
        selectableCount: multipla ? valores.length : 1,
        values: valores,
      }),
    });
    if (!resp.ok) {
      console.error("[Evolution] Falha ao enviar enquete:", resp.status, await resp.text().catch(() => ""));
      return false;
    }
    if (multipla) {
      const id = ((await resp.json().catch(() => null)) as { key?: { id?: string } } | null)?.key?.id;
      const agora = Date.now();
      for (const [k, quando] of enquetesMultiplas) if (agora - quando > VALIDADE_ENQUETE_MS) enquetesMultiplas.delete(k);
      if (id) enquetesMultiplas.set(id, agora);
    }
    return true;
  } catch (error) {
    console.error("[Evolution] Erro de rede ao enviar enquete:", error);
    return false;
  }
}

export function extrairMensagens(payload: unknown): MensagemRecebida[] {
  const corpo = payload as { event?: string; data?: unknown };
  const evento = (corpo?.event ?? "").toString().toLowerCase().replace(/_/g, ".");
  if (evento === "messages.update") {
    // Só interessa voto de enquete.
    const itens = Array.isArray(corpo?.data) ? corpo.data : [corpo?.data];
    const votos: MensagemRecebida[] = [];
    for (const item of itens) {
      const dados = item as Record<string, unknown> | undefined;
      const votadas = opcoesVotadas(dados);
      if (!votadas?.length) continue;
      const chave = (dados?.key ?? {}) as { remoteJid?: string; fromMe?: boolean; id?: string };
      const jid = chave.remoteJid ?? (dados?.remoteJid as string | undefined);
      if (!jid || chave.fromMe || !jid.endsWith("@s.whatsapp.net")) continue;
      const texto = textoDoVoto(dados, votadas);
      if (texto) votos.push({ id: chave.id, waId: jid.split("@")[0], enviadaEm: Date.now(), tipo: "text", texto });
    }
    return votos;
  }
  if (evento && evento !== "messages.upsert") return [];

  const itens = Array.isArray(corpo?.data) ? corpo.data : [corpo?.data];
  const mensagens: MensagemRecebida[] = [];

  for (const item of itens) {
    const dados = item as
      | {
          key?: { remoteJid?: string; fromMe?: boolean; id?: string };
          message?: Record<string, unknown>;
          messageTimestamp?: unknown;
        }
      | undefined;

    const jid = dados?.key?.remoteJid;
    if (!jid) continue;
    if (dados?.key?.fromMe) continue; // eco da própria mensagem enviada
    // Só conversa individual: ignora grupo (@g.us) e status broadcast.
    if (!jid.endsWith("@s.whatsapp.net")) continue;

    const waId = jid.split("@")[0];
    const id = dados?.key?.id;
    const enviadaEm = timestampEmMs(dados?.messageTimestamp);
    const msg = dados?.message ?? {};
    const base64 = typeof msg.base64 === "string" ? msg.base64 : undefined;

    const textoSimples = typeof msg.conversation === "string" ? msg.conversation : undefined;
    const estendido = msg.extendedTextMessage as
      | { text?: string; contextInfo?: { stanzaId?: string; quotedMessage?: { conversation?: string; extendedTextMessage?: { text?: string } } } }
      | undefined;
    // Resposta citando uma mensagem (inclusive a própria: "👆"): o texto citado
    // vai junto, senão o bot não sabe o que está sendo apontado.
    const citada = estendido?.contextInfo?.quotedMessage;
    // Resposta a FOTO fica de fora: o texto dela vira a legenda (conversa.ts).
    const textoCitado = (citada?.conversation || citada?.extendedTextMessage?.text || "").trim();
    const textoEstendido = estendido?.text && textoCitado
      ? `${estendido.text}
[respondendo à mensagem: "${textoCitado.slice(0, 800)}"]`
      : estendido?.text;
    const imagem = msg.imageMessage as { mimetype?: string; caption?: string } | undefined;
    const audio = msg.audioMessage as
      | { mimetype?: string; contextInfo?: { stanzaId?: string } }
      | undefined;
    const respondendoA =
      estendido?.contextInfo?.stanzaId || audio?.contextInfo?.stanzaId || undefined;
    // "Localização atual" e "Localização em tempo real" trazem as coordenadas
    // nos mesmos campos.
    const localizacao = (msg.locationMessage ?? msg.liveLocationMessage) as
      | { degreesLatitude?: number; degreesLongitude?: number }
      | undefined;

    const votadas = opcoesVotadas(dados as Record<string, unknown>);
    if (votadas !== null) {
      const texto = votadas.length ? textoDoVoto(dados as Record<string, unknown>, votadas) : null;
      if (texto) mensagens.push({ id, waId, enviadaEm, tipo: "text", texto });
      continue;
    }

    if (textoSimples || textoEstendido) {
      mensagens.push({ id, waId, enviadaEm, tipo: "text", texto: textoSimples || textoEstendido, respondendoA });
    } else if (
      localizacao &&
      typeof localizacao.degreesLatitude === "number" &&
      typeof localizacao.degreesLongitude === "number"
    ) {
      mensagens.push({
        id,
        waId,
        enviadaEm,
        tipo: "location",
        localizacao: {
          latitude: localizacao.degreesLatitude,
          longitude: localizacao.degreesLongitude,
        },
      });
    } else if (imagem) {
      mensagens.push({
        id,
        waId,
        enviadaEm,
        tipo: "image",
        texto: imagem.caption?.trim() || undefined,
        midia: {
          transporte: "evolution",
          mensagem: dados,
          base64,
          mimetype: imagem.mimetype,
        },
      });
    } else if (audio) {
      mensagens.push({
        id,
        waId,
        enviadaEm,
        tipo: "audio",
        respondendoA,
        midia: {
          transporte: "evolution",
          mensagem: dados,
          base64,
          mimetype: audio.mimetype,
        },
      });
    } else {
      mensagens.push({ id, waId, enviadaEm, tipo: "outro" });
    }
  }

  return mensagens;
}
