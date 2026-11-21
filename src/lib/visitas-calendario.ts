// Dados do calendário de visitas: eventos num intervalo e a carteira de
// clientes com recência de visita (há quantos dias não recebe visita) e
// os números que alimentam o diagnóstico da carteira.

import { prisma } from "@/lib/prisma";
import { diasDesde } from "@/lib/recencia-visita";
import {
  categoriaEfetiva,
  corDaCategoria,
  type CategoriaVisita,
} from "@/lib/visitas-categoria";

export type EventoVisita = {
  id: string;
  title: string;
  start: string;
  end?: string;
  allDay: boolean;
  backgroundColor: string;
  borderColor: string;
  classNames: string[];
  extendedProps: {
    clienteId: string;
    cliente: string;
    consultor: string;
    consultorId: string;
    tipo: "VISITA" | "TECNICO";
    categoria: CategoriaVisita;
    emAndamento: boolean;
    agendada: boolean;
  };
};

// Visita sem hora de saída ainda (check-in aberto) aparece com 1h de duração.
const DURACAO_PADRAO_MS = 60 * 60 * 1000;

export async function eventosDoCalendario(opts: {
  inicio: Date;
  fim: Date;
  safraId: string;
  consultorId?: string;
  // Vários consultores (filtro do calendário); vale além de consultorId.
  consultorIds?: string[];
}): Promise<EventoVisita[]> {
  const visitas = await prisma.relatorioVisita.findMany({
    where: {
      safraId: opts.safraId,
      dataVisita: { gte: opts.inicio, lt: opts.fim },
      ...(opts.consultorIds?.length
        ? { consultorId: { in: opts.consultorIds } }
        : opts.consultorId
          ? { consultorId: opts.consultorId }
          : {}),
    },
    select: {
      id: true,
      tipo: true,
      categoria: true,
      status: true,
      dataVisita: true,
      horaChegada: true,
      horaSaida: true,
      consultorId: true,
      clienteId: true,
      cliente: { select: { nome: true } },
      consultor: { select: { nome: true } },
      fotos: { select: { id: true }, take: 1 },
    },
    orderBy: { dataVisita: "asc" },
    take: 1500,
  });

  return visitas.map((v) => {
    const tipo = v.tipo === "TECNICO" || v.fotos.length > 0 ? "TECNICO" : "VISITA";
    const categoria = categoriaEfetiva({ categoria: v.categoria, tipo });
    const cor = corDaCategoria(categoria);
    const agendada = v.status === "AGENDADA";
    const emAndamento = v.status === "ABERTA";
    const base = {
      id: v.id,
      title: v.cliente.nome,
      // Agendada: só o contorno tracejado, sem preenchimento.
      backgroundColor: agendada ? "transparent" : cor,
      borderColor: cor,
      classNames: agendada ? ["evento-agendado"] : [],
      extendedProps: {
        clienteId: v.clienteId,
        cliente: v.cliente.nome,
        consultor: v.consultor.nome,
        consultorId: v.consultorId,
        tipo,
        categoria,
        emAndamento,
        agendada,
      } as const,
    };

    if (agendada) {
      return {
        ...base,
        start: v.dataVisita.toISOString(),
        end: new Date(v.dataVisita.getTime() + DURACAO_PADRAO_MS).toISOString(),
        allDay: false,
      };
    }
    // Com check-in: evento no horário real. Sem: evento do dia inteiro.
    if (v.horaChegada) {
      const fim = v.horaSaida ?? new Date(v.horaChegada.getTime() + DURACAO_PADRAO_MS);
      return { ...base, start: v.horaChegada.toISOString(), end: fim.toISOString(), allDay: false };
    }
    return {
      ...base,
      start: v.dataVisita.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }),
      allDay: true,
    };
  });
}

export type ClienteRecencia = {
  id: string;
  nome: string;
  consultorId: string | null;
  consultorNome: string | null;
  ultimaVisita: string | null;
  dias: number | null;
  cidade: string | null;
  // Área de plantio (ha) e faturamento da safra (R$): base da matriz BCG.
  area: number | null;
  faturamento: number;
  visitasMes: number;
  visitasSafra: number;
};

export type VisitaResumo = {
  consultorId: string;
  clienteId: string;
  // yyyy-mm-dd em Brasília.
  dia: string;
  agendada: boolean;
};

export type CarteiraVisitas = {
  clientes: ClienteRecencia[];
  // Visitas do mês anterior ao fim das agendadas: base dos KPIs do mês.
  visitas: VisitaResumo[];
};

// Onde o cliente "fica": a cidade onde a maioria das fazendas dele está
// ("Formosa do Rio Preto - BA"); sem fazenda com cidade, a do cadastro.
export function cidadeDoCliente(c: {
  cidade: string | null;
  fazendas: { cidade: string | null; uf: string | null }[];
}): string | null {
  const contagem = new Map<string, number>();
  for (const f of c.fazendas) {
    if (!f.cidade) continue;
    const nome = f.uf ? `${f.cidade} - ${f.uf}` : f.cidade;
    contagem.set(nome, (contagem.get(nome) ?? 0) + 1);
  }
  const [maisComum] = [...contagem].sort((a, b) => b[1] - a[1]);
  return maisComum?.[0] ?? c.cidade?.trim() ?? null;
}

function diaBrasilia(d: Date): string {
  return d.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

// Consultor vê a própria carteira; gestor vê todos os clientes.
export async function carteiraDeVisitas(opts: {
  consultorId?: string;
  safraId: string;
}): Promise<CarteiraVisitas> {
  const agora = new Date();
  const hoje = diaBrasilia(agora);
  const inicioMes = new Date(`${hoje.slice(0, 8)}01T00:00:00-03:00`);
  const inicioMesAnterior = new Date(inicioMes);
  inicioMesAnterior.setUTCMonth(inicioMesAnterior.getUTCMonth() - 1);
  // Tudo é da safra escolhida: as visitas de outra safra não entram.
  const daSafraEscolhida = { safraId: opts.safraId } as const;
  const feitas = { status: { not: "AGENDADA" }, ...daSafraEscolhida } as const;

  const [clientes, ultimas, doMes, daSafra, vendas, janela] = await Promise.all([
    prisma.cliente.findMany({
      where: opts.consultorId ? { consultorId: opts.consultorId } : undefined,
      select: {
        id: true,
        nome: true,
        cidade: true,
        areaPlantio: true,
        consultorId: true,
        consultor: { select: { nome: true } },
        fazendas: { select: { cidade: true, uf: true } },
      },
    }),
    prisma.relatorioVisita.groupBy({
      by: ["clienteId"],
      where: feitas,
      _max: { dataVisita: true },
    }),
    prisma.relatorioVisita.groupBy({
      by: ["clienteId"],
      where: { ...feitas, dataVisita: { gte: inicioMes } },
      _count: true,
    }),
    prisma.relatorioVisita.groupBy({
      by: ["clienteId"],
      where: feitas,
      _count: true,
    }),
    prisma.venda.groupBy({
      by: ["clienteId"],
      where: { safraId: opts.safraId, status: { in: ["FECHADO", "EM_CARTEIRA", "FATURADO"] } },
      _sum: { valorTotal: true },
    }),
    prisma.relatorioVisita.findMany({
      where: {
        ...daSafraEscolhida,
        dataVisita: { gte: inicioMesAnterior },
        ...(opts.consultorId ? { consultorId: opts.consultorId } : {}),
      },
      select: { consultorId: true, clienteId: true, dataVisita: true, status: true },
      orderBy: { dataVisita: "asc" },
      take: 5000,
    }),
  ]);

  const ultimaPorCliente = new Map(ultimas.map((u) => [u.clienteId, u._max.dataVisita]));
  const mesPorCliente = new Map(doMes.map((u) => [u.clienteId, u._count]));
  const safraPorCliente = new Map(daSafra.map((u) => [u.clienteId, u._count]));
  const fatPorCliente = new Map(vendas.map((v) => [v.clienteId, Number(v._sum.valorTotal ?? 0)]));

  return {
    clientes: clientes.map((c) => {
      const ultima = ultimaPorCliente.get(c.id) ?? null;
      return {
        id: c.id,
        nome: c.nome,
        consultorId: c.consultorId,
        consultorNome: c.consultor?.nome ?? null,
        ultimaVisita: ultima?.toISOString() ?? null,
        dias: diasDesde(ultima, agora),
        cidade: cidadeDoCliente(c),
        area: c.areaPlantio && c.areaPlantio > 0 ? c.areaPlantio : null,
        faturamento: fatPorCliente.get(c.id) ?? 0,
        visitasMes: mesPorCliente.get(c.id) ?? 0,
        visitasSafra: safraPorCliente.get(c.id) ?? 0,
      };
    }),
    visitas: janela.map((v) => ({
      consultorId: v.consultorId,
      clienteId: v.clienteId,
      dia: diaBrasilia(v.dataVisita),
      agendada: v.status === "AGENDADA",
    })),
  };
}

// Só a recência (sem os números do diagnóstico): usada pelo relatório mensal.
export async function recenciaDosClientes(opts: { consultorId?: string }): Promise<ClienteRecencia[]> {
  const [clientes, ultimas] = await Promise.all([
    prisma.cliente.findMany({
      where: opts.consultorId ? { consultorId: opts.consultorId } : undefined,
      select: { id: true, nome: true, cidade: true, consultorId: true, consultor: { select: { nome: true } } },
    }),
    prisma.relatorioVisita.groupBy({
      by: ["clienteId"],
      where: { status: { not: "AGENDADA" } },
      _max: { dataVisita: true },
    }),
  ]);
  const ultimaPorCliente = new Map(ultimas.map((u) => [u.clienteId, u._max.dataVisita]));
  const agora = new Date();
  return clientes.map((c) => {
    const ultima = ultimaPorCliente.get(c.id) ?? null;
    return {
      id: c.id,
      nome: c.nome,
      consultorId: c.consultorId,
      consultorNome: c.consultor?.nome ?? null,
      ultimaVisita: ultima?.toISOString() ?? null,
      dias: diasDesde(ultima, agora),
      cidade: c.cidade,
      area: null,
      faturamento: 0,
      visitasMes: 0,
      visitasSafra: 0,
    };
  });
}
