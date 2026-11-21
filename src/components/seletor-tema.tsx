"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Moon, Sun } from "lucide-react";
import { definirTema } from "@/app/actions/tema";
import type { Tema } from "@/lib/tema";

export function SeletorTema({ tema, aparencia = "botao" }: { tema: Tema; aparencia?: "botao" | "icone" | "menu" }) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState(false);
  const proximo = tema === "claro" ? "escuro" : "claro";
  const rotulo = `Ativar tema ${proximo}`;
  const Icone = pendente ? Loader2 : tema === "claro" ? Moon : Sun;
  const estilo = aparencia === "menu"
    ? "flex min-h-11 w-full items-center gap-2 px-3 py-2 text-left text-sm text-zinc-200 hover:bg-zinc-800"
    : `inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-control text-sm text-secondary hover:bg-zinc-800 hover:text-white ${aparencia === "icone" ? "h-11 w-11" : "w-full px-3 py-2"}`;

  function alternar() {
    setErro(false);
    iniciar(async () => {
      try {
        await definirTema(proximo);
        router.refresh();
      } catch {
        setErro(true);
      }
    });
  }

  return (
    <div>
      <button type="button" data-theme-switch aria-label={rotulo} title={rotulo} aria-busy={pendente} disabled={pendente} onClick={alternar} className={`${estilo} transition-colors duration-150 disabled:cursor-wait disabled:opacity-60`}>
        <Icone size={18} aria-hidden className={pendente ? "animate-spin" : undefined} />
        {aparencia !== "icone" && <span>{pendente ? "Alterando tema..." : `Tema ${proximo}`}</span>}
      </button>
      {erro && <p role="alert" className="mt-1 max-w-56 text-xs text-danger-ink">Não foi possível mudar o tema. Tente novamente.</p>}
    </div>
  );
}
