export const runtime = "nodejs";

import { marcaParaApp } from "@/lib/empresa-marca";
import { exigirSessaoMobile } from "@/lib/mobile-auth";
import { jsonOk, respostaDeErro } from "@/lib/api-mobile";
import { prisma } from "@/lib/prisma";

// O app pede a marca ao abrir: as URLs assinadas das logos vencem e a empresa
// pode ter trocado logo ou cor no painel.
export async function GET(request: Request) {
  try {
    const sessao = await exigirSessaoMobile(request);
    const usuario = await prisma.user.findUnique({ where: { id: sessao.id }, select: { empresaId: true } });
    return jsonOk({ empresa: usuario ? await marcaParaApp(usuario.empresaId, new URL(request.url).origin) : null });
  } catch (error) {
    return respostaDeErro(error);
  }
}
