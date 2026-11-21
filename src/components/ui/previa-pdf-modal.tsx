"use client";
import { DialogFrame } from "@/components/ui/dialog-frame";

// Mostra um PDF dentro do próprio site (por cima da tela), em vez de abrir outra aba.
export function PreviaPdfModal({
  url,
  titulo,
  nomeArquivo = "documento.pdf",
  rotuloVoltar = "Fechar",
  aoFechar,
}: {
  url: string;
  titulo: string;
  nomeArquivo?: string;
  rotuloVoltar?: string;
  aoFechar: () => void;
}) {
  return (
    <DialogFrame onClose={aoFechar} label={titulo} className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-3 lg:pl-64">
      <div className="flex h-[92vh] w-[95%] max-w-[1100px] flex-col overflow-hidden rounded-xl border border-surface-border bg-zinc-900">
        <div className="flex items-center justify-between gap-3 border-b border-surface-border px-5 py-3">
          <h3 className="text-base font-bold text-white">{titulo}</h3>
          <div className="flex items-center gap-2">
            <a
              href={url}
              download={nomeArquivo}
              className="rounded-lg border border-surface-border px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800"
            >
              Baixar PDF
            </a>
            <button
              type="button"
              onClick={aoFechar}
              className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-500"
            >
              {rotuloVoltar}
            </button>
          </div>
        </div>
        <iframe src={url} title={titulo} className="min-h-0 flex-1 bg-white" />
      </div>
    </DialogFrame>
  );
}
