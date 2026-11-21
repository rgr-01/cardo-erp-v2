// Checa se um contrato importado manualmente (lib/servicos/propostas.ts,
// importarContratoAssinado) parece de fato assinado — usado só nesse fluxo
// pra evitar aceitar um PDF em branco/rascunho como se fosse o documento
// assinado. Mesmo padrão de ocr-produto.ts (Responses API + function
// calling), mas em vez de extrair dados, devolve uma decisão binária.

import { primeiraPaginaComoJpeg } from "@/lib/pdf-para-imagem";

const OPENAI_URL = "https://api.openai.com/v1/responses";

export type ChecagemAssinatura =
  | { assinado: true }
  | { assinado: false; motivo: string }
  // IA indisponível (sem API key, erro de rede) — quem chama decide se
  // bloqueia ou deixa passar com aviso; não finge que verificou.
  | { assinado: null };

const CHECAR_ASSINATURA_TOOL = {
  type: "function",
  name: "checar_assinatura",
  description:
    "Diz se a imagem mostra um contrato/documento com assinatura (rubrica, assinatura manuscrita, carimbo, ou assinatura eletrônica visível) do cliente.",
  parameters: {
    type: "object",
    properties: {
      assinado: { type: "boolean", description: "true se há assinatura visível no documento." },
      motivo: {
        type: "string",
        description: "Breve explicação (ex: 'assinatura manuscrita na última página' ou 'nenhum campo de assinatura preenchido').",
      },
    },
    required: ["assinado", "motivo"],
    additionalProperties: false,
  },
};

async function paraImagemBase64(
  buffer: Buffer,
  contentType: string
): Promise<{ base64: string; contentType: string } | null> {
  if (contentType === "application/pdf") {
    const jpeg = await primeiraPaginaComoJpeg(buffer);
    if (!jpeg) return null;
    return { base64: jpeg.toString("base64"), contentType: "image/jpeg" };
  }
  return { base64: buffer.toString("base64"), contentType };
}

export async function checarDocumentoAssinado(
  buffer: Buffer,
  contentType: string
): Promise<ChecagemAssinatura> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return { assinado: null };

  const imagem = await paraImagemBase64(buffer, contentType);
  if (!imagem) return { assinado: null };

  const modelo = process.env.OPENAI_MODEL_VISION || process.env.OPENAI_MODEL || "gpt-4.1-mini";

  try {
    const resp = await fetch(OPENAI_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: modelo,
        input: [
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: "Este é um contrato comercial que deveria estar assinado pelo cliente. Verifique se há assinatura (manuscrita, rubrica, carimbo ou assinatura eletrônica) visível no documento.",
              },
              {
                type: "input_image",
                image_url: `data:${imagem.contentType};base64,${imagem.base64}`,
              },
            ],
          },
        ],
        tools: [CHECAR_ASSINATURA_TOOL],
        tool_choice: { type: "function", name: "checar_assinatura" },
      }),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) return { assinado: null };

    const call = (data.output || []).find(
      (item: { type?: string; name?: string }) => item.type === "function_call" && item.name === "checar_assinatura"
    );
    if (!call?.arguments) return { assinado: null };

    const parsed = JSON.parse(call.arguments);
    const motivo = typeof parsed.motivo === "string" ? parsed.motivo : "";
    return parsed.assinado === true ? { assinado: true } : { assinado: false, motivo };
  } catch (error) {
    console.warn("[OCR assinatura] erro:", error);
    return { assinado: null };
  }
}
