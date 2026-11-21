// Monta os PDFs gerencial e de despesas a partir dos dados do banco. Usado
// pelas rotas de download da web e pelo bot do WhatsApp (que envia o arquivo).

import { prisma } from "@/lib/prisma";
import { getDashboardData } from "@/lib/dashboard";
import { getRelatorioDespesas } from "@/lib/despesas-relatorio";
import {
  fmtBRL,
  fmtDataHoraBrasilia,
  fmtNum,
  fmtPct,
  CATEGORIA_DESPESA_LABELS,
} from "@/lib/format";
import { gerarPdfRelatorioDespesas, gerarPdfRelatorioGerencial } from "@/lib/pdf";

export type PdfGerado = { pdf: Uint8Array; nomeArquivo: string };

function hojeIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function nomeCulturaGerencial(valor: string): string {
  const base = valor
    .trim()
    .replaceAll("_", " / ")
    .replace(/(2[ºª])(?=[a-záéíóú])/gi, "$1 ")
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("pt-BR");
  if (!base) return "Sem cultura";
  return base
    .split(" ")
    .map((parte) =>
      parte === "/" ? parte : `${parte.charAt(0).toLocaleUpperCase("pt-BR")}${parte.slice(1)}`
    )
    .join(" ");
}

export async function montarPdfGerencial(opts: {
  safraId: string;
  // Sem consultor = visão da equipe inteira (só admin).
  consultorId?: string;
  // Vários consultores (filtro do dashboard); vale no lugar de consultorId.
  consultorIds?: string[];
  incluirRanking: boolean;
  imagemDashboard?: Uint8Array;
}): Promise<PdfGerado> {
  const ids = opts.consultorIds?.length ? opts.consultorIds : opts.consultorId ? [opts.consultorId] : [];
  const [dados, safra, consultoresEscolhidos] = await Promise.all([
    getDashboardData(opts.safraId, ids),
    prisma.safra.findUnique({ where: { id: opts.safraId }, select: { nome: true } }),
    ids.length > 0
      ? prisma.user.findMany({ where: { id: { in: ids } }, select: { nome: true }, orderBy: { nome: "asc" } })
      : Promise.resolve([]),
  ]);
  const consultor = consultoresEscolhidos.length > 0 ? { nome: consultoresEscolhidos.map((c) => c.nome).join(", ") } : null;

  const pctMeta = dados.meta > 0 ? dados.faturado / dados.meta : 0;
  const totalGeralRanking = dados.ranking.reduce((s, r) => s + r.total, 0);
  const culturasMap = new Map<string, number>();
  for (const cultura of dados.porCultura) {
    const nome = nomeCulturaGerencial(cultura.cultura);
    culturasMap.set(nome, (culturasMap.get(nome) ?? 0) + cultura.total);
  }
  const culturasGerenciais = [...culturasMap.entries()]
    .map(([cultura, total]) => ({ cultura, total }))
    .sort((a, b) => b.total - a.total);
  const pdf = await gerarPdfRelatorioGerencial({
    imagemDashboard: opts.imagemDashboard,
    dataGeracao: fmtDataHoraBrasilia(new Date()),
    safra: safra?.nome ?? "Não identificada",
    escopo: consultor?.nome
      ? `${consultoresEscolhidos.length > 1 ? "Consultores" : "Consultor"}: ${consultor.nome}`
      : "Equipe completa",
    meta: fmtBRL(dados.meta),
    metaValor: dados.meta,
    pctMeta: fmtPct(pctMeta),
    pctMetaValor: pctMeta,
    totalPipeline: fmtBRL(dados.totalPipeline),
    totalPipelineValor: dados.totalPipeline,
    faturado: fmtBRL(dados.faturado),
    faturadoValor: dados.faturado,
    emAndamento: fmtBRL(dados.emAndamento),
    emAndamentoValor: dados.emAndamento,
    clientesAtivos: fmtNum(dados.clientesAtivos),
    fornecedoresAtivos: fmtNum(dados.fornecedoresAtivos),
    mediaPorCliente: fmtBRL(dados.mediaPorClienteAtivo),
    ticketMedio: fmtBRL(dados.ticketMedio),
    qtdVendas: fmtNum(dados.qtdVendas),
    porStatus: dados.porStatus.map((s) => ({
      status: s.status,
      label: s.label,
      total: fmtBRL(s.total),
      totalValor: s.total,
      qtd: fmtNum(s.qtd),
      pct: dados.totalPipeline > 0 ? fmtPct(s.total / dados.totalPipeline) : "0%",
      pctValor: dados.totalPipeline > 0 ? s.total / dados.totalPipeline : 0,
    })),
    porCultura: culturasGerenciais.map((c) => ({
      cultura: c.cultura,
      total: fmtBRL(c.total),
      totalValor: c.total,
      pct: dados.totalPipeline > 0 ? fmtPct(c.total / dados.totalPipeline) : "0%",
      pctValor: dados.totalPipeline > 0 ? c.total / dados.totalPipeline : 0,
    })),
    evolucao: dados.evolucao.map((e) => ({
      mes: e.mes,
      total: fmtBRL(e.total),
      totalValor: e.total,
    })),
    ranking: dados.ranking.map((r) => ({
      consultor: r.consultor,
      total: fmtBRL(r.total),
      totalValor: r.total,
      faturado: fmtBRL(r.faturado),
      faturadoValor: r.faturado,
      pct: totalGeralRanking > 0 ? fmtPct(r.total / totalGeralRanking) : "0%",
    })),
    temMeta: dados.meta > 0,
    temRanking: opts.incluirRanking && dados.ranking.length > 1,
  });

  return { pdf, nomeArquivo: `relatorio-gerencial-${hojeIso()}.pdf` };
}

export async function montarPdfDespesas(opts: {
  safraId: string;
  consultorId?: string;
  // Datas no formato yyyy-mm-dd, como vêm do filtro da tela.
  inicio?: string;
  fim?: string;
}): Promise<PdfGerado & { total: number; qtd: number }> {
  const dados = await getRelatorioDespesas({
    safraId: opts.safraId,
    consultorId: opts.consultorId,
    dataInicio: opts.inicio ? new Date(opts.inicio) : undefined,
    dataFim: opts.fim ? new Date(`${opts.fim}T23:59:59`) : undefined,
  });

  const consultorNome = opts.consultorId
    ? (
        await prisma.user.findUnique({
          where: { id: opts.consultorId },
          select: { nome: true },
        })
      )?.nome
    : undefined;

  const ticketMedio = dados.qtd > 0 ? dados.total / dados.qtd : 0;

  const pdf = await gerarPdfRelatorioDespesas({
    dataGeracao: fmtDataHoraBrasilia(new Date()),
    filtroConsultor: consultorNome ? `Consultor: ${consultorNome}` : undefined,
    filtroPeriodo:
      opts.inicio || opts.fim
        ? `Periodo: ${opts.inicio ?? "inicio"} a ${opts.fim ?? "hoje"}`
        : undefined,
    total: fmtBRL(dados.total),
    qtd: fmtNum(dados.qtd),
    ticketMedio: fmtBRL(ticketMedio),
    porCategoria: dados.porCategoria.map((c) => ({
      categoria: CATEGORIA_DESPESA_LABELS[c.categoria],
      total: fmtBRL(c.total),
      qtd: fmtNum(c.qtd),
    })),
    porConsultor: dados.porConsultor.map((c) => ({
      consultor: c.consultor,
      total: fmtBRL(c.total),
      qtd: fmtNum(c.qtd),
    })),
    evolucao: dados.evolucao.map((e) => ({ mes: e.mes, total: fmtBRL(e.total) })),
    detalhe: dados.detalhe.map((d) => ({
      data: d.data.toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      }),
      categoria: CATEGORIA_DESPESA_LABELS[d.categoria],
      estabelecimento: d.estabelecimento ?? "-",
      cliente: d.clienteNome ?? "-",
      consultor: d.consultorNome,
      valor: fmtBRL(d.valor),
    })),
  });

  return {
    pdf,
    nomeArquivo: `relatorio-despesas-${hojeIso()}.pdf`,
    total: dados.total,
    qtd: dados.qtd,
  };
}

// Corpo de Response a partir do Uint8Array do pdf-lib.
export function pdfParaResponse({ pdf, nomeArquivo }: PdfGerado): Response {
  const body = pdf.buffer.slice(pdf.byteOffset, pdf.byteOffset + pdf.byteLength) as ArrayBuffer;
  return new Response(body, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${nomeArquivo}"`,
    },
  });
}
