"use server";

import { z } from "zod";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { senhaForteSchema } from "@/lib/senha";
import { comEmpresa, semFiltroEmpresa } from "@/lib/empresa-contexto";
import { comErro, type ResultadoAcao } from "@/app/actions/helpers";
import { MODULOS, normalizarModulos } from "@/lib/modulos";
import { usoDaEmpresa } from "@/lib/limites-empresa";

// Painel Cardo AI: só a equipe (User.superAdmin) cria e lista empresas.
export async function exigirSuperAdmin(): Promise<void> {
  const session = await auth();
  if (!session?.user) throw new Error("Não autenticado.");
  const usuario = await semFiltroEmpresa(() =>
    prisma.user.findUnique({ where: { id: session.user.id }, select: { ativo: true, superAdmin: true } })
  );
  if (!usuario?.ativo || !usuario.superAdmin) throw new Error("Acesso restrito à equipe Cardo AI.");
}

const novaEmpresaSchema = z.object({
  nomeFantasia: z.string().trim().min(1, "Nome da empresa é obrigatório"),
  razaoSocial: z.string().trim().optional(),
  cnpj: z.string().trim().optional(),
  adminNome: z.string().trim().min(1, "Nome do administrador é obrigatório"),
  adminEmail: z.string().email("E-mail inválido").transform((s) => s.toLowerCase().trim()),
  adminSenha: senhaForteSchema,
  modulos: z.array(z.enum(MODULOS)).min(1, "Marque ao menos um módulo"),
});

export type NovaEmpresaInput = z.input<typeof novaEmpresaSchema>;

// Cria a empresa já com o primeiro ADM; ele cadastra o restante da equipe.
export async function criarEmpresa(input: NovaEmpresaInput): Promise<ResultadoAcao> {
  try {
    await exigirSuperAdmin();
    const dados = novaEmpresaSchema.parse(input);
    const emailEmUso = await semFiltroEmpresa(() =>
      prisma.user.findUnique({ where: { email: dados.adminEmail }, select: { id: true } })
    );
    if (emailEmUso) throw new Error("Já existe um usuário com esse e-mail.");
    const senhaHash = await bcrypt.hash(dados.adminSenha, 10);

    const empresa = await prisma.empresa.create({
      data: {
        nomeFantasia: dados.nomeFantasia,
        razaoSocial: dados.razaoSocial || null,
        cnpj: dados.cnpj || null,
        modulos: normalizarModulos(dados.modulos),
      },
    });
    await comEmpresa(empresa.id, () =>
      prisma.user.create({
        data: { nome: dados.adminNome, email: dados.adminEmail, role: "ADMIN", senhaHash },
      })
    );
    revalidatePath("/master", "layout");
    return { ok: true };
  } catch (error) {
    return comErro(error);
  }
}

export async function definirModulosEmpresa(id: string, modulos: string[]): Promise<ResultadoAcao> {
  try {
    await exigirSuperAdmin();
    const lista = normalizarModulos(modulos);
    if (lista.length === 0) throw new Error("A empresa precisa de ao menos um módulo.");
    await prisma.empresa.update({ where: { id }, data: { modulos: lista } });
    revalidatePath("/master", "layout");
    return { ok: true };
  } catch (error) {
    return comErro(error);
  }
}

export async function alternarAtivaEmpresa(id: string): Promise<ResultadoAcao> {
  try {
    await exigirSuperAdmin();
    const empresa = await prisma.empresa.findUnique({ where: { id }, select: { ativo: true } });
    if (!empresa) throw new Error("Empresa não encontrada.");
    await prisma.empresa.update({ where: { id }, data: { ativo: !empresa.ativo } });
    revalidatePath("/master", "layout");
    return { ok: true };
  } catch (error) {
    return comErro(error);
  }
}

const textoOpcional = z.string().trim().optional().transform((v) => v || null);

const dadosEmpresaSchema = z.object({
  nomeFantasia: z.string().trim().min(1, "Nome da empresa é obrigatório"),
  razaoSocial: textoOpcional,
  cnpj: textoOpcional,
  endereco: textoOpcional,
  cidadeUfCep: textoOpcional,
});

export type DadosEmpresaMasterInput = z.input<typeof dadosEmpresaSchema>;

export async function atualizarDadosEmpresa(id: string, input: DadosEmpresaMasterInput): Promise<ResultadoAcao> {
  try {
    await exigirSuperAdmin();
    await prisma.empresa.update({ where: { id }, data: dadosEmpresaSchema.parse(input) });
    revalidatePath("/master", "layout");
    return { ok: true };
  } catch (error) {
    return comErro(error);
  }
}

// Limite vazio = sem limite.
const limiteOpcional = z.union([z.number(), z.null()]).transform((v) => (v == null || !Number.isFinite(v) || v <= 0 ? null : v));

const planoSchema = z.object({
  plano: textoOpcional,
  limiteUsuarios: limiteOpcional.transform((v) => (v == null ? null : Math.floor(v))),
  limiteRelatoriosMes: limiteOpcional.transform((v) => (v == null ? null : Math.floor(v))),
  limiteArmazenamentoGb: limiteOpcional,
  observacoesPlano: textoOpcional,
});

export type PlanoEmpresaInput = z.input<typeof planoSchema>;

export async function definirPlanoEmpresa(id: string, input: PlanoEmpresaInput): Promise<ResultadoAcao> {
  try {
    await exigirSuperAdmin();
    await prisma.empresa.update({ where: { id }, data: planoSchema.parse(input) });
    revalidatePath("/master", "layout");
    return { ok: true };
  } catch (error) {
    return comErro(error);
  }
}

const novoAdminSchema = z.object({
  nome: z.string().trim().min(1, "Nome é obrigatório"),
  email: z.string().email("E-mail inválido").transform((s) => s.toLowerCase().trim()),
  senha: senhaForteSchema,
});

// Cadastra mais um ADM na empresa (ex.: o primeiro saiu ou a empresa pediu outro).
export async function criarAdminEmpresa(empresaId: string, input: z.input<typeof novoAdminSchema>): Promise<ResultadoAcao> {
  try {
    await exigirSuperAdmin();
    const dados = novoAdminSchema.parse(input);
    const emUso = await prisma.empresa.findFirst({ where: { users: { some: { email: dados.email } } }, select: { id: true } });
    if (emUso) throw new Error("Já existe um usuário com esse e-mail.");
    // Gravado pela relação da Empresa (sem filtro de tenant), não direto em User.
    await prisma.empresa.update({
      where: { id: empresaId },
      data: { users: { create: { nome: dados.nome, email: dados.email, role: "ADMIN", senhaHash: bcrypt.hashSync(dados.senha, 10) } } },
    });
    revalidatePath("/master", "layout");
    return { ok: true };
  } catch (error) {
    return comErro(error);
  }
}

// Troca a senha de um usuário da empresa e derruba as sessões abertas dele.
export async function redefinirSenhaUsuarioEmpresa(empresaId: string, usuarioId: string, senha: string): Promise<ResultadoAcao> {
  try {
    await exigirSuperAdmin();
    const nova = senhaForteSchema.parse(senha);
    const daEmpresa = await prisma.empresa.findFirst({ where: { id: empresaId, users: { some: { id: usuarioId } } }, select: { id: true } });
    if (!daEmpresa) throw new Error("Usuário não encontrado nessa empresa.");
    await prisma.empresa.update({
      where: { id: empresaId },
      data: { users: { update: { where: { id: usuarioId }, data: { senhaHash: bcrypt.hashSync(nova, 10), versaoSessao: { increment: 1 } } } } },
    });
    revalidatePath("/master", "layout");
    return { ok: true };
  } catch (error) {
    return comErro(error);
  }
}

// Ativa/desativa um usuário da empresa. Desativar derruba as sessões abertas;
// ativar respeita o limite de usuários do plano.
export async function alternarAtivoUsuarioEmpresa(empresaId: string, usuarioId: string, ativo: boolean): Promise<ResultadoAcao> {
  try {
    await exigirSuperAdmin();
    const empresa = await prisma.empresa.findFirst({ where: { id: empresaId, users: { some: { id: usuarioId } } }, select: { limiteUsuarios: true } });
    if (!empresa) throw new Error("Usuário não encontrado nessa empresa.");
    if (ativo && empresa.limiteUsuarios) {
      const { usuariosAtivos } = await usoDaEmpresa(empresaId);
      if (usuariosAtivos >= empresa.limiteUsuarios) throw new Error(`O plano permite ${empresa.limiteUsuarios} usuários ativos. Aumente o limite em Plano e limites.`);
    }
    await prisma.empresa.update({
      where: { id: empresaId },
      data: { users: { update: { where: { id: usuarioId }, data: { ativo, ...(ativo ? {} : { versaoSessao: { increment: 1 } }) } } } },
    });
    revalidatePath("/master", "layout");
    return { ok: true };
  } catch (error) {
    return comErro(error);
  }
}
