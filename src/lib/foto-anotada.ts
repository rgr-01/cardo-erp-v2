// Marcações na foto do relatório feitas pelo bot (ver marcar_foto_relatorio em
// lib/whatsapp/ferramentas.ts): o modelo de visão acha na foto o que o consultor
// pediu ("circula a ferrugem e escreve 'ferrugem asiática'") e devolve as formas
// em % da IMAGEM. Aqui elas são convertidas pro quadro da foto no relatório (que
// recorta, foca e dá zoom — as marcações ficam em % do QUADRO, ver AnotacaoFoto)
// e desenhadas numa prévia em JPEG pra conferir no WhatsApp.
import { createCanvas, loadImage, type Image } from "canvas";
import {
  corTextoEtiqueta,
  medidasEtiqueta,
  novoId,
  tamanhoFonteAnotacao,
  type AnotacaoFoto,
  type BlocoFoto,
  type FormaAnotacao,
} from "@/lib/relatorio-conteudo";

// Mesma conta de razaoDoQuadro (components/visitas/anotacoes-foto.tsx), que é
// módulo de cliente e não pode ser chamado daqui.
function razaoDoQuadro(proporcao?: BlocoFoto["proporcao"]): number {
  return proporcao === "quadrada" ? 1 : proporcao === "retrato" ? 3 / 4 : proporcao === "panoramica" ? 21 / 9 : 16 / 9;
}

const OPENAI_URL = "https://api.openai.com/v1/responses";

export const CORES_MARCACAO = {
  vermelho: "#ef4444",
  amarelo: "#facc15",
  verde: "#22c55e",
  azul: "#3b82f6",
  branco: "#ffffff",
  preto: "#111827",
} as const;
export type NomeCor = keyof typeof CORES_MARCACAO;

// Marcação como o modelo fala dela: posições em % da imagem inteira.
export type MarcacaoImagem = {
  forma: FormaAnotacao;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  cor: NomeCor;
  espessura: "fina" | "media" | "grossa";
  texto: string | null;
};

const ESPESSURA = { fina: 2, media: 4, grossa: 7 } as const;

const limitar = (valor: number, min = 0, max = 100) => Math.min(max, Math.max(min, valor));

// ---------------------------------------------------------------------------
// Imagem ↔ quadro

type Enquadramento = { razaoQuadro: number; dispW: number; dispH: number; offX: number; offY: number; fx: number; fy: number; zoom: number };

// Mesma conta do object-fit/object-position + transform: scale() da página
// (blocos-render.tsx), em frações do quadro (0–1).
function enquadramento(larguraImg: number, alturaImg: number, bloco: Pick<BlocoFoto, "proporcao" | "ajuste" | "focoX" | "focoY" | "zoom">): Enquadramento {
  const razaoQuadro = razaoDoQuadro(bloco.proporcao);
  const razaoImg = larguraImg / alturaImg;
  const cobrir = bloco.ajuste !== "conter";
  const maisLarga = razaoImg > razaoQuadro;
  const [dispW, dispH] = maisLarga === cobrir ? [razaoImg / razaoQuadro, 1] : [1, razaoQuadro / razaoImg];
  const fx = (bloco.focoX ?? 50) / 100;
  const fy = (bloco.focoY ?? 50) / 100;
  return { razaoQuadro, dispW, dispH, offX: (1 - dispW) * fx, offY: (1 - dispH) * fy, fx, fy, zoom: bloco.zoom ?? 1 };
}

function imagemParaQuadro(e: Enquadramento, x: number, y: number) {
  return {
    x: (e.fx + (e.offX + (x / 100) * e.dispW - e.fx) * e.zoom) * 100,
    y: (e.fy + (e.offY + (y / 100) * e.dispH - e.fy) * e.zoom) * 100,
  };
}

function quadroParaImagem(e: Enquadramento, x: number, y: number) {
  return {
    x: (((x / 100 - e.fx) / e.zoom + e.fx - e.offX) / e.dispW) * 100,
    y: (((y / 100 - e.fy) / e.zoom + e.fy - e.offY) / e.dispH) * 100,
  };
}

const arred = (v: number) => Math.round(v * 10) / 10;

export function marcacoesParaQuadro(
  marcacoes: MarcacaoImagem[],
  larguraImg: number,
  alturaImg: number,
  bloco: BlocoFoto
): { anotacoes: AnotacaoFoto[]; cortadas: number } {
  const e = enquadramento(larguraImg, alturaImg, bloco);
  let cortadas = 0;
  const anotacoes = marcacoes.map((m): AnotacaoFoto => {
    const p1 = imagemParaQuadro(e, m.x1, m.y1);
    const p2 = imagemParaQuadro(e, m.x2, m.y2);
    if ([p1.x, p1.y, p2.x, p2.y].some((v) => v < -2 || v > 102)) cortadas++;
    const espessura = ESPESSURA[m.espessura] ?? 4;
    let x1 = limitar(p1.x), y1 = limitar(p1.y);
    const texto = m.texto?.trim().slice(0, 120) || null;
    if ((m.forma === "etiqueta" || m.forma === "texto") && texto) {
      // Etiqueta inteira dentro do quadro: empurra pra esquerda/baixo se estourar.
      const { largura, altura } = medidasEtiqueta(texto, espessura);
      const larguraPct = largura / e.razaoQuadro;
      x1 = limitar(x1, 0, Math.max(0, 100 - larguraPct - 0.5));
      y1 = limitar(y1, altura / 2 + 0.5, 100 - altura / 2 - 0.5);
      return { id: novoId(), forma: m.forma, x1: arred(x1), y1: arred(y1), x2: arred(x1), y2: arred(y1), cor: CORES_MARCACAO[m.cor] ?? CORES_MARCACAO.vermelho, espessura, texto };
    }
    return {
      id: novoId(), forma: m.forma,
      x1: arred(x1), y1: arred(y1), x2: arred(limitar(p2.x)), y2: arred(limitar(p2.y)),
      cor: CORES_MARCACAO[m.cor] ?? CORES_MARCACAO.vermelho, espessura, texto: null,
    };
  });
  return { anotacoes, cortadas };
}

const NOME_DA_COR = Object.fromEntries(Object.entries(CORES_MARCACAO).map(([nome, hex]) => [hex, nome])) as Record<string, NomeCor>;
const NOME_DA_ESPESSURA = (v: number): MarcacaoImagem["espessura"] => (v <= 2 ? "fina" : v >= 7 ? "grossa" : "media");

// Volta pro jeito que o modelo fala (% da imagem) — pra ele poder ajustar
// ("mais pra esquerda", "troca pra amarelo") devolvendo a lista inteira.
export function anotacoesParaImagem(anotacoes: AnotacaoFoto[], larguraImg: number, alturaImg: number, bloco: BlocoFoto): MarcacaoImagem[] {
  const e = enquadramento(larguraImg, alturaImg, bloco);
  return anotacoes.map((a) => {
    const p1 = quadroParaImagem(e, a.x1, a.y1);
    const p2 = quadroParaImagem(e, a.x2, a.y2);
    return {
      forma: a.forma, x1: arred(p1.x), y1: arred(p1.y), x2: arred(p2.x), y2: arred(p2.y),
      cor: NOME_DA_COR[a.cor.toLowerCase()] ?? "vermelho", espessura: NOME_DA_ESPESSURA(a.espessura), texto: a.texto ?? null,
    };
  });
}

// ---------------------------------------------------------------------------
// Visão: achar na foto o que foi pedido

// Grade com rótulos a cada 10% por cima da foto: o modelo erra bem menos a
// posição quando tem régua pra ler do que estimando no olho.
function fotoComGrade(img: Image): Buffer {
  const escala = Math.min(1, 1600 / Math.max(img.width, img.height));
  const w = Math.round(img.width * escala), h = Math.round(img.height * escala);
  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0, w, h);
  const fonte = Math.max(12, Math.round(Math.min(w, h) / 45));
  ctx.font = `bold ${fonte}px sans-serif`;
  for (let i = 1; i < 10; i++) {
    const x = (w * i) / 10, y = (h * i) / 10;
    ctx.strokeStyle = "rgba(255,255,255,0.55)";
    ctx.lineWidth = 1;
    ctx.setLineDash([6, 6]);
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    ctx.setLineDash([]);
    for (const [rotulo, rx, ry] of [[`${i * 10}`, x + 3, fonte + 2], [`${i * 10}`, 3, y - 4]] as const) {
      ctx.lineWidth = 3; ctx.strokeStyle = "#000"; ctx.strokeText(rotulo, rx, ry);
      ctx.fillStyle = "#fff"; ctx.fillText(rotulo, rx, ry);
    }
  }
  return canvas.toBuffer("image/jpeg", { quality: 0.85 });
}

const MARCAR_TOOL = {
  type: "function",
  name: "marcar_foto",
  description: "Devolve as marcações a desenhar sobre a foto, em % da imagem inteira (0 = esquerda/topo, 100 = direita/base), lidas pela grade.",
  parameters: {
    type: "object",
    properties: {
      encontrou: { type: "boolean", description: "false se o que foi pedido não aparece na foto com clareza." },
      observacao: { type: ["string", "null"], description: "Curta, em português: o que foi marcado e onde, ou por que não deu." },
      marcacoes: {
        type: "array",
        items: {
          type: "object",
          properties: {
            forma: { type: "string", enum: ["elipse", "retangulo", "seta", "linha", "texto", "etiqueta"] },
            x1: { type: "number" }, y1: { type: "number" }, x2: { type: "number" }, y2: { type: "number" },
            cor: { type: "string", enum: Object.keys(CORES_MARCACAO) },
            espessura: { type: "string", enum: ["fina", "media", "grossa"] },
            texto: { type: ["string", "null"] },
          },
          required: ["forma", "x1", "y1", "x2", "y2", "cor", "espessura", "texto"],
          additionalProperties: false,
        },
      },
    },
    required: ["encontrou", "observacao", "marcacoes"],
    additionalProperties: false,
  },
};

const INSTRUCOES_MARCAR = [
  "Você marca fotos de campo (lavouras, folhas, pragas, doenças, ensaios) pra um relatório agronômico.",
  "A foto tem uma grade pontilhada com rótulos a cada 10% (no topo: posição horizontal; à esquerda: vertical). A grade NÃO faz parte da foto; use só pra medir.",
  "Coordenadas em % da imagem inteira. elipse/retangulo: (x1,y1) canto superior esquerdo e (x2,y2) inferior direito da caixa, com uma folga pequena em volta do alvo. seta/linha: de (x1,y1) até (x2,y2) — a ponta da seta é (x2,y2) e deve encostar no alvo, começando de uma área livre. texto/etiqueta: (x1,y1) é a borda ESQUERDA no meio da altura; x2=x1, y2=y1.",
  "'etiqueta' é texto em destaque sobre uma tarja colorida — use quando pedirem texto destacado, rótulo, tarja ou título na foto. 'texto' é só texto com contorno. Ponha o texto perto do alvo, em área que não cubra o que está sendo mostrado, e deixe espaço à direita pra ele caber.",
  "Escreva o texto exatamente como pedido (pode corrigir só acentuação/maiúsculas). Não invente diagnóstico: se pedirem 'circula a doença' e não der pra ver nada, encontrou=false.",
  "Cor padrão: vermelho pra problema (doença, praga, dano), amarelo pra atenção, verde pra resultado bom; respeite a cor se pedirem. Etiqueta: prefira vermelho, verde, azul ou preto. Espessura padrão: media.",
  "Várias ocorrências pedidas ('circula todas as lesões') → uma forma pra cada, no máximo 12.",
].join("\n");

// referencia: a mesma foto rabiscada à mão pelo consultor (lápis do WhatsApp)
// — as marcas dela viram marcações limpas na foto do relatório.
export async function localizarNaFoto(
  buffer: Buffer,
  instrucao: string,
  referencia?: Buffer
): Promise<{ encontrou: boolean; observacao: string | null; marcacoes: MarcacaoImagem[]; largura: number; altura: number }> {
  const img = await loadImage(buffer);
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY não configurada.");
  const modelo = process.env.OPENAI_MODEL_VISION || process.env.OPENAI_MODEL || "gpt-4.1-mini";

  const resp = await fetch(OPENAI_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: modelo,
      instructions: INSTRUCOES_MARCAR,
      input: [{
        role: "user",
        content: [
          { type: "input_text", text: `Pedido do consultor: ${instrucao}` },
          { type: "input_image", image_url: `data:image/jpeg;base64,${fotoComGrade(img).toString("base64")}`, detail: "high" },
          ...(referencia
            ? [
                { type: "input_text", text: "REFERÊNCIA: a mesma foto (pode estar recortada/enquadrada diferente) com marcas feitas à mão pelo consultor. Ache na foto com grade o mesmo lugar de cada marca e reproduza como forma limpa (círculo à mão → elipse, seta → seta, texto escrito → etiqueta com o mesmo texto). As coordenadas são da foto COM GRADE, não da referência." },
                { type: "input_image", image_url: `data:image/jpeg;base64,${referencia.toString("base64")}`, detail: "high" },
              ]
            : []),
        ],
      }],
      tools: [MARCAR_TOOL],
      tool_choice: { type: "function", name: "marcar_foto" },
    }),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(`A IA não conseguiu analisar a foto (${resp.status}).`);
  const chamada = (data.output ?? []).find((item: { type?: string }) => item.type === "function_call");
  const args = JSON.parse(chamada?.arguments ?? "{}");
  const marcacoes = (Array.isArray(args.marcacoes) ? args.marcacoes : [])
    .slice(0, 12)
    .map((m: MarcacaoImagem) => ({ ...m, x1: limitar(Number(m.x1)), y1: limitar(Number(m.y1)), x2: limitar(Number(m.x2)), y2: limitar(Number(m.y2)) }));
  return { encontrou: Boolean(args.encontrou), observacao: args.observacao ?? null, marcacoes, largura: img.width, altura: img.height };
}

export async function dimensoesImagem(buffer: Buffer): Promise<{ largura: number; altura: number }> {
  const img = await loadImage(buffer);
  return { largura: img.width, altura: img.height };
}

// ---------------------------------------------------------------------------
// Prévia: o quadro como sai no relatório, com as marcações

const LARGURA_PREVIA = 1280;
// O SVG da página usa traço sem escala (vectorEffect); o quadro tem uns 640px
// na tela, então a prévia engrossa na mesma proporção.
const ESCALA_TRACO = LARGURA_PREVIA / 640;

export async function desenharPrevia(buffer: Buffer, bloco: BlocoFoto): Promise<Buffer> {
  const img = await loadImage(buffer);
  const e = enquadramento(img.width, img.height, bloco);
  const W = LARGURA_PREVIA, H = Math.round(LARGURA_PREVIA / e.razaoQuadro);
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);

  const p0 = imagemParaQuadro(e, 0, 0), p1 = imagemParaQuadro(e, 100, 100);
  ctx.drawImage(img, (p0.x / 100) * W, (p0.y / 100) * H, ((p1.x - p0.x) / 100) * W, ((p1.y - p0.y) / 100) * H);

  // Unidades do quadro: altura 100, largura 100*razão (como o viewBox do SVG).
  const u = H / 100;
  const X = (pct: number) => (pct / 100) * W;
  const Y = (pct: number) => (pct / 100) * H;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const a of bloco.anotacoes ?? []) {
    ctx.strokeStyle = a.cor;
    ctx.fillStyle = a.cor;
    ctx.lineWidth = a.espessura * ESCALA_TRACO;
    const [x1, y1, x2, y2] = [X(a.x1), Y(a.y1), X(a.x2), Y(a.y2)];
    if (a.forma === "elipse") {
      ctx.beginPath();
      ctx.ellipse((x1 + x2) / 2, (y1 + y2) / 2, Math.abs(x2 - x1) / 2, Math.abs(y2 - y1) / 2, 0, 0, Math.PI * 2);
      ctx.stroke();
    } else if (a.forma === "retangulo") {
      ctx.strokeRect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1));
    } else if (a.forma === "linha" || a.forma === "seta") {
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      if (a.forma === "seta") {
        const tamanho = (3 + a.espessura * 0.9) * u;
        const ang = Math.atan2(y2 - y1, x2 - x1), ab = Math.PI / 7;
        ctx.beginPath();
        ctx.moveTo(x2, y2);
        ctx.lineTo(x2 - tamanho * Math.cos(ang - ab), y2 - tamanho * Math.sin(ang - ab));
        ctx.lineTo(x2 - tamanho * Math.cos(ang + ab), y2 - tamanho * Math.sin(ang + ab));
        ctx.closePath(); ctx.fill();
      }
    } else if (a.forma === "texto" && a.texto) {
      ctx.font = `bold ${tamanhoFonteAnotacao(a.espessura) * u}px sans-serif`;
      ctx.textBaseline = "middle";
      ctx.lineWidth = 2.5 * ESCALA_TRACO;
      ctx.strokeStyle = a.cor === "#ffffff" ? "#111827" : "#ffffff";
      ctx.strokeText(a.texto, x1, y1);
      ctx.fillText(a.texto, x1, y1);
    } else if (a.forma === "etiqueta" && a.texto) {
      const m = medidasEtiqueta(a.texto, a.espessura);
      const [w, h, r] = [m.largura * u, m.altura * u, m.altura * u * 0.22];
      const topo = y1 - h / 2;
      ctx.beginPath();
      ctx.moveTo(x1 + r, topo);
      ctx.arcTo(x1 + w, topo, x1 + w, topo + h, r);
      ctx.arcTo(x1 + w, topo + h, x1, topo + h, r);
      ctx.arcTo(x1, topo + h, x1, topo, r);
      ctx.arcTo(x1, topo, x1 + w, topo, r);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = corTextoEtiqueta(a.cor);
      ctx.font = `bold ${m.fonte * u}px sans-serif`;
      ctx.textBaseline = "middle";
      ctx.fillText(a.texto, x1 + m.folgaX * u, y1);
    }
  }
  return canvas.toBuffer("image/jpeg", { quality: 0.88 });
}
