"use client";

import { createContext, useCallback, useContext, useEffect, useId, useRef, useState } from "react";
import { DialogFrame } from "./dialog-frame";
import { AlertTriangle, Info, PencilLine } from "lucide-react";
import { Button } from "@/components/ui/button";

type ConfirmOpcoes = {
  titulo?: string;
  mensagem: string;
  confirmarLabel?: string;
  cancelarLabel?: string;
  // "perigo" = exclusão/ação destrutiva (vermelho); "padrao" = confirmação comum (verde).
  variante?: "perigo" | "padrao";
};

type AlertOpcoes = {
  titulo?: string;
  mensagem: string;
  fecharLabel?: string;
};

type PerguntaOpcoes = {
  titulo?: string;
  mensagem: string;
  valorInicial?: string;
  placeholder?: string;
  confirmarLabel?: string;
  cancelarLabel?: string;
  // "senha" esconde o que é digitado.
  tipoCampo?: "texto" | "senha";
};

type EstadoConfirm =
  | { tipo: "confirm"; opcoes: ConfirmOpcoes; resolver: (valor: boolean) => void }
  | { tipo: "alert"; opcoes: AlertOpcoes; resolver: (valor: boolean) => void }
  | { tipo: "prompt"; opcoes: PerguntaOpcoes; responder: (valor: string | null) => void };

type ConfirmContextValor = {
  confirmar: (opcoes: ConfirmOpcoes | string) => Promise<boolean>;
  avisar: (opcoes: AlertOpcoes | string) => Promise<void>;
  // Campo de texto no lugar do window.prompt: devolve o texto, ou null se cancelar.
  perguntar: (opcoes: PerguntaOpcoes | string) => Promise<string | null>;
};

const ConfirmContext = createContext<ConfirmContextValor | null>(null);

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const messageId = useId();
  const [estado, setEstado] = useState<EstadoConfirm | null>(null);
  const [sequencia, setSequencia] = useState(0);
  const atualRef = useRef<EstadoConfirm | null>(null);
  const fila = useRef<EstadoConfirm[]>([]);
  const [texto, setTexto] = useState("");

  const apresentar = useCallback((proximo: EstadoConfirm) => {
    if (atualRef.current) { fila.current.push(proximo); return; }
    atualRef.current = proximo;
    setSequencia(valor => valor + 1);
    setTexto(proximo.tipo === "prompt" ? proximo.opcoes.valorInicial ?? "" : "");
    setEstado(proximo);
  }, []);
  useEffect(() => () => {
    for (const item of [atualRef.current, ...fila.current]) {
      if (item?.tipo === "prompt") item.responder(null);
      else item?.resolver(false);
    }
    atualRef.current = null;
    fila.current = [];
  }, []);

  const confirmar = useCallback((opcoesOuMensagem: ConfirmOpcoes | string) => {
    const opcoes: ConfirmOpcoes =
      typeof opcoesOuMensagem === "string" ? { mensagem: opcoesOuMensagem } : opcoesOuMensagem;
    return new Promise<boolean>((resolve) => {
      apresentar({ tipo: "confirm", opcoes, resolver: resolve });
    });
  }, [apresentar]);

  const avisar = useCallback((opcoesOuMensagem: AlertOpcoes | string) => {
    const opcoes: AlertOpcoes =
      typeof opcoesOuMensagem === "string" ? { mensagem: opcoesOuMensagem } : opcoesOuMensagem;
    return new Promise<void>((resolve) => {
      apresentar({ tipo: "alert", opcoes, resolver: () => resolve() });
    });
  }, [apresentar]);

  const perguntar = useCallback((opcoesOuMensagem: PerguntaOpcoes | string) => {
    const opcoes: PerguntaOpcoes =
      typeof opcoesOuMensagem === "string" ? { mensagem: opcoesOuMensagem } : opcoesOuMensagem;
    return new Promise<string | null>((resolve) => {
      apresentar({ tipo: "prompt", opcoes, responder: resolve });
    });
  }, [apresentar]);
  function fechar(valor: boolean) {
    const atual = atualRef.current;
    if (!atual) return;
    if (atual.tipo === "prompt") atual.responder(valor ? texto : null);
    else atual.resolver(valor);
    const proximo = fila.current.shift() ?? null;
    atualRef.current = proximo;
    if (proximo) setSequencia(valor => valor + 1);
    setTexto(proximo?.tipo === "prompt" ? proximo.opcoes.valorInicial ?? "" : "");
    setEstado(proximo);
  }

  return (
    <ConfirmContext.Provider value={{ confirmar, avisar, perguntar }}>
      {children}
      {estado && (
        <DialogFrame key={sequencia} onClose={() => fechar(false)} label={estado.opcoes.titulo ?? (estado.tipo === "confirm" ? "Confirmar ação" : estado.tipo === "prompt" ? "Preencher informação" : "Aviso")} describedBy={messageId} role={estado.tipo === "confirm" ? "alertdialog" : "dialog"} className="p-4 lg:pl-64">
          <div className="w-full max-w-sm rounded-xl border border-surface-border bg-zinc-900 p-5 shadow-xl">
            <div className="flex items-start gap-3">
              <div
                className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                  estado.tipo === "confirm" && estado.opcoes.variante === "perigo"
                    ? "bg-danger/10 text-danger-ink"
                    : "bg-accent/10 text-accent"
                }`}
              >
                {estado.tipo === "confirm" && estado.opcoes.variante === "perigo" ? (
                  <AlertTriangle size={18} />
                ) : estado.tipo === "prompt" ? (
                  <PencilLine size={18} />
                ) : (
                  <Info size={18} />
                )}
              </div>
              <div className="min-w-0 flex-1">
                {estado.opcoes.titulo && (
                  <h2 className="text-sm font-bold text-white">{estado.opcoes.titulo}</h2>
                )}
                <p id={messageId} className="mt-1 break-words text-sm text-zinc-300">{estado.opcoes.mensagem}</p>
                {estado.tipo === "prompt" && (
                  <input
                    autoFocus
                    aria-labelledby={messageId}
                    type={estado.opcoes.tipoCampo === "senha" ? "password" : "text"}
                    value={texto}
                    onChange={(e) => setTexto(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") { e.preventDefault(); fechar(true); }
                    }}
                    onFocus={(e) => e.currentTarget.select()}
                    placeholder={estado.opcoes.placeholder}
                    className="mt-3 w-full rounded-lg border border-surface-border bg-zinc-950 px-3 py-2 text-sm text-white outline-none placeholder:text-subtle focus:border-accent"
                  />
                )}
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              {estado.tipo !== "alert" ? (
                <>
                  <Button variant="secondary" onClick={() => fechar(false)}>
                    {estado.opcoes.cancelarLabel ?? "Cancelar"}
                  </Button>
                  <Button
                    variant={estado.tipo === "confirm" && estado.opcoes.variante === "perigo" ? "danger" : "primary"}
                    onClick={() => fechar(true)}
                  >
                    {estado.opcoes.confirmarLabel ?? "Confirmar"}
                  </Button>
                </>
              ) : (
                <Button variant="primary" onClick={() => fechar(true)}>
                  {estado.opcoes.fecharLabel ?? "Fechar aviso"}
                </Button>
              )}
            </div>
          </div>
        </DialogFrame>
      )}
    </ConfirmContext.Provider>
  );
}

// Substitui window.confirm/window.alert por um modal no estilo do site —
// async, uso: `if (!(await confirmar("Excluir X?"))) return;`
export function useConfirm(): ConfirmContextValor {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm precisa estar dentro de <ConfirmProvider>.");
  return ctx;
}
