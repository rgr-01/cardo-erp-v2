import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { gerarPdfDoRelatorio } from "@/lib/servicos/relatorios";
import { ErroNaoEncontrado, ErroPermissao } from "@/lib/servicos/erros";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await auth();
  if (!session) return new NextResponse("Não autorizado", { status: 401 });

  try {
    const { bytes, nomeArquivo } = await gerarPdfDoRelatorio(
      { id: session.user.id, nome: session.user.nome, role: session.user.role },
      id
    );
    return new NextResponse(Buffer.from(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${nomeArquivo}"`,
      },
    });
  } catch (error) {
    if (error instanceof ErroNaoEncontrado) return new NextResponse("Não encontrado", { status: 404 });
    if (error instanceof ErroPermissao) return new NextResponse("Não autorizado", { status: 403 });
    throw error;
  }
}
