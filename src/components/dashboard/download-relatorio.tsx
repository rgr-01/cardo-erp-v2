"use client";

import { useState } from "react";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Download, Loader2 } from "lucide-react";
import { baixarBlob, elementoParaPng } from "@/lib/exportar-dom";

function nomeArquivoDaResposta(response: Response): string {
  const disposition = response.headers.get("content-disposition");
  const encontrado = disposition?.match(/filename="?([^";]+)"?/i);
  return encontrado?.[1] ?? "relatorio-gerencial.pdf";
}

export function DownloadRelatorioGerencial() {
  const [baixando, setBaixando] = useState(false);
  const { avisar } = useConfirm();

  async function baixar() {
    if (baixando) return;
    setBaixando(true);

    try {
      // Resumo do dashboard em tema claro; o servidor monta capa, resumo e relatório
      const alvo = document.getElementById("dashboard-resumo-claro");
      const form = new FormData();
      if (alvo) form.append("imagem", await elementoParaPng(alvo), "dashboard.png");
      // Mesmo filtro de consultores que está na tela
      form.append("consultores", new URLSearchParams(window.location.search).get("consultor") ?? "");

      const response = await fetch("/relatorios/gerencial", {
        method: alvo ? "POST" : "GET",
        body: alvo ? form : undefined,
        cache: "no-store",
        credentials: "same-origin",
      });
      if (!response.ok) throw new Error("Não foi possível gerar o relatório.");

      baixarBlob(await response.blob(), nomeArquivoDaResposta(response));
    } catch (error) {
      void avisar(error instanceof Error ? error.message : "Não foi possível gerar o relatório.");
    } finally {
      setBaixando(false);
    }
  }

  return (
    <button
      type="button"
      onClick={baixar}
      disabled={baixando}
      className="flex items-center gap-1.5 rounded-lg border border-surface-border px-3 py-1.5 text-xs text-secondary transition hover:border-zinc-500 hover:text-zinc-200 disabled:cursor-wait disabled:opacity-60"
    >
      {baixando ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
      {baixando ? "Gerando PDF..." : "Baixar relatório PDF"}
    </button>
  );
}
