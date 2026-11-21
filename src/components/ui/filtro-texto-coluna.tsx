"use client";

import { useEffect, useRef, useState } from "react";
import { Filter } from "lucide-react";

// Filtro de texto livre ("contém") no cabeçalho da coluna — mesmo visual do
// FiltroColunaExcel, mas pra campo com valores quase sempre únicos (nome,
// endereço, etc.), onde uma lista de checkbox não faria sentido.
export function FiltroTextoColuna({
  rotulo,
  valor,
  onMudar,
}: {
  rotulo: string;
  valor: string;
  onMudar: (novo: string) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const botaoRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const ativo = valor.trim().length > 0;

  useEffect(() => {
    if (!aberto) return;
    function aoClicarFora(e: MouseEvent) {
      const alvo = e.target as Node;
      if (
        botaoRef.current &&
        !botaoRef.current.contains(alvo) &&
        popoverRef.current &&
        !popoverRef.current.contains(alvo)
      ) {
        setAberto(false);
      }
    }
    document.addEventListener("mousedown", aoClicarFora);
    return () => document.removeEventListener("mousedown", aoClicarFora);
  }, [aberto]);

  function abrir() {
    const r = botaoRef.current?.getBoundingClientRect();
    if (r) setPos({ top: r.bottom + 4, left: r.left });
    setAberto((a) => !a);
  }

  return (
    <>
      <button
        ref={botaoRef}
        type="button"
        onClick={abrir}
        title={`Filtrar ${rotulo}`}
        className={`ml-1 rounded p-0.5 align-middle ${
          ativo ? "text-accent" : "text-muted hover:text-zinc-300"
        }`}
      >
        <Filter size={12} fill={ativo ? "currentColor" : "none"} />
      </button>
      {aberto && (
        <div
          ref={popoverRef}
          style={{ top: pos.top, left: pos.left }}
          className="fixed z-[1400] w-56 rounded-lg border border-surface-border bg-zinc-800 p-2 normal-case shadow-xl"
        >
          <input
            autoFocus
            value={valor}
            onChange={(e) => onMudar(e.target.value)}
            placeholder={`Contém...`}
            className="w-full rounded border border-surface-border bg-zinc-900 px-2 py-1 text-xs text-white outline-none focus:border-accent"
          />
          {ativo && (
            <button
              type="button"
              onClick={() => onMudar("")}
              className="mt-1 px-1 text-[11px] text-muted hover:text-accent"
            >
              Limpar filtro
            </button>
          )}
        </div>
      )}
    </>
  );
}
