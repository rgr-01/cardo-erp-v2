// Trabalhos da safra: leitura e escrita. Ver `lib/trabalhos.ts` para as regras
// puras. Qualquer usuário vê os trabalhos; só o admin cria, edita e exclui.
// Consultor vincula os próprios relatórios.

import { z } from "zod";
import { aplicarCapaDoTrabalho } from "@/lib/relatorios-visita";
import type { Sessao } from "@/app/actions/helpers";
import { prisma } from "@/lib/prisma";
import { ErroNaoEncontrado, ErroPermissao } from "@/lib/servicos/erros";
import type {
  RelatorioAvulso,
  RelatorioDoTrabalho,
  StatusTrabalho,
  TipoTrabalho,
  TrabalhoLinha,
} from "@/lib/trabalhos";

const texto = z.string().trim().max(200).nullish().transform((v) => v || null);

export const trabalhoSchema = z.object({
  nome: z.string().trim().min(1, "Informe o nome do trabalho.").max(200),
  tipo: z.enum(["AREA_DEMONSTRATIVA", "ENSAIO", "VITRINE", "DIA_DE_CAMPO"]),
  status: z.enum(["PLANEJADO", "EM_ANDAMENTO", "CONCLUIDO"]).default("PLANEJADO"),
  produto: texto,
  fornecedor: texto,
  cultura: texto,
  clienteIds: z.array(z.string()).default([]),
  campos: z.coerce.number().int().min(1).max(500).default(1),
  visitasPrevistas: z.coerce.number().int().min(0).max(500).default(0),
  dataPrevista: z.string().nullish().transform((v) => (v ? new Date(`${v}T12:00:00-03:00`) : null)),
  observacao: z.string().trim().max(2000).nullish().transform((v) => v || null),
});

export type DadosTrabalho = z.input<typeof trabalhoSchema>;

function exigirAdmin(sessao: Sessao) {
  if (sessao.role !== "ADMIN") throw new ErroPermissao("Só o administrador gerencia os trabalhos da safra.");
}

export async function listarTrabalhos(safraId: string): Promise<TrabalhoLinha[]> {
  const trabalhos = await prisma.trabalho.findMany({
    where: { safraId },
    include: {
      clientes: { select: { id: true, nome: true }, orderBy: { nome: "asc" } },
      relatorios: {
        where: { status: { not: "AGENDADA" } },
        select: { dataVisita: true, titulo: true },
        orderBy: { dataVisita: "desc" },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const ordemStatus: Record<string, number> = { EM_ANDAMENTO: 0, PLANEJADO: 1, CONCLUIDO: 2 };
  return trabalhos
    .map((t) => ({
      id: t.id,
      nome: t.nome,
      tipo: t.tipo as TipoTrabalho,
      status: t.status as StatusTrabalho,
      produto: t.produto,
      fornecedor: t.fornecedor,
      cultura: t.cultura,
      clientes: t.clientes,
      campos: t.campos,
      visitasPrevistas: t.visitasPrevistas,
      dataPrevista: t.dataPrevista?.toISOString() ?? null,
      observacao: t.observacao,
      relatorios: t.relatorios.length,
      visitasFeitas: new Set(
        t.relatorios.map((r) => r.dataVisita.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }))
      ).size,
      ultimoRelatorio: t.relatorios[0]
        ? { data: t.relatorios[0].dataVisita.toISOString(), titulo: t.relatorios[0].titulo }
        : null,
    }))
    .sort((a, b) => ordemStatus[a.status] - ordemStatus[b.status]);
}

// Relatórios técnicos criados no sistema que ainda não pertencem a nenhum
// trabalho. As visitas importadas do TBDC não entram: não são laudos.
export async function listarAvulsos(sessao: Sessao, safraId: string): Promise<RelatorioAvulso[]> {
  const relatorios = await prisma.relatorioVisita.findMany({
    where: {
      safraId,
      trabalhoId: null,
      tipo: "TECNICO",
      idExterno: null,
      status: { not: "AGENDADA" },
      ...(sessao.role === "ADMIN" ? {} : { consultorId: sessao.id }),
    },
    select: {
      id: true,
      titulo: true,
      dataVisita: true,
      clienteId: true,
      cliente: { select: { nome: true } },
      consultor: { select: { nome: true } },
    },
    orderBy: { dataVisita: "desc" },
    take: 100,
  });
  return relatorios.map((r) => ({
    id: r.id,
    titulo: r.titulo,
    dataVisita: r.dataVisita.toISOString(),
    clienteId: r.clienteId,
    clienteNome: r.cliente.nome,
    consultorNome: r.consultor.nome,
  }));
}

// Relatórios de um trabalho, para ver/editar na janela sobreposta. Consultor vê
// só os próprios; quem pode editar é o admin ou o autor.
export async function listarRelatoriosDoTrabalho(
  sessao: Sessao,
  trabalhoId: string
): Promise<RelatorioDoTrabalho[]> {
  const relatorios = await prisma.relatorioVisita.findMany({
    where: {
      trabalhoId,
      status: { not: "AGENDADA" },
      ...(sessao.role === "ADMIN" ? {} : { consultorId: sessao.id }),
    },
    select: {
      id: true,
      titulo: true,
      dataVisita: true,
      consultorId: true,
      cliente: { select: { nome: true } },
      consultor: { select: { nome: true } },
    },
    orderBy: { dataVisita: "desc" },
  });
  return relatorios.map((r) => ({
    id: r.id,
    titulo: r.titulo,
    dataVisita: r.dataVisita.toISOString(),
    clienteNome: r.cliente.nome,
    consultorNome: r.consultor.nome,
    podeEditar: sessao.role === "ADMIN" || r.consultorId === sessao.id,
  }));
}

export async function criarTrabalho(sessao: Sessao, safraId: string, entrada: DadosTrabalho) {
  exigirAdmin(sessao);
  const { clienteIds, ...dados } = trabalhoSchema.parse(entrada);
  return prisma.trabalho.create({
    data: { ...dados, safraId, clientes: { connect: clienteIds.map((id) => ({ id })) } },
  });
}

export async function atualizarTrabalho(sessao: Sessao, id: string, entrada: DadosTrabalho) {
  exigirAdmin(sessao);
  const { clienteIds, ...dados } = trabalhoSchema.parse(entrada);
  const existe = await prisma.trabalho.findUnique({ where: { id }, select: { id: true } });
  if (!existe) throw new ErroNaoEncontrado("Trabalho não encontrado.");
  return prisma.trabalho.update({
    where: { id },
    data: { ...dados, clientes: { set: clienteIds.map((c) => ({ id: c })) } },
  });
}

// Os relatórios do trabalho voltam a ser avulsos (a FK é SET NULL).
export async function excluirTrabalho(sessao: Sessao, id: string) {
  exigirAdmin(sessao);
  await prisma.trabalho.delete({ where: { id } });
}

// Vincula relatórios a um trabalho (ou desvincula, com trabalhoId nulo).
// Consultor só mexe nos próprios relatórios.
export async function vincularRelatorios(sessao: Sessao, relatorioIds: string[], trabalhoId: string | null) {
  if (relatorioIds.length === 0) return 0;
  if (trabalhoId) {
    const t = await prisma.trabalho.findUnique({
      where: { id: trabalhoId },
      select: { id: true, nome: true, clientes: { select: { id: true } } },
    });
    if (!t) throw new ErroNaoEncontrado("Trabalho não encontrado.");
    // Só vincula relatório de cliente que faz parte do trabalho.
    const clientesDoTrabalho = new Set(t.clientes.map((c) => c.id));
    const estranhos = await prisma.relatorioVisita.findMany({
      where: { id: { in: relatorioIds }, clienteId: { notIn: [...clientesDoTrabalho] } },
      select: { cliente: { select: { nome: true } } },
    });
    if (estranhos.length > 0) {
      const nomes = [...new Set(estranhos.map((r) => r.cliente.nome))].join(", ");
      throw new Error(
        `Só é possível vincular relatórios do mesmo cliente do trabalho "${t.nome}". Cliente(s) diferente(s): ${nomes}.`
      );
    }
  }
  const r = await prisma.relatorioVisita.updateMany({
    where: {
      id: { in: relatorioIds },
      ...(sessao.role === "ADMIN" ? {} : { consultorId: sessao.id }),
    },
    data: { trabalhoId },
  });
  if (trabalhoId && r.count > 0) await aplicarCapaDoTrabalho(relatorioIds, trabalhoId);
  return r.count;
}

// "Unir em um novo trabalho": cria o trabalho já com os clientes dos
// relatórios escolhidos e vincula todos a ele.
export async function unirEmNovoTrabalho(
  sessao: Sessao,
  safraId: string,
  relatorioIds: string[],
  entrada: DadosTrabalho
) {
  exigirAdmin(sessao);
  if (relatorioIds.length < 2) throw new Error("Selecione 2 ou mais relatórios para unir.");
  const relatorios = await prisma.relatorioVisita.findMany({
    where: { id: { in: relatorioIds }, trabalhoId: null },
    select: { id: true, clienteId: true },
  });
  if (new Set(relatorios.map((r) => r.clienteId)).size > 1) {
    throw new Error("Só é possível unir relatórios do mesmo cliente.");
  }
  const clienteIds = [...new Set([...(entrada.clienteIds ?? []), ...relatorios.map((r) => r.clienteId)])];
  const trabalho = await criarTrabalho(sessao, safraId, { ...entrada, clienteIds });
  await prisma.relatorioVisita.updateMany({
    where: { id: { in: relatorios.map((r) => r.id) } },
    data: { trabalhoId: trabalho.id },
  });
  await aplicarCapaDoTrabalho(relatorios.map((r) => r.id), trabalho.id);
  return trabalho;
}
