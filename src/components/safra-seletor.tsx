"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, ChevronUp, MoreVertical, Plus, Pencil, Trash2 } from "lucide-react";
import {
  atualizarSafra,
  criarSafra,
  excluirSafra,
  selecionarSafra,
} from "@/app/actions/safras";
import { useConfirm } from "@/components/ui/confirm-dialog";

export function SafraSeletor({
  safras,
  safraAtual,
}: {
  safras: { id: string; nome: string }[];
  safraAtual: { id: string; nome: string };
}) {
  const router = useRouter();
  const [switcherAberto, setSwitcherAberto] = useState(false);
  const [menuAberto, setMenuAberto] = useState(false);
  const [modo, setModo] = useState<"normal" | "nova" | "editar">("normal");
  const [texto, setTexto] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();
  const raizRef = useRef<HTMLDivElement>(null);
  const { confirmar } = useConfirm();

  useEffect(() => {
    function aoClicarFora(e: MouseEvent) {
      if (raizRef.current && !raizRef.current.contains(e.target as Node)) {
        setSwitcherAberto(false);
        setMenuAberto(false);
      }
    }
    document.addEventListener("mousedown", aoClicarFora);
    return () => document.removeEventListener("mousedown", aoClicarFora);
  }, []);

  function selecionar(id: string) {
    setErro(null);
    startTransition(async () => {
      const resultado = await selecionarSafra(id);
      if (!resultado.ok) setErro(resultado.erro);
      else {
        setSwitcherAberto(false);
        router.refresh();
      }
    });
  }

  function iniciarNova() {
    setMenuAberto(false);
    setTexto("");
    setErro(null);
    setModo("nova");
  }

  function iniciarEdicao() {
    setMenuAberto(false);
    setTexto(safraAtual.nome);
    setErro(null);
    setModo("editar");
  }

  function salvarNova() {
    setErro(null);
    startTransition(async () => {
      const resultado = await criarSafra(texto);
      if (!resultado.ok) setErro(resultado.erro);
      else {
        setModo("normal");
        router.refresh();
      }
    });
  }

  function salvarEdicao() {
    setErro(null);
    startTransition(async () => {
      const resultado = await atualizarSafra(safraAtual.id, texto);
      if (!resultado.ok) setErro(resultado.erro);
      else {
        setModo("normal");
        router.refresh();
      }
    });
  }

  async function excluir() {
    setMenuAberto(false);
    if (
      !(await confirmar({
        mensagem: `Excluir a safra ${safraAtual.nome}? Só é possível se estiver vazia.`,
        confirmarLabel: "Excluir safra",
        variante: "perigo",
      }))
    )
      return;
    setErro(null);
    startTransition(async () => {
      const resultado = await excluirSafra(safraAtual.id);
      if (!resultado.ok) setErro(resultado.erro);
      else router.refresh();
    });
  }

  return (
    <div ref={raizRef} className="relative">
      {modo === "normal" ? (
        <div className="flex items-center gap-1">
          <div className="relative flex-1">
            <button
              onClick={() => {
                setSwitcherAberto((a) => !a);
                setMenuAberto(false);
              }}
              className="flex w-full items-center justify-between rounded px-1 py-0.5 text-xs text-white hover:bg-zinc-800"
              title="Trocar safra"
            >
              <span>Safra {safraAtual.nome}</span>
              <span className="text-subtle">
                {switcherAberto ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
              </span>
            </button>

            {switcherAberto && (
              <div className="absolute left-0 top-full z-30 mt-1 w-40 overflow-hidden rounded-lg border border-surface-border bg-zinc-800 shadow-xl">
                <p className="border-b border-surface-border px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted">
                  Trocar safra
                </p>
                <ul className="max-h-48 overflow-y-auto py-1">
                  {safras.map((s) => (
                    <li key={s.id}>
                      <button
                        onClick={() => selecionar(s.id)}
                        disabled={pendente}
                        className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-zinc-700 ${
                          s.id === safraAtual.id ? "text-accent" : "text-zinc-200"
                        }`}
                      >
                        <span className="flex w-4 justify-center">
                          {s.id === safraAtual.id ? <Check size={13} /> : ""}
                        </span>
                        <span className="truncate">{s.nome}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <div className="relative">
            <button
              onClick={() => {
                setMenuAberto((a) => !a);
                setSwitcherAberto(false);
              }}
              className="rounded p-1 text-muted hover:bg-zinc-800 hover:text-white"
              title="Ações da safra"
            >
              <MoreVertical size={14} />
            </button>

            {menuAberto && (
              <ul className="absolute left-0 top-full z-30 mt-1 w-40 overflow-hidden rounded-lg border border-surface-border bg-zinc-800 py-1 shadow-xl">
                <li>
                  <button
                    onClick={iniciarNova}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-zinc-200 hover:bg-zinc-700"
                  >
                    <Plus size={14} className="shrink-0" /> Nova safra
                  </button>
                </li>
                <li>
                  <button
                    onClick={iniciarEdicao}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-zinc-200 hover:bg-zinc-700"
                  >
                    <Pencil size={14} className="shrink-0" /> Editar
                  </button>
                </li>
                <li className="mt-1 border-t border-surface-border pt-1">
                  <button
                    onClick={excluir}
                    disabled={pendente}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-red-400 hover:bg-red-500/10"
                  >
                    <Trash2 size={14} className="shrink-0" /> Excluir
                  </button>
                </li>
              </ul>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-1.5 rounded-lg border border-accent bg-zinc-800 p-2">
          <input
            autoFocus
            type="text"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Ex: 25/28"
            className="w-full rounded border border-surface-border bg-zinc-900 px-2 py-1 text-sm text-white outline-none focus:border-accent"
          />
          <div className="flex gap-1.5">
            <button
              onClick={modo === "nova" ? salvarNova : salvarEdicao}
              disabled={pendente || !texto.trim()}
              className="flex-1 rounded bg-accent py-1 text-xs font-semibold text-accent-foreground hover:brightness-110 disabled:opacity-50"
            >
              Salvar
            </button>
            <button
              onClick={() => setModo("normal")}
              className="flex-1 rounded border border-danger/40 bg-danger/10 py-1 text-xs font-semibold text-danger-ink hover:bg-danger/20"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {erro && <p role="alert" className="mt-1.5 text-xs text-red-400">{erro}</p>}
    </div>
  );
}
