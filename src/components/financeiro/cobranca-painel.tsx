"use client";

import { useState } from "react";
import { AlertTriangle, CheckCircle2, Clock } from "lucide-react";
import { fmtBRL, fmtData } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Kpi } from "@/components/ui/kpi";

type StatusBoleto = "PENDENTE" | "EMITIDO" | "PAGO" | "CANCELADO";

export type PendenciaCobranca = {
  id: string;
  codigo: string;
  clienteNome: string;
  consultorNome: string;
  total: number;
  vencimento: string | null;
  valor: number | null;
  status: StatusBoleto;
  dataPagamento: string | null;
};

type Filtro = "aberto" | "vencidos" | "pagos" | "todos";

const FILTROS: { id: Filtro; rotulo: string }[] = [
  { id: "aberto", rotulo: "Em aberto" },
  { id: "vencidos", rotulo: "Vencidos" },
  { id: "pagos", rotulo: "Pagos" },
  { id: "todos", rotulo: "Todos" },
];

function estaVencido(c: PendenciaCobranca): boolean {
  if (c.status === "PAGO" || !c.vencimento) return false;
  return new Date(c.vencimento).getTime() < Date.now();
}

const valorDe = (c: PendenciaCobranca) => c.valor ?? c.total;
const soma = (lista: PendenciaCobranca[]) => lista.reduce((s, c) => s + valorDe(c), 0);

export function CobrancaPainel({ cobrancas }: { cobrancas: PendenciaCobranca[] }) {
  const [filtro, setFiltro] = useState<Filtro>("aberto");

  const abertos = cobrancas.filter((c) => c.status !== "PAGO");
  const vencidos = abertos.filter(estaVencido);
  const aVencer = abertos.filter((c) => !estaVencido(c));
  const pagos = cobrancas.filter((c) => c.status === "PAGO");

  const porFiltro: Record<Filtro, PendenciaCobranca[]> = {
    // Vencidos primeiro, depois por vencimento.
    aberto: [...vencidos, ...aVencer],
    vencidos,
    pagos: [...pagos].sort((a, b) => (b.dataPagamento ?? "").localeCompare(a.dataPagamento ?? "")),
    todos: [...vencidos, ...aVencer, ...pagos],
  };
  const lista = porFiltro[filtro];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-white">Contas a receber</h1>
        <p className="text-xs text-muted">Boletos dos pedidos da safra, por vencimento</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Kpi rotulo="Vencidos" valor={fmtBRL(soma(vencidos))} detalhe={`${vencidos.length} ${vencidos.length === 1 ? "boleto em atraso" : "boletos em atraso"}`} icone={AlertTriangle} alerta={vencidos.length > 0} />
        <Kpi rotulo="A vencer" valor={fmtBRL(soma(aVencer))} detalhe={`${aVencer.length} boletos em aberto`} icone={Clock} />
        <Kpi rotulo="Recebidos" valor={fmtBRL(soma(pagos))} detalhe={`${pagos.length} boletos pagos`} icone={CheckCircle2} />
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTROS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFiltro(f.id)}
            className={`rounded-lg border px-3 py-1 text-xs transition ${
              filtro === f.id
                ? "border-accent bg-accent/15 text-accent"
                : "border-surface-border text-secondary hover:border-zinc-500 hover:text-white"
            }`}
          >
            {f.rotulo} <span>({porFiltro[f.id].length})</span>
          </button>
        ))}
      </div>

      <div className="tabela-fixa overflow-x-auto rounded-xl border border-surface-border">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b border-surface-border bg-zinc-900 text-left text-xs font-medium text-muted">
              <th className="px-3 py-2.5">Pedido</th>
              <th className="px-3 py-2.5">Cliente</th>
              <th className="px-3 py-2.5">Consultor</th>
              <th className="px-3 py-2.5 text-right">Valor</th>
              <th className="px-3 py-2.5">Vencimento</th>
              <th className="px-3 py-2.5">Situação</th>
            </tr>
          </thead>
          <tbody>
            {lista.map((c) => (
              <tr key={c.id} className="border-b border-surface-border/50 hover:bg-zinc-900/60">
                <td className="px-3 py-2 font-semibold text-white">{c.codigo}</td>
                <td className="max-w-56 truncate px-3 py-2 text-zinc-300">{c.clienteNome}</td>
                <td className="px-3 py-2 text-secondary">{c.consultorNome}</td>
                <td className="whitespace-nowrap px-3 py-2 text-right font-semibold text-white">{fmtBRL(valorDe(c))}</td>
                <td className="px-3 py-2 text-secondary">{fmtData(c.vencimento)}</td>
                <td className="px-3 py-2">
                  {c.status === "PAGO" ? (
                    <Badge color="#10b981">Pago{c.dataPagamento ? ` em ${fmtData(c.dataPagamento)}` : ""}</Badge>
                  ) : estaVencido(c) ? (
                    <Badge color="#ef4444">Vencido</Badge>
                  ) : (
                    <Badge color="#3b82f6">A vencer</Badge>
                  )}
                </td>
              </tr>
            ))}
            {lista.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-muted"><p className="sticky left-3 max-w-[calc(100vw-4rem)] whitespace-normal md:max-w-[calc(100vw-20rem)]">Nenhum boleto neste filtro. Escolha outro filtro para consultar os demais boletos da safra.</p></td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
