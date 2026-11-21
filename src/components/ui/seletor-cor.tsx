"use client";

import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent } from "react";
import { createPortal } from "react-dom";
import { usePointerDrag } from "./use-pointer-drag";
import { ChevronDown, Palette } from "lucide-react";

// Seletor de cor no estilo do Excel: cores do tema (com tons), cores padrão
// e "Mais cores…" com o seletor personalizado (espectro, luminosidade, RGB e Hex).

const BASE_TEMA = [
  "#ffffff",
  "#000000",
  "#e7e6e6",
  "#19323b",
  "#1e5f74",
  "#ed7d31",
  "#1e7b34",
  "#0ea5e9",
  "#a02b93",
  "#4ea72e",
];

const CORES_PADRAO = [
  "#c00000",
  "#ff0000",
  "#ffc000",
  "#ffff00",
  "#92d050",
  "#00b050",
  "#00b0f0",
  "#0070c0",
  "#002060",
  "#7030a0",
];

type Rgb = { r: number; g: number; b: number };
type Hsl = { h: number; s: number; l: number };

function limitar(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

export function hexParaRgb(hex: string): Rgb {
  const limpo = hex.replace("#", "");
  const n = parseInt(limpo.length === 3 ? limpo.replace(/./g, "$&$&") : limpo, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function rgbParaHex({ r, g, b }: Rgb) {
  return `#${[r, g, b].map((v) => Math.round(limitar(v, 0, 255)).toString(16).padStart(2, "0")).join("")}`;
}

function rgbParaHsl({ r, g, b }: Rgb): Hsl {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l: l * 100 };
  const s = d / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === rn) h = ((gn - bn) / d) % 6;
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  return { h: (h * 60 + 360) % 360, s: s * 100, l: l * 100 };
}

function hslParaRgb({ h, s, l }: Hsl): Rgb {
  const sn = s / 100;
  const ln = l / 100;
  const c = (1 - Math.abs(2 * ln - 1)) * sn;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = ln - c / 2;
  const [r, g, b] =
    h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 };
}

function misturar(hex: string, alvo: number, proporcao: number) {
  const { r, g, b } = hexParaRgb(hex);
  return rgbParaHex({
    r: r + (alvo - r) * proporcao,
    g: g + (alvo - g) * proporcao,
    b: b + (alvo - b) * proporcao,
  });
}

// Cinco tons por coluna do tema: do mais claro ao mais escuro.
function tonsDoTema(base: string, indice: number): string[] {
  if (indice === 0) return [0.05, 0.15, 0.25, 0.35, 0.5].map((p) => misturar(base, 0, p));
  if (indice === 1) return [0.5, 0.35, 0.25, 0.15, 0.05].map((p) => misturar(base, 255, p));
  return [
    misturar(base, 255, 0.8),
    misturar(base, 255, 0.6),
    misturar(base, 255, 0.4),
    misturar(base, 0, 0.25),
    misturar(base, 0, 0.5),
  ];
}

const HEX_COMPLETO = /^#[0-9a-f]{6}$/i;

function Amostra({
  cor,
  atual,
  aoEscolher,
}: {
  cor: string;
  atual: string;
  aoEscolher: (cor: string) => void;
}) {
  const selecionada = cor.toLowerCase() === atual.toLowerCase();
  return (
    <button
      type="button"
      onClick={() => aoEscolher(cor)}
      aria-label={`Usar ${cor}`}
      title={cor.toUpperCase()}
      className={`h-[18px] w-[18px] border ${
        selecionada ? "border-2 border-accent" : "border-zinc-600 hover:border-white"
      }`}
      style={{ backgroundColor: cor }}
    />
  );
}

function Personalizar({
  inicial,
  aoConfirmar,
  aoCancelar,
}: {
  inicial: string;
  aoConfirmar: (cor: string) => void;
  aoCancelar: () => void;
}) {
  const gesto = usePointerDrag();
  const [hsl, setHsl] = useState<Hsl>(() => rgbParaHsl(hexParaRgb(inicial)));
  const [hexTexto, setHexTexto] = useState(inicial.toUpperCase());
  const rgb = hslParaRgb(hsl);
  const hex = rgbParaHex(rgb);

  function aplicar(proximo: Hsl) {
    setHsl(proximo);
    setHexTexto(rgbParaHex(hslParaRgb(proximo)).toUpperCase());
  }

  function arrastar(e: PointerEvent<HTMLDivElement>, aoMover: (x: number, y: number) => void) {
    const alvo = e.currentTarget;
    e.preventDefault();
    const mover = (ev: { clientX: number; clientY: number }) => {
      const caixa = alvo.getBoundingClientRect();
      aoMover(
        limitar((ev.clientX - caixa.left) / caixa.width, 0, 1),
        limitar((ev.clientY - caixa.top) / caixa.height, 0, 1),
      );
    };
    if (gesto.iniciar(e, { mover, concluir: () => {}, cancelar: () => {} })) mover(e);
  }

  function mudarCanal(canal: keyof Rgb, texto: string) {
    const valor = limitar(Math.round(Number(texto) || 0), 0, 255);
    aplicar(rgbParaHsl({ ...rgb, [canal]: valor }));
  }

  function mudarHex(texto: string) {
    const normalizado = `#${texto.replace(/[^0-9a-f]/gi, "").slice(0, 6)}`;
    setHexTexto(normalizado.toUpperCase());
    if (HEX_COMPLETO.test(normalizado)) setHsl(rgbParaHsl(hexParaRgb(normalizado)));
  }

  const entrada =
    "w-14 rounded border border-surface-border bg-zinc-950 px-1.5 py-1 text-center text-xs text-zinc-100 outline-none focus:border-accent";

  return (
    <div className="space-y-3">
      <p className="text-xs font-medium text-zinc-300">Cores personalizadas</p>
      <div className="flex gap-2">
        <div
          className="relative h-36 flex-1 cursor-crosshair touch-none rounded border border-zinc-600"
          style={{
            background:
              "linear-gradient(to bottom, rgba(128,128,128,0), #808080), linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)",
          }}
          onPointerDown={(e) =>
            arrastar(e, (x, y) => aplicar({ ...hsl, h: x * 360, s: (1 - y) * 100 }))
          }
          role="presentation"
        >
          <span
            className="pointer-events-none absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow"
            style={{ left: `${(hsl.h / 360) * 100}%`, top: `${100 - hsl.s}%` }}
          />
        </div>
        <div
          className="relative h-36 w-4 cursor-pointer touch-none rounded border border-zinc-600"
          style={{
            background: `linear-gradient(to bottom, #fff, hsl(${hsl.h} ${hsl.s}% 50%), #000)`,
          }}
          onPointerDown={(e) => arrastar(e, (_x, y) => aplicar({ ...hsl, l: (1 - y) * 100 }))}
          role="presentation"
        >
          <span
            className="pointer-events-none absolute -left-1 h-2 w-6 -translate-y-1/2 rounded-sm border border-white bg-zinc-900/60"
            style={{ top: `${100 - hsl.l}%` }}
          />
        </div>
      </div>

      <div className="flex items-end gap-3">
        <div className="grid grid-cols-[auto_auto] items-center gap-x-2 gap-y-1.5 text-xs text-secondary">
          <label htmlFor="seletor-r">Vermelho</label>
          <input
            id="seletor-r"
            type="number"
            min={0}
            max={255}
            value={Math.round(rgb.r)}
            onChange={(e) => mudarCanal("r", e.target.value)}
            className={entrada}
          />
          <label htmlFor="seletor-g">Verde</label>
          <input
            id="seletor-g"
            type="number"
            min={0}
            max={255}
            value={Math.round(rgb.g)}
            onChange={(e) => mudarCanal("g", e.target.value)}
            className={entrada}
          />
          <label htmlFor="seletor-b">Azul</label>
          <input
            id="seletor-b"
            type="number"
            min={0}
            max={255}
            value={Math.round(rgb.b)}
            onChange={(e) => mudarCanal("b", e.target.value)}
            className={entrada}
          />
          <label htmlFor="seletor-hex">Hex</label>
          <input
            id="seletor-hex"
            type="text"
            value={hexTexto}
            onChange={(e) => mudarHex(e.target.value)}
            className={`${entrada} w-20`}
          />
        </div>
        <div className="flex flex-1 flex-col items-center gap-1 text-[10px] text-secondary">
          <span>Nova</span>
          <div className="h-8 w-full rounded-t border border-zinc-600" style={{ backgroundColor: hex }} />
          <div className="-mt-1 h-8 w-full rounded-b border border-zinc-600" style={{ backgroundColor: inicial }} />
          <span>Atual</span>
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={aoCancelar}
          className="rounded-md border border-surface-border px-3 py-1 text-xs text-zinc-300 hover:bg-zinc-800"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={() => aoConfirmar(hex)}
          className="rounded-md bg-accent px-4 py-1 text-xs font-semibold text-accent-foreground hover:opacity-90"
        >
          OK
        </button>
      </div>
    </div>
  );
}

export function SeletorCor({
  value,
  onChange,
  rotulo = "Escolher cor",
  paletaExtra,
}: {
  value: string;
  onChange: (cor: string) => void;
  rotulo?: string;
  // Linha extra no topo, por exemplo as cores já usadas pelo sistema.
  paletaExtra?: { titulo: string; cores: string[] };
}) {
  const [aberto, setAberto] = useState(false);
  const [portalRoot, setPortalRoot] = useState<HTMLElement | null>(null);
  const [modo, setModo] = useState<"paleta" | "personalizar">("paleta");
  const [posicao, setPosicao] = useState({ left: 0, top: 0 });
  const botao = useRef<HTMLButtonElement>(null);
  const painel = useRef<HTMLDivElement>(null);

  function alternar() {
    setPortalRoot(botao.current?.closest("dialog") ?? document.body);
    setModo("paleta");
    setAberto((v) => !v);
  }

  useLayoutEffect(() => {
    if (!aberto || !botao.current) return;
    const caixa = botao.current.getBoundingClientRect();
    const altura = painel.current?.offsetHeight ?? 340;
    const largura = painel.current?.offsetWidth ?? 270;
    const top = limitar(caixa.bottom + 4, 8, Math.max(8, window.innerHeight - altura - 8));
    setPosicao({ left: limitar(caixa.left, 8, Math.max(8, window.innerWidth - largura - 8)), top });
  }, [aberto, modo]);

  useEffect(() => {
    if (!aberto) return;
    function fora(e: globalThis.PointerEvent) {
      const alvo = e.target as Node;
      if (painel.current?.contains(alvo) || botao.current?.contains(alvo)) return;
      setAberto(false);
    }
    function tecla(e: KeyboardEvent) {
      if (e.key === "Escape") setAberto(false);
    }
    document.addEventListener("pointerdown", fora);
    document.addEventListener("keydown", tecla);
    return () => {
      document.removeEventListener("pointerdown", fora);
      document.removeEventListener("keydown", tecla);
    };
  }, [aberto]);

  function escolher(cor: string) {
    onChange(cor);
    setAberto(false);
    botao.current?.focus();
  }

  const titulo = "mb-1 text-xs font-medium text-zinc-300";

  return (
    <>
      <button
        onKeyDown={event => { if (event.key === "Escape" && aberto) { event.preventDefault(); event.stopPropagation(); setAberto(false); } }}
        ref={botao}
        type="button"
        onClick={alternar}
        aria-haspopup="dialog"
        aria-expanded={aberto}
        aria-label={rotulo}
        title={rotulo}
        className="flex w-full items-center gap-2 rounded-md border border-surface-border px-2 py-1 text-zinc-300 hover:border-zinc-500"
      >
        <span className="h-4 w-6 rounded-sm border border-zinc-600" style={{ backgroundColor: value }} />
        <span className="flex-1 text-left text-[11px] uppercase text-secondary">{value}</span>
        <ChevronDown size={12} className="text-muted" />
      </button>

      {aberto && portalRoot &&
        createPortal(
          <div
            ref={painel}
            onKeyDown={event => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setAberto(false); botao.current?.focus(); } }}
            role="dialog"
            aria-label="Seletor de cores"
            style={{ position: "fixed", left: posicao.left, top: posicao.top }}
            className="z-[2000] w-64 rounded-lg border border-surface-border bg-zinc-900 p-3 shadow-2xl shadow-black/50"
          >
            {modo === "paleta" ? (
              <div>
                {paletaExtra && (
                  <>
                    <p className={titulo}>{paletaExtra.titulo}</p>
                    <div className="mb-3 flex flex-wrap gap-1">
                      {paletaExtra.cores.map((cor) => (
                        <Amostra key={cor} cor={cor} atual={value} aoEscolher={escolher} />
                      ))}
                    </div>
                  </>
                )}
                <p className={titulo}>Cores do tema</p>
                <div className="grid grid-cols-10 gap-1">
                  {BASE_TEMA.map((cor) => (
                    <Amostra key={cor} cor={cor} atual={value} aoEscolher={escolher} />
                  ))}
                </div>
                <div className="mb-3 mt-1 grid grid-cols-10 gap-1">
                  {[0, 1, 2, 3, 4].flatMap((linha) =>
                    BASE_TEMA.map((cor, coluna) => {
                      const tom = tonsDoTema(cor, coluna)[linha];
                      return <Amostra key={`${linha}-${coluna}`} cor={tom} atual={value} aoEscolher={escolher} />;
                    }),
                  )}
                </div>
                <p className={titulo}>Cores padrão</p>
                <div className="mb-3 grid grid-cols-10 gap-1">
                  {CORES_PADRAO.map((cor) => (
                    <Amostra key={cor} cor={cor} atual={value} aoEscolher={escolher} />
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => setModo("personalizar")}
                  className="flex w-full items-center gap-2 border-t border-surface-border pt-2 text-left text-xs text-zinc-300 hover:text-accent"
                >
                  <Palette size={13} /> Mais cores…
                </button>
              </div>
            ) : (
              <Personalizar inicial={value} aoConfirmar={escolher} aoCancelar={() => setModo("paleta")} />
            )}
          </div>,
          portalRoot,
        )}
    </>
  );
}
