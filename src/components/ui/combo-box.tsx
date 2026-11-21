"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";

export type ComboBoxOpcao = { id: string; label: string; grupo?: string };

function normalizarBusca(texto: string) {
  return texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

export function ComboBox({
  opcoes,
  valor,
  onSelecionar,
  onCancelar,
  placeholder,
  autoFoco,
  className,
  disabled,
  rotulo,
}: {
  opcoes: ComboBoxOpcao[];
  valor: string;
  onSelecionar: (id: string) => void;
  onCancelar?: () => void;
  placeholder?: string;
  autoFoco?: boolean;
  className?: string;
  disabled?: boolean;
  rotulo?: string;
}) {
  const listId = useId();
  const valorInicial = useMemo(
    () => opcoes.find((o) => o.id === valor)?.label ?? "",
    [opcoes, valor]
  );
  const [texto, setTexto] = useState(valorInicial);
  const [aberto, setAberto] = useState(false);
  const [destaque, setDestaque] = useState(0);
  // position:fixed com coordenadas calculadas do input — dentro de uma
  // tabela com overflow-x-auto (ex.: linha de nova venda), um dropdown
  // absolute fica cortado pelo container. Mesma tecnica de
  // FiltroColunaExcel/MenuAcoes.
  const [pos, setPos] = useState({ top: 0, left: 0, largura: 0, maxLargura: 0, maxAltura: 224 });
  const raizRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const posicionar = useCallback(() => {
    const r = inputRef.current?.getBoundingClientRect();
    if (!r) return;
    const largura = Math.min(r.width, window.innerWidth - 16);
    const left = Math.max(8, Math.min(r.left, window.innerWidth - largura - 8));
    const abaixo = window.innerHeight - r.bottom - 8;
    const acima = r.top - 8;
    const paraCima = abaixo < 160 && acima > abaixo;
    const maxAltura = Math.max(48, Math.min(224, paraCima ? acima - 4 : abaixo - 4));
    const top = Math.max(8, paraCima ? r.top - maxAltura - 4 : r.bottom + 4);
    setPos({ top, left, largura, maxLargura: window.innerWidth - left - 8, maxAltura });
  }, []);

  useEffect(() => {
    if (!aberto) return;
    window.addEventListener("resize", posicionar);
    window.addEventListener("scroll", posicionar, true);
    return () => {
      window.removeEventListener("resize", posicionar);
      window.removeEventListener("scroll", posicionar, true);
    };
  }, [aberto, posicionar]);

  const filtradas = useMemo(() => {
    const termo = normalizarBusca(texto);
    if (!termo || termo === normalizarBusca(valorInicial)) return opcoes;
    return opcoes.filter((o) => normalizarBusca(o.label).includes(termo));
  }, [opcoes, texto, valorInicial]);

  // Foco automatico no mount so posiciona o cursor no campo — nao deve abrir
  // a lista sozinho (isso e reservado pra quando o usuario de fato interage).
  const ignorarProximoFoco = useRef(false);
  useEffect(() => {
    if (autoFoco) {
      ignorarProximoFoco.current = true;
      inputRef.current?.focus();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // So faz sentido "cancelar" se o dropdown estiver de fato aberto —
    // clicar em qualquer lugar da pagina com o combo fechado (ex.: marcar
    // uma checkbox de outra linha da tabela) nao deveria resetar o valor
    // ja selecionado (bug: filtro por consultor "sumia" ao clicar em outra
    // parte da tela).
    if (!aberto) return;
    function aoClicarFora(e: MouseEvent) {
      if (raizRef.current && !raizRef.current.contains(e.target as Node)) {
        setAberto(false);
        setTexto(valorInicial);
        onCancelar?.();
      }
    }
    document.addEventListener("pointerdown", aoClicarFora);
    return () => document.removeEventListener("pointerdown", aoClicarFora);
  }, [aberto, valorInicial, onCancelar]);

  function selecionar(opcao: ComboBoxOpcao) {
    setTexto(opcao.label);
    setAberto(false);
    onSelecionar(opcao.id);
  }

  function aoTecla(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.nativeEvent.isComposing) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      posicionar();
      setAberto(true);
      setDestaque((d) => aberto ? Math.min(d + 1, filtradas.length - 1) : 0);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      posicionar();
      setAberto(true);
      setDestaque((d) => aberto ? Math.max(d - 1, 0) : filtradas.length - 1);
    } else if (aberto && (e.key === "Home" || e.key === "End")) {
      e.preventDefault();
      setDestaque(e.key === "Home" ? 0 : filtradas.length - 1);
    } else if (e.key === "Enter" && aberto) {
      e.preventDefault();
      if (filtradas[indiceAtivo]) selecionar(filtradas[indiceAtivo]);
    } else if (e.key === "Escape" && aberto) {
      e.preventDefault();
      e.stopPropagation();
      setAberto(false);
      setTexto(valorInicial);
      onCancelar?.();
    }
  }

  const indiceAtivo = filtradas.length ? Math.min(Math.max(destaque, 0), filtradas.length - 1) : -1;

  return (
    <div ref={raizRef} className={`relative ${className ?? ""}`}>
      <input
        ref={inputRef}
        type="text"
        role="combobox"
        aria-label={rotulo ?? placeholder ?? "Selecionar opção"}
        aria-autocomplete="list"
        aria-expanded={aberto}
        aria-controls={aberto ? listId : undefined}
        aria-activedescendant={aberto && indiceAtivo >= 0 ? `${listId}-${indiceAtivo}` : undefined}
        value={texto}
        placeholder={placeholder}
        disabled={disabled}
        className="w-full rounded border border-accent bg-zinc-800 px-1.5 py-1 text-sm text-white outline-none disabled:cursor-not-allowed disabled:opacity-50"
        onChange={(e) => {
          setTexto(e.target.value);
          posicionar();
          setAberto(true);
          setDestaque(0);
        }}
        onFocus={() => {
          if (ignorarProximoFoco.current) {
            ignorarProximoFoco.current = false;
            return;
          }
          posicionar();
          setAberto(true);
        }}
        onKeyDown={aoTecla}
        onBlur={event => {
          if (aberto && !raizRef.current?.contains(event.relatedTarget)) {
            setAberto(false);
            setTexto(valorInicial);
            onCancelar?.();
          }
        }}
      />
      {aberto && (
        <ul
          id={listId}
          role="listbox"
          aria-label={rotulo ?? placeholder ?? "Opções disponíveis"}
          style={{ top: pos.top, left: pos.left, minWidth: pos.largura, maxWidth: pos.maxLargura, maxHeight: pos.maxAltura }}
          className="fixed z-[1200] max-h-56 w-max max-w-[calc(100vw-1rem)] overflow-y-auto rounded-lg border border-surface-border bg-zinc-800 py-1 shadow-xl">
          {filtradas.length === 0 && (
            <li role="option" aria-disabled="true" aria-selected="false" className="px-2.5 py-2 text-sm text-secondary">
              {opcoes.length === 0 ? "Nenhuma opção disponível." : "Nenhuma opção com esse nome. Altere a busca."}
            </li>
          )}
          {filtradas.map((o, i) => {
            // Cabeçalho do grupo quando muda em relação ao item anterior.
            const novoGrupo = i === 0 || o.grupo !== filtradas[i - 1].grupo;
            return (
              <li key={o.id} role="presentation">
                {novoGrupo && o.grupo && (
                  <div className="px-2.5 pt-1.5 pb-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted">
                    {o.grupo}
                  </div>
                )}
                <button
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={o.id === valor}
                  tabIndex={-1}
                  type="button"
                  onPointerDown={e => e.preventDefault()}
                  onClick={() => selecionar(o)}
                  className={`block w-full whitespace-normal break-words px-2.5 py-1 text-left text-sm ${
                    i === indiceAtivo
                      ? "bg-accent text-accent-foreground"
                      : "text-zinc-200 hover:bg-zinc-700"
                  }`}
                >
                  {o.label}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
