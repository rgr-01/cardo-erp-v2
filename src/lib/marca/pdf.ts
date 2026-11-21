// Identidade da marca nos PDFs gerados no servidor (pdf-lib): fontes Space
// Grotesk embutidas, logo em vetor (drawSvgPath — nítida em qualquer zoom) e
// as duas cores do manual.

import { readFile } from "node:fs/promises";
import path from "node:path";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, PDFFont, PDFImage, PDFPage, rgb, type RGB } from "pdf-lib";
import { LOGO_EMPILHADA, LOGO_HORIZONTAL } from "@/lib/marca/logo-paths";

export const MARCA_AZUL = rgb(25 / 255, 50 / 255, 59 / 255); // #19323b
export const MARCA_VERDE = rgb(0, 220 / 255, 77 / 255); // #00DC4D

const PASTA_FONTES = path.join(process.cwd(), "assets", "fonts");
let fontesEmCache: Promise<{ regular: Buffer; medio: Buffer; bold: Buffer }> | null = null;

function lerFontes() {
  fontesEmCache ??= Promise.all([
    readFile(path.join(PASTA_FONTES, "SpaceGrotesk-Regular.ttf")),
    readFile(path.join(PASTA_FONTES, "SpaceGrotesk-Medium.ttf")),
    readFile(path.join(PASTA_FONTES, "SpaceGrotesk-Bold.ttf")),
  ]).then(([regular, medio, bold]) => ({ regular, medio, bold }));
  return fontesEmCache;
}

export type FontesMarca = { regular: PDFFont; medio: PDFFont; bold: PDFFont };

// Fontes que o usuário escolhe nos blocos de texto (ver FONTES_TEXTO): arquivos
// estáticos regular/negrito em assets/fonts. "padrao" usa a Space Grotesk.
const ARQUIVOS_FONTE_TEXTO: Record<string, string> = {
  inter: "inter", roboto: "roboto", montserrat: "montserrat", merriweather: "merriweather", lora: "lora",
};
const bytesFonteTexto = new Map<string, Promise<[Buffer, Buffer]>>();

export async function embutirFonteTexto(pdfDoc: PDFDocument, id: string): Promise<{ regular: PDFFont; bold: PDFFont } | null> {
  const base = ARQUIVOS_FONTE_TEXTO[id];
  if (!base) return null;
  pdfDoc.registerFontkit(fontkit);
  if (!bytesFonteTexto.has(base)) {
    bytesFonteTexto.set(base, Promise.all([
      readFile(path.join(PASTA_FONTES, `${base}-400.ttf`)),
      readFile(path.join(PASTA_FONTES, `${base}-700.ttf`)),
    ]));
  }
  try {
    const [regular, bold] = await bytesFonteTexto.get(base)!;
    return { regular: await pdfDoc.embedFont(regular, { subset: true }), bold: await pdfDoc.embedFont(bold, { subset: true }) };
  } catch (error) {
    console.warn("[PDF] Fonte do bloco indisponível:", id, error);
    return null;
  }
}

export async function embutirFontesMarca(pdfDoc: PDFDocument): Promise<FontesMarca> {
  pdfDoc.registerFontkit(fontkit);
  const bytes = await lerFontes();
  const [regular, medio, bold] = await Promise.all([
    pdfDoc.embedFont(bytes.regular, { subset: true }),
    pdfDoc.embedFont(bytes.medio, { subset: true }),
    pdfDoc.embedFont(bytes.bold, { subset: true }),
  ]);
  return { regular, medio, bold };
}

type OpcoesLogo = {
  x: number;
  /** Topo da logo (coordenada pdf-lib, medida a partir da base da página). */
  yTopo: number;
  altura: number;
  /** "claro" = texto azul da marca; "escuro" = texto branco. */
  fundo?: "claro" | "escuro";
  variante?: "horizontal" | "empilhada";
  /** Força uma cor única (ex.: marca d'água). */
  cor?: RGB;
  opacidade?: number;
  /** Desenha só o símbolo (as partes verdes). */
  soSimbolo?: boolean;
};

export function larguraLogo(altura: number, variante: "horizontal" | "empilhada" = "horizontal") {
  const logo = variante === "empilhada" ? LOGO_EMPILHADA : LOGO_HORIZONTAL;
  return (logo.largura * altura) / logo.altura;
}

// Logo da empresa (imagem enviada em Configurações) registrada por documento;
// sem registro vale o vetor da Rede Agro (logo-paths). `null` = empresa sem
// logo: não desenha nada.
type LogosEmpresa = { claro: PDFImage | null; escuro: PDFImage | null } | null;
const logosPorDocumento = new WeakMap<PDFDocument, LogosEmpresa>();

export function registrarLogoEmpresa(pdf: PDFDocument, logos: LogosEmpresa) {
  logosPorDocumento.set(pdf, logos);
}

export function desenharLogo(page: PDFPage, opts: OpcoesLogo) {
  if (logosPorDocumento.has(page.doc)) {
    const logos = logosPorDocumento.get(page.doc);
    const imagem = opts.fundo === "escuro" ? (logos?.escuro ?? logos?.claro) : (logos?.claro ?? logos?.escuro);
    if (!imagem || opts.soSimbolo) return;
    const largura = (imagem.width / imagem.height) * opts.altura;
    page.drawImage(imagem, { x: opts.x, y: opts.yTopo - opts.altura, width: largura, height: opts.altura, opacity: opts.opacidade });
    return;
  }
  const logo = opts.variante === "empilhada" ? LOGO_EMPILHADA : LOGO_HORIZONTAL;
  const escala = opts.altura / logo.altura;
  const corTexto = opts.fundo === "escuro" ? rgb(1, 1, 1) : MARCA_AZUL;
  for (const parte of logo.partes) {
    if (opts.soSimbolo && !parte.verde) continue;
    page.drawSvgPath(parte.d, {
      x: opts.x,
      y: opts.yTopo,
      scale: escala,
      color: opts.cor ?? (parte.verde ? MARCA_VERDE : corTexto),
      opacity: opts.opacidade,
      borderWidth: 0,
    });
  }
}

/** Proporção largura/altura do símbolo sozinho (parte verde da logo). */
export const SIMBOLO_PROPORCAO = 19.68 / LOGO_HORIZONTAL.altura;
