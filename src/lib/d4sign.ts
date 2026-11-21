// Wrapper da API do D4Sign (https://docapi.d4sign.com.br) — envio de
// documento pra assinatura, definição de signatário e consulta de status.
//
// Credenciais via variável de ambiente (não hardcode):
//   D4SIGN_TOKEN_API     token da conta (tokenAPI)
//   D4SIGN_CRYPT_KEY     cryptKey, só existe se estiver habilitado na conta
//   D4SIGN_BASE_URL      opcional; default aponta pra produção
//   D4SIGN_UUID_SAFEBOX  cofre onde os documentos são criados
//   D4SIGN_WEBHOOK_URL   URL pública do endpoint /api/webhooks/d4sign;
//                        cadastrada por documento a cada envio (ver
//                        enviarDocumento) — não confiar só na configuração
//                        manual do cofre no painel.
//
// Certificado ICP-Brasil: o cofre (D4SIGN_UUID_SAFEBOX) está configurado no
// painel D4Sign com "Ponto de autenticação inicial" = "Exigir certificado
// digital ICP-Brasil", então todo documento enviado pra ele já exige esse
// tipo de assinatura por padrão — não precisamos chamar
// POST /certificate/{uuid}/add por documento. `definirCertificadoIcpBrasil`
// abaixo fica só como referência caso um documento específico precise
// sobrescrever o padrão do cofre no futuro.

const BASE_URL = process.env.D4SIGN_BASE_URL || "https://secure.d4sign.com.br/api/v1";

function credenciais() {
  const tokenAPI = process.env.D4SIGN_TOKEN_API;
  if (!tokenAPI) {
    throw new Error("D4SIGN_TOKEN_API não configurado.");
  }
  const cryptKey = process.env.D4SIGN_CRYPT_KEY;
  return { tokenAPI, cryptKey };
}

function montarUrl(path: string, query: Record<string, string | undefined> = {}) {
  const { tokenAPI, cryptKey } = credenciais();
  const url = new URL(`${BASE_URL}${path}`);
  url.searchParams.set("tokenAPI", tokenAPI);
  if (cryptKey) url.searchParams.set("cryptKey", cryptKey);
  for (const [chave, valor] of Object.entries(query)) {
    if (valor !== undefined) url.searchParams.set(chave, valor);
  }
  return url.toString();
}

async function chamarD4Sign<T>(
  path: string,
  opcoes: { method: "GET" | "POST"; body?: unknown; query?: Record<string, string | undefined> } = { method: "GET" }
): Promise<T> {
  const resposta = await fetch(montarUrl(path, opcoes.query), {
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
    method: opcoes.method,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: opcoes.body !== undefined ? JSON.stringify(opcoes.body) : undefined,
  });

  const texto = await resposta.text();
  let json: unknown = null;
  try {
    json = texto ? JSON.parse(texto) : null;
  } catch {
    // Resposta não-JSON: mantém texto bruto na mensagem de erro abaixo.
  }

  if (!resposta.ok) {
    const detalhe = json ? JSON.stringify(json) : texto;
    throw new Error(`D4Sign ${opcoes.method} ${path} falhou (${resposta.status}): ${detalhe}`);
  }

  return json as T;
}

export type UploadDocumentoResposta = {
  uuid: string;
  [chave: string]: unknown;
};

// Envia o PDF (bytes já gerados por gerarPdfProposta) pro cofre configurado
// em D4SIGN_UUID_SAFEBOX. Retorna o uuid do documento no D4Sign.
export async function enviarDocumento(
  pdfBytes: Uint8Array,
  nomeArquivo: string
): Promise<string> {
  const uuidSafebox = process.env.D4SIGN_UUID_SAFEBOX;
  if (!uuidSafebox) {
    throw new Error("D4SIGN_UUID_SAFEBOX não configurado.");
  }

  const base64 = Buffer.from(pdfBytes).toString("base64");
  const resposta = await chamarD4Sign<UploadDocumentoResposta>(
    `/documents/${uuidSafebox}/uploadbinary`,
    {
      method: "POST",
      body: {
        base64_binary_file: base64,
        mime_type: "application/pdf",
        name: nomeArquivo,
      },
    }
  );

  if (!resposta?.uuid) {
    throw new Error(`D4Sign não retornou uuid do documento: ${JSON.stringify(resposta)}`);
  }

  // A configuração de webhook do cofre no painel (modal "Webhook Cofre") não
  // se mostrou confiável em teste real — documentos enviados via API não
  // vieram com o webhook associado automaticamente. Por segurança, cadastra
  // explicitamente por documento via POST /documents/{uuid}/webhooks. Não
  // bloqueia o envio se falhar (esse endpoint tem rate limit agressivo,
  // visto em teste): o documento já foi criado no D4Sign, e sem webhook o
  // status será recuperado pela varredura periódica em lib/assinaturas.ts.
  const webhookUrl = process.env.D4SIGN_WEBHOOK_URL;
  if (webhookUrl) {
    try {
      await chamarD4Sign(`/documents/${resposta.uuid}/webhooks`, {
        method: "POST",
        body: { url: webhookUrl },
      });
    } catch (error) {
      console.error(`[D4Sign] falha ao cadastrar webhook no documento ${resposta.uuid}:`, error);
    }
  }

  return resposta.uuid;
}

export type SignatarioInput = {
  email: string;
  // "1" assinar, conforme os valores de "act" documentados pelo D4Sign
  // (consultar https://docapi.d4sign.com.br/reference/cadastrar-signatários).
  act?: string;
  foreign?: "0" | "1";
  // "1" faz o D4Sign devolver, no retorno do createlist, um link direto de
  // assinatura desse signatário (assinatura_presencial_link) — o bot manda
  // esse link pro consultor encaminhar ao cliente pelo WhatsApp. O e-mail
  // continua indo normalmente (skip_email "0" em enviarParaAssinatura).
  assinaturaPresencial?: boolean;
};

export type SignatarioCadastrado = {
  email: string;
  keySigner: string | null;
  link: string | null;
};

// Varre a resposta do D4Sign atrás dos objetos de signatário — o formato
// exato (array direto, { message: [...] } ou aninhado) não é garantido pela
// doc pública, então não depende de um caminho fixo.
export function extrairSignatarios(resposta: unknown): SignatarioCadastrado[] {
  const encontrados: SignatarioCadastrado[] = [];
  const visitar = (valor: unknown) => {
    if (Array.isArray(valor)) {
      valor.forEach(visitar);
      return;
    }
    if (!valor || typeof valor !== "object") return;
    const obj = valor as Record<string, unknown>;
    if (typeof obj.email === "string") {
      const link = obj.assinatura_presencial_link;
      encontrados.push({
        email: obj.email,
        keySigner: typeof obj.key_signer === "string" ? obj.key_signer : null,
        link: typeof link === "string" && /^https?:\/\//.test(link) ? link : null,
      });
    }
    Object.values(obj).forEach(visitar);
  };
  visitar(resposta);
  return encontrados;
}

// Cadastra o(s) signatário(s) do documento — todos precisam assinar pra
// completar (ver enviarParaAssinatura/workflowSequencial se a ordem
// importar). Assinatura por certificado ICP-Brasil em nuvem é definida à
// parte, via `definirCertificadoIcpBrasil`.
export async function definirSignatario(
  documentoUuid: string,
  signatarios: SignatarioInput | SignatarioInput[]
): Promise<SignatarioCadastrado[]> {
  const lista = Array.isArray(signatarios) ? signatarios : [signatarios];
  const resposta = await chamarD4Sign<unknown>(`/documents/${documentoUuid}/createlist`, {
    method: "POST",
    body: {
      signers: lista.map((signatario) => ({
        email: signatario.email,
        act: signatario.act ?? "1",
        foreign: signatario.foreign ?? "0",
        ...(signatario.assinaturaPresencial ? { assinatura_presencial: "1" } : {}),
      })),
    },
  });
  return extrairSignatarios(resposta);
}

// GET /documents/{uuid}/list — signatários do documento. Usado pra buscar o
// link de assinatura de novo quando ele não foi gravado no envio.
export async function listarSignatarios(documentoUuid: string): Promise<SignatarioCadastrado[]> {
  const resposta = await chamarD4Sign<unknown>(`/documents/${documentoUuid}/list`, { method: "GET" });
  return extrairSignatarios(resposta);
}

// TODO(D4Sign): valores de document_type/pades ainda não confirmados com o
// D4Sign para certificado ICP-Brasil em nuvem (ver conversa com o comercial).
// Não chamar em produção até a resposta deles — os valores abaixo são
// placeholders para não travar o resto da integração.
/* eslint-disable @typescript-eslint/no-unused-vars -- assinatura já definida; corpo aguarda o D4Sign */
export async function definirCertificadoIcpBrasil(
  _documentoUuid: string,
  _keySigner: string,
  _documento: { tipo: "CPF" | "CNPJ"; numero: string }
): Promise<void> {
  throw new Error(
    "definirCertificadoIcpBrasil ainda não implementado: aguardando confirmação do D4Sign sobre document_type/pades."
  );
}
/* eslint-enable @typescript-eslint/no-unused-vars */

export async function enviarParaAssinatura(
  documentoUuid: string,
  opcoes: { mensagem?: string; workflowSequencial?: boolean } = {}
): Promise<void> {
  await chamarD4Sign(`/documents/${documentoUuid}/sendtosigner`, {
    method: "POST",
    body: {
      skip_email: "0",
      workflow: opcoes.workflowSequencial ? "1" : "0",
      ...(opcoes.mensagem ? { message: opcoes.mensagem } : {}),
    },
  });
}

export type DocumentoD4Sign = {
  uuidDoc: string;
  statusId?: string;
  statusName?: string;
  [chave: string]: unknown;
};

// GET /documents/{uuid} devolve um array (mesmo pra um único documento) —
// confirmado testando contra a API real, a doc pública não deixava isso claro.
export async function consultarDocumento(documentoUuid: string): Promise<DocumentoD4Sign> {
  const resposta = await chamarD4Sign<DocumentoD4Sign[]>(`/documents/${documentoUuid}`, {
    method: "GET",
  });
  const documento = resposta[0];
  if (!documento) {
    throw new Error(`D4Sign não retornou documento para uuid ${documentoUuid}.`);
  }
  return documento;
}

// POST /documents/{uuid}/download não devolve o binário direto: devolve JSON
// { url, name } com um link assinado e temporário pro PDF (confirmado
// testando contra a API real — a doc pública não deixava isso claro).
export async function baixarDocumento(documentoUuid: string): Promise<Uint8Array> {
  const { url } = await chamarD4Sign<{ url: string; name: string }>(
    `/documents/${documentoUuid}/download`,
    { method: "POST", body: { type: "pdf", encoding: false } }
  );
  const respostaPdf = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(30_000) });
  if (!respostaPdf.ok) {
    throw new Error(`D4Sign: falha ao baixar PDF (${respostaPdf.status}).`);
  }
  return new Uint8Array(await respostaPdf.arrayBuffer());
}

export function d4signConfigurado(): boolean {
  return Boolean(process.env.D4SIGN_TOKEN_API && process.env.D4SIGN_UUID_SAFEBOX);
}
