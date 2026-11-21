"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  criarContaDespesa,
  criarGrupoDespesa,
  salvarPlanoDespesas,
} from "@/app/actions/despesas-plano";
import type { ResultadoAcao } from "@/app/actions/helpers";
import { fmtBRL } from "@/lib/format";

type Linha = { id: string; codigo: string; nome: string; ativo: boolean; valor: number };
type Grupo = { id: string; nome: string; contas: Linha[] };

const inputCls =
  "rounded-lg border border-surface-border bg-zinc-800 px-3 py-1.5 text-sm text-white outline-none focus:border-accent";
const btn =
  "rounded-lg border border-surface-border px-3 py-1.5 text-sm font-semibold text-zinc-200 hover:bg-zinc-800 disabled:opacity-50";

export function PlanoOrcamentoForm({ grupos }: { grupos: Grupo[] }) {
  const router = useRouter();
  const [pendente, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const [linhas, setLinhas] = useState<Record<string, Linha>>(() =>
    Object.fromEntries(grupos.flatMap((g) => g.contas).map((c) => [c.id, c]))
  );
  const [novoGrupo, setNovoGrupo] = useState("");
  const [novaConta, setNovaConta] = useState({
    grupoId: grupos[0]?.id ?? "",
    codigo: "",
    nome: "",
    valor: "",
  });

  const editar = (id: string, parcial: Partial<Linha>) =>
    setLinhas((a) => ({ ...a, [id]: { ...a[id], ...parcial } }));
  const totalMensal = Object.values(linhas)
    .filter((l) => l.ativo)
    .reduce((s, l) => s + (Number.isFinite(l.valor) ? l.valor : 0), 0);

  function executar(acao: () => Promise<ResultadoAcao>, sucesso: string, aoOk?: () => void) {
    setMsg(null);
    startTransition(async () => {
      const r = await acao();
      if (r.ok) {
        setMsg({ ok: true, texto: sucesso });
        aoOk?.();
        router.refresh();
      } else {
        setMsg({ ok: false, texto: r.erro });
      }
    });
  }

  const ativas = Object.values(linhas).filter((l) => l.ativo).length;
  const subtotal = (g: Grupo) =>
    g.contas.reduce((s, c) => {
      const l = linhas[c.id];
      return s + (l?.ativo && Number.isFinite(l.valor) ? l.valor : 0);
    }, 0);

  return (
    <div className="space-y-4">
      <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-surface-border bg-zinc-900/95 px-4 py-3 backdrop-blur">
        <div className="flex flex-wrap gap-x-8 gap-y-1">
          <p className="text-xs text-muted">
            Orçamento mensal <b className="block text-lg text-white">{fmtBRL(totalMensal)}</b>
          </p>
          <p className="text-xs text-muted">
            Na safra (12 meses) <b className="block text-lg text-white">{fmtBRL(totalMensal * 12)}</b>
          </p>
          <p className="text-xs text-muted">
            Contas ativas <b className="block text-lg text-white">{ativas}</b>
          </p>
        </div>
        <div className="flex items-center gap-3">
          {msg && <span role={msg.ok ? "status" : "alert"} className={`text-sm ${msg.ok ? "text-accent" : "text-amber-400"}`}>{msg.texto}</span>}
          <button
            disabled={pendente}
            onClick={() =>
              executar(
                () =>
                  salvarPlanoDespesas(
                    Object.values(linhas).map((l) => ({
                      id: l.id,
                      nome: l.nome,
                      ativo: l.ativo,
                      valor: l.valor,
                    }))
                  ),
                "Orçamento salvo."
              )
            }
            className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground hover:brightness-110 disabled:opacity-50"
          >
            {pendente ? "Salvando..." : "Salvar orçamento"}
          </button>
        </div>
      </div>

      {grupos.length === 0 && <p className="text-sm text-secondary">O plano de contas ainda não foi cadastrado. Crie um grupo e adicione as contas para definir o orçamento mensal.</p>}
      <div className="grid gap-4 xl:grid-cols-2">
        {grupos.map((g) => (
          <section key={g.id} className="overflow-hidden rounded-xl border border-surface-border bg-zinc-900/60">
            <header className="flex items-center justify-between border-b border-surface-border px-4 py-2.5">
              <h2 className="text-sm font-semibold text-white">{g.nome}</h2>
              <span className="text-xs text-secondary">
                {fmtBRL(subtotal(g))} <span className="text-muted">/ mês</span>
              </span>
            </header>
            <div className="divide-y divide-surface-border">
              {g.contas.map((c) => {
                const l = linhas[c.id];
                if (!l) return null;
                return (
                  <div
                    key={c.id}
                    className={`grid grid-cols-[52px_minmax(0,1fr)_112px_auto] items-center gap-2 px-3 py-1.5 ${l.ativo ? "" : "opacity-50"}`}
                  >
                    <span className="font-mono text-[11px] text-muted">{c.codigo}</span>
                    <input
                      value={l.nome}
                      onChange={(e) => editar(c.id, { nome: e.target.value })}
                      className="min-w-0 rounded-md border border-transparent bg-transparent px-2 py-1 text-sm text-white outline-none hover:border-surface-border focus:border-accent focus:bg-zinc-800"
                      aria-label={`Nome da conta ${c.codigo}`}
                    />
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={Number.isFinite(l.valor) ? l.valor : ""}
                      onChange={(e) => editar(c.id, { valor: e.target.value === "" ? NaN : Number(e.target.value) })}
                      className="rounded-md border border-surface-border bg-zinc-800/60 px-2 py-1 text-right text-sm text-white outline-none focus:border-accent"
                      aria-label={`Orçamento mensal da conta ${c.codigo}`}
                    />
                    <label className="flex items-center gap-1.5 text-[11px] text-secondary" title="Conta ativa">
                      <input
                        type="checkbox"
                        checked={l.ativo}
                        onChange={(e) => editar(c.id, { ativo: e.target.checked })}
                        className="accent-accent"
                      />
                      Ativa
                    </label>
                  </div>
                );
              })}
              {g.contas.length === 0 && <p className="px-4 py-3 text-xs text-muted">Este grupo ainda não tem contas. Use &quot;Nova conta&quot; para adicionar a primeira.</p>}
            </div>
          </section>
        ))}
      </div>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-surface-border bg-zinc-900/60 p-4">
          <h2 className="mb-2 text-sm font-semibold text-white">Novo grupo</h2>
          <div className="flex gap-2">
            <input
              value={novoGrupo}
              onChange={(e) => setNovoGrupo(e.target.value)}
              placeholder="Nome do grupo"
              className={`${inputCls} min-w-0 flex-1`}
            />
            <button
              className={btn}
              disabled={pendente}
              onClick={() =>
                executar(() => criarGrupoDespesa(novoGrupo), "Grupo criado.", () => setNovoGrupo(""))
              }
            >
              Criar grupo
            </button>
          </div>
        </div>

        <div className="rounded-xl border border-surface-border bg-zinc-900/60 p-4">
          <h2 className="mb-2 text-sm font-semibold text-white">Nova conta</h2>
          <div className="flex flex-wrap gap-2">
            <select
              aria-label="Grupo da nova conta"
              value={novaConta.grupoId}
              onChange={(e) => setNovaConta({ ...novaConta, grupoId: e.target.value })}
              className={inputCls}
            >
              {grupos.length === 0 && <option value="">Crie um grupo primeiro</option>}
              {grupos.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.nome}
                </option>
              ))}
            </select>
            <input
              value={novaConta.codigo}
              onChange={(e) => setNovaConta({ ...novaConta, codigo: e.target.value })}
              placeholder="Código (3.2.07)"
              className={`${inputCls} w-32`}
            />
            <input
              value={novaConta.nome}
              onChange={(e) => setNovaConta({ ...novaConta, nome: e.target.value })}
              placeholder="Nome da conta"
              className={`${inputCls} min-w-0 flex-1 basis-40`}
            />
            <input
              type="number"
              min="0"
              step="0.01"
              value={novaConta.valor}
              onChange={(e) => setNovaConta({ ...novaConta, valor: e.target.value })}
              placeholder="R$ / mês"
              className={`${inputCls} w-28 text-right`}
            />
            <button
              className={btn}
              disabled={pendente}
              onClick={() =>
                executar(
                  () => criarContaDespesa({ ...novaConta, valor: Number(novaConta.valor || 0) }),
                  "Conta criada.",
                  () => setNovaConta({ ...novaConta, codigo: "", nome: "", valor: "" })
                )
              }
            >
              Criar conta
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
