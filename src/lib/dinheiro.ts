type DecimalOuNumero = { toNumber(): number } | number | null | undefined;

// Converte apenas na saída para telas, PDFs e integrações. No banco, Prisma
// mantém Decimal para que preços e totais não sofram erro de ponto flutuante.
export function numeroDecimal(valor: DecimalOuNumero): number {
  if (valor == null) return 0;
  return typeof valor === "number" ? valor : valor.toNumber();
}

export function numeroDecimalOuNulo(valor: DecimalOuNumero): number | null {
  return valor == null ? null : numeroDecimal(valor);
}
