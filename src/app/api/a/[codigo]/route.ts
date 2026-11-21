import { prisma } from "@/lib/prisma";
import { assinaturaConfere, partesDoLinkCurto } from "@/lib/link-curto";

// Redireciona o link curto de assinatura (ver lib/link-curto.ts) pro link do
// D4Sign. Pública de propósito: quem assina é o cliente, sem login.
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ codigo: string }> }
) {
  const { codigo } = await ctx.params;
  const partes = partesDoLinkCurto(decodeURIComponent(codigo));
  if (!partes) return new Response("Link inválido.", { status: 404 });

  const proposta = await prisma.proposta.findUnique({
    where: { numero: partes.numero },
    select: { id: true, linkAssinaturaCliente: true },
  });
  if (
    !proposta?.linkAssinaturaCliente ||
    !assinaturaConfere(proposta.id, partes.assinatura)
  ) {
    return new Response("Link inválido ou expirado.", { status: 404 });
  }
  return Response.redirect(proposta.linkAssinaturaCliente, 302);
}
