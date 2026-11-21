"use client";
import { DialogFrame } from "@/components/ui/dialog-frame";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  MENSAGEM_FECHAR_RELATORIO,
  MENSAGEM_PEDIR_FECHAR,
  MENSAGEM_RECEBIDO,
} from "@/components/visitas/botao-voltar-relatorio";

// Mostra uma tela de relatório (ver, editar ou novo) por cima da página atual,
// sem sair dela. O "Fechar" pergunta à página de dentro (que confirma se houver
// alteração não salva); ela responde pedindo o fechamento por mensagem.
export function RelatorioJanela({ url, titulo, aoFechar }: { url: string; titulo: string; aoFechar: () => void }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function aoReceber(e: MessageEvent) {
      if (e.origin !== window.location.origin) return;
      if (e.data?.tipo === MENSAGEM_RECEBIDO && timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      if (e.data?.tipo === MENSAGEM_FECHAR_RELATORIO) aoFechar();
    }
    window.addEventListener("message", aoReceber);
    return () => {
      window.removeEventListener("message", aoReceber);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [aoFechar]);

  const pedirFechar = useCallback(() => {
    const alvo = iframeRef.current?.contentWindow;
    if (!alvo) return aoFechar();
    alvo.postMessage({ tipo: MENSAGEM_PEDIR_FECHAR }, window.location.origin);
    // Página de dentro sem resposta (carregando, erro): fecha direto.
    timerRef.current = setTimeout(aoFechar, 600);
  }, [aoFechar]);

  return (
    <DialogFrame onClose={pedirFechar} label={titulo} className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 p-3 lg:pl-64">
      <div className="flex h-[94vh] w-[96%] max-w-[1300px] flex-col overflow-hidden rounded-xl border border-surface-border bg-zinc-900">
        <div className="flex items-center justify-between gap-3 border-b border-surface-border px-5 py-3">
          <h3 className="text-base font-bold text-white">{titulo}</h3>
          <button
            type="button"
            onClick={pedirFechar}
            className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-500"
          >
            Fechar
          </button>
        </div>
        <iframe ref={iframeRef} src={url} title={titulo} className="min-h-0 flex-1 bg-zinc-950" />
      </div>
    </DialogFrame>
  );
}

// Relatório completo do trabalho pra editar de uma vez: as visitas (capítulos)
// numa lateral e o editor da escolhida ao lado. Trocar de capítulo pergunta à
// página de dentro antes (confirma se houver alteração não salva).
export function JanelaRelatorioCompleto({
  titulo,
  capitulos,
  pdfUrl,
  aoFechar,
}: {
  titulo: string;
  capitulos: { id: string; titulo: string; data: string }[];
  pdfUrl: string;
  aoFechar: () => void;
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [atual, setAtual] = useState(capitulos[0]?.id ?? "");
  // Pra onde ir quando a página de dentro liberar: id do capítulo ou "fechar".
  const destino = useRef<string | null>(null);

  const seguir = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    const alvo = destino.current;
    destino.current = null;
    if (alvo === "fechar") aoFechar();
    else if (alvo) setAtual(alvo);
  }, [aoFechar]);

  useEffect(() => {
    function aoReceber(e: MessageEvent) {
      if (e.origin !== window.location.origin) return;
      if (e.data?.tipo === MENSAGEM_RECEBIDO && timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      if (e.data?.tipo === MENSAGEM_FECHAR_RELATORIO) seguir();
    }
    window.addEventListener("message", aoReceber);
    return () => {
      window.removeEventListener("message", aoReceber);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [seguir]);

  const ir = useCallback(
    (alvo: string) => {
      if (alvo === atual) return;
      destino.current = alvo;
      const janela = iframeRef.current?.contentWindow;
      if (!janela) return seguir();
      janela.postMessage({ tipo: MENSAGEM_PEDIR_FECHAR }, window.location.origin);
      timerRef.current = setTimeout(seguir, 600);
    },
    [atual, seguir]
  );

  const indice = capitulos.findIndex((c) => c.id === atual);

  return (
    <DialogFrame onClose={() => ir("fechar")} label={titulo} className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 p-3 lg:pl-64">
      <div className="flex h-[94vh] w-[98%] max-w-[1500px] flex-col overflow-hidden rounded-xl border border-surface-border bg-zinc-900">
        <div className="flex items-center justify-between gap-3 border-b border-surface-border px-5 py-3">
          <div className="min-w-0">
            <h3 className="truncate text-base font-bold text-white">Relatório completo · {titulo}</h3>
            <p className="text-xs text-muted">
              Capítulo {indice + 1} de {capitulos.length} · salve antes de trocar de capítulo
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <a
              href={pdfUrl}
              className="rounded-lg border border-surface-border px-3 py-1.5 text-sm font-semibold text-zinc-200 hover:bg-zinc-800"
            >
              Baixar PDF completo
            </a>
            <button
              type="button"
              onClick={() => ir("fechar")}
              className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-500"
            >
              Fechar
            </button>
          </div>
        </div>
        <div className="flex min-h-0 flex-1">
          <ol className="w-56 shrink-0 space-y-1 overflow-y-auto border-r border-surface-border p-2">
            {capitulos.map((c, i) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => ir(c.id)}
                  className={`w-full rounded-lg px-2.5 py-2 text-left text-xs transition ${
                    c.id === atual ? "bg-accent/15 text-white ring-1 ring-accent/50" : "text-secondary hover:bg-zinc-800"
                  }`}
                >
                  <span className="block font-semibold">
                    {i + 1}. {c.data}
                  </span>
                  <span className="block truncate">{c.titulo}</span>
                </button>
              </li>
            ))}
          </ol>
          <iframe
            key={atual}
            ref={iframeRef}
            src={`/relatorios/visitas/${atual}/editar`}
            title={titulo}
            className="min-h-0 flex-1 bg-zinc-950"
          />
        </div>
      </div>
    </DialogFrame>
  );
}
