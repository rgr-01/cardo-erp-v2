"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";

// Campo de data com calendario proprio (substitui o <input type="date"> do
// navegador): digita com mascara dd/mm/aaaa ou escolhe no calendario.
// Mesmo contrato do input nativo — valor em "aaaa-mm-dd", `name` entra no
// FormData, `defaultValue`/`value`, `required` e onChange(e.target.value).

const MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];
const MESES_CURTOS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const DIAS_SEMANA = [
  { curto: "D", longo: "domingo" },
  { curto: "S", longo: "segunda-feira" },
  { curto: "T", longo: "terça-feira" },
  { curto: "Q", longo: "quarta-feira" },
  { curto: "Q", longo: "quinta-feira" },
  { curto: "S", longo: "sexta-feira" },
  { curto: "S", longo: "sábado" },
];

type Dia = { a: number; m: number; d: number };

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function paraIso({ a, m, d }: Dia) {
  return `${a}-${pad(m + 1)}-${pad(d)}`;
}

function deIso(iso: string | undefined | null): Dia | null {
  const achou = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  if (!achou) return null;
  const dia = { a: Number(achou[1]), m: Number(achou[2]) - 1, d: Number(achou[3]) };
  return existe(dia) ? dia : null;
}

function existe({ a, m, d }: Dia) {
  const dt = new Date(a, m, d, 12);
  return dt.getFullYear() === a && dt.getMonth() === m && dt.getDate() === d;
}

function somarDias(dia: Dia, n: number): Dia {
  const dt = new Date(dia.a, dia.m, dia.d + n, 12);
  return { a: dt.getFullYear(), m: dt.getMonth(), d: dt.getDate() };
}

function somarMeses(dia: Dia, n: number): Dia {
  const alvo = new Date(dia.a, dia.m + n, 1, 12);
  const ultimo = new Date(alvo.getFullYear(), alvo.getMonth() + 1, 0, 12).getDate();
  return { a: alvo.getFullYear(), m: alvo.getMonth(), d: Math.min(dia.d, ultimo) };
}

function hoje(): Dia {
  const dt = new Date();
  return { a: dt.getFullYear(), m: dt.getMonth(), d: dt.getDate() };
}

function igual(x: Dia | null, y: Dia | null) {
  return !!x && !!y && x.a === y.a && x.m === y.m && x.d === y.d;
}

function formatar(dia: Dia | null) {
  return dia ? `${pad(dia.d)}/${pad(dia.m + 1)}/${dia.a}` : "";
}

// "20102026" -> "20/10/2026" enquanto digita
function mascarar(texto: string) {
  const n = texto.replace(/\D/g, "").slice(0, 8);
  if (n.length <= 2) return n;
  if (n.length <= 4) return `${n.slice(0, 2)}/${n.slice(2)}`;
  return `${n.slice(0, 2)}/${n.slice(2, 4)}/${n.slice(4)}`;
}

function lerTexto(texto: string): Dia | null {
  const achou = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(texto);
  if (!achou) return null;
  const dia = { a: Number(achou[3]), m: Number(achou[2]) - 1, d: Number(achou[1]) };
  return existe(dia) && dia.a >= 1900 && dia.a <= 2200 ? dia : null;
}

// 6 semanas de 7 dias começando no domingo
function gradeDoMes(a: number, m: number): Dia[] {
  const primeiro = new Date(a, m, 1, 12);
  const inicio = somarDias({ a, m, d: 1 }, -primeiro.getDay());
  return Array.from({ length: 42 }, (_, i) => somarDias(inicio, i));
}

export function DateInput({
  value,
  defaultValue,
  onChange,
  name,
  required,
  disabled,
  className = "",
  placeholder = "dd/mm/aaaa",
  min,
  max,
  id,
  "aria-label": ariaLabel,
}: {
  value?: string;
  defaultValue?: string;
  onChange?: (e: { target: { value: string } }) => void;
  name?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
  // "aaaa-mm-dd": dias fora do intervalo ficam desabilitados.
  min?: string;
  max?: string;
  id?: string;
  "aria-label"?: string;
}) {
  const [interno, setInterno] = useState(defaultValue ?? "");
  const iso = value ?? interno;
  const selecionado = deIso(iso);
  // Texto em digitacao; fora disso o campo mostra a data do valor.
  const [digitado, setDigitado] = useState<string | null>(null);
  const texto = digitado ?? formatar(selecionado);
  const [aberto, setAberto] = useState(false);
  const [portalRoot, setPortalRoot] = useState<HTMLElement | null>(null);
  const [visao, setVisao] = useState<"dias" | "meses" | "anos">("dias");
  const [mostrado, setMostrado] = useState<Dia>(selecionado ?? hoje());
  const [focado, setFocado] = useState<Dia>(selecionado ?? hoje());
  const [pos, setPos] = useState({ left: 0, top: 0 });
  const caixa = useRef<HTMLDivElement>(null);
  const painel = useRef<HTMLDivElement>(null);
  const idPainel = useId();

  const minimo = deIso(min);
  const maximo = deIso(max);

  function emitir(novo: string) {
    if (value === undefined) setInterno(novo);
    onChange?.({ target: { value: novo } });
  }

  function foraDoIntervalo(dia: Dia) {
    const t = paraIso(dia);
    return (!!minimo && t < paraIso(minimo)) || (!!maximo && t > paraIso(maximo));
  }

  function escolher(dia: Dia) {
    if (foraDoIntervalo(dia)) return;
    setDigitado(null);
    emitir(paraIso(dia));
    setAberto(false);
    caixa.current?.querySelector("input")?.focus();
  }

  function abrir() {
    if (disabled) return;
    setPortalRoot(caixa.current?.closest("dialog") ?? document.body);
    const base = selecionado ?? hoje();
    setMostrado(base);
    setFocado(base);
    setVisao("dias");
    setAberto(true);
  }

  useLayoutEffect(() => {
    if (!aberto || !caixa.current) return;
    const r = caixa.current.getBoundingClientRect();
    const altura = painel.current?.offsetHeight ?? 360;
    const largura = painel.current?.offsetWidth ?? 296;
    const abaixo = r.bottom + 6;
    const top =
      abaixo + altura > window.innerHeight - 8 ? Math.max(8, r.top - altura - 6) : abaixo;
    setPos({
      left: Math.min(Math.max(8, r.left), Math.max(8, window.innerWidth - largura - 8)),
      top,
    });
  }, [aberto, visao, mostrado.m, mostrado.a]);

  useEffect(() => {
    if (!aberto) return;
    function fora(e: PointerEvent) {
      const alvo = e.target as Node;
      if (painel.current?.contains(alvo) || caixa.current?.contains(alvo)) return;
      setAberto(false);
    }
    document.addEventListener("pointerdown", fora);
    return () => document.removeEventListener("pointerdown", fora);
  }, [aberto]);

  function aoDigitar(valor: string) {
    const mascarado = mascarar(valor);
    setDigitado(mascarado);
    if (mascarado === "") {
      emitir("");
      return;
    }
    const dia = lerTexto(mascarado);
    if (dia && !foraDoIntervalo(dia)) {
      emitir(paraIso(dia));
      setMostrado(dia);
      setFocado(dia);
    }
  }

  function aoSairDoCampo() {
    // Texto incompleto/invalido volta para o valor valido anterior
    setDigitado(null);
  }

  function teclasPainel(e: KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      setAberto(false);
      caixa.current?.querySelector("input")?.focus();
      return;
    }
    if (visao !== "dias") {
      return;
    }
    const mover = (novo: Dia) => {
      e.preventDefault();
      setFocado(novo);
      setMostrado(novo);
    };
    if (e.key === "ArrowLeft") mover(somarDias(focado, -1));
    else if (e.key === "ArrowRight") mover(somarDias(focado, 1));
    else if (e.key === "ArrowUp") mover(somarDias(focado, -7));
    else if (e.key === "ArrowDown") mover(somarDias(focado, 7));
    else if (e.key === "PageUp") mover(somarMeses(focado, e.shiftKey ? -12 : -1));
    else if (e.key === "PageDown") mover(somarMeses(focado, e.shiftKey ? 12 : 1));
    else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      escolher(focado);
    }
  }

  const hojeDia = hoje();
  const grade = gradeDoMes(mostrado.a, mostrado.m);
  const decadaInicio = Math.floor(mostrado.a / 12) * 12;

  const botaoNav =
    "flex h-8 w-8 items-center justify-center rounded-lg text-zinc-300 transition hover:bg-zinc-700 hover:text-white";

  return (
    <>
      <div ref={caixa} className="relative">
        <input
          id={id}
          type="text"
          role="combobox"
          inputMode="numeric"
          autoComplete="off"
          value={texto}
          disabled={disabled}
          placeholder={placeholder}
          aria-label={ariaLabel}
          aria-haspopup="dialog"
          aria-expanded={aberto}
          aria-controls={aberto ? idPainel : undefined}
          onChange={(e) => aoDigitar(e.target.value)}
          onBlur={aoSairDoCampo}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown" && !aberto) {
              e.preventDefault();
              abrir();
            }
            if (e.key === "Escape" && aberto) { e.preventDefault(); e.stopPropagation(); setAberto(false); }
          }}
          className={`${className} pr-9`}
        />
        <button
          type="button"
          tabIndex={-1}
          disabled={disabled}
          onClick={() => (aberto ? setAberto(false) : abrir())}
          aria-label="Abrir calendário"
          className="absolute right-1.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-secondary transition hover:bg-white/10 hover:text-accent disabled:opacity-40"
        >
          <CalendarDays size={15} />
        </button>
        {name && (
          <input
            type="text"
            name={name}
            value={iso}
            required={required}
            readOnly
            tabIndex={-1}
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0 h-0 w-full opacity-0"
          />
        )}
      </div>

      {aberto && portalRoot &&
        createPortal(
          <div
            ref={painel}
            id={idPainel}
            role="dialog"
            aria-label="Calendário"
            tabIndex={-1}
            onKeyDown={teclasPainel}
            style={{ position: "fixed", left: pos.left, top: pos.top }}
            className="z-[3000] w-[296px] select-none rounded-xl border border-surface-border bg-zinc-900 p-3 text-zinc-100 shadow-2xl shadow-black/60"
          >
            <div className="mb-2 flex items-center justify-between gap-1">
              <button
                type="button"
                onClick={() =>
                  visao === "dias"
                    ? setMostrado(somarMeses(mostrado, -1))
                    : visao === "meses"
                      ? setMostrado({ ...mostrado, a: mostrado.a - 1 })
                      : setMostrado({ ...mostrado, a: mostrado.a - 12 })
                }
                aria-label="Anterior"
                className={botaoNav}
              >
                <ChevronLeft size={18} />
              </button>
              <button
                type="button"
                onClick={() => setVisao(visao === "dias" ? "meses" : visao === "meses" ? "anos" : "dias")}
                className="flex-1 rounded-lg px-2 py-1.5 text-sm font-semibold capitalize text-white transition hover:bg-zinc-700"
                aria-live="polite"
              >
                {visao === "dias"
                  ? `${MESES[mostrado.m]} de ${mostrado.a}`
                  : visao === "meses"
                    ? mostrado.a
                    : `${decadaInicio} – ${decadaInicio + 11}`}
              </button>
              <button
                type="button"
                onClick={() =>
                  visao === "dias"
                    ? setMostrado(somarMeses(mostrado, 1))
                    : visao === "meses"
                      ? setMostrado({ ...mostrado, a: mostrado.a + 1 })
                      : setMostrado({ ...mostrado, a: mostrado.a + 12 })
                }
                aria-label="Próximo"
                className={botaoNav}
              >
                <ChevronRight size={18} />
              </button>
            </div>

            {visao === "dias" && (
              <>
                <div className="mb-1 grid grid-cols-7 text-center text-[11px] font-medium text-muted">
                  {DIAS_SEMANA.map((d, i) => (
                    <abbr key={i} title={d.longo} className="py-1 no-underline">
                      {d.curto}
                    </abbr>
                  ))}
                </div>
                <div role="grid" className="grid grid-cols-7 gap-y-0.5">
                  {grade.map((dia) => {
                    const doMes = dia.m === mostrado.m;
                    const ehSelecionado = igual(dia, selecionado);
                    const ehHoje = igual(dia, hojeDia);
                    const ehFocado = igual(dia, focado);
                    const bloqueado = foraDoIntervalo(dia);
                    return (
                      <button
                        key={paraIso(dia)}
                        type="button"
                        role="gridcell"
                        disabled={bloqueado}
                        aria-selected={ehSelecionado}
                        aria-label={`${dia.d} de ${MESES[dia.m]} de ${dia.a}`}
                        aria-current={ehHoje ? "date" : undefined}
                        tabIndex={ehFocado ? 0 : -1}
                        ref={(el) => {
                          if (el && ehFocado && aberto && document.activeElement !== el && painel.current?.contains(document.activeElement)) el.focus();
                        }}
                        onClick={() => escolher(dia)}
                        onMouseEnter={() => setFocado(dia)}
                        className={[
                          "mx-auto flex h-9 w-9 items-center justify-center rounded-full text-sm tabular-nums outline-none transition",
                          ehSelecionado
                            ? "bg-accent font-bold text-accent-foreground"
                            : ehHoje
                              ? "border border-accent text-accent hover:bg-accent/15"
                              : doMes
                                ? "text-zinc-100 hover:bg-zinc-700"
                                : "text-subtle hover:bg-zinc-800",
                          ehFocado && !ehSelecionado ? "ring-1 ring-zinc-500" : "",
                          bloqueado ? "cursor-not-allowed opacity-30 hover:bg-transparent" : "",
                        ].join(" ")}
                      >
                        {dia.d}
                      </button>
                    );
                  })}
                </div>
              </>
            )}

            {visao === "meses" && (
              <div className="grid grid-cols-3 gap-2 py-1">
                {MESES_CURTOS.map((nome, i) => (
                  <button
                    key={nome}
                    type="button"
                    onClick={() => {
                      setMostrado({ ...mostrado, m: i, d: 1 });
                      setFocado({ ...focado, a: mostrado.a, m: i, d: 1 });
                      setVisao("dias");
                    }}
                    className={`rounded-xl py-3 text-sm capitalize transition ${
                      i === mostrado.m
                        ? "bg-accent font-bold text-accent-foreground"
                        : "text-zinc-200 hover:bg-zinc-700"
                    }`}
                  >
                    {nome}
                  </button>
                ))}
              </div>
            )}

            {visao === "anos" && (
              <div className="grid grid-cols-3 gap-2 py-1">
                {Array.from({ length: 12 }, (_, i) => decadaInicio + i).map((ano) => (
                  <button
                    key={ano}
                    type="button"
                    onClick={() => {
                      setMostrado({ ...mostrado, a: ano });
                      setVisao("meses");
                    }}
                    className={`rounded-xl py-3 text-sm tabular-nums transition ${
                      ano === mostrado.a
                        ? "bg-accent font-bold text-accent-foreground"
                        : "text-zinc-200 hover:bg-zinc-700"
                    }`}
                  >
                    {ano}
                  </button>
                ))}
              </div>
            )}

            <div className="mt-2 flex items-center justify-between border-t border-surface-border pt-2">
              <button
                type="button"
                onClick={() => {
                  setDigitado(null);
                  emitir("");
                  setAberto(false);
                }}
                className="rounded-lg px-2.5 py-1.5 text-xs text-secondary transition hover:bg-zinc-700 hover:text-white"
              >
                Limpar
              </button>
              <button
                type="button"
                onClick={() => {
                  const h = hoje();
                  if (visao === "dias") escolher(h);
                  else {
                    setMostrado(h);
                    setFocado(h);
                    setVisao("dias");
                  }
                }}
                className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-accent transition hover:bg-accent/15"
              >
                Hoje
              </button>
            </div>
          </div>,
          portalRoot,
        )}
    </>
  );
}
