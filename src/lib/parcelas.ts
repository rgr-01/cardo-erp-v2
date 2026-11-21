// Parcelas de um pedido a partir da data de faturamento: a 1ª parcela sai na
// própria data de faturamento e as demais seguem em sequência, de acordo com
// os dias da condição de pagamento (ex.: "30/60/90 dias" = a cada 30 dias).

export type Parcela = { numero: number; data: string; valor: number };

// "30/60/90 dias" -> [30, 60, 90]; "À vista" ou texto sem números -> []
export function diasDaCondicao(condicao: string | null | undefined): number[] {
  return (condicao ?? "")
    .split("/")
    .map((parte) => parseInt(parte.replace(/\D/g, ""), 10))
    .filter((n) => Number.isFinite(n) && n > 0);
}

function somarDias(isoData: string, dias: number): string {
  const [a, m, d] = isoData.slice(0, 10).split("-").map(Number);
  const dt = new Date(Date.UTC(a, m - 1, d + dias));
  return dt.toISOString().slice(0, 10);
}

export function parcelasDoPedido({
  condicao,
  dataFaturamento,
  total,
}: {
  condicao: string | null | undefined;
  dataFaturamento: string | null | undefined;
  total: number;
}): Parcela[] {
  if (!dataFaturamento || !/^\d{4}-\d{2}-\d{2}/.test(dataFaturamento)) return [];
  const dias = diasDaCondicao(condicao);
  // À vista: uma parcela só, na data de faturamento.
  const quantidade = Math.max(1, dias.length);
  const intervalo = dias[0] ?? 0;
  const centavos = Math.round(total * 100);
  const base = Math.floor(centavos / quantidade);
  return Array.from({ length: quantidade }, (_, i) => ({
    numero: i + 1,
    data: somarDias(dataFaturamento, i * intervalo),
    // a última parcela leva a sobra dos centavos
    valor: (i === quantidade - 1 ? centavos - base * (quantidade - 1) : base) / 100,
  }));
}
