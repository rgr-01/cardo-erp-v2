// Leitura de foto de campo pelo bot (analisar_foto_campo): o que aparece na
// foto e POSSÍVEIS problemas, com o sinal visual de cada um e a confiança. É
// sugestão pro consultor confirmar — o bot nunca grava diagnóstico sozinho.

const OPENAI_URL = "https://api.openai.com/v1/responses";

export type AnaliseFotoCampo = {
  e_foto_de_campo: boolean;
  descricao: string;
  cultura: string | null;
  estadio_provavel: string | null;
  possiveis_problemas: { nome: string; sinais: string; confianca: "alta" | "media" | "baixa"; onde_na_foto: string }[];
  o_que_conferir: string[];
};

const ANALISAR_TOOL = {
  type: "function",
  name: "analisar",
  description: "Devolve a leitura agronômica da foto.",
  parameters: {
    type: "object",
    properties: {
      e_foto_de_campo: { type: "boolean", description: "false se não for lavoura/planta/praga/solo (ex.: nota fiscal, documento, pessoa)." },
      descricao: { type: "string", description: "Uma ou duas frases do que aparece na foto, sem diagnóstico." },
      cultura: { type: ["string", "null"] },
      estadio_provavel: { type: ["string", "null"], description: "Estádio fenológico, só se der pra ver (ex.: 'V4', 'R5.1'); null se não der." },
      possiveis_problemas: {
        type: "array",
        items: {
          type: "object",
          properties: {
            nome: { type: "string", description: "Doença, praga, deficiência ou dano provável." },
            sinais: { type: "string", description: "O sinal visual que levou a essa hipótese." },
            confianca: { type: "string", enum: ["alta", "media", "baixa"] },
            onde_na_foto: { type: "string", description: "Onde está na foto (ex.: 'folhas do canto superior direito')." },
          },
          required: ["nome", "sinais", "confianca", "onde_na_foto"],
          additionalProperties: false,
        },
      },
      o_que_conferir: {
        type: "array",
        items: { type: "string" },
        description: "O que o consultor deve olhar no campo pra confirmar (ex.: 'verso da folha: pústulas com esporos').",
      },
    },
    required: ["e_foto_de_campo", "descricao", "cultura", "estadio_provavel", "possiveis_problemas", "o_que_conferir"],
    additionalProperties: false,
  },
};

const INSTRUCOES = [
  "Você é um agrônomo de campo olhando uma foto mandada por um consultor no WhatsApp.",
  "Diga só o que dá pra ver. Hipóteses de problema vêm com o sinal visual e uma confiança honesta: foto de longe, borrada ou sem detalhe = baixa. Se não houver sinal de problema, lista vazia.",
  "Nada de dose, produto ou recomendação de manejo — isso é decisão do consultor.",
  "No máximo 3 hipóteses, da mais provável pra menos.",
].join("\n");

export async function analisarFotoCampo(imagem: Buffer, contentType: string, contexto: string | null): Promise<AnaliseFotoCampo> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY não configurada.");
  const modelo = process.env.OPENAI_MODEL_VISION || process.env.OPENAI_MODEL || "gpt-4.1-mini";
  const resp = await fetch(OPENAI_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: modelo,
      instructions: INSTRUCOES,
      input: [{
        role: "user",
        content: [
          { type: "input_text", text: contexto ? `Contexto do consultor: ${contexto}` : "Sem contexto." },
          { type: "input_image", image_url: `data:${contentType};base64,${imagem.toString("base64")}`, detail: "high" },
        ],
      }],
      tools: [ANALISAR_TOOL],
      tool_choice: { type: "function", name: "analisar" },
    }),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(`A IA não conseguiu analisar a foto (${resp.status}).`);
  const chamada = (data.output ?? []).find((item: { type?: string }) => item.type === "function_call");
  return JSON.parse(chamada?.arguments ?? "{}") as AnaliseFotoCampo;
}
