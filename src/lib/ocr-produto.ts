// Mesmo padrão de src/lib/ocr-despesa.ts, mas pra extrair dados de uma foto
// de embalagem de produto (defensivo agrícola/insumo) — usado pelo bot do
// WhatsApp em ler_embalagem_produto (ver lib/whatsapp/ferramentas.ts).

const OPENAI_URL = "https://api.openai.com/v1/responses";

export type ExtracaoProduto = {
  nome: string | null;
  fornecedorSugerido: string | null;
  ingredienteAtivo: string | null;
  embalagem: string | null;
  confianca: "alta" | "media" | "baixa";
};

const EXTRAIR_PRODUTO_TOOL = {
  type: "function",
  name: "extrair_produto",
  description:
    "Extrai dados estruturados de uma foto de embalagem/rótulo de produto agrícola (defensivo, fertilizante, semente etc.).",
  parameters: {
    type: "object",
    properties: {
      nome: { type: ["string", "null"], description: "Nome comercial do produto, como aparece no rótulo." },
      fornecedor_sugerido: {
        type: ["string", "null"],
        description: "Nome do fabricante/fornecedor impresso na embalagem.",
      },
      ingrediente_ativo: { type: ["string", "null"], description: "Ingrediente(s) ativo(s) e concentração, se visível." },
      embalagem: { type: ["string", "null"], description: "Formato e volume da embalagem (ex: 'Bombona 20L', 'Saco 25kg')." },
      confianca: { type: "string", enum: ["alta", "media", "baixa"] },
    },
    required: ["nome", "fornecedor_sugerido", "ingrediente_ativo", "embalagem", "confianca"],
    additionalProperties: false,
  },
};

const FALLBACK: ExtracaoProduto = {
  nome: null,
  fornecedorSugerido: null,
  ingredienteAtivo: null,
  embalagem: null,
  confianca: "baixa",
};

export async function extrairDadosProduto(buffer: Buffer, contentType: string): Promise<ExtracaoProduto> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return FALLBACK;

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
                text: "Extraia os dados desta embalagem/rótulo de produto agrícola.",
              },
              {
                type: "input_image",
                image_url: `data:${contentType};base64,${buffer.toString("base64")}`,
              },
            ],
          },
        ],
        tools: [EXTRAIR_PRODUTO_TOOL],
        tool_choice: { type: "function", name: "extrair_produto" },
      }),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) return FALLBACK;

    const call = (data.output || []).find(
      (item: { type?: string; name?: string }) => item.type === "function_call" && item.name === "extrair_produto"
    );
    if (!call?.arguments) return FALLBACK;

    const parsed = JSON.parse(call.arguments);
    return {
      nome: typeof parsed.nome === "string" ? parsed.nome : null,
      fornecedorSugerido: typeof parsed.fornecedor_sugerido === "string" ? parsed.fornecedor_sugerido : null,
      ingredienteAtivo: typeof parsed.ingrediente_ativo === "string" ? parsed.ingrediente_ativo : null,
      embalagem: typeof parsed.embalagem === "string" ? parsed.embalagem : null,
      confianca: ["alta", "media", "baixa"].includes(parsed.confianca) ? parsed.confianca : "baixa",
    };
  } catch (error) {
    console.warn("[OCR produto] erro:", error);
    return FALLBACK;
  }
}
