import { auth } from "@/auth";
import { obterArquivo } from "@/lib/assistente-arquivos";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ arquivo: string }> }) {
  const session = await auth();
  if (!session?.user) return new Response("Não autenticado.", { status: 401 });

  const { arquivo } = await params;
  const a = obterArquivo(session.user.id, arquivo);
  if (!a) return new Response("Arquivo expirado ou não encontrado. Peça de novo ao assistente.", { status: 404 });

  const corpo = a.bytes.buffer.slice(a.bytes.byteOffset, a.bytes.byteOffset + a.bytes.byteLength) as ArrayBuffer;
  return new Response(corpo, {
    headers: {
      "Content-Type": a.mime,
      "Content-Disposition": `inline; filename="${a.nome.replace(/[^\w.\-]+/g, "_")}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
