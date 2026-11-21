// Regras de margem do Orcamento: meta minima 27%, sugerida 30%. Vendedor so
// digita o preco de venda — custo vem do cadastro do Produto (custoCompra,
// o que se paga ao fornecedor) e a margem e' calculada aqui, nunca no
// cliente. custoAvista/custoAprazo sao os PRECOS DE VENDA de referencia (ja
// com a margem do gestor embutida) — servem so pra pre-preencher o campo
// Valor, nao entram no calculo de margem.

export const MARGEM_MINIMA = 0.27;
export const MARGEM_SUGERIDA = 0.3;

import { numeroDecimalOuNulo } from "@/lib/dinheiro";

export type FaixaMargem = "ABAIXO" | "NA_META" | "BOA" | "ALTA";

export type CondicaoPagamentoTipo = "AVISTA" | "APRAZO";

// Preco de venda de referencia (tabela) pra pre-preencher o campo Valor —
// nao e' custo de compra, ja inclui a margem do gestor.
export function precoDeVendaDoProduto(
  produto: { custoAvista: number | { toNumber(): number } | null; custoAprazo: number | { toNumber(): number } | null },
  condicao: CondicaoPagamentoTipo
): number | null {
  const preco = condicao === "AVISTA" ? produto.custoAvista : produto.custoAprazo;
  return numeroDecimalOuNulo(preco);
}

// Custo de compra de verdade — unico, nao varia por condicao de pagamento.
// Base real do calculo de margem (ver calcularMargem/margemPonderada).
export function custoDoProduto(produto: { custoCompra: number | { toNumber(): number } | null }): number | null {
  return numeroDecimalOuNulo(produto.custoCompra);
}

// Margem sobre o preco de venda: (venda - custo) / venda. Null quando falta
// custo cadastrado ou preco de venda — nao da pra calcular, item fica de fora
// da media ponderada do orcamento.
export function calcularMargem(precoVenda: number, custo: number | null): number | null {
  if (custo == null || precoVenda <= 0) return null;
  return (precoVenda - custo) / precoVenda;
}

export function tabelaMinima(custo: number): number {
  return custo / (1 - MARGEM_MINIMA);
}

export function tabelaSugerida(custo: number): number {
  return custo / (1 - MARGEM_SUGERIDA);
}

export function faixaDaMargem(margem: number): FaixaMargem {
  if (margem < MARGEM_MINIMA) return "ABAIXO";
  if (margem < MARGEM_MINIMA + 0.01) return "NA_META"; // 27% - 27,9%
  if (margem <= MARGEM_SUGERIDA) return "BOA"; // 28% - 30%
  return "ALTA"; // > 30%
}

export const FAIXA_CORES: Record<FaixaMargem, string> = {
  ABAIXO: "#ef4444",
  NA_META: "#eab308",
  BOA: "#16a34a",
  ALTA: "#3b82f6",
};

export const FAIXA_LABELS: Record<FaixaMargem, string> = {
  ABAIXO: "< 27%",
  NA_META: "27% (27,0–27,9%)",
  BOA: "28% até 30%",
  ALTA: "> 30%",
};

export type ItemParaMargem = {
  precoVenda: number;
  volume: number;
  custo: number | null;
};

// Margem media do orcamento ponderada pelo valor de venda de cada item (nao
// simples media aritmetica) — um item que concentra a maior parte do total
// pesa mais na media, igual ao "concentra 37% da venda" do simulador.
export function margemPonderada(itens: ItemParaMargem[]): number | null {
  let somaVenda = 0;
  let somaCusto = 0;
  let temItemValido = false;

  for (const item of itens) {
    if (item.custo == null) continue;
    const totalVenda = item.precoVenda * item.volume;
    const totalCusto = item.custo * item.volume;
    somaVenda += totalVenda;
    somaCusto += totalCusto;
    temItemValido = true;
  }

  if (!temItemValido || somaVenda <= 0) return null;
  return (somaVenda - somaCusto) / somaVenda;
}

// Margem indeterminada (produto sem custo cadastrado, por ex.) também exige
// aprovação do gestor — não dá pra confirmar que está dentro da meta, então
// não libera automaticamente (fail-closed).
export function precisaAprovacaoGestor(margemMedia: number | null): boolean {
  if (margemMedia == null) return true;
  return margemMedia < MARGEM_MINIMA;
}
