"use client";

import { useRef, useState } from "react";
import { usePointerDrag } from "@/components/ui/use-pointer-drag";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { corTextoEtiqueta, medidasEtiqueta, novoId, tamanhoFonteAnotacao, type AnotacaoFoto, type FormaAnotacao } from "@/lib/relatorio-conteudo";

export const ROTULOS_FORMA: Record<FormaAnotacao, string> = {
  elipse: "Círculo",
  retangulo: "Retângulo",
  linha: "Linha",
  seta: "Seta",
  texto: "Texto",
  etiqueta: "Etiqueta",
};

export const CORES_ANOTACAO = [
  { cor: "#ef4444", rotulo: "Vermelho" },
  { cor: "#facc15", rotulo: "Amarelo" },
  { cor: "#22c55e", rotulo: "Verde" },
  { cor: "#3b82f6", rotulo: "Azul" },
  { cor: "#ffffff", rotulo: "Branco" },
  { cor: "#111827", rotulo: "Preto" },
];

export const ESPESSURAS_ANOTACAO = [
  { valor: 2, rotulo: "Fina" },
  { valor: 4, rotulo: "Média" },
  { valor: 7, rotulo: "Grossa" },
];

// Largura/altura do quadro da foto, conforme a proporção escolhida no bloco.
export function razaoDoQuadro(proporcao?: "paisagem" | "quadrada" | "retrato" | "panoramica"): number {
  return proporcao === "quadrada" ? 1 : proporcao === "retrato" ? 3 / 4 : proporcao === "panoramica" ? 21 / 9 : 16 / 9;
}

const limitar = (valor: number) => Math.min(100, Math.max(0, valor));

// Ponta da seta: triângulo no fim da linha, no tamanho proporcional à espessura.
function pontaDaSeta(x1: number, y1: number, x2: number, y2: number, tamanho: number): string {
  const angulo = Math.atan2(y2 - y1, x2 - x1);
  const abertura = Math.PI / 7;
  return [
    [x2, y2],
    [x2 - tamanho * Math.cos(angulo - abertura), y2 - tamanho * Math.sin(angulo - abertura)],
    [x2 - tamanho * Math.cos(angulo + abertura), y2 - tamanho * Math.sin(angulo + abertura)],
  ].map((ponto) => ponto.join(",")).join(" ");
}

function Forma({ a, razao, selecionada, aoSelecionar }: {
  a: AnotacaoFoto;
  razao: number;
  selecionada: boolean;
  aoSelecionar?: (id: string) => void;
}) {
  // O SVG tem a mesma proporção do quadro (altura 100, largura 100*razao), então
  // círculos continuam círculos e a ponta da seta não deforma.
  const x1 = a.x1 * razao, x2 = a.x2 * razao, y1 = a.y1, y2 = a.y2;
  const traco = { stroke: a.cor, strokeWidth: a.espessura, fill: "none", vectorEffect: "non-scaling-stroke" as const, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  const interacao = aoSelecionar
    ? { style: { pointerEvents: "all" as const, cursor: "pointer" }, onPointerDown: (e: React.PointerEvent) => { e.stopPropagation(); aoSelecionar(a.id); } }
    : {};
  const caixa = { x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1) };
  const etiqueta = a.forma === "etiqueta" ? medidasEtiqueta(a.texto ?? "", a.espessura) : null;
  return (
    <g {...interacao}>
      {a.forma === "elipse" && <ellipse cx={(x1 + x2) / 2} cy={(y1 + y2) / 2} rx={caixa.w / 2} ry={caixa.h / 2} {...traco} />}
      {a.forma === "retangulo" && <rect x={caixa.x} y={caixa.y} width={caixa.w} height={caixa.h} rx={0.6} {...traco} />}
      {(a.forma === "linha" || a.forma === "seta") && <line x1={x1} y1={y1} x2={x2} y2={y2} {...traco} />}
      {a.forma === "seta" && <polygon points={pontaDaSeta(x1, y1, x2, y2, 3 + a.espessura * 0.9)} fill={a.cor} stroke={a.cor} strokeWidth={1} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />}
      {a.forma === "texto" && (
        <text x={x1} y={y1} dominantBaseline="middle" fontSize={tamanhoFonteAnotacao(a.espessura)} fontWeight={700} fill={a.cor} stroke={a.cor === "#ffffff" ? "#111827" : "#ffffff"} strokeWidth={2.5} paintOrder="stroke" strokeLinejoin="round" vectorEffect="non-scaling-stroke">{a.texto}</text>
      )}
      {etiqueta && (
        <g>
          <rect x={x1} y={y1 - etiqueta.altura / 2} width={etiqueta.largura} height={etiqueta.altura} rx={etiqueta.altura * 0.22} fill={a.cor} stroke={corTextoEtiqueta(a.cor) === "#ffffff" ? "none" : "#11182733"} strokeWidth={1} vectorEffect="non-scaling-stroke" />
          <text x={x1 + etiqueta.folgaX} y={y1} dominantBaseline="central" fontSize={etiqueta.fonte} fontWeight={700} fill={corTextoEtiqueta(a.cor)}>{a.texto}</text>
        </g>
      )}
      {selecionada && <rect x={caixa.x - 1.5} y={etiqueta ? y1 - etiqueta.altura / 2 - 1 : caixa.y - 2} width={etiqueta ? etiqueta.largura + 3 : caixa.w + 3} height={etiqueta ? etiqueta.altura + 2 : a.forma === "texto" ? 6 : caixa.h + 4} fill="none" stroke="#00dc4d" strokeWidth={1.5} strokeDasharray="4 3" vectorEffect="non-scaling-stroke" pointerEvents="none" />}
    </g>
  );
}

// Marcações sobre a foto, desenhadas por cima do quadro (não seguem o zoom da foto).
export function AnotacoesFotoSvg({ anotacoes, razao, selecionadaId, aoSelecionar }: {
  anotacoes: AnotacaoFoto[];
  razao: number;
  selecionadaId?: string | null;
  aoSelecionar?: (id: string) => void;
}) {
  if (anotacoes.length === 0) return null;
  return (
    <svg viewBox={`0 0 ${100 * razao} 100`} className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true">
      {anotacoes.map((a) => <Forma key={a.id} a={a} razao={razao} selecionada={a.id === selecionadaId} aoSelecionar={aoSelecionar} />)}
    </svg>
  );
}

// Camada do editor: com uma forma escolhida, arrastar sobre a foto desenha; sem
// forma, clicar numa marcação a seleciona (para trocar cor, espessura ou apagar).
export function CamadaAnotar({ anotacoes, razao, ferramenta, cor, espessura, selecionadaId, aoSelecionar, aoCriar }: {
  anotacoes: AnotacaoFoto[];
  razao: number;
  ferramenta: FormaAnotacao | null;
  cor: string;
  espessura: number;
  selecionadaId: string | null;
  aoSelecionar: (id: string | null) => void;
  aoCriar: (anotacao: AnotacaoFoto) => void;
}) {
  const { perguntar } = useConfirm();
  const quadro = useRef<HTMLDivElement>(null);
  const [rascunho, setRascunho] = useState<AnotacaoFoto | null>(null);
  const ativo = useRef<AnotacaoFoto | null>(null);
  const gesto = usePointerDrag();

  function ponto(e: { clientX: number; clientY: number }) {
    const area = quadro.current!.getBoundingClientRect();
    return { x: limitar(((e.clientX - area.left) / area.width) * 100), y: limitar(((e.clientY - area.top) / area.height) * 100) };
  }

  function aoPressionar(e: React.PointerEvent<HTMLDivElement>) {
    if (!ferramenta) return;
    e.preventDefault();
    e.stopPropagation();
    const p = ponto(e);
    const iniciado = gesto.iniciar(e, {
      mover: aoArrastar,
      concluir: () => { void aoSoltar(); },
      cancelar: () => { ativo.current = null; setRascunho(null); },
    });
    if (iniciado) {
      ativo.current = { id: novoId(), forma: ferramenta, x1: p.x, y1: p.y, x2: p.x, y2: p.y, cor, espessura, texto: null };
      setRascunho(ativo.current);
    }
  }

  function aoArrastar(e: { clientX: number; clientY: number }) {
    if (!ativo.current) return;
    const p = ponto(e);
    ativo.current = { ...ativo.current, x2: p.x, y2: p.y };
    setRascunho(ativo.current);
  }

  async function aoSoltar() {
    if (!ativo.current) return;
    const final = ativo.current;
    ativo.current = null;
    setRascunho(null);
    if (final.forma === "texto" || final.forma === "etiqueta") {
      const texto = (await perguntar({ mensagem: final.forma === "etiqueta" ? "Texto da etiqueta:" : "Texto da anotação:", confirmarLabel: "Colocar" }))?.trim();
      if (texto) aoCriar({ ...final, x2: final.x1, y2: final.y1, texto });
      return;
    }
    // Clique sem arrastar não cria forma.
    if (Math.hypot((final.x2 - final.x1) * razao, final.y2 - final.y1) > 2) aoCriar(final);
  }

  const todas = rascunho ? [...anotacoes, rascunho] : anotacoes;
  return (
    <div
      ref={quadro}
      onPointerDown={aoPressionar}
      onClick={(e) => { if (ferramenta) e.stopPropagation(); }}
      className="absolute inset-0 z-10"
      style={{ pointerEvents: ferramenta ? "auto" : "none", cursor: ferramenta ? "crosshair" : "default", touchAction: ferramenta ? "none" : "auto" }}
    >
      <AnotacoesFotoSvg anotacoes={todas} razao={razao} selecionadaId={selecionadaId} aoSelecionar={ferramenta ? undefined : (id) => aoSelecionar(id)} />
    </div>
  );
}
