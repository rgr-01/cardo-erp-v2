// Desconto em % por item: valorUnitario fica bruto; o que vale pra total,
// margem e venda e' o valor liquido (bruto menos o desconto do item).

function arredondar(valor: number, casas: number): number {
  const f = 10 ** casas;
  return Math.round(valor * f) / f;
}

export function unitarioLiquido(valorUnitario: number | null | undefined, descontoPct: number | null | undefined): number {
  const pct = Math.min(100, Math.max(0, descontoPct ?? 0));
  return arredondar((valorUnitario ?? 0) * (1 - pct / 100), 4);
}

export function totalBrutoItem(volume: number | null | undefined, valorUnitario: number | null | undefined): number {
  return arredondar((volume ?? 0) * (valorUnitario ?? 0), 2);
}

export function totalLiquidoItem(
  volume: number | null | undefined,
  valorUnitario: number | null | undefined,
  descontoPct: number | null | undefined
): number {
  return arredondar((volume ?? 0) * unitarioLiquido(valorUnitario, descontoPct), 2);
}
