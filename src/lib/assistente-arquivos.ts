import crypto from "node:crypto";

// Arquivos que o assistente do site gera (PDFs, gráficos, notas) e entrega como
// link. Ficam só na memória do servidor por um tempo curto: servem para abrir ou
// baixar logo depois do pedido, e sempre só para o usuário que pediu.

const VALIDADE_MS = 30 * 60 * 1000;
const MAX_POR_USUARIO = 40;

type Arquivo = { usuarioId: string; bytes: Buffer; mime: string; nome: string; expiraEm: number };

const globalComArquivos = globalThis as unknown as { __assistenteArquivos?: Map<string, Arquivo> };
const arquivos = (globalComArquivos.__assistenteArquivos ??= new Map<string, Arquivo>());

const EXTENSOES: Record<string, string> = {
  "application/pdf": "pdf",
  "image/png": "png",
  "image/jpeg": "jpg",
};

function limpar() {
  const agora = Date.now();
  for (const [id, a] of arquivos) if (a.expiraEm <= agora) arquivos.delete(id);
}

export function guardarArquivo(usuarioId: string, bytes: Buffer, mime: string, nome: string): string {
  limpar();
  const doUsuario = [...arquivos.entries()].filter(([, a]) => a.usuarioId === usuarioId);
  if (doUsuario.length >= MAX_POR_USUARIO) {
    const maisAntigo = doUsuario.sort((a, b) => a[1].expiraEm - b[1].expiraEm)[0];
    arquivos.delete(maisAntigo[0]);
  }
  const id = crypto.randomBytes(18).toString("hex");
  arquivos.set(id, { usuarioId, bytes, mime, nome, expiraEm: Date.now() + VALIDADE_MS });
  return `/api/assistente/arquivo/${id}.${EXTENSOES[mime] ?? "bin"}`;
}

export function obterArquivo(usuarioId: string, idComExtensao: string): Arquivo | null {
  limpar();
  const id = idComExtensao.replace(/\.[a-z0-9]+$/i, "");
  const a = arquivos.get(id);
  return a && a.usuarioId === usuarioId ? a : null;
}
