import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { COOKIE_EMPRESA_LOGIN } from "@/lib/empresa-marca";

export type UsuarioAutenticado = {
  id: string;
  email: string;
  nome: string;
  role: "ADMIN" | "CONSULTOR";
  versaoSessao: number;
  empresaId: string;
};

export async function validarCredenciais(
  email: string,
  senha: string
): Promise<UsuarioAutenticado | null> {
  const emailNormalizado = email.toLowerCase().trim();
  if (!emailNormalizado || !senha) return null;

  const user = await prisma.user.findUnique({
    where: { email: emailNormalizado },
    include: { empresa: { select: { ativo: true } } },
  });
  // Empresa desativada no painel Cardo AI bloqueia o login de toda a equipe.
  if (!user || !user.ativo || !user.empresa.ativo) return null;
  const bloqueioAtivo = user.bloqueadoAte && user.bloqueadoAte > new Date();
  if (bloqueioAtivo) return null;

  const senhaOk = await bcrypt.compare(senha, user.senhaHash);
  if (!senhaOk) {
    const tentativas = (user.bloqueadoAte ? 0 : user.tentativasLogin) + 1;
    await prisma.user.update({ where: { id: user.id }, data: { tentativasLogin: tentativas, bloqueadoAte: tentativas >= 5 ? new Date(Date.now() + 15 * 60 * 1000) : null } });
    return null;
  }
  if (user.tentativasLogin || user.bloqueadoAte) await prisma.user.update({ where: { id: user.id }, data: { tentativasLogin: 0, bloqueadoAte: null } });

  // A tela de login deste aparelho passa a mostrar a marca da empresa.
  try {
    (await cookies()).set(COOKIE_EMPRESA_LOGIN, user.empresaId, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 60 * 24 * 365,
      path: "/",
    });
  } catch {
    // Fora de requisição com cookies (ex.: teste): segue sem lembrar.
  }

  return {
    id: user.id,
    email: user.email,
    nome: user.nome,
    role: user.role,
    versaoSessao: user.versaoSessao,
    empresaId: user.empresaId,
  };
}
