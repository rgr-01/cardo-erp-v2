import type { CategoriaDespesa } from "@/generated/prisma/client";

const OPENAI_URL = "https://api.openai.com/v1/responses";

const CATEGORIAS: CategoriaDespesa[] = [
  "COMBUSTIVEL",
  "ALIMENTACAO",
  "HOSPEDAGEM",
  "MANUTENCAO_VEICULO",
  "PEDAGIO",
  "MATERIAL_ESCRITORIO",
  "OUTROS",
];

export type ExtracaoDespesa = {
  valor: number | null;
  data: string | null; // ISO yyyy-mm-dd
  estabelecimento: string | null;
  categoria: CategoriaDespesa | null;
  confianca: "alta" | "media" | "baixa";
};

const EXTRAIR_DESPESA_TOOL = {
  type: "function",
  name: "extrair_despesa",
  description:
    "Extrai dados estruturados de uma foto de nota fiscal ou cupom de despesa (combustível, alimentação, hospedagem, manutenção de veículo, pedágio, material de escritório).",
  parameters: {
    type: "object",
    properties: {
      valor: { type: ["number", "null"], description: "Valor total da nota, em reais." },
      data: { type: ["string", "null"], description: "Data da compra no formato ISO yyyy-mm-dd." },
      estabelecimento: { type: ["string", "null"], description: "Nome do estabelecimento/emissor." },
      categoria: { type: ["string", "null"], enum: [...CATEGORIAS, null] },
      confianca: { type: "string", enum: ["alta", "media", "baixa"] },
    },
    required: ["valor", "data", "estabelecimento", "categoria", "confianca"],
    additionalProperties: false,
  },
};

const FALLBACK: ExtracaoDespesa = {
  valor: null,
  data: null,
  estabelecimento: null,
  categoria: null,
  confianca: "baixa",
};

export async function extrairDadosNotaFiscal(
  buffer: Buffer,
  contentType: string
): Promise<ExtracaoDespesa> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return FALLBACK;

  const modelo =
    process.env.OPENAI_MODEL_VISION || process.env.OPENAI_MODEL || "gpt-4.1-mini";

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
                text: "Extraia os dados desta nota fiscal ou cupom de despesa.",
              },
              {
                type: "input_image",
                image_url: `data:${contentType};base64,${buffer.toString("base64")}`,
              },
            ],
          },
        ],
        tools: [EXTRAIR_DESPESA_TOOL],
        tool_choice: { type: "function", name: "extrair_despesa" },
      }),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) return FALLBACK;

    const call = (data.output || []).find(
      (item: { type?: string; name?: string }) =>
        item.type === "function_call" && item.name === "extrair_despesa"
    );
    if (!call?.arguments) return FALLBACK;

    const parsed = JSON.parse(call.arguments);
    return {
      valor: typeof parsed.valor === "number" ? parsed.valor : null,
      data: typeof parsed.data === "string" ? parsed.data : null,
      estabelecimento:
        typeof parsed.estabelecimento === "string" ? parsed.estabelecimento : null,
      categoria: CATEGORIAS.includes(parsed.categoria) ? parsed.categoria : null,
      confianca: ["alta", "media", "baixa"].includes(parsed.confianca)
        ? parsed.confianca
        : "baixa",
    };
  } catch (error) {
    console.warn("[OCR despesa] erro:", error);
    return FALLBACK;
  }
}
