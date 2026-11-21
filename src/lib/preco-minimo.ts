// Desconto comercial de 3% sobre o preço cadastrado, independente da margem.
export function precoMinimo(preco: number | null | undefined): number | null {
  if (preco == null || !Number.isFinite(preco) || preco < 0) return null;
  const centavos = Math.round(preco * 100);
  return Math.round(centavos * 97 / 100) / 100;
}
