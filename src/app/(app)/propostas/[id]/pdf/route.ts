import { auth } from "@/auth";
import { gerarPdfDaProposta } from "@/lib/servicos/propostas";
import { ErroNaoEncontrado, ErroPermissao } from "@/lib/servicos/erros";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return new Response("Nao autenticado.", { status: 401 });
  }

  const { id } = await params;
  try {
    const { bytes, nomeArquivo } = await gerarPdfDaProposta(
      { id: session.user.id, nome: session.user.nome, role: session.user.role },
      id
    );
    const body = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    return new Response(body, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${nomeArquivo}"`,
      },
    });
  } catch (error) {
    if (error instanceof ErroNaoEncontrado) return new Response("Proposta nao encontrada.", { status: 404 });
    if (error instanceof ErroPermissao) return new Response("Acesso negado.", { status: 403 });
    return new Response(error instanceof Error ? error.message : "Erro inesperado.", { status: 400 });
  }
}
