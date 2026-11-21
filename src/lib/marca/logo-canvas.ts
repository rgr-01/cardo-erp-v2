// Desenha a logo (mesmos vetores de logo-paths.ts) num CanvasRenderingContext2D
// — equivalente de desenharLogo em lib/marca/pdf.ts, mas pra imagens PNG
// (canvas 2d, y cresce pra baixo) em vez de PDF (pdf-lib, y cresce pra cima).
// Os paths em logo-paths.ts já estão em coordenadas "y pra baixo" (ver
// comentário lá), então aqui não precisa inverter nada — só escalar/posicionar.
import type { CanvasRenderingContext2D } from "canvas";
import { LOGO_HORIZONTAL, LOGO_EMPILHADA } from "@/lib/marca/logo-paths";

const MARCA_AZUL_HEX = "#19323b";
const MARCA_VERDE_HEX = "#00dc4d";

type ComandoSvg = "M" | "L" | "C";

// Os paths exportados do manual só usam M/L/C, sempre com o comando explícito
// em cada ponto (sem repetição implícita) — parser fica bem simples.
function segmentosDoPath(d: string): { cmd: ComandoSvg; pts: number[] }[] {
  const tokens = d.match(/[MLC]|-?\d+\.?\d*/g) ?? [];
  const nArgs: Record<ComandoSvg, number> = { M: 2, L: 2, C: 6 };
  const out: { cmd: ComandoSvg; pts: number[] }[] = [];
  let i = 0;
  let atual: ComandoSvg = "M";
  while (i < tokens.length) {
    const tok = tokens[i];
    if (tok === "M" || tok === "L" || tok === "C") {
      atual = tok;
      i++;
    }
    const n = nArgs[atual];
    const pts = tokens.slice(i, i + n).map(Number);
    if (pts.length < n) break;
    out.push({ cmd: atual, pts });
    i += n;
  }
  return out;
}

// Um "parte" pode ter vários subpaths (M...M...) — igual SVG, desenha todos
// antes de um fill só, pra furos (ex.: o miolo do símbolo) saírem certos.
function desenharPathSvg(ctx: CanvasRenderingContext2D, d: string) {
  ctx.beginPath();
  for (const seg of segmentosDoPath(d)) {
    if (seg.cmd === "M") ctx.moveTo(seg.pts[0], seg.pts[1]);
    else if (seg.cmd === "L") ctx.lineTo(seg.pts[0], seg.pts[1]);
    else ctx.bezierCurveTo(seg.pts[0], seg.pts[1], seg.pts[2], seg.pts[3], seg.pts[4], seg.pts[5]);
  }
  ctx.closePath();
  ctx.fill();
}

export interface OpcoesLogoCanvas {
  x: number;
  /** Topo da logo (canvas 2D: y cresce pra baixo). */
  yTopo: number;
  altura: number;
  variante?: "horizontal" | "empilhada";
  /** Cor das partes que não são o símbolo verde. Default MARCA_AZUL. */
  corTexto?: string;
}

export function desenharLogoCanvas(ctx: CanvasRenderingContext2D, opts: OpcoesLogoCanvas) {
  const logo = opts.variante === "horizontal" ? LOGO_HORIZONTAL : LOGO_EMPILHADA;
  const escala = opts.altura / logo.altura;
  ctx.save();
  ctx.translate(opts.x, opts.yTopo);
  ctx.scale(escala, escala);
  for (const parte of logo.partes) {
    ctx.fillStyle = parte.verde ? MARCA_VERDE_HEX : (opts.corTexto ?? MARCA_AZUL_HEX);
    desenharPathSvg(ctx, parte.d);
  }
  ctx.restore();
}

export function larguraLogoCanvas(altura: number, variante: "horizontal" | "empilhada" = "empilhada"): number {
  const logo = variante === "horizontal" ? LOGO_HORIZONTAL : LOGO_EMPILHADA;
  return (logo.largura * altura) / logo.altura;
}
