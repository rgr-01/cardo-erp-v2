"use client";

import { useRef, useState, type ReactNode } from "react";
import { fmtBRL } from "@/lib/format";
import { precoMinimo } from "@/lib/preco-minimo";

type ProdutoComPreco = {
  nome: string;
  custoAvista: number | null;
  custoAprazo: number | null;
};

// Popup ao passar o mouse no valor unitario: minimo (preco cadastrado menos 3%)
// e maximo (preco cadastrado) do produto, a vista e a prazo. Mesmo esquema
// de position:fixed do NomeProdutoComCusto (a tabela corta overflow absoluto).
export function LimitesDePreco({
  produto,
  condicao,
  children,
}: {
  produto: ProdutoComPreco | undefined;
  condicao: "AVISTA" | "APRAZO";
  children: ReactNode;
}) {
  const [aberto, setAberto] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const ref = useRef<HTMLDivElement>(null);

  function aoEntrar() {
    const r = ref.current?.getBoundingClientRect();
    if (r) setPos({ top: r.bottom + 4, left: Math.max(8, r.right - 224) });
    setAberto(true);
  }

  const formatar = (valor: number | null | undefined) =>
    valor != null && Number.isFinite(valor) && valor >= 0 ? fmtBRL(valor) : "—";
  const linhas = [
    ["AVISTA", "À vista", produto?.custoAvista],
    ["APRAZO", "A prazo", produto?.custoAprazo],
  ] as const;

  return (
    <div ref={ref} onMouseEnter={aoEntrar} onMouseLeave={() => setAberto(false)}>
      {children}
      {aberto && (
        <div
          style={{ top: pos.top, left: pos.left }}
          className="pointer-events-none fixed z-[1400] w-56 rounded-lg border border-surface-border bg-zinc-800 px-3 py-2 text-left text-xs font-normal normal-case shadow-xl"
        >
          <p className="mb-1.5 truncate text-zinc-300">{produto?.nome ?? "Produto não selecionado"}</p>
          <div className="grid grid-cols-[auto_1fr_1fr] gap-x-3 gap-y-1">
            <span />
            <span className="text-right text-muted" title="Preço cadastrado menos 3%">Mínimo</span>
            <span className="text-right text-muted">Máximo</span>
            {linhas.map(([tipo, rotulo, preco]) => (
              <span key={tipo} className={`contents ${tipo === condicao ? "font-semibold" : ""}`}>
                <span className={tipo === condicao ? "text-accent" : "text-secondary"}>{rotulo}</span>
                <span className="text-right text-accent">{formatar(precoMinimo(preco))}</span>
                <span className="text-right text-white">{formatar(preco)}</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
