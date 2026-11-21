import {
  STATUS_CORES,
  fmtBRLCompacto,
  fmtPct,
  type Status,
} from "@/lib/format";

// Título dos cartões do dashboard: à esquerda, maior e em branco.
export const TITULO_CARD = "mb-4 pr-8 text-left text-sm font-semibold text-white";

export function FunilBarras({
  data,
}: {
  data: { status: Status; label: string; total: number; qtd?: number }[];
}) {
  const maior = Math.max(...data.map((d) => d.total), 1);
  const soma = data.reduce((acc, d) => acc + d.total, 0);
  if (soma === 0) return <p className="py-4 text-sm text-muted">Nenhum valor de venda para exibir nesta safra e nos filtros atuais.</p>;
  return (
    <div className="flex flex-col divide-y divide-surface-border">
      {data.map((d) => (
        <div key={d.status} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 py-2.5 first:pt-0 last:pb-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-sm font-medium text-zinc-100"><span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ background: STATUS_CORES[d.status] }} />{d.label}</div>
            <div className="text-[11px] text-muted">
              {d.qtd !== undefined && `${d.qtd} ${d.qtd === 1 ? "item" : "itens"} · `}
              {fmtPct(soma > 0 ? d.total / soma : 0)}
            </div>
          </div>
          <div className="text-right text-base font-semibold tabular-nums text-white">{fmtBRLCompacto(d.total)}</div>
          <div className="col-span-2 h-1.5 overflow-hidden rounded bg-zinc-950">
            <div
              className="h-full rounded"
              style={{ width: `${Math.max((d.total / maior) * 100, d.total > 0 ? 2 : 0)}%`, background: STATUS_CORES[d.status] }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

// Rosca (donut) com as maiores fatias e "Demais" juntando o resto.
export function DonutCultura({
  data,
  maxFatias = 4,
}: {
  data: { cultura: string; total: number }[];
  maxFatias?: number;
}) {
  const total = data.reduce((acc, c) => acc + c.total, 0);
  if (total <= 0) return <p className="py-4 text-sm text-muted">Nenhuma venda por cultura nesta safra.</p>;
  const cores: Record<string, string> = { Soja: "#168865", Milho: "#497cb6", "Algodão": "#8b70af", "Feijão": "#d18b39", Sorgo: "#687d8a", Arroz: "#c66759", Trigo: "#a38e36" };
  const principais = data.slice(0, maxFatias).map(c => ({ nome: c.cultura, valor: c.total, cor: cores[c.cultura] ?? "#687d8a" }));
  const resto = data.slice(maxFatias).reduce((acc, c) => acc + c.total, 0);
  const fatias = resto > 0 ? [...principais, { nome: "Demais", valor: resto, cor: "#4a6670" }] : principais;

  const gradiente = fatias
    .map((f, i) => {
      const antes = fatias.slice(0, i).reduce((acc, x) => acc + x.valor, 0);
      return `${f.cor} ${(antes / total) * 100}% ${((antes + f.valor) / total) * 100}%`;
    })
    .join(", ");

  return (
    <div className="flex w-full flex-col items-center gap-4">
      <div
        className="relative h-32 w-32 shrink-0 rounded-full"
        style={{ background: `conic-gradient(${gradiente})` }}
        role="img"
        aria-label={`Culturas: ${fatias.map((f) => `${f.nome} ${fmtPct(f.valor / total)}`).join(", ")}`}
      >
        <div className="absolute inset-5 flex flex-col items-center justify-center rounded-full bg-zinc-900"><span className="text-lg font-semibold">{data.length}</span><span className="text-[10px] text-muted">culturas</span></div>
      </div>
      <ul className="flex w-full min-w-0 flex-col gap-2 text-xs text-zinc-300">
        {fatias.map((f) => (
          <li key={f.nome} className="flex items-center gap-2">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: f.cor }} aria-hidden /><span className="min-w-0 flex-1">{f.nome}</span><span className="text-[11px] text-muted">{fmtBRLCompacto(f.valor)}</span><b className="w-12 text-right font-medium text-white">{fmtPct(f.valor / total)}</b>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function RankingBarras({
  data,
}: {
  data: { consultor: string; total: number; faturado: number }[];
}) {
  const maior = Math.max(...data.map((d) => d.total), 1);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-4 text-[11px] text-muted"><span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#497cb6]" />Pipeline</span><span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#168865]" />Faturado</span></div>
      {data.map((d, i) => (
        <div key={d.consultor}>
          <div className="mb-1.5 flex justify-between gap-2 text-xs text-zinc-300">
            <span className="min-w-0 break-words">{i + 1} · {d.consultor}</span>
            <span className="shrink-0 text-secondary">{fmtBRLCompacto(d.total)}</span>
          </div>
          <div className="h-2 overflow-hidden rounded bg-zinc-950" role="img" aria-label={`${d.consultor}: pipeline ${fmtBRLCompacto(d.total)}, faturado ${fmtBRLCompacto(d.faturado)}`}>
            <div className="h-full overflow-hidden rounded bg-[#497cb6]" style={{ width: `${(d.total / maior) * 100}%` }}><div className="h-full bg-[#168865]" style={{ width: `${d.total > 0 ? Math.min(d.faturado / d.total, 1) * 100 : 0}%` }} /></div>
          </div>
        </div>
      ))}
    </div>
  );
}
