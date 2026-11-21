"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Filter } from "lucide-react";

// Filtro estilo Excel/planilha no cabecalho da coluna: lista com busca e
// checkbox por opcao, vazio (nenhuma marcada) = mostra tudo. O popover usa
// position:fixed com coordenadas calculadas do botao — precisa escapar do
// overflow-x-auto do container da tabela (que corta qualquer overflow
// absolute/relative posicionado dentro dele, inclusive no eixo Y).
export function FiltroColunaExcel({
  rotulo,
  opcoes,
  selecionados,
  onMudar,
}: {
  rotulo: string;
  opcoes: { id: string; label: string }[];
  selecionados: Set<string>;
  onMudar: (novo: Set<string>) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState("");
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const botaoRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const ativo = selecionados.size > 0;

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

  const filtradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return opcoes;
    return opcoes.filter((o) => o.label.toLowerCase().includes(termo));
  }, [opcoes, busca]);

  function alternar(id: string) {
    const novo = new Set(selecionados);
    if (novo.has(id)) novo.delete(id);
    else novo.add(id);
    onMudar(novo);
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
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar..."
            className="mb-2 w-full rounded border border-surface-border bg-zinc-900 px-2 py-1 text-xs text-white outline-none focus:border-accent"
          />
          <div className="flex items-center justify-between px-1 pb-1 text-[11px] text-muted">
            <button
              type="button"
              onClick={() => onMudar(new Set())}
              className="hover:text-accent"
            >
              Limpar filtro
            </button>
            <button
              type="button"
              onClick={() => onMudar(new Set(opcoes.map((o) => o.id)))}
              className="hover:text-accent"
            >
              Marcar todos
            </button>
          </div>
          <div className="max-h-56 overflow-y-auto">
            {filtradas.length === 0 && (
              <p className="px-1 py-2 text-xs text-muted">Nada encontrado.</p>
            )}
            {filtradas.map((o) => (
              <label
                key={o.id}
                className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-xs text-zinc-200 hover:bg-zinc-700"
              >
                <input
                  type="checkbox"
                  checked={selecionados.has(o.id)}
                  onChange={() => alternar(o.id)}
                />
                <span className="truncate">{o.label}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

