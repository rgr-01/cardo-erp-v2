import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const BUCKET = process.env.SUPABASE_FOTOS_BUCKET || "relatorios-visita";
const URL_PUBLICA_PREFIXO = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/`;

export const TAMANHO_MAXIMO_IMAGEM = 8 * 1024 * 1024;

type TipoImagem = "image/jpeg" | "image/png" | "image/webp";

function detectarTipoImagem(buffer: Buffer): TipoImagem | null {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
  return null;
}

export function validarImagem(buffer: Buffer): { contentType: TipoImagem; extensao: "jpg" | "png" | "webp" } {
  if (buffer.byteLength === 0) throw new Error("A imagem enviada está vazia.");
  if (buffer.byteLength > TAMANHO_MAXIMO_IMAGEM) throw new Error("A imagem excede 8MB.");
  const contentType = detectarTipoImagem(buffer);
  if (!contentType) throw new Error("Envie uma imagem JPEG, PNG ou WebP válida.");
  const extensao = contentType === "image/jpeg" ? "jpg" : contentType.slice("image/".length) as "png" | "webp";
  return { contentType, extensao };
}

let clienteAdmin: ReturnType<typeof createClient> | null = null;

function getSupabaseAdmin() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      "Storage de fotos não configurado. Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY."
    );
  }
  clienteAdmin ??= createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return clienteAdmin;
}

export function storageConfigurado(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);
}

export async function verificarStorage(): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.storage.getBucket(BUCKET);
  if (error) throw new Error(error.message);
}

// Links assinados: o mesmo arquivo devolve o mesmo link enquanto ele ainda
// vale por um bom tempo (o navegador reaproveita a imagem já baixada em vez de
// baixar de novo a cada tela), e os pedidos feitos na mesma volta do event
// loop vão juntos num único createSignedUrls (uma lista de visitas assinava
// foto por foto, uma chamada HTTP cada).
type LinkGuardado = { url: string; expiraEm: number };
const linksGuardados = new Map<string, LinkGuardado>();
const MAX_LINKS_GUARDADOS = 20_000;

type Pendente = { path: string; resolver: (url: string) => void; rejeitar: (erro: Error) => void };
const filas = new Map<number, Pendente[]>();

function chaveLink(path: string, expiraEmSegundos: number) {
  return `${expiraEmSegundos}|${path}`;
}

// Arquivo regravado no mesmo caminho (logo, foto de perfil): link novo.
function esquecerLinks(path: string) {
  for (const chave of linksGuardados.keys()) if (chave.endsWith(`|${path}`)) linksGuardados.delete(chave);
}

async function assinarFila(expiraEmSegundos: number) {
  const fila = filas.get(expiraEmSegundos) ?? [];
  filas.delete(expiraEmSegundos);
  const paths = [...new Set(fila.map((p) => p.path))];
  try {
    const { data, error } = await getSupabaseAdmin().storage.from(BUCKET).createSignedUrls(paths, expiraEmSegundos);
    if (error) throw error;
    const porPath = new Map((data ?? []).map((d) => [d.path, d]));
    const expiraEm = Date.now() + expiraEmSegundos * 1000;
    if (linksGuardados.size > MAX_LINKS_GUARDADOS) linksGuardados.clear();
    for (const p of fila) {
      const item = porPath.get(p.path);
      if (item?.signedUrl) {
        linksGuardados.set(chaveLink(p.path, expiraEmSegundos), { url: item.signedUrl, expiraEm });
        p.resolver(item.signedUrl);
      } else {
        p.rejeitar(new Error(`Falha ao gerar acesso temporário ao arquivo: ${item?.error ?? "arquivo indisponível"}`));
      }
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    for (const p of fila) p.rejeitar(new Error(`Falha ao gerar acesso temporário ao arquivo: ${msg}`));
  }
}

export async function criarUrlAssinada(path: string, expiraEmSegundos = 60 * 60): Promise<string> {
  const guardado = linksGuardados.get(chaveLink(path, expiraEmSegundos));
  // Reaproveita enquanto ainda falta ao menos 1/5 da validade.
  if (guardado && guardado.expiraEm - Date.now() > expiraEmSegundos * 200) return guardado.url;
  getSupabaseAdmin();
  return new Promise((resolver, rejeitar) => {
    let fila = filas.get(expiraEmSegundos);
    if (!fila) {
      fila = [];
      filas.set(expiraEmSegundos, fila);
      setTimeout(() => void assinarFila(expiraEmSegundos), 0);
    }
    fila.push({ path, resolver, rejeitar });
  });
}

function caminhoDaUrlPublica(url: string): string | null {
  if (!SUPABASE_URL || !url.startsWith(URL_PUBLICA_PREFIXO)) return null;
  try {
    return decodeURIComponent(url.slice(URL_PUBLICA_PREFIXO.length));
  } catch {
    return null;
  }
}

export async function assinarUrlArmazenada(arquivo: { path?: string | null; url: string }): Promise<string> {
  const path = arquivo.path || caminhoDaUrlPublica(arquivo.url);
  if (!path || !storageConfigurado()) return arquivo.url;
  return criarUrlAssinada(path);
}

export async function assinarArquivos<T extends { path?: string | null; url: string }>(arquivos: T[]): Promise<T[]> {
  return Promise.all(arquivos.map(async (arquivo) => ({ ...arquivo, url: await assinarUrlArmazenada(arquivo) })));
}

export async function assinarBlocosDeFotos<T extends { tipo?: string; path?: string | null; url?: string }>(blocos: T[]): Promise<T[]> {
  return Promise.all(blocos.map(async (bloco) => {
    if (bloco.tipo !== "foto" || !bloco.url) return bloco;
    return { ...bloco, url: await assinarUrlArmazenada({ path: bloco.path, url: bloco.url }) };
  }));
}

async function enviarBuffer(
  buffer: Buffer,
  contentType: string,
  nomeOriginal: string,
  path: string,
  upsert = false
): Promise<{ url: string; path: string }> {
  const supabase = getSupabaseAdmin();
  const imagem = contentType.startsWith("image/") ? validarImagem(buffer) : null;

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, buffer, {
      contentType: imagem?.contentType ?? (contentType || "application/octet-stream"),
      upsert,
    });

  if (error) throw new Error(`Falha ao enviar foto: ${error.message}`);
  if (upsert) esquecerLinks(path);

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return { url: data.publicUrl, path };
}

export async function excluirArquivo(path: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  await supabase.storage.from(BUCKET).remove([path]);
  esquecerLinks(path);
}

export async function enviarBufferFotoVisita(
  buffer: Buffer,
  contentType: string,
  nomeOriginal: string,
  relatorioId: string
): Promise<{ url: string; path: string }> {
  const { extensao } = validarImagem(buffer);
  const nomeArquivo = `${crypto.randomUUID()}.${extensao}`;
  const path = `${relatorioId}/${nomeArquivo}`;
  return enviarBuffer(buffer, contentType, nomeOriginal, path);
}

export async function enviarFotoVisita(
  arquivo: File,
  relatorioId: string
): Promise<{ url: string; path: string }> {
  const buffer = Buffer.from(await arquivo.arrayBuffer());
  return enviarBufferFotoVisita(buffer, arquivo.type, arquivo.name, relatorioId);
}

export async function excluirFotoVisita(path: string): Promise<void> {
  return excluirArquivo(path);
}

// Marca da empresa (Configurações): logo clara, logo escura e ícone da aba.
export async function enviarBufferMarcaEmpresa(
  buffer: Buffer,
  contentType: string,
  nomeOriginal: string,
  empresaId: string,
  tipo: "logo" | "logo-escuro" | "icone"
): Promise<{ url: string; path: string }> {
  const { extensao } = validarImagem(buffer);
  const path = `marcas-empresa/${empresaId}/${tipo}-${crypto.randomUUID()}.${extensao}`;
  return enviarBuffer(buffer, contentType, nomeOriginal, path);
}

// Logo do parceiro que sai à direita do cabeçalho do relatório.
export async function enviarBufferLogoParceiro(
  buffer: Buffer,
  contentType: string,
  nomeOriginal: string,
  relatorioId: string
): Promise<{ url: string; path: string }> {
  const { extensao } = validarImagem(buffer);
  const path = `logos-parceiro/${relatorioId}/${crypto.randomUUID()}.${extensao}`;
  return enviarBuffer(buffer, contentType, nomeOriginal, path);
}

// Biblioteca de logos dos relatórios (Configurações), compartilhada entre eles.
export async function enviarBufferLogoRelatorio(
  buffer: Buffer,
  contentType: string,
  nomeOriginal: string,
  empresaId: string
): Promise<{ url: string; path: string }> {
  const { extensao } = validarImagem(buffer);
  const path = `logos-relatorio/${empresaId}/${crypto.randomUUID()}.${extensao}`;
  return enviarBuffer(buffer, contentType, nomeOriginal, path);
}

// URL temporária da logo (bucket privado), ou null sem logo/sem storage.
export async function urlLogoParceiro(path: string | null | undefined): Promise<string | null> {
  if (!path || !storageConfigurado()) return null;
  try {
    return await criarUrlAssinada(path);
  } catch {
    return null;
  }
}

export async function enviarBufferComprovante(
  buffer: Buffer,
  contentType: string,
  nomeOriginal: string,
  despesaId: string
): Promise<{ url: string; path: string }> {
  const { extensao } = validarImagem(buffer);
  const nomeArquivo = `${crypto.randomUUID()}.${extensao}`;
  const path = `despesas/${despesaId}/${nomeArquivo}`;
  return enviarBuffer(buffer, contentType, nomeOriginal, path);
}

// Documento assinado (PDF) ou certificado de autenticidade recebidos do
// D4Sign via webhook, um por proposta.
export async function enviarBufferAssinatura(
  buffer: Buffer,
  contentType: string,
  nomeOriginal: string,
  propostaId: string
): Promise<{ url: string; path: string }> {
  const extensao = nomeOriginal.split(".").pop()?.toLowerCase() || "pdf";
  // Nome estável por documento: webhook e recuperação podem executar juntos.
  const nomeArquivo = `${nomeOriginal.replace(/[^a-zA-Z0-9_-]/g, "_")}.${extensao}`;
  const path = `propostas/${propostaId}/${nomeArquivo}`;
  return enviarBuffer(buffer, contentType, nomeOriginal, path, true);
}

export async function enviarBufferFotoPerfil(
  buffer: Buffer,
  contentType: string,
  nomeOriginal: string,
  userId: string
): Promise<{ url: string; path: string }> {
  const { extensao } = validarImagem(buffer);
  const path = `perfis/${userId}/${crypto.randomUUID()}.${extensao}`;
  return enviarBuffer(buffer, contentType, nomeOriginal, path);
}
