// Regras dos clientes, compartilhadas entre as server actions do web e a API
// do app. Consultor so' ve/edita os proprios clientes (consultorId ===
// sessao.id) — sem vinculo ou de outro consultor fica invisivel pra ele, so'
// o admin ve todos. Admin pode vincular um cliente a um consultor a qualquer
// momento (tela de Clientes), e ele passa a aparecer pra esse consultor dali
// em diante. Localizacao e exclusao continuam exclusivas do admin.

import { z } from "zod";
import type { Sessao } from "@/app/actions/helpers";
import { prisma } from "@/lib/prisma";
import { ErroNaoEncontrado, ErroPermissao } from "@/lib/servicos/erros";

export const clienteSchema = z.object({
  nome: z.string().min(1, "Nome é obrigatório").transform((s) => s.trim()),
  documento: z.string().nullish(),
  razaoSocial: z.string().nullish(),
  inscricaoEstadual: z.string().nullish(),
  telefone: z.string().nullish(),
  email: z.string().email("E-mail invalido").or(z.literal("")).nullish(),
  endereco: z.string().nullish(),
  cidade: z.string().nullish(),
  uf: z.string().max(2, "UF deve ter 2 letras").nullish(),
  cep: z.string().nullish(),
  ctv: z.string().nullish(),
  areaPlantio: z.coerce.number().nonnegative().nullish(),
  areaTotal: z.coerce.number().nonnegative().nullish(),
  pctIrrigada: z.coerce.number().min(0).max(100).nullish(),
  pctArroz: z.coerce.number().min(0).max(100).nullish(),
  pctSoja: z.coerce.number().min(0).max(100).nullish(),
  pctMilho: z.coerce.number().min(0).max(100).nullish(),
  pctAlgodao: z.coerce.number().min(0).max(100).nullish(),
  pctFeijao: z.coerce.number().min(0).max(100).nullish(),
  pctTrigo: z.coerce.number().min(0).max(100).nullish(),
  pctMilho2: z.coerce.number().min(0).max(100).nullish(),
  pctSorgo2: z.coerce.number().min(0).max(100).nullish(),
  latitude: z.coerce.number().min(-90).max(90).nullish(),
  longitude: z.coerce.number().min(-180).max(180).nullish(),
  consultorId: z.string().nullish(),
});

export type ClienteInput = z.input<typeof clienteSchema>;

function limpar(dados: z.output<typeof clienteSchema>) {
  return {
    ...dados,
    documento: dados.documento || null,
    razaoSocial: dados.razaoSocial || null,
    inscricaoEstadual: dados.inscricaoEstadual || null,
    telefone: dados.telefone || null,
    email: dados.email || null,
    endereco: dados.endereco || null,
    cidade: dados.cidade || null,
    uf: dados.uf?.toUpperCase() || null,
    cep: dados.cep || null,
    ctv: dados.ctv || null,
    areaPlantio: dados.areaPlantio ?? null,
    areaTotal: dados.areaTotal ?? null,
    pctIrrigada: dados.pctIrrigada ?? null,
    pctArroz: dados.pctArroz ?? null,
    pctSoja: dados.pctSoja ?? null,
    pctMilho: dados.pctMilho ?? null,
    pctAlgodao: dados.pctAlgodao ?? null,
    pctFeijao: dados.pctFeijao ?? null,
    pctTrigo: dados.pctTrigo ?? null,
    pctMilho2: dados.pctMilho2 ?? null,
    pctSorgo2: dados.pctSorgo2 ?? null,
    latitude: dados.latitude ?? null,
    longitude: dados.longitude ?? null,
    consultorId: dados.consultorId || null,
  };
}

function exigirAdmin(sessao: Sessao) {
  if (sessao.role !== "ADMIN") throw new ErroPermissao("Acesso restrito ao administrador.");
}

const ehAdmin = (sessao: Sessao) => sessao.role === "ADMIN";

export async function listarClientes(sessao: Sessao) {
  const [clientes, visitas] = await Promise.all([
    prisma.cliente.findMany({
      where: ehAdmin(sessao) ? {} : { consultorId: sessao.id },
      include: {
        consultor: { select: { id: true, nome: true } },
        fazendas: { select: { id: true, nome: true }, orderBy: { nome: "asc" } },
      },
      orderBy: { nome: "asc" },
    }),
    prisma.relatorioVisita.groupBy({ by: ["clienteId"], where: { status: { not: "AGENDADA" } }, _max: { dataVisita: true } }),
  ]);
  const ultimaVisita = new Map(visitas.map((v) => [v.clienteId, v._max.dataVisita]));
  return clientes.map(({ consultor, createdAt, updatedAt, ...c }) => ({
    ...c,
    consultorNome: consultor?.nome ?? null,
    ultimaVisita: ultimaVisita.get(c.id)?.toISOString() ?? null,
    criadoEm: createdAt.toISOString(),
    atualizadoEm: updatedAt.toISOString(),
  }));
}

export async function obterCliente(sessao: Sessao, id: string) {
  const cliente = await prisma.cliente.findUnique({
    where: { id, ...(ehAdmin(sessao) ? {} : { consultorId: sessao.id }) },
    include: {
      consultor: { select: { id: true, nome: true } },
      fazendas: {
        select: {
          id: true,
          clienteId: true,
          nome: true,
          cidade: true,
          uf: true,
          area: true,
          latitude: true,
          longitude: true,
        },
        orderBy: { nome: "asc" },
      },
      _count: { select: { vendas: true, relatoriosVisita: true, propostas: true, despesas: true } },
    },
  });
  if (!cliente) throw new ErroNaoEncontrado("Cliente não encontrado.");
  const ultima = await prisma.relatorioVisita.findFirst({
    where: { clienteId: id, status: { not: "AGENDADA" } },
    orderBy: { dataVisita: "desc" },
    select: { dataVisita: true },
  });
  const { consultor, _count, createdAt, updatedAt, ...resto } = cliente;
  return {
    ...resto,
    consultorNome: consultor?.nome ?? null,
    totais: _count,
    ultimaVisita: ultima?.dataVisita.toISOString() ?? null,
    criadoEm: createdAt.toISOString(),
    atualizadoEm: updatedAt.toISOString(),
  };
}

export async function criarCliente(sessao: Sessao, input: ClienteInput) {
  const dados = clienteSchema.parse(input);
  const dadosLimpos = limpar(dados);
  // Consultor sem escolher um dono explicito (so' admin ve esse campo no
  // formulario) cria o cliente ja vinculado a si mesmo — senao o cliente
  // recem-criado sumiria da propria visao de quem acabou de cadastrar.
  const consultorId = ehAdmin(sessao) ? dadosLimpos.consultorId : sessao.id;
  return prisma.cliente.create({
    data: { ...dadosLimpos, consultorId },
    select: { id: true },
  });
}

export async function atualizarCliente(sessao: Sessao, id: string, input: ClienteInput) {
  const existente = await prisma.cliente.findUnique({ where: { id }, select: { consultorId: true } });
  if (!existente) throw new ErroNaoEncontrado("Cliente não encontrado.");
  if (!ehAdmin(sessao) && existente.consultorId !== sessao.id) {
    throw new ErroPermissao("Você só pode editar seus próprios clientes.");
  }
  const dados = clienteSchema.parse(input);
  const dadosLimpos = limpar(dados);
  // Consultor nao pode trocar o dono do cliente (so' admin decide isso).
  await prisma.cliente.update({
    where: { id },
    data: ehAdmin(sessao) ? dadosLimpos : { ...dadosLimpos, consultorId: existente.consultorId },
  });
}

// Dados que o pedido exige do cliente para ir para assinatura (ver
// camposFaltantes em lib/clientes.ts). Atualiza SÓ esses campos, sem mexer no
// resto do cadastro (áreas, consultor, etc.).
const cadastroParaPedidoSchema = z.object({
  razaoSocial: z.string().trim().max(200).optional(),
  documento: z.string().trim().min(11, "CPF/CNPJ incompleto").max(32),
  endereco: z.string().trim().min(3, "Informe o endereço").max(250),
  cidade: z.string().trim().min(2, "Informe a cidade").max(120),
  uf: z.string().trim().length(2, "UF deve ter 2 letras"),
  cep: z.string().trim().min(8, "CEP incompleto").max(12),
  telefone: z.string().trim().max(40).optional(),
  email: z.string().trim().email("E-mail inválido"),
});

export type CadastroParaPedidoInput = z.input<typeof cadastroParaPedidoSchema>;

export async function completarCadastroParaPedido(
  sessao: Sessao,
  id: string,
  input: CadastroParaPedidoInput
) {
  const existente = await prisma.cliente.findUnique({ where: { id }, select: { consultorId: true } });
  if (!existente) throw new ErroNaoEncontrado("Cliente não encontrado.");
  if (!ehAdmin(sessao) && existente.consultorId !== sessao.id) {
    throw new ErroPermissao("Você só pode editar seus próprios clientes.");
  }
  const d = cadastroParaPedidoSchema.parse(input);
  return prisma.cliente.update({
    where: { id },
    data: {
      razaoSocial: d.razaoSocial || null,
      documento: d.documento,
      endereco: d.endereco,
      cidade: d.cidade,
      uf: d.uf.toUpperCase(),
      cep: d.cep,
      telefone: d.telefone || null,
      email: d.email,
    },
    select: {
      id: true,
      razaoSocial: true,
      documento: true,
      endereco: true,
      cidade: true,
      uf: true,
      cep: true,
      telefone: true,
      email: true,
    },
  });
}

export async function atualizarLocalizacaoCliente(
  sessao: Sessao,
  id: string,
  latitude: number,
  longitude: number
) {
  exigirAdmin(sessao);
  const dados = z
    .object({
      latitude: z.number().min(-90).max(90),
      longitude: z.number().min(-180).max(180),
    })
    .parse({ latitude, longitude });
  await prisma.cliente.update({ where: { id }, data: dados });
}

export async function excluirCliente(sessao: Sessao, id: string) {
  exigirAdmin(sessao);
  const vendas = await prisma.venda.count({ where: { clienteId: id } });
  if (vendas > 0) {
    throw new Error(
      `Cliente possui ${vendas} venda(s) registrada(s) e não pode ser excluído.`
    );
  }
  await prisma.cliente.delete({ where: { id } });
}
