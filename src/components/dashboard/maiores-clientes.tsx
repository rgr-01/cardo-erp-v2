"use client";

import { useState } from "react";
import { fmtBRL, fmtBRLCompacto, fmtPct } from "@/lib/format";
import { Card } from "@/components/ui/card";
import { TITULO_CARD } from "@/components/dashboard/painel";

export type ClienteRanking = { cliente: string; total: number; cor: string };

export function MaioresClientes({ clientes, exportavel }: { clientes: ClienteRanking[]; exportavel: boolean }) {
  const [todos, setTodos] = useState(false);
  const lista = todos ? clientes : clientes.slice(0, 5);
  const total = clientes.reduce((soma, cliente) => soma + cliente.total, 0);
  return <Card exportavel={exportavel} titleClassName={TITULO_CARD} title="Maiores clientes">
    <p className="-mt-1 mb-4 text-xs text-muted">Participação no pipeline, sem vendas canceladas</p>
    <div className={todos ? "max-h-80 overflow-y-auto" : undefined}>
      <table className="w-full table-fixed text-left text-xs">
        <thead><tr className="border-b border-surface-border text-[11px] text-muted"><th scope="col" className="w-[48%] pb-3 font-medium">Cliente</th><th scope="col" className="w-[28%] pb-3 text-right font-medium">Valor</th><th scope="col" className="pb-3 pl-4 text-right font-medium">Part.</th></tr></thead>
        <tbody className="divide-y divide-surface-border">{lista.map((c, i) => <tr key={c.cliente}>
          <td className="py-4 pr-3"><div className="flex min-w-0 items-center gap-2"><span className="w-4 shrink-0 text-[10px] text-muted">{String(i + 1).padStart(2, "0")}</span><span className="truncate font-medium" title={c.cliente}>{c.cliente}</span></div></td>
          <td className="py-4 text-right font-semibold tabular-nums" title={fmtBRL(c.total)}>{fmtBRLCompacto(c.total)}</td>
          <td className="py-4 pl-4 text-right"><span className="tabular-nums">{fmtPct(total > 0 ? c.total / total : 0)}</span><div className="mt-1.5 h-1 overflow-hidden rounded bg-zinc-950"><div className="h-full rounded bg-[#168865]" style={{ width: `${total > 0 ? c.total / total * 100 : 0}%` }} /></div></td>
        </tr>)}</tbody>
      </table>
      {clientes.length === 0 && <p className="py-10 text-center text-sm text-muted">Nenhum cliente com vendas nesta safra.</p>}
    </div>
    {clientes.length > 5 && <div className="mt-2 flex items-center justify-between gap-3 border-t border-surface-border pt-3 text-[11px] text-muted"><span>{todos ? clientes.length : 5} de {clientes.length} clientes</span><button type="button" onClick={() => setTodos(v => !v)} aria-expanded={todos} className="min-h-9 text-xs font-semibold text-accent hover:underline">{todos ? "Mostrar menos" : "Ver todos"}</button></div>}
  </Card>;
}
