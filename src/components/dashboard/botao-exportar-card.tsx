"use client";

import { useRef, useState } from "react";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Download, Loader2 } from "lucide-react";
import { baixarBlob, elementoParaPdf, slugArquivo } from "@/lib/exportar-dom";

export function BotaoExportarCard({ titulo }: { titulo: string }) {
  const ref = useRef<HTMLButtonElement>(null);
  const [baixando, setBaixando] = useState(false);
  const { avisar } = useConfirm();

  async function baixar() {
    const card = ref.current?.closest<HTMLElement>("[data-export-card]");
    if (!card || baixando) return;
    setBaixando(true);
    try {
      const blob = await elementoParaPdf(card);
      baixarBlob(blob, `${slugArquivo(titulo)}.pdf`);
    } catch {
      void avisar("Não foi possível gerar o PDF deste gráfico.");
    } finally {
      setBaixando(false);
    }
  }

  return (
    <button
      ref={ref}
      type="button"
      data-sem-export=""
      onClick={baixar}
      disabled={baixando}
      title="Baixar este gráfico em PDF"
      aria-label={`Baixar ${titulo} em PDF`}
      className="absolute right-2 top-2 rounded-md p-1 text-muted transition hover:bg-white/5 hover:text-accent disabled:cursor-wait"
    >
      {baixando ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
    </button>
  );
}
