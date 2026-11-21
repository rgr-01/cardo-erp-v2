// Fazendas de um cliente (um cliente pode ter várias). Mesmas regras do
// cadastro de clientes: qualquer usuário cadastra e edita; excluir só o
// admin. Excluir a fazenda não apaga relatórios — eles ficam sem fazenda.

import { z } from "zod";
import type { Sessao } from "@/app/actions/helpers";
import { prisma } from "@/lib/prisma";
import { ErroNaoEncontrado, ErroPermissao } from "@/lib/servicos/erros";

export const fazendaSchema = z.object({
  nome: z.string().trim().min(1, "Informe o nome da fazenda."),
  cidade: z.string().nullish(),
  uf: z.string().max(2, "UF deve ter 2 letras").nullish(),
  area: z.coerce.number().nonnegative().nullish(),
  latitude: z.coerce.number().min(-90).max(90).nullish(),
  longitude: z.coerce.number().min(-180).max(180).nullish(),
});

export type FazendaInput = z.input<typeof fazendaSchema>;

function limpar(dados: z.output<typeof fazendaSchema>) {
  return {
    nome: dados.nome,
    cidade: dados.cidade?.trim() || null,
    uf: dados.uf?.trim().toUpperCase() || null,
    area: dados.area ?? null,
    latitude: dados.latitude ?? null,
    longitude: dados.longitude ?? null,
  };
}

const selecao = {
  id: true,
  clienteId: true,
  nome: true,
  cidade: true,
  uf: true,
  area: true,
  latitude: true,
  longitude: true,
} as const;

export type Fazenda = {
  id: string;
  clienteId: string;
  nome: string;
  cidade: string | null;
  uf: string | null;
  area: number | null;
  latitude: number | null;
  longitude: number | null;
};

// Nome repetido no mesmo cliente vira mensagem legível, não erro do banco.
function traduzirErro(error: unknown): never {
  if ((error as { code?: string })?.code === "P2002") {
    throw new Error("Esse cliente já tem uma fazenda com esse nome.");
  }
  throw error;
}

const ehAdmin = (sessao: Sessao) => sessao.role === "ADMIN";

async function exigirAcessoCliente(sessao: Sessao, clienteId: string) {
  const cliente = await prisma.cliente.findUnique({
    where: { id: clienteId },
    select: { id: true, consultorId: true },
  });
  if (!cliente) throw new ErroNaoEncontrado("Cliente não encontrado.");
  if (!ehAdmin(sessao) && cliente.consultorId !== sessao.id) {
    throw new ErroPermissao("Você só pode acessar fazendas dos seus próprios clientes.");
  }
  return cliente;
}

export async function listarFazendas(sessao: Sessao, clienteId: string): Promise<Fazenda[]> {
  await exigirAcessoCliente(sessao, clienteId);
  return prisma.fazenda.findMany({
    where: { clienteId },
    select: selecao,
    orderBy: { nome: "asc" },
  });
}

export async function criarFazenda(
  sessao: Sessao,
  clienteId: string,
  input: FazendaInput
): Promise<Fazenda> {
  await exigirAcessoCliente(sessao, clienteId);
  const dados = fazendaSchema.parse(input);
  return prisma.fazenda
    .create({ data: { clienteId, ...limpar(dados) }, select: selecao })
    .catch(traduzirErro);
}

export async function atualizarFazenda(
  sessao: Sessao,
  id: string,
  input: FazendaInput
): Promise<Fazenda> {
  const existe = await prisma.fazenda.findUnique({ where: { id }, select: { clienteId: true } });
  if (!existe) throw new ErroNaoEncontrado("Fazenda não encontrada.");
  await exigirAcessoCliente(sessao, existe.clienteId);
  const dados = fazendaSchema.parse(input);
  return prisma.fazenda
    .update({ where: { id }, data: limpar(dados), select: selecao })
    .catch(traduzirErro);
}

export async function excluirFazenda(sessao: Sessao, id: string) {
  if (sessao.role !== "ADMIN") throw new ErroPermissao("Só o administrador exclui fazendas.");
  const existe = await prisma.fazenda.findUnique({ where: { id }, select: { id: true } });
  if (!existe) throw new ErroNaoEncontrado("Fazenda não encontrada.");
  await prisma.fazenda.delete({ where: { id } });
}

/** Confere que a fazenda escolhida é mesmo do cliente do relatório. */
export async function validarFazendaDoCliente(fazendaId: string | null | undefined, clienteId: string) {
  if (!fazendaId) return null;
  const fazenda = await prisma.fazenda.findUnique({ where: { id: fazendaId }, select: { clienteId: true } });
  if (!fazenda || fazenda.clienteId !== clienteId) {
    throw new Error("A fazenda escolhida não pertence a esse cliente.");
  }
  return fazendaId;
}
