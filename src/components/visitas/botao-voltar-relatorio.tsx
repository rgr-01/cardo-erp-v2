"use client";

import { useEffect } from "react";
import { useConfirm } from "@/components/ui/confirm-dialog";
import Link from "next/link";
import { useEmbutido } from "@/components/embutido";

// Mensagens entre a janela sobreposta (pai) e a página de relatório dentro dela.
export const MENSAGEM_FECHAR_RELATORIO = "rede-agro:fechar-relatorio";
export const MENSAGEM_PEDIR_FECHAR = "rede-agro:pedir-fechar";
export const MENSAGEM_RECEBIDO = "rede-agro:pedido-recebido";

export function dentroDeIframe(): boolean {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

export function fecharJanelaEmbutida() {
  window.parent.postMessage({ tipo: MENSAGEM_FECHAR_RELATORIO }, window.location.origin);
}

// O editor registra aqui se há alterações não salvas, pra o "Fechar" da janela
// perguntar antes de descartar.
let temAlteracoesNaoSalvas: (() => boolean) | null = null;

export function registrarBloqueioDeSaida(fn: (() => boolean) | null) {
  temAlteracoesNaoSalvas = fn;
}

// Dentro da janela: atende o "Fechar" do pai (avisa que recebeu, confirma se
// houver alteração pendente e então pede pra fechar).
export function EscutaFecharEmbutido() {
  const { confirmar } = useConfirm();
  useEffect(() => {
    async function aoReceber(e: MessageEvent) {
      if (e.origin !== window.location.origin || e.data?.tipo !== MENSAGEM_PEDIR_FECHAR) return;
      // Antes do confirm (que trava a página): sem isso o pai acharia que ninguém respondeu.
      window.parent.postMessage({ tipo: MENSAGEM_RECEBIDO }, window.location.origin);
      if (
        temAlteracoesNaoSalvas?.() &&
        !(await confirmar({ mensagem: "Há alterações que ainda não foram salvas no servidor. Deseja sair mesmo assim?", confirmarLabel: "Sair sem salvar", variante: "perigo" }))
      ) {
        return;
      }
      fecharJanelaEmbutida();
    }
    window.addEventListener("message", aoReceber);
    return () => window.removeEventListener("message", aoReceber);
  }, [confirmar]);
  return null;
}

// Fora da janela volta pra lista de relatórios; dentro dela não existe: só o "Fechar" da janela.
export function BotaoVoltarRelatorio({ className, children }: { className: string; children: React.ReactNode }) {
  const embutido = useEmbutido();
  if (embutido) return null;
  return (
    <Link href="/relatorios/visitas" className={className}>
      {children}
    </Link>
  );
}
