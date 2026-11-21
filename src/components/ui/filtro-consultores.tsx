"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search, Users, X } from "lucide-react";

type Opcao = { id: string; nome: string };

function normalizar(texto: string) {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

// Filtro de consultores com seleção múltipla: lista com busca, bolinha da cor
// do consultor no mapa e quantidade de clientes de cada um.
export function FiltroConsultores({
  consultores,
  selecionados,
  aoMudar,
  cores = {},
  contagens,
  alinhar = "right",
}: {
  consultores: Opcao[];
  selecionados: string[];
  aoMudar: (ids: string[]) => void;
  // Bolinha de cor de cada consultor (ex.: cor no mapa); sem cor, cinza.
  cores?: Record<string, string>;
  // Quantidade mostrada ao lado do nome; omitida quando não há.
  contagens?: Record<string, number>;
  alinhar?: "left" | "right";
}) {
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState("");
  const raiz = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!aberto) return;
    function fora(e: PointerEvent) {
      if (!raiz.current?.contains(e.target as Node)) setAberto(false);
    }
    function tecla(e: KeyboardEvent) {
      if (e.key === "Escape") setAberto(false);
    }
    document.addEventListener("pointerdown", fora);
    document.addEventListener("keydown", tecla);
    return () => {
      document.removeEventListener("pointerdown", fora);
      document.removeEventListener("keydown", tecla);
    };
  }, [aberto]);

  const visiveis = useMemo(() => {
    const termo = normalizar(busca.trim());
    return consultores.filter((c) => !termo || normalizar(c.nome).includes(termo));
  }, [consultores, busca]);

  const marcados = new Set(selecionados);
  const nomes = consultores.filter((c) => marcados.has(c.id)).map((c) => c.nome);
  const rotulo =
    nomes.length === 0
      ? "Todos os consultores"
      : nomes.length <= 2
        ? nomes.join(", ")
        : `${nomes.length} consultores`;

  function alternar(id: string) {
    aoMudar(marcados.has(id) ? selecionados.filter((x) => x !== id) : [...selecionados, id]);
  }

  return (
    <div ref={raiz} className="relative">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={aberto}
        className={`flex h-10 min-w-56 max-w-72 items-center gap-2 rounded-xl border bg-zinc-900/60 px-3 text-sm transition ${
          aberto || nomes.length > 0
            ? "border-accent text-white"
            : "border-surface-border text-zinc-300 hover:border-zinc-500"
        }`}
      >
        <Users size={16} className={nomes.length > 0 ? "text-accent" : "text-muted"} />
        <span className="flex-1 truncate text-left">{rotulo}</span>
        {nomes.length > 0 && (
          <span className="rounded-full bg-accent px-1.5 text-[11px] font-bold text-accent-foreground">
            {nomes.length}
          </span>
        )}
        <ChevronDown size={15} className={`text-muted transition ${aberto ? "rotate-180" : ""}`} />
      </button>

      {aberto && (
        <div
          role="listbox"
          aria-multiselectable="true"
          aria-label="Consultores"
          className={`absolute ${alinhar === "right" ? "right-0" : "left-0"} top-12 z-[1100] w-72 rounded-xl border border-surface-border bg-zinc-900 p-2 shadow-2xl shadow-black/50`}
        >
          <div className="relative mb-2">
            <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
            <input
              autoFocus
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar consultor…"
              aria-label="Buscar consultor"
              className="w-full rounded-lg border border-surface-border bg-zinc-950 py-1.5 pl-8 pr-2 text-sm text-zinc-100 outline-none placeholder:text-muted focus:border-accent"
            />
          </div>

          <div className="mb-1 flex items-center justify-between px-1 text-[11px]">
            <button
              type="button"
              onClick={() => aoMudar(consultores.map((c) => c.id))}
              className="font-medium text-accent hover:underline"
            >
              Selecionar todos
            </button>
            <button
              type="button"
              onClick={() => aoMudar([])}
              disabled={selecionados.length === 0}
              className="flex items-center gap-1 text-secondary hover:text-white disabled:opacity-40"
            >
              <X size={11} /> Limpar
            </button>
          </div>

          <div className="max-h-72 overflow-y-auto pr-0.5">
            {visiveis.length === 0 && (
              <p className="px-2 py-4 text-center text-xs text-muted">Nenhum consultor encontrado.</p>
            )}
            {visiveis.map((c) => {
              const ativo = marcados.has(c.id);
              return (
                <button
                  key={c.id}
                  type="button"
                  role="option"
                  aria-selected={ativo}
                  onClick={() => alternar(c.id)}
                  className={`flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left text-sm transition ${
                    ativo ? "bg-accent/12 text-white" : "text-zinc-200 hover:bg-zinc-800"
                  }`}
                >
                  <span
                    className={`flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded border ${
                      ativo ? "border-accent bg-accent text-accent-foreground" : "border-zinc-600"
                    }`}
                    style={{ width: 18, height: 18 }}
                  >
                    {ativo && <Check size={12} strokeWidth={3} />}
                  </span>
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: cores[c.id] ?? "#71717a" }}
                    aria-hidden
                  />
                  <span className="flex-1 truncate">{c.nome}</span>
                  {contagens && <span className="text-xs tabular-nums text-muted">{contagens[c.id] ?? 0}</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
