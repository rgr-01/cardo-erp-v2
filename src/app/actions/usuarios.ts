"use server";

import { z } from "zod";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { senhaForteSchema } from "@/lib/senha";
import { exigirVagaDeUsuario } from "@/lib/limites-empresa";
import { MODULOS, modulosParaUsuario } from "@/lib/modulos";
import {
  exigirAdmin,
  comErro,
  type ResultadoAcao,
} from "@/app/actions/helpers";

const usuarioSchema = z.object({
  nome: z.string().min(1, "Nome é obrigatório"),
  email: z.string().email("E-mail inválido").transform((s) => s.toLowerCase().trim()),
  role: z.enum(["ADMIN", "CONSULTOR"]),
  senha: senhaForteSchema.optional().or(z.literal("")),
  ativo: z.boolean().default(true),
});

export type UsuarioInput = z.input<typeof usuarioSchema>;

export async function criarUsuario(input: UsuarioInput): Promise<ResultadoAcao> {
  try {
    await exigirAdmin();
    const dados = usuarioSchema.parse(input);
    if (!dados.senha) throw new Error("Senha é obrigatória para novo usuário.");
    if (dados.ativo) await exigirVagaDeUsuario();
    const senhaHash = await bcrypt.hash(dados.senha, 10);
    await prisma.user.create({
      data: {
        nome: dados.nome,
        email: dados.email,
        role: dados.role,
        ativo: dados.ativo,
        senhaHash,
      },
    });
    revalidatePath("/usuarios");
    return { ok: true };
  } catch (error) {
    return comErro(error);
  }
}

export async function atualizarUsuario(
  id: string,
  input: UsuarioInput
): Promise<ResultadoAcao> {
  try {
    const admin = await exigirAdmin();
    const dados = usuarioSchema.parse(input);
    if (id === admin.id && (dados.role !== "ADMIN" || !dados.ativo)) {
      throw new Error("Você não pode rebaixar ou desativar seu próprio usuário.");
    }
    const data: {
      nome: string;
      email: string;
      role: "ADMIN" | "CONSULTOR";
      ativo: boolean;
      senhaHash?: string;
    } = {
      nome: dados.nome,
      email: dados.email,
      role: dados.role,
      ativo: dados.ativo,
    };
    if (dados.senha) {
      data.senhaHash = await bcrypt.hash(dados.senha, 10);
    }
    const existente = await prisma.user.findUniqueOrThrow({ where: { id }, select: { role: true, ativo: true } });
    if (dados.ativo && !existente.ativo) await exigirVagaDeUsuario();
    const revogarSessoes = Boolean(dados.senha) || !dados.ativo || dados.role !== existente.role;
    await prisma.user.update({ where: { id }, data: { ...data, ...(revogarSessoes ? { versaoSessao: { increment: 1 } } : {}) } });
    revalidatePath("/usuarios");
    return { ok: true };
  } catch (error) {
    return comErro(error);
  }
}

// Módulos que o usuário enxerga dentro dos contratados pela empresa. Guarda os
// desligados, assim módulo novo contratado depois já vem ligado para todos.
export async function definirModulosUsuario(id: string, ligados: string[]): Promise<ResultadoAcao> {
  try {
    await exigirAdmin();
    const usuario = await prisma.user.findUnique({ where: { id }, select: { empresa: { select: { modulos: true } } } });
    if (!usuario) throw new Error("Usuário não encontrado.");
    const ligadosNorm = new Set(ligados.filter(m => (MODULOS as readonly string[]).includes(m)));
    const bloqueados = modulosParaUsuario(usuario.empresa.modulos, [], "ADMIN").filter(m => !ligadosNorm.has(m));
    await prisma.user.update({ where: { id }, data: { modulosBloqueados: bloqueados } });
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (error) {
    return comErro(error);
  }
}

export async function alternarAtivoUsuario(
  id: string,
  ativo: boolean
): Promise<ResultadoAcao> {
  try {
    const admin = await exigirAdmin();
    if (id === admin.id && !ativo) {
      throw new Error("Você não pode desativar seu próprio usuário.");
    }
    if (ativo) await exigirVagaDeUsuario();
    await prisma.user.update({ where: { id }, data: { ativo, versaoSessao: { increment: 1 } } });
    revalidatePath("/usuarios");
    return { ok: true };
  } catch (error) {
    return comErro(error);
  }
}
