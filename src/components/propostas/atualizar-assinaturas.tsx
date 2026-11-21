"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { assinaturasMudaram } from "@/app/actions/propostas";

type Pendente = { id: string; status: string; temPdf: boolean };

// Confere a cada 30 s (e ao voltar para a aba) se alguma assinatura pendente
// mudou; só aí recarrega a tela inteira.
export function AtualizarAssinaturas({ pendentes }: { pendentes: Pendente[] }) {
  const router = useRouter();
  const chave = JSON.stringify(pendentes);
  useEffect(() => {
    const lista: Pendente[] = JSON.parse(chave);
    if (lista.length === 0) return;
    let ocupado = false;
    const atualizar = async () => {
      if (document.visibilityState !== "visible" || ocupado) return;
      ocupado = true;
      try {
        if (await assinaturasMudaram(lista)) router.refresh();
      } finally {
        ocupado = false;
      }
    };
    const timer = setInterval(atualizar, 30_000);
    document.addEventListener("visibilitychange", atualizar);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", atualizar);
    };
  }, [chave, router]);
  return null;
}
