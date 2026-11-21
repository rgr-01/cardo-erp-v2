"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { CheckCircle2, Plus, Wallet, AlertTriangle, CalendarClock, CalendarDays } from "lucide-react";
import { baixarDespesa } from "@/app/actions/despesas";
import { fmtBRL, fmtData, fmtNum } from "@/lib/format";
import { Kpi } from "@/components/ui/kpi";
import { Badge } from "@/components/ui/badge";
import { useConfirm } from "@/components/ui/confirm-dialog";

export type ContaPagarLinha = {
  id: string;
  valor: number;
  vencimento: string | null; // yyyy-mm-dd
  data: string;
  descricao: string;
  documento: string | null;
  conta: string | null;
  consultorNome: string;
};

type Filtro = "todas" | "vencidas" | "hoje" | "semana" | "mes" | "sem-vencimento";

const FILTROS: { id: Filtro; rotulo: string }[] = [
  { id: "todas", rotulo: "Todas" },
  { id: "vencidas", rotulo: "Vencidas" },
  { id: "hoje", rotulo: "Vencem hoje" },
  { id: "semana", rotulo: "Próximos 7 dias" },
  { id: "mes", rotulo: "Este mês" },
  { id: "sem-vencimento", rotulo: "Sem vencimento" },
];

function somarDias(iso: string, dias: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + dias)).toISOString().slice(0, 10);
}

export function ContasPagarPainel({ contas, hoje }: { contas: ContaPagarLinha[]; hoje: string }) {
  const [filtro, setFiltro] = useState<Filtro>("todas");
  const [pagas, setPagas] = useState<Set<string>>(new Set());
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();
  const { confirmar } = useConfirm();

  const abertas = contas.filter((c) => !pagas.has(c.id));
  const em7 = somarDias(hoje, 7);
  const mes = hoje.slice(0, 7);

  const passa = useMemo(
    () =>
      (c: ContaPagarLinha, f: Filtro): boolean => {
        const v = c.vencimento;
        if (f === "todas") return true;
        if (f === "sem-vencimento") return !v;
        if (!v) return false;
        if (f === "vencidas") return v < hoje;
        if (f === "hoje") return v === hoje;
        if (f === "semana") return v >= hoje && v <= em7;
        return v.startsWith(mes);
      },
    [hoje, em7, mes]
  );

  const soma = (f: Filtro) => abertas.filter((c) => passa(c, f)).reduce((s, c) => s + c.valor, 0);
  const qtd = (f: Filtro) => abertas.filter((c) => passa(c, f)).length;
  const lista = abertas.filter((c) => passa(c, filtro));

  async function marcarPaga(c: ContaPagarLinha) {
    setErro(null);
    const ok = await confirmar({ mensagem: `Registrar o pagamento de "${c.descricao}" (${fmtBRL(c.valor)})?`, confirmarLabel: "Registrar pagamento" });
    if (!ok) return;
    startTransition(async () => {
      const r = await baixarDespesa(c.id);
      if (r.ok) setPagas((s) => new Set(s).add(c.id));
      else setErro(r.erro);
    });
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-white">Contas a pagar</h1>
          <p className="text-xs text-muted">Despesas lançadas como &quot;A pagar&quot;, por vencimento</p>
        </div>
        <Link
          href="/despesas"
          className="inline-flex items-center gap-1.5 rounded-lg border border-surface-border px-3 py-1.5 text-xs text-zinc-300 transition hover:border-accent hover:text-accent"
        >
          <Plus size={13} /> Lançar em Despesas
        </Link>
      </header>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi rotulo="Em aberto" valor={fmtBRL(soma("todas"))} detalhe={`${fmtNum(qtd("todas"))} contas`} icone={Wallet} />
        <Kpi rotulo="Vencidas" valor={fmtBRL(soma("vencidas"))} detalhe={`${fmtNum(qtd("vencidas"))} contas`} icone={AlertTriangle} alerta={qtd("vencidas") > 0} />
        <Kpi rotulo="Próximos 7 dias" valor={fmtBRL(soma("semana"))} detalhe={`${fmtNum(qtd("semana"))} contas`} icone={CalendarClock} />
        <Kpi rotulo="Vencem este mês" valor={fmtBRL(soma("mes"))} detalhe={`${fmtNum(qtd("mes"))} contas`} icone={CalendarDays} />
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
            {f.rotulo} <span>({qtd(f.id)})</span>
          </button>
        ))}
      </div>

      {erro && <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-red-400">{erro}</p>}

      <div className="tabela-fixa overflow-x-auto rounded-xl border border-surface-border">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b border-surface-border bg-zinc-900 text-left text-xs font-medium text-muted">
              <th className="px-3 py-2.5">Vencimento</th>
              <th className="px-3 py-2.5">Fornecedor / histórico</th>
              <th className="px-3 py-2.5">Conta</th>
              <th className="px-3 py-2.5">Lançado por</th>
              <th className="px-3 py-2.5 text-right">Valor</th>
              <th className="px-3 py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {lista.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-sm text-muted"><p className="sticky left-3 max-w-[calc(100vw-4rem)] whitespace-normal md:max-w-[calc(100vw-20rem)]">Nenhuma conta a pagar neste filtro. Altere o período ou registre uma despesa com a situação &quot;A pagar&quot;.</p></td>
              </tr>
            )}
            {lista.map((c) => {
              const vencida = !!c.vencimento && c.vencimento < hoje;
              return (
                <tr key={c.id} className="border-b border-surface-border last:border-0">
                  <td className="whitespace-nowrap px-3 py-2.5">
                    {c.vencimento ? (
                      <span className={vencida ? "text-red-400" : "text-zinc-200"}>{fmtData(c.vencimento + "T12:00:00Z")}</span>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                    {vencida && (
                      <span className="ml-2">
                        <Badge variant="danger">Vencida</Badge>
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <p className="text-white">{c.descricao}</p>
                    {c.documento && <p className="text-xs text-muted">Doc. {c.documento}</p>}
                  </td>
                  <td className="px-3 py-2.5 text-secondary">{c.conta ?? "—"}</td>
                  <td className="px-3 py-2.5 text-secondary">{c.consultorNome}</td>
                  <td className="px-3 py-2.5 text-right font-medium text-white">{fmtBRL(c.valor)}</td>
                  <td className="px-3 py-2.5 text-right">
                    <button
                      type="button"
                      disabled={pendente}
                      onClick={() => marcarPaga(c)}
                      className="inline-flex items-center gap-1 text-xs text-secondary transition hover:text-accent disabled:opacity-50"
                    >
                      <CheckCircle2 size={14} /> Marcar como paga
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
