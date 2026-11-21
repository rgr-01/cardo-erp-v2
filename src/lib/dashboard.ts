import { categoriaEfetiva, type CategoriaVisita } from "@/lib/visitas-categoria";
import { prisma } from "@/lib/prisma";
import { STATUS_LABELS, STATUS_ORDEM, type Status } from "@/lib/format";
import { numeroDecimal } from "@/lib/dinheiro";
import { numeroDocumento } from "@/lib/propostas";
import { serieMensalFaturamento } from "@/lib/dashboard-mensal";

export type LinhaCliente = { cliente: string } & Partial<Record<Status, number>>;

export type DadosDashboard = {
  meta: number;
  totalPipeline: number;
  faturado: number;
  emAndamento: number;
  clientesAtivos: number;
  fornecedoresAtivos: number;
  mediaPorClienteAtivo: number;
  ticketMedio: number;
  qtdVendas: number;
  porStatus: { status: Status; label: string; total: number; qtd: number }[];
  porCultura: { cultura: string; total: number }[];
  porCliente: LinhaCliente[];
  evolucao: { mes: string; total: number }[];
  ranking: { consultor: string; total: number; faturado: number }[];
};

export type AtencaoDashboard = {
  // Negócio fechado esperando a conferência final do administrativo.
  conferencia: { qtd: number; total: number };
  // Pedidos/orçamentos com margem abaixo da meta aguardando (ou recusados pelo) gestor.
  margemBaixa: { qtd: number; documentos: string[] };
  // Clientes da carteira sem visita há mais de 30 dias e os nunca visitados.
  semVisita: { maisDe30: number; nunca: number };
  // Valor já em carteira, pronto para faturar.
  emCarteira: number;
};

export type DestaquesDashboard = {
  ultimasVisitas: { id: string; data: string; cliente: string; consultor: string; categoria: CategoriaVisita }[];
  visitasPorCategoria: Record<CategoriaVisita, number>;
  totalVisitas15d: number;
  ultimosFechamentos: { id: string; data: string; cliente: string; produto: string; valor: number; status: Status }[];
};

// Próximas visitas agendadas e os últimos negócios fechados, no mesmo filtro de consultores.
export async function getDestaquesDashboard(
  safraId: string,
  consultores: string | string[] | undefined
): Promise<DestaquesDashboard> {
  const ids = (Array.isArray(consultores) ? consultores : consultores ? [consultores] : []).filter(Boolean);
  const donos = ids.length > 0 ? { consultorId: { in: ids } } : {};
  const desde = new Date();
  desde.setHours(0, 0, 0, 0);
  desde.setDate(desde.getDate() - 15);

  const [visitas, vendas] = await Promise.all([
    prisma.relatorioVisita.findMany({
      where: { safraId, status: { not: "AGENDADA" }, dataVisita: { gte: desde }, ...donos },
      select: {
        id: true,
        dataVisita: true,
        tipo: true,
        categoria: true,
        cliente: { select: { nome: true } },
        consultor: { select: { nome: true } },
      },
      orderBy: { dataVisita: "desc" },
    }),
    prisma.venda.findMany({
      where: { safraId, status: { in: ["FECHADO", "EM_CARTEIRA", "FATURADO"] }, ...donos },
      select: {
        id: true,
        status: true,
        valorTotal: true,
        dataFechamento: true,
        updatedAt: true,
        cliente: { select: { nome: true } },
        produto: { select: { nome: true } },
      },
      orderBy: { updatedAt: "desc" },
      take: 5,
    }),
  ]);

  const visitasPorCategoria: Record<CategoriaVisita, number> = { COMERCIAL: 0, TECNICA: 0, POS_VENDA: 0, RELACIONAMENTO: 0 };
  for (const v of visitas) visitasPorCategoria[categoriaEfetiva(v)]++;

  return {
    visitasPorCategoria,
    totalVisitas15d: visitas.length,
    ultimasVisitas: visitas.slice(0, 6).map((v) => ({
      id: v.id,
      data: v.dataVisita.toISOString(),
      cliente: v.cliente.nome,
      consultor: v.consultor.nome,
      categoria: categoriaEfetiva(v),
    })),
    ultimosFechamentos: vendas.map((v) => ({
      id: v.id,
      data: (v.dataFechamento ?? v.updatedAt).toISOString(),
      cliente: v.cliente.nome,
      produto: v.produto.nome,
      valor: numeroDecimal(v.valorTotal),
      status: v.status as Status,
    })),
  };
}

const DIA_MS = 24 * 60 * 60 * 1000;

// Itens que pedem ação do time hoje. Segue o mesmo filtro de consultores do dashboard.
export async function getAtencaoDashboard(
  safraId: string,
  consultores: string | string[] | undefined,
  dados: DadosDashboard
): Promise<AtencaoDashboard> {
  const ids = (Array.isArray(consultores) ? consultores : consultores ? [consultores] : []).filter(Boolean);
  const donos = ids.length > 0 ? { consultorId: { in: ids } } : {};

  const [margem, vendasClientes] = await Promise.all([
    prisma.proposta.findMany({
      where: {
        safraId,
        status: { not: "CANCELADA" },
        statusMargem: { in: ["AGUARDANDO_APROVACAO", "RECUSADA_GESTOR"] },
        ...donos,
      },
      select: { tipo: true, numero: true },
      orderBy: { numero: "desc" },
      take: 200,
    }),
    prisma.venda.findMany({
      where: { safraId, status: { not: "CANCELADO" }, ...donos },
      select: { clienteId: true },
      distinct: ["clienteId"],
    }),
  ]);

  const clienteIds = vendasClientes.map((v) => v.clienteId);
  const ultimas =
    clienteIds.length > 0
      ? await prisma.relatorioVisita.groupBy({
          by: ["clienteId"],
          where: { safraId, status: { not: "AGENDADA" }, clienteId: { in: clienteIds } },
          _max: { dataVisita: true },
        })
      : [];
  const limite = Date.now() - 30 * DIA_MS;
  const visitado = new Map(ultimas.map((u) => [u.clienteId, u._max.dataVisita]));
  let maisDe30 = 0;
  let nunca = 0;
  for (const id of clienteIds) {
    const ultima = visitado.get(id);
    if (!ultima) nunca += 1;
    else if (ultima.getTime() < limite) maisDe30 += 1;
  }

  const fechado = dados.porStatus.find((s) => s.status === "FECHADO");
  const carteira = dados.porStatus.find((s) => s.status === "EM_CARTEIRA");
  return {
    conferencia: { qtd: fechado?.qtd ?? 0, total: fechado?.total ?? 0 },
    margemBaixa: {
      qtd: margem.length,
      documentos: margem.map((m) => numeroDocumento(m.tipo, m.numero)),
    },
    semVisita: { maisDe30, nunca },
    emCarteira: carteira?.total ?? 0,
  };
}

export async function getDashboardData(
  safraId: string,
  // Um consultor, vários ou nenhum (equipe toda).
  consultores?: string | string[]
): Promise<DadosDashboard> {
  const ids = (Array.isArray(consultores) ? consultores : consultores ? [consultores] : []).filter(Boolean);
  const where = { safraId, ...(ids.length > 0 ? { consultorId: { in: ids } } : {}) };

  const [vendas, meta, consultoresAtivos] = await Promise.all([
    prisma.venda.findMany({
      where,
      select: {
        valorTotal: true,
        status: true,
        cultura: true,
        dataFechamento: true,
        clienteId: true,
        cliente: { select: { nome: true } },
        consultor: { select: { id: true, nome: true } },
        produto: { select: { fornecedorId: true } },
      },
    }),
    prisma.meta.findFirst({ where: { safraId } }),
    prisma.user.findMany({
      where: {
        ativo: true,
        ...(ids.length > 0 ? { id: { in: ids } } : {}),
      },
      select: { id: true, nome: true },
      orderBy: { nome: "asc" },
    }),
  ]);

  const porStatusMap = new Map<Status, { total: number; qtd: number }>();
  const porCulturaMap = new Map<string, number>();
  const porClienteMap = new Map<string, Partial<Record<Status, number>>>();
  const evolucaoMap = new Map<string, number>();
  const rankingMap = new Map(
    consultoresAtivos.map((consultor) => [
      consultor.id,
      { consultor: consultor.nome, total: 0, faturado: 0 },
    ])
  );
  const clientesSet = new Set<string>();
  const fornecedoresSet = new Set<string>();

  let totalPipeline = 0;
  let faturado = 0;

  for (const v of vendas) {
    const status = v.status as Status;
    const valor = numeroDecimal(v.valorTotal);

    const st = porStatusMap.get(status) ?? { total: 0, qtd: 0 };
    st.total += valor;
    st.qtd += 1;
    porStatusMap.set(status, st);

    totalPipeline += valor;
    const cultura = v.cultura?.trim() || "Sem cultura";
    porCulturaMap.set(cultura, (porCulturaMap.get(cultura) ?? 0) + valor);

    if (status !== "CANCELADO") {
      clientesSet.add(v.clienteId);
      fornecedoresSet.add(v.produto.fornecedorId);
    }

    if (status === "FATURADO") {
      faturado += valor;
      if (v.dataFechamento) {
        const d = v.dataFechamento;
        const chave = `${d.getUTCFullYear()}-${String(d.getUTCMonth()).padStart(2, "0")}`;
        evolucaoMap.set(chave, (evolucaoMap.get(chave) ?? 0) + valor);
      }
    }

    const cli = porClienteMap.get(v.cliente.nome) ?? {};
    cli[status] = (cli[status] ?? 0) + valor;
    porClienteMap.set(v.cliente.nome, cli);

    const rk = rankingMap.get(v.consultor.id);
    if (rk) {
      rk.total += valor;
      if (status === "FATURADO") rk.faturado += valor;
    }
  }

  const clientesAtivos = clientesSet.size;
  const cancelado = porStatusMap.get("CANCELADO")?.total ?? 0;

  return {
    meta: numeroDecimal(meta?.valor),
    totalPipeline,
    faturado,
    emAndamento: totalPipeline - faturado - cancelado,
    clientesAtivos,
    fornecedoresAtivos: fornecedoresSet.size,
    mediaPorClienteAtivo: clientesAtivos ? totalPipeline / clientesAtivos : 0,
    ticketMedio: vendas.length ? totalPipeline / vendas.length : 0,
    qtdVendas: vendas.length,
    porStatus: STATUS_ORDEM.filter((s) => porStatusMap.has(s)).map((s) => ({
      status: s,
      label: STATUS_LABELS[s],
      total: porStatusMap.get(s)!.total,
      qtd: porStatusMap.get(s)!.qtd,
    })),
    porCultura: [...porCulturaMap.entries()]
      .map(([cultura, total]) => ({ cultura, total }))
      .sort((a, b) => b.total - a.total),
    porCliente: [...porClienteMap.entries()]
      .map(([cliente, statuses]) => ({ cliente, ...statuses }))
      .sort((a, b) => a.cliente.localeCompare(b.cliente, "pt-BR")),
    evolucao: serieMensalFaturamento(evolucaoMap),
    ranking: [...rankingMap.values()]
      .sort((a, b) => b.total - a.total),
  };
}
