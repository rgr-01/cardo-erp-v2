"use client";

import { fmtBRL, fmtNum } from "@/lib/format";
import {
  FAIXA_CORES,
  FAIXA_LABELS,
  MARGEM_MINIMA,
  calcularMargem,
  faixaDaMargem,
  tabelaMinima,
  tabelaSugerida,
  type FaixaMargem,
} from "@/lib/margem";
import { Badge } from "@/components/ui/badge";
import { unitarioLiquido } from "@/lib/desconto";

export type ItemSimulador = {
  id: string;
  produtoNome: string;
  fornecedorNome: string;
  cultura: string | null;
  volume: number | null;
  valorUnitario: number | null;
  // Desconto em % so deste item; a margem usa o preco ja com desconto.
  descontoPct?: number;
  custoUnitario: number | null;
  total: number;
};

function margemDoItem(item: ItemSimulador): number | null {
  return calcularMargem(unitarioLiquido(item.valorUnitario, item.descontoPct), item.custoUnitario);
}

function pct(valor: number | null): string {
  return valor == null ? "—" : `${(valor * 100).toFixed(1)}%`;
}

export function SimuladorMargem({
  itens,
  margemMedia,
  onEditarPreco,
  onRemoverItem,
  somenteResumo = false,
}: {
  itens: ItemSimulador[];
  margemMedia: number | null;
  // Presente => tabela editavel: o vendedor digita so o preco de venda, o
  // resto (tabela minima/sugerida, margem) e calculado aqui em tempo real.
  onEditarPreco?: (id: string, valor: string) => void;
  onRemoverItem?: (id: string) => void;
  // So o painel de margem media/faixas, sem a tabela (a tabela de itens ja mostra a margem).
  somenteResumo?: boolean;
}) {
  const contagemPorFaixa: Record<FaixaMargem, number> = {
    ABAIXO: 0,
    NA_META: 0,
    BOA: 0,
    ALTA: 0,
  };
  for (const item of itens) {
    const margem = margemDoItem(item);
    if (margem != null) contagemPorFaixa[faixaDaMargem(margem)]++;
  }

  const totalVenda = itens.reduce((soma, i) => soma + i.total, 0);
  const itemQueMaisPesa = itens.reduce<ItemSimulador | null>((maior, item) => {
    if (!maior || item.total > maior.total) return item;
    return maior;
  }, null);
  const pesoMaiorItem =
    itemQueMaisPesa && totalVenda > 0 ? itemQueMaisPesa.total / totalVenda : 0;
  const margemMaiorItem = itemQueMaisPesa
    ? margemDoItem(itemQueMaisPesa)
    : null;

  const abaixoDaMeta = margemMedia != null && margemMedia < MARGEM_MINIMA;
  const faixaMedia = margemMedia != null ? faixaDaMargem(margemMedia) : null;

  const resumo = (
      <div className="space-y-3">
        <div className="rounded-xl border border-surface-border bg-zinc-950/60 p-4">
          <p className="text-xs font-medium text-muted">Margem média do orçamento</p>
          <p
            className="mt-1 text-3xl font-bold"
            style={{ color: faixaMedia ? FAIXA_CORES[faixaMedia] : FAIXA_CORES.BOA }}
          >
            {pct(margemMedia)}
          </p>
          {abaixoDaMeta && (
            <p className="mt-1 flex items-center gap-1.5 text-xs text-red-400">
              <span className="h-1.5 w-1.5 rounded-full bg-red-400" /> Abaixo da meta de 27%
            </p>
          )}
        </div>

        <div className="rounded-xl border border-surface-border bg-zinc-950/60 p-4">
          <p className="mb-2 text-xs font-medium text-muted">Itens por faixa</p>
          <div className="grid grid-cols-4 gap-2 text-center">
            {(Object.keys(contagemPorFaixa) as FaixaMargem[]).map((faixa) => (
              <div
                key={faixa}
                className="rounded-lg border px-2 py-2"
                style={{ borderColor: `${FAIXA_CORES[faixa]}40`, backgroundColor: `${FAIXA_CORES[faixa]}15` }}
              >
                <p className="text-lg font-bold" style={{ color: FAIXA_CORES[faixa] }}>
                  {contagemPorFaixa[faixa]}
                </p>
                <p className="text-[10px] text-muted">{FAIXA_LABELS[faixa]}</p>
              </div>
            ))}
          </div>
        </div>

        {!somenteResumo && itemQueMaisPesa && pesoMaiorItem >= 0.3 && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs text-amber-300">
            <span className="font-semibold">Atenção:</span> {itemQueMaisPesa.produtoNome} (
            {pct(margemMaiorItem)}) concentra {(pesoMaiorItem * 100).toFixed(0)}% da venda e
            {margemMaiorItem != null && margemMaiorItem < MARGEM_MINIMA
              ? " puxa a média para baixo."
              : " tem peso relevante na média."}
          </div>
        )}
      </div>
  );

  if (somenteResumo) return resumo;

  return (
    <div className="grid gap-4 2xl:grid-cols-[1fr_280px]">
      <div className="overflow-x-auto rounded-xl border border-surface-border">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-surface-border bg-zinc-950 text-left text-xs uppercase text-muted">
              <th className="px-3 py-2">Produto</th>
              <th className="px-3 py-2 text-right">Volume</th>
              <th className="px-3 py-2 text-right">Tabela mín. (27%)</th>
              <th className="px-3 py-2 text-right">Tabela sugerida (30%)</th>
              <th className="px-3 py-2 text-right">Preço de venda</th>
              <th className="px-3 py-2 text-right">Margem</th>
              <th className="px-3 py-2 text-right">Total venda</th>
              {onRemoverItem && <th className="px-3 py-2"></th>}
            </tr>
          </thead>
          <tbody>
            {itens.map((item) => {
              const margem = margemDoItem(item);
              const faixa = margem != null ? faixaDaMargem(margem) : null;
              return (
                <tr key={item.id} className="border-b border-surface-border/60">
                  <td className="px-3 py-2">
                    <p className="font-medium text-white">{item.produtoNome}</p>
                    <p className="text-xs text-muted">
                      {item.fornecedorNome}
                      {item.cultura ? ` · ${item.cultura}` : ""}
                    </p>
                  </td>
                  <td className="px-3 py-2 text-right text-zinc-300">
                    {item.volume != null ? fmtNum(item.volume) : "—"}
                  </td>
                  <td className="px-3 py-2 text-right text-secondary">
                    {item.custoUnitario != null ? fmtBRL(tabelaMinima(item.custoUnitario)) : "—"}
                  </td>
                  <td className="px-3 py-2 text-right text-secondary">
                    {item.custoUnitario != null ? fmtBRL(tabelaSugerida(item.custoUnitario)) : "—"}
                  </td>
                  <td className="px-3 py-2 text-right font-semibold text-white">
                    {onEditarPreco ? (
                      <input
                        inputMode="decimal"
                        value={item.valorUnitario ?? ""}
                        onChange={(e) => onEditarPreco(item.id, e.target.value)}
                        className="w-24 rounded border bg-zinc-800 px-2 py-1 text-right text-sm text-white outline-none"
                        style={{
                          borderColor: faixa ? FAIXA_CORES[faixa] : "var(--surface-border)",
                        }}
                      />
                    ) : item.valorUnitario != null ? (
                      fmtBRL(item.valorUnitario)
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {faixa ? (
                      <Badge color={FAIXA_CORES[faixa]}>{pct(margem)}</Badge>
                    ) : (
                      <span className="text-xs text-muted">sem custo</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right font-semibold text-white">
                    {fmtBRL(item.total)}
                  </td>
                  {onRemoverItem && (
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => onRemoverItem(item.id)}
                        className="rounded px-2 py-1 text-xs text-secondary hover:bg-zinc-800 hover:text-red-400"
                      >
                        Remover
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {resumo}
    </div>
  );
}
