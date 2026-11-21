import { auth } from "@/auth";
import { getSafraAtualId } from "@/lib/safra-atual";
import { montarPdfGerencial, pdfParaResponse } from "@/lib/relatorios-exportacao";

export const runtime = "nodejs";

const LIMITE_IMAGEM = 15 * 1024 * 1024;
const ASSINATURA_PNG = [0x89, 0x50, 0x4e, 0x47];

async function gerar(imagemDashboard?: Uint8Array, consultoresPedidos: string[] = []) {
  const session = await auth();
  if (!session?.user) return new Response("Nao autenticado.", { status: 401 });

  const ehAdmin = session.user.role === "ADMIN";
  // Admin pode pedir o relatório só de alguns consultores (filtro do dashboard).
  const consultorIds = ehAdmin ? consultoresPedidos : [session.user.id];

  const safraId = await getSafraAtualId();
  const gerado = await montarPdfGerencial({
    safraId,
    consultorIds,
    incluirRanking: ehAdmin,
    imagemDashboard,
  });

  return pdfParaResponse(gerado);
}

export async function GET() {
  return gerar();
}

// A web envia o PNG do resumo do dashboard (tema claro) para entrar após a capa.
export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);
  const arquivo = form?.get("imagem");
  if (!(arquivo instanceof Blob) || arquivo.size === 0 || arquivo.size > LIMITE_IMAGEM) {
    return new Response("Imagem do dashboard invalida.", { status: 400 });
  }
  const bytes = new Uint8Array(await arquivo.arrayBuffer());
  if (!ASSINATURA_PNG.every((b, i) => bytes[i] === b)) {
    return new Response("Imagem do dashboard invalida.", { status: 400 });
  }
  const consultores = String(form?.get("consultores") ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter((id) => /^[\w-]{1,64}$/.test(id));
  return gerar(bytes, consultores);
}
