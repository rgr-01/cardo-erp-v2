// Wrapper da API da Focus NFe (https://focusnfe.com.br) — emissão,
// consulta e cancelamento de NF-e via SEFAZ.
//
// Credenciais via variável de ambiente (não hardcode):
//   FOCUS_NFE_TOKEN            token da conta na Focus NFe (o mesmo token
//                               autentica homologação e produção; o ambiente
//                               é decidido pela URL base, ver FOCUS_NFE_AMBIENTE)
//   FOCUS_NFE_AMBIENTE         "producao" liga a API de produção; qualquer
//                               outro valor (ou ausente) usa homologação —
//                               default seguro pra não emitir nota real sem
//                               decisão explícita
//   FOCUS_NFE_CNPJ_EMITENTE    CNPJ da empresa emitente, já cadastrada e com
//                               certificado A1 configurado no painel da
//                               Focus NFe (só dígitos)
//   FOCUS_NFE_UF_EMITENTE      UF (sigla, ex. "BA") do estabelecimento
//                               emitente — usada só para decidir CFOP interno
//                               (5xxx) x interestadual (6xxx) por pedido, ver
//                               cfopParaDestino em lib/servicos/financeiro.ts
//   FOCUS_NFE_WEBHOOK_SECRET   query string (?secret=...) cadastrada junto
//                               da URL de webhook no painel da Focus NFe —
//                               confere que o POST recebido veio de lá
//                               (ver app/api/webhooks/focusnfe/route.ts)
//
// A Focus NFe processa a autorização de forma assíncrona: o POST de emissão
// devolve "processando_autorizacao" na maioria das vezes, e o resultado
// final (autorizado/erro_autorizacao/denegado) chega depois via webhook ou
// precisa ser consultado (ver sincronizarNotaFiscalFocusNfe em
// lib/servicos/financeiro.ts).

const BASE_URL_HOMOLOGACAO = "https://homologacao.focusnfe.com.br";
const BASE_URL_PRODUCAO = "https://api.focusnfe.com.br";

function baseUrl(): string {
  return process.env.FOCUS_NFE_AMBIENTE === "producao" ? BASE_URL_PRODUCAO : BASE_URL_HOMOLOGACAO;
}

export function ambienteFocusNfe(): "PRODUCAO" | "HOMOLOGACAO" {
  return process.env.FOCUS_NFE_AMBIENTE === "producao" ? "PRODUCAO" : "HOMOLOGACAO";
}

function token(): string {
  const t = process.env.FOCUS_NFE_TOKEN;
  if (!t) throw new Error("FOCUS_NFE_TOKEN não configurado.");
  return t;
}

export function focusNfeConfigurado(): boolean {
  return Boolean(process.env.FOCUS_NFE_TOKEN && process.env.FOCUS_NFE_CNPJ_EMITENTE);
}

export type FocusNfeErro = { campo?: string; mensagem: string };

// Campos observados na prática além dos documentados — a API devolve muita
// coisa a mais dependendo do status, por isso o índice genérico no fim.
export type FocusNfeResposta = {
  status?: "processando_autorizacao" | "autorizado" | "erro_autorizacao" | "cancelado" | "denegado";
  numero?: string;
  serie?: string;
  chave_nfe?: string;
  caminho_danfe?: string;
  caminho_xml_nota_fiscal?: string;
  mensagem_sefaz?: string;
  mensagem?: string;
  erros?: FocusNfeErro[];
  [chave: string]: unknown;
};

// Não lança em respostas de erro "esperadas" (4xx/5xx da própria Focus NFe
// costumam vir com JSON útil em erros/mensagem) — quem chama decide o que
// fazer olhando pra `status`/`erros`. Só lança em falha de rede/timeout ou
// resposta que não é JSON (indica algo fora do contrato da API).
async function chamarFocusNfe<T = FocusNfeResposta>(
  path: string,
  opcoes: { method: "GET" | "POST" | "DELETE"; body?: unknown; query?: Record<string, string | undefined> } = {
    method: "GET",
  }
): Promise<T> {
  const url = new URL(`${baseUrl()}${path}`);
  for (const [chave, valor] of Object.entries(opcoes.query ?? {})) {
    if (valor !== undefined) url.searchParams.set(chave, valor);
  }

  const resposta = await fetch(url, {
    method: opcoes.method,
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
    headers: {
      // Focus NFe autentica por Basic Auth: token como usuário, senha vazia.
      Authorization: `Basic ${Buffer.from(`${token()}:`).toString("base64")}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: opcoes.body !== undefined ? JSON.stringify(opcoes.body) : undefined,
  });

  const texto = await resposta.text();
  let json: unknown;
  try {
    json = texto ? JSON.parse(texto) : {};
  } catch {
    throw new Error(`Focus NFe ${opcoes.method} ${path}: resposta inesperada (${resposta.status}): ${texto.slice(0, 300)}`);
  }
  return json as T;
}

// POST /v2/nfe?ref=... — `referencia` é escolhida por nós (não é o número da
// nota) e serve pra consultar/cancelar depois e pra casar o webhook com a
// nota certa. Reenviar com a mesma referência depois de um erro não refaz a
// tentativa — a Focus NFe considera a referência já usada — por isso quem
// chama gera uma referência nova a cada tentativa (ver gerarReferencia em
// lib/servicos/financeiro.ts).
export async function emitirNfeFocus(referencia: string, payload: Record<string, unknown>): Promise<FocusNfeResposta> {
  return chamarFocusNfe(`/v2/nfe`, { method: "POST", query: { ref: referencia }, body: payload });
}

export async function consultarNfeFocus(referencia: string): Promise<FocusNfeResposta> {
  return chamarFocusNfe(`/v2/nfe/${encodeURIComponent(referencia)}`, { method: "GET" });
}

// Justificativa é obrigatória pela SEFAZ e precisa de pelo menos 15
// caracteres — validar antes de chamar evita gastar uma tentativa.
export async function cancelarNfeFocus(referencia: string, justificativa: string): Promise<FocusNfeResposta> {
  return chamarFocusNfe(`/v2/nfe/${encodeURIComponent(referencia)}`, {
    method: "DELETE",
    body: { justificativa },
  });
}

// caminho_danfe/caminho_xml_nota_fiscal vêm relativos ao ambiente (homolog.
// ou produção) que emitiu a nota — não trocar de ambiente sem reemitir.
export function urlAbsolutaFocusNfe(caminho: string): string {
  return caminho.startsWith("http") ? caminho : `${baseUrl()}${caminho}`;
}
