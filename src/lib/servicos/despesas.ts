// Regras das despesas, compartilhadas entre as server actions do web e a API
// do app: quem vê o quê, quem edita, histórico e formato de leitura.

import { z } from "zod";
import type { Sessao } from "@/app/actions/helpers";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import {
  atualizarDespesaPorId,
  excluirDespesaPorId,
  excluirFotoDespesaPorId,
  type FotoEntrada,
} from "@/lib/despesas";
import { ErroNaoEncontrado, ErroPermissao } from "@/lib/servicos/erros";
import { assinarArquivos } from "@/lib/storage";
import { numeroDecimal } from "@/lib/dinheiro";

export const CATEGORIAS_DESPESA = [
  "COMBUSTIVEL",
  "ALIMENTACAO",
  "HOSPEDAGEM",
  "MANUTENCAO_VEICULO",
  "PEDAGIO",
  "MATERIAL_ESCRITORIO",
  "OUTROS",
] as const;

// FormData manda "" nos campos vazios.
const textoOpcional = z.string().nullish().transform((v) => v?.trim() || null);

export const despesaSchema = z.object({
  // Informe a conta do plano (web) ou, nos clientes antigos, a categoria.
  categoria: z.enum(CATEGORIAS_DESPESA).nullish().transform((v) => v ?? undefined),
  contaId: textoOpcional,
  documento: textoOpcional,
  vencimento: textoOpcional,
  situacao: z.enum(["PAGO", "A_PAGAR"]).nullish().transform((v) => v ?? undefined),
  filial: textoOpcional,
  valor: z.coerce.number().positive("Informe um valor válido."),
  data: z.string().nullish(),
  clienteId: z.string().nullish(),
  estabelecimento: z.string().nullish(),
  descricao: z.string().nullish(),
});

const ehAdmin = (sessao: Sessao) => sessao.role === "ADMIN";

export async function registrarHistoricoDespesa(sessao: Sessao, acao: string, detalhes: string) {
  await prisma.historico.create({
    data: {
      usuarioNome: sessao.nome,
      acao,
      entidade: "DESPESA",
      detalhes,
    },
  });
}

export async function exigirAcessoDespesa(
  sessao: Sessao,
  id: string,
  verbo: "ver" | "editar" | "excluir" = "editar"
) {
  const despesa = await prisma.despesa.findUnique({
    where: { id },
    select: { consultorId: true },
  });
  if (!despesa) throw new ErroNaoEncontrado("Despesa não encontrada.");
  if (!ehAdmin(sessao) && despesa.consultorId !== sessao.id) {
    throw new ErroPermissao(`Você só pode ${verbo} suas próprias despesas.`);
  }
  return despesa;
}

const incluirLeitura = {
  cliente: { select: { id: true, nome: true } },
  consultor: { select: { nome: true } },
  safra: { select: { id: true, nome: true } },
  fotos: { select: { id: true, url: true, path: true }, orderBy: { ordem: "asc" as const } },
} satisfies Prisma.DespesaInclude;

type DespesaLida = Prisma.DespesaGetPayload<{ include: typeof incluirLeitura }>;

async function formatar(sessao: Sessao, d: DespesaLida) {
  return {
    id: d.id,
    categoria: d.categoria,
    contaId: d.contaId,
    documento: d.documento,
    vencimento: d.vencimento?.toISOString() ?? null,
    situacao: d.situacao,
    filial: d.filial,
    valor: numeroDecimal(d.valor),
    data: d.data.toISOString(),
    estabelecimento: d.estabelecimento,
    descricao: d.descricao,
    origemOcr: d.origemOcr,
    cliente: d.cliente,
    consultorNome: d.consultor.nome,
    safra: d.safra,
    fotos: await assinarArquivos(d.fotos),
    atualizadoEm: d.updatedAt.toISOString(),
    podeEditar: ehAdmin(sessao) || d.consultorId === sessao.id,
  };
}

export async function listarDespesas(sessao: Sessao, filtros: { safraId?: string | null } = {}) {
  const despesas = await prisma.despesa.findMany({
    where: {
      ...(ehAdmin(sessao) ? {} : { consultorId: sessao.id }),
      ...(filtros.safraId ? { safraId: filtros.safraId } : {}),
    },
    include: incluirLeitura,
    orderBy: { data: "desc" },
    take: 500,
  });
  return Promise.all(despesas.map((d) => formatar(sessao, d)));
}

export async function obterDespesa(sessao: Sessao, id: string) {
  await exigirAcessoDespesa(sessao, id, "ver");
  const despesa = await prisma.despesa.findUniqueOrThrow({ where: { id }, include: incluirLeitura });
  return await formatar(sessao, despesa);
}

export async function atualizarDespesa(
  sessao: Sessao,
  id: string,
  // Entrada crua (FormData ou JSON): a validação é do schema, aqui dentro.
  entrada: Record<string, unknown>,
  fotosNovas: FotoEntrada[]
) {
  await exigirAcessoDespesa(sessao, id, "editar");
  const dados = despesaSchema.parse(entrada);

  await atualizarDespesaPorId(id, {
    clienteId: dados.clienteId,
    categoria: dados.categoria,
    contaId: dados.contaId,
    documento: dados.documento,
    vencimento: dados.vencimento ? new Date(dados.vencimento) : null,
    situacao: dados.situacao,
    filial: dados.filial,
    valor: dados.valor,
    data: dados.data ? new Date(dados.data) : undefined,
    estabelecimento: dados.estabelecimento,
    descricao: dados.descricao,
    fotosNovas,
  });

  await registrarHistoricoDespesa(sessao, "EDICAO", `Despesa atualizada (#${id})`);
}

export async function excluirFotoDespesa(sessao: Sessao, despesaId: string, fotoId: string) {
  await exigirAcessoDespesa(sessao, despesaId, "editar");
  const foto = await prisma.fotoDespesa.findUnique({ where: { id: fotoId }, select: { despesaId: true } });
  if (!foto || foto.despesaId !== despesaId) {
    throw new ErroNaoEncontrado("Foto não encontrada.");
  }
  await excluirFotoDespesaPorId(fotoId);
}

export async function excluirDespesa(sessao: Sessao, id: string) {
  await exigirAcessoDespesa(sessao, id, "excluir");
  await excluirDespesaPorId(id);
  await registrarHistoricoDespesa(sessao, "EXCLUSAO", `Despesa removida (#${id})`);
}
