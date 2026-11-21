"use client";

import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { salvarMeta, excluirMeta } from "@/app/actions/metas";
import { fmtBRL } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { useConfirm } from "@/components/ui/confirm-dialog";

export function MetasForm({
  safraNome,
  meta,
}: {
  safraNome: string;
  meta: { id: string; valor: number } | null;
}) {
  const [valor, setValor] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();
  const { confirmar } = useConfirm();

  function salvar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    const v = parseFloat(valor.replace(/\./g, "").replace(",", "."));
    if (isNaN(v)) {
      setErro("Informe um valor válido.");
      return;
    }
    startTransition(async () => {
      const resultado = await salvarMeta(v);
      if (resultado.ok) setValor("");
      else setErro(resultado.erro);
    });
  }

  async function excluir() {
    if (!meta) return;
    if (!(await confirmar({ mensagem: `Excluir a meta da safra ${safraNome}?`, confirmarLabel: "Excluir meta", variante: "perigo" })))
      return;
    setErro(null);
    startTransition(async () => {
      const r = await excluirMeta(meta.id);
      if (!r.ok) setErro(r.erro);
    });
  }

  return (
    <div className="max-w-xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-white">Metas</h1>
        <p className="text-sm text-muted">
          Meta de faturamento da safra {safraNome}, exibida no painel de vendas.
        </p>
      </div>

      <form
        onSubmit={salvar}
        className="flex flex-wrap items-end gap-2 rounded-xl border border-surface-border bg-zinc-900 p-4"
      >
        <div className="flex-1">
          <Label>Valor da meta (R$)</Label>
          <Input
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            inputMode="decimal"
            placeholder="15.000.000,00"
          />
        </div>
        <Button type="submit" variant="primary" disabled={pendente}>
          {pendente ? "Salvando meta..." : "Salvar meta"}
        </Button>
      </form>

      {erro && (
        <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-red-400">
          {erro}
        </p>
      )}

      {meta && (
        <div className="flex items-center justify-between rounded-xl border border-surface-border px-4 py-3">
          <div>
            <p className="text-xs text-muted">Meta atual — safra {safraNome}</p>
            <p className="text-lg font-semibold text-accent">
              {fmtBRL(meta.valor)}
            </p>
          </div>
          <button
            onClick={excluir}
            title="Excluir meta" aria-label="Excluir meta"
            className="rounded p-1 text-secondary hover:text-red-400"
          >
            <Trash2 size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
