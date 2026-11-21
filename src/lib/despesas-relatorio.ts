import { prisma } from "@/lib/prisma";
import type { CategoriaDespesa } from "@/generated/prisma/client";
import { numeroDecimal } from "@/lib/dinheiro";

export type LinhaDespesaDetalhe = {
  id: string;
  categoria: CategoriaDespesa;
  valor: number;
  data: Date;
  estabelecimento: string | null;
  clienteNome: string | null;
  consultorNome: string;
};

export type DadosRelatorioDespesas = {
  total: number;
  qtd: number;
  porCategoria: { categoria: CategoriaDespesa; total: number; qtd: number }[];
  porConsultor: { consultor: string; total: number; qtd: number }[];
  evolucao: { mes: string; total: number }[];
  detalhe: LinhaDespesaDetalhe[];
};

const MESES = [
  "jan", "fev", "mar", "abr", "mai", "jun",
  "jul", "ago", "set", "out", "nov", "dez",
];

export async function getRelatorioDespesas(opts: {
  safraId: string;
  consultorId?: string;
  dataInicio?: Date;
  dataFim?: Date;
}): Promise<DadosRelatorioDespesas> {
  const where = {
    safraId: opts.safraId,
    ...(opts.consultorId ? { consultorId: opts.consultorId } : {}),
    ...(opts.dataInicio || opts.dataFim
      ? {
          data: {
            ...(opts.dataInicio ? { gte: opts.dataInicio } : {}),
            ...(opts.dataFim ? { lte: opts.dataFim } : {}),
          },
        }
      : {}),
  };

  const despesas = await prisma.despesa.findMany({
    where,
    select: {
      id: true,
      categoria: true,
      valor: true,
      data: true,
      estabelecimento: true,
      cliente: { select: { nome: true } },
      consultor: { select: { nome: true } },
    },
    orderBy: { data: "desc" },
  });

  const porCategoriaMap = new Map<CategoriaDespesa, { total: number; qtd: number }>();
  const porConsultorMap = new Map<string, { total: number; qtd: number }>();
  const evolucaoMap = new Map<string, number>();
  let total = 0;

  for (const d of despesas) {
    const valor = numeroDecimal(d.valor);
    total += valor;

    const cat = porCategoriaMap.get(d.categoria) ?? { total: 0, qtd: 0 };
    cat.total += valor;
    cat.qtd += 1;
    porCategoriaMap.set(d.categoria, cat);

    const cons = porConsultorMap.get(d.consultor.nome) ?? { total: 0, qtd: 0 };
    cons.total += valor;
    cons.qtd += 1;
    porConsultorMap.set(d.consultor.nome, cons);

    const chave = `${d.data.getFullYear()}-${String(d.data.getMonth() + 1).padStart(2, "0")}`;
    evolucaoMap.set(chave, (evolucaoMap.get(chave) ?? 0) + valor);
  }

  const evolucao = Array.from(evolucaoMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([chave, valor]) => {
      const [, mes] = chave.split("-");
      return { mes: MESES[Number(mes) - 1], total: valor };
    });

  return {
    total,
    qtd: despesas.length,
    porCategoria: Array.from(porCategoriaMap.entries())
      .map(([categoria, v]) => ({ categoria, ...v }))
      .sort((a, b) => b.total - a.total),
    porConsultor: Array.from(porConsultorMap.entries())
      .map(([consultor, v]) => ({ consultor, ...v }))
      .sort((a, b) => b.total - a.total),
    evolucao,
    detalhe: despesas.map((d) => ({
      id: d.id,
      categoria: d.categoria,
      valor: numeroDecimal(d.valor),
      data: d.data,
      estabelecimento: d.estabelecimento,
      clienteNome: d.cliente?.nome ?? null,
      consultorNome: d.consultor.nome,
    })),
  };
}
