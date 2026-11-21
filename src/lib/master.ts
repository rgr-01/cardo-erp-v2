import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { semFiltroEmpresa } from "@/lib/empresa-contexto";

// Empresa da própria equipe Cardo AI (dona das contas super ADM).
export const EMPRESA_CARDO_AI = "empresa_cardoai";

// Painel master: só a equipe Cardo AI; quem não é volta para o sistema comum.
export async function exigirSuperAdminPagina(): Promise<{ nome: string }> {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const usuario = await semFiltroEmpresa(() =>
    prisma.user.findUnique({ where: { id: session.user.id }, select: { nome: true, ativo: true, superAdmin: true } })
  );
  if (!usuario?.ativo) redirect("/login");
  if (!usuario.superAdmin) redirect("/dashboard");
  return { nome: usuario.nome };
}
