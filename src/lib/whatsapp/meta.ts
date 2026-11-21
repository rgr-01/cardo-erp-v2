// Cliente fino para a Meta Cloud API (WhatsApp Business).
// Mantido como transporte alternativo à Evolution API: implementa o mesmo
// contrato de ./tipos, então basta WHATSAPP_TRANSPORTE=meta para trocar.
// Vínculo reverso por código (usuário manda o código pelo próprio WhatsApp,
// sem custo de SMS externo).

import crypto from "node:crypto";
import { timestampEmMs, type MensagemRecebida, type Midia, type RefMidia } from "./tipos";

const ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN || "";
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || "";
const APP_SECRET = process.env.WHATSAPP_APP_SECRET || "";
const API_VERSION = process.env.WHATSAPP_API_VERSION || "v21.0";
const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || "";
const GRAPH_URL = `https://graph.facebook.com/${API_VERSION}`;

export function whatsappConfigurado(): boolean {
  return Boolean(ACCESS_TOKEN && PHONE_NUMBER_ID);
}

export function numeroDoBot(): string | null {
  return process.env.WHATSAPP_NUMERO_BOT || null;
}

export function autorizarWebhook(request: Request, bodyRaw: string): boolean {
  if (!APP_SECRET) return true; // sem app secret configurado, pula a checagem
  const assinatura = request.headers.get("x-hub-signature-256");
  if (!assinatura) return false;
  const esperado =
    "sha256=" +
    crypto.createHmac("sha256", APP_SECRET).update(bodyRaw).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(esperado), Buffer.from(assinatura));
  } catch {
    return false;
  }
}

// Handshake de verificação do webhook da Meta (GET com hub.challenge).
export function responderVerificacao(request: Request): Response | null {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === VERIFY_TOKEN && challenge) {
    return new Response(challenge, { status: 200 });
  }
  return null;
}

export async function enviarMensagemTexto(waId: string, texto: string): Promise<boolean> {
  if (!whatsappConfigurado()) {
    console.warn("[WhatsApp] Envio ignorado — credenciais não configuradas.");
    return false;
  }
  const resp = await fetch(`${GRAPH_URL}/${PHONE_NUMBER_ID}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: waId,
      type: "text",
      text: { body: texto.slice(0, 4096), preview_url: false },
    }),
  });
  if (!resp.ok) {
    const erro = await resp.text().catch(() => "");
    console.error("[WhatsApp] Falha ao enviar mensagem:", resp.status, erro);
    return false;
  }
  return true;
}

// A Cloud API exige subir a mídia antes e mandar pelo id.
export async function enviarAudio(waId: string, audio: Buffer): Promise<boolean> {
  if (!whatsappConfigurado()) return false;
  try {
    const form = new FormData();
    form.append("messaging_product", "whatsapp");
    form.append("type", "audio/ogg");
    form.append("file", new Blob([new Uint8Array(audio)], { type: "audio/ogg" }), "resposta.ogg");
    const upload = await fetch(`${GRAPH_URL}/${PHONE_NUMBER_ID}/media`, {
      method: "POST",
      headers: { Authorization: `Bearer ${ACCESS_TOKEN}` },
      body: form,
    });
    const midia = (await upload.json().catch(() => null)) as { id?: string } | null;
    if (!upload.ok || !midia?.id) {
      console.error("[WhatsApp] Falha ao subir áudio:", upload.status, midia);
      return false;
    }

    const resp = await fetch(`${GRAPH_URL}/${PHONE_NUMBER_ID}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: waId,
        type: "audio",
        audio: { id: midia.id },
      }),
    });
    if (!resp.ok) {
      const erro = await resp.text().catch(() => "");
      console.error("[WhatsApp] Falha ao enviar áudio:", resp.status, erro);
      return false;
    }
    return true;
  } catch (error) {
    console.error("[WhatsApp] Erro ao enviar áudio:", error);
    return false;
  }
}

export async function reagir(waId: string, mensagemId: string, emoji: string): Promise<void> {
  if (!whatsappConfigurado()) return;
  const resp = await fetch(`${GRAPH_URL}/${PHONE_NUMBER_ID}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: waId,
      type: "reaction",
      reaction: { message_id: mensagemId, emoji },
    }),
  });
  if (!resp.ok) {
    const erro = await resp.text().catch(() => "");
    console.warn("[WhatsApp] Falha ao reagir:", resp.status, erro);
  }
}

// A Cloud API não tem um "digitando…" avulso como a Evolution — fica sem.
export function enviarDigitando(_waId: string): void {
  void _waId;
}

export async function enviarDocumento(
  waId: string,
  buffer: Buffer,
  nomeArquivo: string,
  mimetype: string,
  legenda?: string
): Promise<boolean> {
  if (!whatsappConfigurado()) {
    console.warn("[WhatsApp] Envio de documento ignorado — credenciais não configuradas.");
    return false;
  }
  try {
    const form = new FormData();
    form.append("messaging_product", "whatsapp");
    form.append("file", new Blob([new Uint8Array(buffer)], { type: mimetype }), nomeArquivo);
    const uploadResp = await fetch(`${GRAPH_URL}/${PHONE_NUMBER_ID}/media`, {
      method: "POST",
      headers: { Authorization: `Bearer ${ACCESS_TOKEN}` },
      body: form,
    });
    const uploadData = await uploadResp.json().catch(() => null);
    if (!uploadResp.ok || !uploadData?.id) {
      console.error("[WhatsApp] Falha ao subir documento:", uploadResp.status, uploadData);
      return false;
    }

    const resp = await fetch(`${GRAPH_URL}/${PHONE_NUMBER_ID}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: waId,
        type: "document",
        document: { id: uploadData.id, filename: nomeArquivo, caption: legenda },
      }),
    });
    if (!resp.ok) {
      const erro = await resp.text().catch(() => "");
      console.error("[WhatsApp] Falha ao enviar documento:", resp.status, erro);
      return false;
    }
    return true;
  } catch (error) {
    console.error("[WhatsApp] Erro de rede ao enviar documento:", error);
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
    console.warn("[WhatsApp] Envio de imagem ignorado — credenciais não configuradas.");
    return false;
  }
  try {
    const form = new FormData();
    form.append("messaging_product", "whatsapp");
    form.append("file", new Blob([new Uint8Array(buffer)], { type: mimetype }));
    const uploadResp = await fetch(`${GRAPH_URL}/${PHONE_NUMBER_ID}/media`, {
      method: "POST",
      headers: { Authorization: `Bearer ${ACCESS_TOKEN}` },
      body: form,
    });
    const uploadData = await uploadResp.json().catch(() => null);
    if (!uploadResp.ok || !uploadData?.id) {
      console.error("[WhatsApp] Falha ao subir imagem:", uploadResp.status, uploadData);
      return false;
    }

    const resp = await fetch(`${GRAPH_URL}/${PHONE_NUMBER_ID}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: waId,
        type: "image",
        image: { id: uploadData.id, caption: legenda },
      }),
    });
    if (!resp.ok) {
      const erro = await resp.text().catch(() => "");
      console.error("[WhatsApp] Falha ao enviar imagem:", resp.status, erro);
      return false;
    }
    return true;
  } catch (error) {
    console.error("[WhatsApp] Erro de rede ao enviar imagem:", error);
    return false;
  }
}

export async function baixarMidia(ref: RefMidia): Promise<Midia | null> {
  if (ref.transporte !== "meta") return null;
  if (!whatsappConfigurado()) return null;

  const metaResp = await fetch(`${GRAPH_URL}/${ref.mediaId}`, {
    headers: { Authorization: `Bearer ${ACCESS_TOKEN}` },
  });
  if (!metaResp.ok) return null;
  const meta = await metaResp.json();
  if (!meta?.url) return null;

  const arquivoResp = await fetch(meta.url, {
    headers: { Authorization: `Bearer ${ACCESS_TOKEN}` },
  });
  if (!arquivoResp.ok) return null;

  const buffer = Buffer.from(await arquivoResp.arrayBuffer());
  return { buffer, contentType: meta.mime_type || "image/jpeg" };
}

export function extrairMensagens(payload: unknown): MensagemRecebida[] {
  const mensagens: MensagemRecebida[] = [];
  const entradas = (payload as { entry?: unknown[] })?.entry ?? [];

  for (const entrada of entradas) {
    const changes = (entrada as { changes?: unknown[] })?.changes ?? [];
    for (const change of changes) {
      const value = (change as { value?: Record<string, unknown> })?.value;
      const msgs = (value?.messages as Record<string, unknown>[]) ?? [];
      for (const msg of msgs) {
        const waId = String(msg.from ?? "");
        if (!waId) continue;
        const id = typeof msg.id === "string" ? msg.id : undefined;
        const enviadaEm = timestampEmMs(msg.timestamp);
        const respondendoA = (msg.context as { id?: string } | undefined)?.id;
        if (msg.type === "text") {
          const texto = (msg.text as { body?: string })?.body;
          mensagens.push({ id, waId, enviadaEm, tipo: "text", texto, respondendoA });
        } else if (msg.type === "image") {
          const imagem = msg.image as { id?: string; caption?: string } | undefined;
          const mediaId = imagem?.id;
          mensagens.push({
            id,
            waId,
            enviadaEm,
            tipo: "image",
            texto: imagem?.caption?.trim() || undefined,
            midia: mediaId ? { transporte: "meta", mediaId } : undefined,
          });
        } else if (msg.type === "audio") {
          const mediaId = (msg.audio as { id?: string })?.id;
          mensagens.push({
            id,
            waId,
            enviadaEm,
            tipo: "audio",
            respondendoA,
            midia: mediaId ? { transporte: "meta", mediaId } : undefined,
          });
        } else if (msg.type === "location") {
          const localizacao = msg.location as { latitude?: number; longitude?: number };
          if (typeof localizacao?.latitude === "number" && typeof localizacao?.longitude === "number") {
            mensagens.push({
              id,
              waId,
              enviadaEm,
              tipo: "location",
              localizacao: { latitude: localizacao.latitude, longitude: localizacao.longitude },
            });
          } else {
            mensagens.push({ id, waId, enviadaEm, tipo: "outro" });
          }
        } else {
          mensagens.push({ id, waId, enviadaEm, tipo: "outro" });
        }
      }
    }
  }
  return mensagens;
}

// A Cloud API tem botões/listas, mas não enquete: manda as opções numeradas.
export async function enviarEnquete(waId: string, pergunta: string, opcoes: string[], multipla: boolean): Promise<boolean> {
  const linhas = opcoes.map((o, i) => `${i + 1}. ${o}`).join("\n");
  return enviarMensagemTexto(waId, `${pergunta}\n${linhas}\n\n${multipla ? "Responda com os números (ex.: 1, 3)." : "Responda com o número."}`);
}
