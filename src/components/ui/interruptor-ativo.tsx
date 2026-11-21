"use client";

// Interruptor "Ativo / Inativo" das listas de usuários (sistema e painel master).
export function InterruptorAtivo({ ativo, aoMudar, desabilitado }: { ativo: boolean; aoMudar: () => void; desabilitado?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={ativo}
      disabled={desabilitado}
      onClick={aoMudar}
      title={ativo ? "Clique para desativar" : "Clique para ativar"}
      className="inline-flex items-center gap-2 text-xs font-medium disabled:opacity-50"
    >
      <span className={`relative h-5 w-9 shrink-0 rounded-full transition ${ativo ? "bg-emerald-500" : "bg-zinc-600"}`}>
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-[#fff] shadow transition-colors ${ativo ? "left-[18px]" : "left-0.5"}`} />
      </span>
      <span className={ativo ? "text-emerald-400" : "text-muted"}>{ativo ? "Ativo" : "Inativo"}</span>
    </button>
  );
}
