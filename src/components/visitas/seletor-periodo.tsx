"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { MESES_ABREV, rotuloMes, somarDias, somarMeses } from "@/lib/periodo";
import { DateInput } from "@/components/ui/date-input";

const botaoSeta =
  "flex h-9 w-8 items-center justify-center text-secondary hover:bg-zinc-700/60 hover:text-white";

// Seletor de período do resumo de visitas: um mês (grade de meses própria, no
// tema do app) ou um dia (campo de data escuro), sempre com setas para ir e voltar.
export function SeletorPeriodo({
  periodo,
  hoje,
  aoMudar,
}: {
  periodo: string;
  hoje: string;
  aoMudar: (periodo: string) => void;
}) {
  const porMes = periodo.length === 7;
  const [aberto, setAberto] = useState(false);
  const [anoVisivel, setAnoVisivel] = useState(Number(periodo.slice(0, 4)));
  const raiz = useRef<HTMLDivElement>(null);
  const mesAtual = hoje.slice(0, 7);

  useEffect(() => {
    function fora(e: MouseEvent) {
      if (raiz.current && !raiz.current.contains(e.target as Node)) setAberto(false);
    }
    document.addEventListener("mousedown", fora);
    return () => document.removeEventListener("mousedown", fora);
  }, []);

  const mover = (delta: number) => aoMudar(porMes ? somarMeses(periodo, delta) : somarDias(periodo, delta));

  return (
    <div ref={raiz} className="relative flex items-center overflow-visible rounded-lg border border-surface-border bg-zinc-800">
      <button type="button" onClick={() => mover(-1)} aria-label={porMes ? "Mês anterior" : "Dia anterior"} className={`${botaoSeta} rounded-l-lg`}>
        <ChevronLeft size={16} />
      </button>

      {porMes ? (
        <button
          type="button"
          onClick={() => {
            setAnoVisivel(Number(periodo.slice(0, 4)));
            setAberto((v) => !v);
          }}
          aria-expanded={aberto}
          className="h-9 min-w-40 px-3 text-sm font-medium text-white hover:bg-zinc-700/60"
        >
          {/* Só a 1ª letra maiúscula: "Novembro de 2026" (capitalize do CSS deixaria "De"). */}
          {rotuloMes(periodo).replace(/^./, (c) => c.toUpperCase())}
        </button>
      ) : (
        <DateInput
          value={periodo}
          onChange={(e) => e.target.value && aoMudar(e.target.value)}
          className="h-9 w-36 bg-transparent px-2 text-sm text-white outline-none"
        />
      )}

      <button type="button" onClick={() => mover(1)} aria-label={porMes ? "Próximo mês" : "Próximo dia"} className={`${botaoSeta} rounded-r-lg`}>
        <ChevronRight size={16} />
      </button>

      {porMes && aberto && (
        <div className="absolute right-0 top-full z-50 mt-2 w-64 rounded-xl border border-surface-border bg-zinc-900 p-3 shadow-xl">
          <div className="mb-2 flex items-center justify-between">
            <button type="button" onClick={() => setAnoVisivel((a) => a - 1)} aria-label="Ano anterior" className="rounded p-1 text-secondary hover:bg-zinc-800 hover:text-white">
              <ChevronLeft size={16} />
            </button>
            <span className="text-sm font-bold text-white">{anoVisivel}</span>
            <button type="button" onClick={() => setAnoVisivel((a) => a + 1)} aria-label="Próximo ano" className="rounded p-1 text-secondary hover:bg-zinc-800 hover:text-white">
              <ChevronRight size={16} />
            </button>
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            {MESES_ABREV.map((nome, i) => {
              const valor = `${anoVisivel}-${String(i + 1).padStart(2, "0")}`;
              const selecionado = valor === periodo;
              return (
                <button
                  key={valor}
                  type="button"
                  onClick={() => {
                    aoMudar(valor);
                    setAberto(false);
                  }}
                  className={`rounded-lg py-2 text-sm font-medium capitalize transition ${
                    selecionado
                      ? "bg-accent text-accent-foreground"
                      : valor === mesAtual
                        ? "border border-accent/60 text-accent hover:bg-zinc-800"
                        : "text-zinc-300 hover:bg-zinc-800"
                  }`}
                >
                  {nome}
                </button>
              );
            })}
          </div>
          <div className="mt-2 flex justify-end border-t border-surface-border pt-2">
            <button
              type="button"
              onClick={() => {
                aoMudar(mesAtual);
                setAberto(false);
              }}
              className="text-xs font-semibold text-accent underline-offset-2 hover:underline"
            >
              Mês atual
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
