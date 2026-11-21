import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { modulosParaUsuario, normalizarModulos, type Modulo } from "@/lib/modulos";

export async function modulosDoUsuario(userId: string): Promise<Modulo[]> {
  const usuario = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, modulosBloqueados: true, empresa: { select: { modulos: true } } },
  });
  if (!usuario) return [];
  return modulosParaUsuario(usuario.empresa.modulos, usuario.modulosBloqueados, usuario.role);
}

// Contrato da empresa do usuário, sem os desligados por usuário. Ex.: mandar
// pedido para assinatura depende da empresa ter o Financeiro, não do consultor.
export async function empresaTemModulo(userId: string, modulo: Modulo): Promise<boolean> {
  const usuario = await prisma.user.findUnique({
    where: { id: userId },
    select: { empresa: { select: { modulos: true } } },
  });
  return normalizarModulos(usuario?.empresa.modulos ?? []).includes(modulo);
}

export async function modulosDaSessao(): Promise<Modulo[]> {
  const session = await auth();
  return session?.user ? modulosDoUsuario(session.user.id) : [];
}

// Usado no layout de cada área: módulo desligado volta para o início.
export async function exigirModuloPagina(modulo: Modulo): Promise<void> {
  const modulos = await modulosDaSessao();
  // O dashboard manda cada plano para a tela inicial certa.
  if (!modulos.includes(modulo)) redirect("/dashboard");
}
