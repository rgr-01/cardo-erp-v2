"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { fmtNum } from "@/lib/format";
import { Button } from "@/components/ui/button";

// Paginação no cliente para tabelas longas: só a página atual vira DOM.
// Volta para a primeira página quando `chaveFiltro` muda (busca/filtros), mas
// não quando a lista chega atualizada do servidor depois de uma edição.
export function usePaginacao<T>(lista: T[], chaveFiltro: string, porPagina = 50) {
  const [pagina, setPagina] = useState(1);
  const [chaveAnterior, setChaveAnterior] = useState(chaveFiltro);

  if (chaveFiltro !== chaveAnterior) {
    setChaveAnterior(chaveFiltro);
    setPagina(1);
  }

  const totalPaginas = Math.max(1, Math.ceil(lista.length / porPagina));
  const atual = Math.min(pagina, totalPaginas);
  const inicio = (atual - 1) * porPagina;

  return {
    itens: lista.slice(inicio, inicio + porPagina),
    pagina: atual,
    totalPaginas,
    inicio,
    total: lista.length,
    porPagina,
    irPara: (p: number) => setPagina(Math.min(Math.max(1, p), totalPaginas)),
  };
}

export function Paginacao({
  pagina,
  totalPaginas,
  inicio,
  total,
  porPagina,
  irPara,
}: Omit<ReturnType<typeof usePaginacao>, "itens">) {
  if (totalPaginas <= 1) return null;

  const fim = Math.min(inicio + porPagina, total);

  return (
    <div className="flex items-center justify-between gap-3 text-xs text-muted">
      <span>
        {fmtNum(inicio + 1)}–{fmtNum(fim)} de {fmtNum(total)}
      </span>
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="ghost"
          onClick={() => irPara(pagina - 1)}
          disabled={pagina === 1}
          aria-label="Página anterior"
        >
          <ChevronLeft size={14} />
        </Button>
        <span className="tabular-nums">
          Página {pagina} de {totalPaginas}
        </span>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => irPara(pagina + 1)}
          disabled={pagina === totalPaginas}
          aria-label="Próxima página"
        >
          <ChevronRight size={14} />
        </Button>
      </div>
    </div>
  );
}
