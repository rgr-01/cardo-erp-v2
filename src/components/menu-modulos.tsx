"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { Check, ClipboardList, Handshake, Landmark, LayoutGrid, Package, Users, X } from "lucide-react";
import { DialogFrame } from "@/components/ui/dialog-frame";
import type { GrupoNavegacao } from "@/lib/navegacao";

const ICONES = { CADASTROS: Users, ESTOQUE: Package, VENDAS: Handshake, ERP: Landmark, VISITAS: ClipboardList, DESPESAS: Landmark };

export function MenuModulos({ grupos, ativo }: { grupos: GrupoNavegacao[]; ativo?: GrupoNavegacao }) {
  const [aberto, setAberto] = useState(false);
  const tituloId = useId();
  const painelId = useId();

  return (
    <>
      <button type="button" aria-haspopup="dialog" aria-expanded={aberto} aria-controls={painelId}
        aria-label={ativo ? `Módulos: ${ativo.nome}` : "Abrir módulos"}
        disabled={grupos.length === 0} onClick={() => setAberto(true)}
        className="flex min-h-11 w-full items-center gap-3 rounded-lg px-2 py-2 text-left text-[13px] font-medium text-secondary transition-colors duration-150 hover:bg-zinc-800/70 hover:text-white disabled:opacity-60">
        <LayoutGrid size={20} className="shrink-0 text-accent" aria-hidden />
        <span>Módulos</span>
      </button>

      <DialogFrame open={aberto} onClose={() => setAberto(false)} labelledBy={tituloId} className="p-4 sm:p-6">
        <div id={painelId} className="w-full max-w-6xl rounded-xl border border-surface-border bg-zinc-900" onClick={event => event.stopPropagation()}>
          <div className="flex items-center justify-between gap-4 border-b border-surface-border px-5 py-4 sm:px-6">
            <div className="flex items-center gap-3"><LayoutGrid size={22} className="text-accent" aria-hidden /><h2 id={tituloId} className="text-lg font-semibold">Módulos</h2></div>
            <button type="button" aria-label="Fechar módulos" onClick={() => setAberto(false)} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-secondary hover:bg-zinc-800"><X size={22} aria-hidden /></button>
          </div>
          <nav aria-label="Escolher módulo" className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 sm:gap-4 sm:p-6 xl:grid-cols-5">
            {grupos.map(grupo => {
              const Icon = ICONES[grupo.id];
              const selecionado = ativo?.id === grupo.id;
              return <Link key={grupo.id} href={grupo.links[0].href} onClick={() => setAberto(false)}
                aria-current={selecionado ? "true" : undefined}
                className={`relative flex min-h-40 flex-col items-center justify-between gap-6 rounded-lg px-3 py-6 text-center text-[#ffffff] transition-colors duration-150 sm:min-h-48 sm:py-7 ${selecionado ? "bg-[#006d2e] hover:bg-[#005a26]" : "bg-[#19323b] hover:bg-[#23434d]"}`}>
                {selecionado && <span className="absolute right-2 top-2 flex items-center gap-1 text-[11px] text-[#ffffff]"><Check size={14} aria-hidden /> Atual</span>}
                <Icon size={52} strokeWidth={1.25} className="mt-1 shrink-0 text-[#ffffff] opacity-75" aria-hidden />
                <span className="text-sm font-semibold leading-snug sm:text-base">{grupo.nome}</span>
              </Link>;
            })}
          </nav>
        </div>
      </DialogFrame>
    </>
  );
}
