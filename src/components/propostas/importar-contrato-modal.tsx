"use client";
import { DialogFrame } from "@/components/ui/dialog-frame";

import { useRef, useState } from "react";
import { FileText, Upload } from "lucide-react";

const TIPOS_ACEITOS = "application/pdf,image/jpeg,image/png,image/webp";

export function ImportarContratoModal({
  codigo,
  clienteNome,
  pendente,
  erro,
  aoConfirmar,
  aoFechar,
}: {
  codigo: string;
  clienteNome: string;
  pendente: boolean;
  erro: string | null;
  aoConfirmar: (arquivo: File) => void;
  aoFechar: () => void;
}) {
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [arrastandoSobre, setArrastandoSobre] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function soltouArquivo(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setArrastandoSobre(false);
    const arquivoSolto = e.dataTransfer.files?.[0];
    if (arquivoSolto) setArquivo(arquivoSolto);
  }

  return (
    <DialogFrame onClose={aoFechar} label={"Importar documento assinado"} className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 lg:pl-64">
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-xl border border-surface-border bg-zinc-900 p-5"
      >
        <h2 className="mb-1 text-lg font-bold text-white">Importar contrato assinado</h2>
        <p className="mb-4 text-xs text-muted">
          {codigo} — {clienteNome}. Use quando o cliente assinou no papel (impresso) em vez de
          pela assinatura digital.
        </p>

        <label className="mb-1 block text-xs font-medium text-secondary">
          Contrato assinado (PDF ou foto)
        </label>
        <div
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setArrastandoSobre(true);
          }}
          onDragLeave={() => setArrastandoSobre(false)}
          onDrop={soltouArquivo}
          className={`flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed px-4 py-8 text-center transition ${
            arrastandoSobre
              ? "border-accent bg-accent/10"
              : "border-surface-border hover:border-zinc-600 hover:bg-zinc-800/60"
          }`}
        >
          {arquivo ? (
            <>
              <FileText size={24} className="text-accent" />
              <p className="text-sm font-medium text-white">{arquivo.name}</p>
              <p className="text-xs text-muted">Clique ou arraste outro arquivo para trocar</p>
            </>
          ) : (
            <>
              <Upload size={24} className="text-muted" />
              <p className="text-sm text-zinc-300">Arraste o arquivo aqui ou clique para escolher</p>
              <p className="text-xs text-muted">PDF, JPEG, PNG ou WEBP</p>
            </>
          )}
        </div>
        <input
          ref={inputRef}
          type="file"
          accept={TIPOS_ACEITOS}
          onChange={(e) => setArquivo(e.target.files?.[0] ?? null)}
          className="hidden"
        />

        {erro && <p role="alert" className="mt-3 text-xs text-danger-ink">{erro}</p>}

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={aoFechar}
            disabled={pendente}
            className="rounded-lg border border-surface-border px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => arquivo && aoConfirmar(arquivo)}
            disabled={pendente || !arquivo}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground hover:brightness-110 disabled:opacity-50"
          >
            {pendente ? "Enviando..." : "Importar"}
          </button>
        </div>
      </div>
    </DialogFrame>
  );
}
