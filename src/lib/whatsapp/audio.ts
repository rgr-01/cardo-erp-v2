// Áudio do WhatsApp nos dois sentidos: transcrição do que o consultor fala
// (o relato de visita costuma vir falado) e voz pra resposta do bot.

import { prisma } from "@/lib/prisma";

const OPENAI_TRANSCRIPTION_URL = "https://api.openai.com/v1/audio/transcriptions";
const OPENAI_SPEECH_URL = "https://api.openai.com/v1/audio/speech";
const ELEVENLABS_URL = "https://api.elevenlabs.io/v1/text-to-speech";

const MODELO_TRANSCRICAO = process.env.OPENAI_TRANSCRIBE_MODEL || "gpt-4o-transcribe";
const MODELO_VOZ = process.env.OPENAI_TTS_MODEL || "gpt-4o-mini-tts";
// Voz masculina escolhida comparando amostras; troca sem deploy pela env.
const VOZ = process.env.OPENAI_TTS_VOICE || "cedar";

// ElevenLabs: só entra se ELEVENLABS_API_KEY e ELEVENLABS_VOICE_ID estiverem
// configurados; falhou, cai na voz da OpenAI abaixo.
const MODELO_ELEVENLABS = process.env.ELEVENLABS_MODEL || "eleven_multilingual_v2";

const INSTRUCOES_VOZ =
  "Voz masculina, brasileiro, na faixa dos 35 anos, jeito de quem trabalha no agro no " +
  "Centro-Oeste. Fale como se estivesse mandando um áudio no WhatsApp pra um colega: " +
  "descontraído, caloroso, ritmo de conversa, pequenas pausas naturais entre as frases, " +
  "entonação de pergunta quando for pergunta. Nada de voz de locutor ou de atendimento eletrônico.";

function extensaoPorContentType(contentType: string): string {
  if (contentType.includes("ogg")) return "ogg";
  if (contentType.includes("mp4") || contentType.includes("m4a")) return "m4a";
  if (contentType.includes("mpeg") || contentType.includes("mp3")) return "mp3";
  if (contentType.includes("wav")) return "wav";
  return "ogg";
}

// Nomes que o modelo de transcrição tende a errar (fazendas, produtos). Vão
// como dica no `prompt`. Cache curto por consultor pra não consultar o banco
// a cada áudio.
const TTL_GLOSSARIO_MS = 10 * 60 * 1000;
const MAX_CARACTERES_GLOSSARIO = 1500;
const glossarios = new Map<string, { texto: string; em: number }>();

async function glossarioDoConsultor(consultorId: string): Promise<string> {
  const emCache = glossarios.get(consultorId);
  if (emCache && Date.now() - emCache.em < TTL_GLOSSARIO_MS) return emCache.texto;

  const [clientes, produtos] = await Promise.all([
    prisma.cliente.findMany({
      where: { consultorId },
      select: { nome: true },
      orderBy: { nome: "asc" },
      take: 120,
    }),
    prisma.produto.findMany({ select: { nome: true }, take: 150 }),
  ]);

  let texto = "Relato de visita técnica/comercial no agronegócio.";
  for (const nome of [...clientes.map((c) => c.nome), ...produtos.map((p) => p.nome)]) {
    if (texto.length + nome.length + 2 > MAX_CARACTERES_GLOSSARIO) break;
    texto += ` ${nome},`;
  }
  texto = texto.replace(/,$/, ".");

  glossarios.set(consultorId, { texto, em: Date.now() });
  return texto;
}

async function chamarTranscricao(
  apiKey: string,
  buffer: Buffer,
  contentType: string,
  modelo: string,
  prompt?: string
): Promise<string | null> {
  const arquivo = new Blob([new Uint8Array(buffer)], { type: contentType });
  const form = new FormData();
  form.append("file", arquivo, `audio.${extensaoPorContentType(contentType)}`);
  form.append("model", modelo);
  form.append("language", "pt");
  if (prompt) form.append("prompt", prompt);

  const resp = await fetch(OPENAI_TRANSCRIPTION_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    console.warn(`[WhatsApp transcrição] ${modelo} falhou:`, resp.status, data);
    return null;
  }
  return (data.text as string)?.trim() || null;
}

export async function transcreverAudio(
  buffer: Buffer,
  contentType: string,
  consultorId?: string
): Promise<string | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  try {
    const prompt = consultorId
      ? await glossarioDoConsultor(consultorId).catch(() => undefined)
      : undefined;
    const texto = await chamarTranscricao(apiKey, buffer, contentType, MODELO_TRANSCRICAO, prompt);
    if (texto || MODELO_TRANSCRICAO === "whisper-1") return texto;
    // Modelo novo indisponível/recusou o arquivo: cai pro whisper sem dica.
    return await chamarTranscricao(apiKey, buffer, contentType, "whisper-1");
  } catch (error) {
    console.warn("[WhatsApp transcrição] erro:", error);
    return null;
  }
}

async function sintetizarElevenLabs(texto: string): Promise<Buffer | null> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  const vozId = process.env.ELEVENLABS_VOICE_ID;
  if (!apiKey || !vozId) return null;

  try {
    const resp = await fetch(
      `${ELEVENLABS_URL}/${encodeURIComponent(vozId)}?output_format=opus_48000_64`,
      {
        method: "POST",
        headers: { "xi-api-key": apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({ text: texto.slice(0, 4000), model_id: MODELO_ELEVENLABS }),
      }
    );
    if (!resp.ok) {
      const erro = await resp.text().catch(() => "");
      console.warn("[WhatsApp voz] ElevenLabs falhou:", resp.status, erro);
      return null;
    }
    return Buffer.from(await resp.arrayBuffer());
  } catch (error) {
    console.warn("[WhatsApp voz] ElevenLabs erro:", error);
    return null;
  }
}

// Texto → áudio ogg/opus (formato nativo de mensagem de voz do WhatsApp).
export async function sintetizarVoz(texto: string): Promise<Buffer | null> {
  if (!texto.trim()) return null;
  const eleven = await sintetizarElevenLabs(texto);
  if (eleven) return eleven;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  try {
    const resp = await fetch(OPENAI_SPEECH_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODELO_VOZ,
        voice: VOZ,
        input: texto.slice(0, 4000),
        instructions: INSTRUCOES_VOZ,
        response_format: "opus",
      }),
    });
    if (!resp.ok) {
      const erro = await resp.text().catch(() => "");
      console.warn("[WhatsApp voz] falha ao sintetizar:", resp.status, erro);
      return null;
    }
    return Buffer.from(await resp.arrayBuffer());
  } catch (error) {
    console.warn("[WhatsApp voz] erro:", error);
    return null;
  }
}
