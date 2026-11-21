// Leitura da prévia rabiscada: o bot manda a página do relatório como imagem
// (previa_relatorio), o consultor circula/risca/escreve por cima com o lápis do
// WhatsApp e devolve. A IA de visão diz QUAIS itens do relatório foram marcados
// (pela lista numerada de itensDoRelatorio) e o que foi escrito/pedido em cada
// um. Quem aplica a mudança é o agente, com editar_item_relatorio e afins.

const OPENAI_URL = "https://api.openai.com/v1/responses";

export type CorrecaoLida = {
  e_previa: boolean;
  correcoes: { item_numero: number | null; marcacao: string; pedido: string }[];
  observacao: string | null;
};

const LER_TOOL = {
  type: "function",
  name: "ler_correcoes",
  description: "Devolve as correções que o consultor marcou à mão na página do relatório.",
  parameters: {
    type: "object",
    properties: {
      e_previa: {
        type: "boolean",
        description: "true se a imagem é uma página do relatório (com ou sem rabiscos); false se é outra foto (campo, nota fiscal etc.).",
      },
      correcoes: {
        type: "array",
        items: {
          type: "object",
          properties: {
            item_numero: { type: ["integer", "null"], description: "Número do item da lista que foi marcado; null se não der pra saber." },
            marcacao: { type: "string", description: "O que foi feito na página: 'circulou', 'riscou', 'seta', 'sublinhou' etc., e onde." },
            pedido: {
              type: "string",
              description: "O que o consultor escreveu à mão, transcrito fiel, ou o pedido implícito (riscado = tirar). Vazio se só circulou sem escrever.",
            },
          },
          required: ["item_numero", "marcacao", "pedido"],
          additionalProperties: false,
        },
      },
      observacao: { type: ["string", "null"] },
    },
    required: ["e_previa", "correcoes", "observacao"],
    additionalProperties: false,
  },
};

const INSTRUCOES = [
  "Você recebe a imagem de uma página de relatório agronômico na qual o consultor rabiscou à mão (lápis do WhatsApp) pra pedir correções, e a lista numerada dos itens do relatório.",
  "Ache cada marca feita à mão (círculo, risco, seta, sublinhado, X, texto escrito) e diga sobre qual item da lista ela está: compare o texto, título do gráfico, legenda ou foto embaixo da marca com a lista.",
  "Transcreva o que estiver escrito à mão exatamente. Riscado/X sem texto = pedido de tirar. Circulado sem texto = 'circulou sem escrever' (o bot vai perguntar).",
  "Ignore o que é parte normal da página (marcações impressas na foto, cores do layout). Se a imagem não for uma página de relatório, e_previa=false.",
].join("\n");

export async function lerCorrecoesDaPrevia(
  imagem: Buffer,
  contentType: string,
  itens: { numero: number; tipo: string; resumo: string }[],
  comentario: string | null
): Promise<CorrecaoLida> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY não configurada.");
  const modelo = process.env.OPENAI_MODEL_VISION || process.env.OPENAI_MODEL || "gpt-4.1-mini";
  const lista = itens.map((i) => `${i.numero}. [${i.tipo}] ${i.resumo}`).join("\n");

  const resp = await fetch(OPENAI_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: modelo,
      instructions: INSTRUCOES,
      input: [{
        role: "user",
        content: [
          { type: "input_text", text: `Itens do relatório:\n${lista}${comentario ? `\n\nO consultor também disse: ${comentario}` : ""}` },
          { type: "input_image", image_url: `data:${contentType};base64,${imagem.toString("base64")}`, detail: "high" },
        ],
      }],
      tools: [LER_TOOL],
      tool_choice: { type: "function", name: "ler_correcoes" },
    }),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(`A IA não conseguiu ler a página (${resp.status}).`);
  const chamada = (data.output ?? []).find((item: { type?: string }) => item.type === "function_call");
  const args = JSON.parse(chamada?.arguments ?? "{}");
  return {
    e_previa: Boolean(args.e_previa),
    correcoes: Array.isArray(args.correcoes) ? args.correcoes : [],
    observacao: args.observacao ?? null,
  };
}

// Trava de segurança do anexar_foto_ao_relatorio: print de página do
// relatório (a prévia, rabiscada ou não), captura de tela ou documento não é
// foto de campo e não pode entrar no relatório como evidência.
export async function ehPaginaOuPrint(imagem: Buffer, contentType: string): Promise<boolean> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return false;
  const modelo = process.env.OPENAI_MODEL_VISION || process.env.OPENAI_MODEL || "gpt-4.1-mini";
  try {
    const resp = await fetch(OPENAI_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: modelo,
        input: [{
          role: "user",
          content: [
            { type: "input_text", text: "Esta imagem é uma FOTO tirada no campo (lavoura, planta, praga, solo, máquina, pessoas) ou é um PRINT/página de documento (página de relatório, captura de tela, gráfico impresso, PDF, texto)?" },
            { type: "input_image", image_url: `data:${contentType};base64,${imagem.toString("base64")}`, detail: "low" },
          ],
        }],
        tools: [{
          type: "function",
          name: "classificar",
          description: "Classifica a imagem.",
          parameters: {
            type: "object",
            properties: { tipo: { type: "string", enum: ["foto_de_campo", "print_ou_documento"] } },
            required: ["tipo"],
            additionalProperties: false,
          },
        }],
        tool_choice: { type: "function", name: "classificar" },
      }),
    });
    const data = await resp.json().catch(() => ({}));
    const chamada = (data.output ?? []).find((item: { type?: string }) => item.type === "function_call");
    return JSON.parse(chamada?.arguments ?? "{}").tipo === "print_ou_documento";
  } catch {
    return false;
  }
}

export type TipoImagem = "campo" | "rabiscada" | "print";

// O que é a imagem que acabou de chegar — decidido na chegada (conversa.ts),
// pra o bot não ter que adivinhar:
// - campo: foto limpa de campo (vai pro relatório);
// - rabiscada: foto de campo com marcas feitas à mão (círculo, seta, texto do
//   lápis do WhatsApp) — é REFERÊNCIA de onde marcar, não entra no relatório;
// - print: página do relatório/prévia, captura de tela, documento ou nota.
export async function classificarImagem(imagem: Buffer, contentType: string): Promise<TipoImagem> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return "campo";
  const modelo = process.env.OPENAI_MODEL_VISION || process.env.OPENAI_MODEL || "gpt-4.1-mini";
  try {
    const resp = await fetch(OPENAI_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: modelo,
        input: [{
          role: "user",
          content: [
            { type: "input_text", text: "Classifique a imagem: 'campo' = foto real (lavoura, planta, praga, solo, máquina, pessoas) SEM marcas feitas à mão por cima; 'rabiscada' = foto real com marcas desenhadas à mão por cima (círculo, seta, risco ou texto à mão, típico do lápis do WhatsApp) — etiquetas digitais retas e limpas não contam; 'print' = página de relatório, captura de tela, gráfico, PDF, documento, nota fiscal ou texto." },
            { type: "input_image", image_url: `data:${contentType};base64,${imagem.toString("base64")}`, detail: "low" },
          ],
        }],
        tools: [{
          type: "function",
          name: "classificar",
          description: "Classifica a imagem.",
          parameters: {
            type: "object",
            properties: { tipo: { type: "string", enum: ["campo", "rabiscada", "print"] } },
            required: ["tipo"],
            additionalProperties: false,
          },
        }],
        tool_choice: { type: "function", name: "classificar" },
      }),
    });
    const data = await resp.json().catch(() => ({}));
    const chamada = (data.output ?? []).find((item: { type?: string }) => item.type === "function_call");
    const tipo = JSON.parse(chamada?.arguments ?? "{}").tipo;
    return tipo === "rabiscada" || tipo === "print" ? tipo : "campo";
  } catch {
    return "campo";
  }
}
