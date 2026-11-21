import { auth } from "@/auth";
import { ZodError } from "zod";
import { prisma } from "@/lib/prisma";
import { modulosParaUsuario, type Modulo } from "@/lib/modulos";

export type Sessao = {
  id: string;
  nome: string;
  role: "ADMIN" | "CONSULTOR";
};

// `modulo`: a ação pertence a um módulo contratado (src/lib/modulos.ts); sem
// ele contratado pela empresa, a ação é recusada mesmo chamada direto.
export async function exigirSessao(modulo?: Modulo): Promise<Sessao> {
  const session = await auth();
  if (!session?.user) throw new Error("Entre na sua conta para continuar.");
  const usuario = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { nome: true, role: true, ativo: true, modulosBloqueados: true, empresa: { select: { modulos: true } } },
  });
  if (!usuario?.ativo) throw new Error("Seu acesso não está disponível. Entre novamente ou peça ao administrador para verificar sua conta.");
  if (modulo && !modulosParaUsuario(usuario.empresa.modulos, usuario.modulosBloqueados, usuario.role).includes(modulo)) {
    throw new Error("Você não tem acesso a este módulo. Peça ao administrador para verificar suas permissões.");
  }
  return {
    id: session.user.id,
    nome: usuario.nome,
    role: usuario.role,
  };
}

export async function exigirAdmin(modulo?: Modulo): Promise<Sessao> {
  const sessao = await exigirSessao(modulo);
  if (sessao.role !== "ADMIN") throw new Error("Somente administradores podem realizar esta ação. Peça ajuda ao administrador da sua empresa.");
  return sessao;
}

export type ResultadoAcao = { ok: true } | { ok: false; erro: string };

export function comErro(error: unknown): { ok: false; erro: string } {
  if (error instanceof ZodError) {
    return { ok: false, erro: error.issues.map((i) => i.message).join(" ") };
  }
  const msg = error instanceof Error ? error.message : "Não foi possível concluir a ação. Tente novamente.";
  return { ok: false, erro: msg };
}
