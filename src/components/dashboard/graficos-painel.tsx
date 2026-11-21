"use client";

import { useId } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fmtBRL, fmtBRLCompacto, fmtPct, STATUS_CORES, type Status } from "@/lib/format";

const tooltipStyle = { background: "var(--surface)", border: "1px solid var(--surface-border)", borderRadius: 8, color: "var(--foreground)", fontSize: 12 };

export function EvolucaoFaturamento({ data }: { data: { mes: string; total: number }[] }) {
  const id = useId().replace(/:/g, "");
  if (!data.length) return <div className="flex h-52 items-center justify-center text-center text-sm text-muted">O faturamento aparecerá aqui após as primeiras vendas faturadas.</div>;
  return <div>
    <div className="h-52 min-w-0" role="img" aria-label="Evolução mensal do faturamento. Valores disponíveis na tabela acessível.">
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <AreaChart data={data} margin={{ top: 15, right: 12, bottom: 0, left: 0 }} accessibilityLayer>
          <defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#168865" stopOpacity={0.2} /><stop offset="100%" stopColor="#168865" stopOpacity={0.01} /></linearGradient></defs>
          <CartesianGrid vertical={false} stroke="var(--surface-border)" strokeDasharray="3 5" />
          <XAxis dataKey="mes" tickLine={false} axisLine={false} tick={{ fill: "var(--text-muted)", fontSize: 11 }} minTickGap={22} dy={8} height={32} />
          <YAxis tickFormatter={value => fmtBRLCompacto(Number(value)).replace("R$ ", "")} tickLine={false} axisLine={false} tick={{ fill: "var(--text-muted)", fontSize: 10 }} width={55} tickCount={4} />
          <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: "var(--text-secondary)" }} itemStyle={{ color: "var(--foreground)" }} formatter={value => [fmtBRL(Number(value)), "Faturado"]} />
          <Area type="monotone" dataKey="total" name="Faturado" stroke="#168865" strokeWidth={2.5} fill={`url(#${id})`} dot={data.length === 1 ? { r: 4 } : false} activeDot={{ r: 5, strokeWidth: 3, stroke: "var(--surface)" }} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
    <table className="sr-only"><caption>Faturamento mensal</caption><thead><tr><th>Mês</th><th>Faturado</th></tr></thead><tbody>{data.map(d => <tr key={d.mes}><td>{d.mes}</td><td>{fmtBRL(d.total)}</td></tr>)}</tbody></table>
  </div>;
}

export function DistribuicaoVendas({ data }: { data: { status: Status; label: string; total: number; qtd: number }[] }) {
  const labels: Record<Status, string> = { PROSPECCAO: "Prosp.", NEGOCIACAO: "Negoc.", FECHADO: "Fechado", EM_CARTEIRA: "Carteira", FATURADO: "Faturado", CANCELADO: "Cancel." };
  if (!data.some(d => d.total > 0)) return <p className="py-10 text-center text-sm text-muted">Nenhuma venda nos filtros atuais.</p>;
  return <div>
    <div className="h-36 min-w-0" role="img" aria-label="Valores de vendas por etapa">
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <BarChart data={data} barSize={24} margin={{ top: 8, left: 0, right: 0, bottom: 0 }} accessibilityLayer>
          <XAxis dataKey="status" tickFormatter={status => labels[status as Status]} axisLine={false} tickLine={false} interval={0} tick={{ fill: "var(--text-muted)", fontSize: 9 }} />
          <Tooltip contentStyle={tooltipStyle} labelFormatter={status => data.find(d => d.status === status)?.label ?? status} cursor={{ fill: "var(--surface-border)", opacity: 0.3 }} formatter={value => [fmtBRL(Number(value)), "Total"]} />
          <Bar dataKey="total" radius={[5, 5, 0, 0]} isAnimationActive={false}>{data.map(d => <Cell key={d.status} fill={STATUS_CORES[d.status]} />)}</Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
    <ul className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 text-[11px]">
      {data.map(d => <li key={d.status} className="flex min-w-0 items-start gap-1.5" title={`${d.label}: ${fmtBRL(d.total)} · ${d.qtd} registros`}><span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: STATUS_CORES[d.status] }} /><span className="min-w-0 flex-1"><span className="block text-muted">{d.label}</span><b className="font-medium text-foreground">{fmtBRLCompacto(d.total)}</b></span></li>)}
    </ul>
  </div>;
}

export function ProgressoMeta({ meta, faturado, aberto }: { meta: number; faturado: number; aberto: number }) {
  const pct = meta > 0 ? faturado / meta : 0;
  return <div>
    <svg viewBox="0 0 240 144" className="mx-auto w-full max-w-[250px]" role="img" aria-label={meta > 0 ? `${fmtPct(pct)} da meta faturada` : "Meta não definida"}>
      <path d="M 24 120 A 96 96 0 0 1 216 120" fill="none" stroke="var(--surface-border)" strokeWidth="14" pathLength="100" strokeDasharray="1.5 1" />
      <path d="M 24 120 A 96 96 0 0 1 216 120" fill="none" stroke="#168865" strokeWidth="14" pathLength="100" strokeDasharray={`${Math.min(Math.max(pct, 0), 1) * 100} 100`} />
      <text x="120" y="96" textAnchor="middle" fill="var(--foreground)" fontSize="30" fontWeight="600">{meta > 0 ? fmtPct(pct) : "—"}</text>
      <text x="120" y="117" textAnchor="middle" fill="var(--text-muted)" fontSize="11">da meta faturada</text>
    </svg>
    <div className="flex items-baseline justify-between gap-3 border-t border-surface-border pt-3 text-xs"><span className="text-muted">Meta da safra</span><b className="font-semibold">{meta > 0 ? fmtBRLCompacto(meta) : "Não definida"}</b></div>
    {meta > 0 && <p className="mt-2 text-[11px] text-muted">Pipeline em aberto cobre {fmtPct(aberto / meta)} da meta.</p>}
  </div>;
}
