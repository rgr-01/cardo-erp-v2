"use client";

import { useEffect, useRef, useState } from "react";
import { MoreVertical } from "lucide-react";

export type AcaoMenu = {
  rotulo: string;
  icone?: React.ReactNode;
  aoClicar: () => void;
  desabilitada?: boolean;
  perigosa?: boolean;
};

// Menu de "3 pontinhos". O painel é posicionado com position:fixed a partir do
// retângulo do botão em vez de absolute: dentro de uma tabela com rolagem
// horizontal, um dropdown absolute fica cortado pelo overflow do container.
export function MenuAcoes({
  acoes,
  desabilitado,
  rotuloBotao = "Ações",
}: {
  acoes: AcaoMenu[];
  desabilitado?: boolean;
  rotuloBotao?: string;
}) {
  const [posicao, setPosicao] = useState<{ topo: number; direita: number } | null>(
    null
  );
  const botaoRef = useRef<HTMLButtonElement>(null);
  const painelRef = useRef<HTMLDivElement>(null);
  const aberto = posicao !== null;

  useEffect(() => {
    if (!aberto) return;

    function aoClicarFora(evento: MouseEvent) {
      const alvo = evento.target as Node;
      if (painelRef.current?.contains(alvo)) return;
      if (botaoRef.current?.contains(alvo)) return;
      setPosicao(null);
    }
    function aoTeclar(evento: KeyboardEvent) {
      if (evento.key === "Escape") setPosicao(null);
    }
    // Rolar a página moveria o botão e deixaria o painel solto no ar.
    function aoRolar() {
      setPosicao(null);
    }

    document.addEventListener("mousedown", aoClicarFora);
    document.addEventListener("keydown", aoTeclar);
    window.addEventListener("scroll", aoRolar, true);
    window.addEventListener("resize", aoRolar);
    return () => {
      document.removeEventListener("mousedown", aoClicarFora);
      document.removeEventListener("keydown", aoTeclar);
      window.removeEventListener("scroll", aoRolar, true);
      window.removeEventListener("resize", aoRolar);
    };
  }, [aberto]);

  function alternar() {
    if (aberto) {
      setPosicao(null);
      return;
    }
    const retangulo = botaoRef.current?.getBoundingClientRect();
    if (!retangulo) return;
    setPosicao({
      topo: retangulo.bottom + 4,
      direita: window.innerWidth - retangulo.right,
    });
  }

  return (
    <>
      <button
        ref={botaoRef}
        type="button"
        onClick={alternar}
        disabled={desabilitado}
        aria-haspopup="menu"
        aria-expanded={aberto}
        aria-label={rotuloBotao}
        title={rotuloBotao}
        className="rounded p-1 text-secondary hover:bg-zinc-800 hover:text-white disabled:opacity-40"
      >
        <MoreVertical size={16} />
      </button>

      {aberto && (
        <div
          ref={painelRef}
          role="menu"
          style={{ top: posicao.topo, right: posicao.direita }}
          className="fixed z-50 min-w-44 overflow-hidden rounded-lg border border-surface-border bg-zinc-900 py-1 shadow-xl"
        >
          {acoes.map((acao) => (
            <button
              key={acao.rotulo}
              type="button"
              role="menuitem"
              disabled={acao.desabilitada}
              onClick={() => {
                setPosicao(null);
                acao.aoClicar();
              }}
              className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm disabled:opacity-40 ${
                acao.perigosa
                  ? "text-zinc-300 hover:bg-red-500/10 hover:text-red-400"
                  : "text-zinc-300 hover:bg-zinc-800 hover:text-white"
              }`}
            >
              {acao.icone}
              {acao.rotulo}
            </button>
          ))}
        </div>
      )}
    </>
  );
}
