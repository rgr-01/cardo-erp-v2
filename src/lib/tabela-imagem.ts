// Tabela genérica em PNG, pra mandar como foto no WhatsApp em vez de um bloco
// de texto monoespaçado — usada quando a listagem (produtos por fornecedor,
// catálogo etc.) fica grande demais pra ler rolando texto (ver buscar_produtos
// e listar_produtos_por_fornecedor em lib/whatsapp/ferramentas.ts). Mesma
// identidade visual dos PDFs (ver lib/marca/pdf.ts): fonte Space Grotesk e as
// duas cores do manual da marca.
import { createCanvas, registerFont } from "canvas";
import path from "node:path";
import { desenharLogoCanvas, larguraLogoCanvas } from "@/lib/marca/logo-canvas";

const PASTA_FONTES = path.join(process.cwd(), "assets", "fonts");
const FAMILIA_FONTE = "Space Grotesk WhatsApp"; // nome só interno, evita colidir com fonte de sistema homônima

let fontesRegistradas = false;
function garantirFontesMarca() {
  if (fontesRegistradas) return;
  registerFont(path.join(PASTA_FONTES, "SpaceGrotesk-Regular.ttf"), { family: FAMILIA_FONTE, weight: "normal" });
  registerFont(path.join(PASTA_FONTES, "SpaceGrotesk-Bold.ttf"), { family: FAMILIA_FONTE, weight: "bold" });
  fontesRegistradas = true;
}

// Mesmos valores de MARCA_AZUL/MARCA_VERDE em lib/marca/pdf.ts (lá em RGB
// 0–1 pra pdf-lib; aqui em hex, formato que o canvas 2D espera).
const MARCA_AZUL = "#19323b";
const MARCA_VERDE = "#00dc4d";

export interface ColunaTabelaImagem {
  titulo: string;
  alinhamento?: "esquerda" | "direita";
}

export interface OpcoesTabelaImagem {
  titulo: string;
  subtitulo?: string;
  colunas: ColunaTabelaImagem[];
  linhas: string[][];
}

const FONTE_TITULO = `bold 24px "${FAMILIA_FONTE}"`;
const FONTE_SUBTITULO = `14px "${FAMILIA_FONTE}"`;
const FONTE_CABECALHO = `bold 14px "${FAMILIA_FONTE}"`;
const FONTE_CELULA = `14px "${FAMILIA_FONTE}"`;
const PADDING_CELULA = 14;
const LARGURA_MIN_COLUNA = 70;
const LARGURA_MAX_COLUNA = 340;

export function gerarImagemTabela(opcoes: OpcoesTabelaImagem): Buffer {
  garantirFontesMarca();
  const { titulo, subtitulo, colunas, linhas } = opcoes;

  // Canvas descartável só pra medir texto antes de saber a largura final.
  const medidor = createCanvas(10, 10).getContext("2d");
  const largurasColunas = colunas.map((col, i) => {
    medidor.font = FONTE_CABECALHO;
    let maior = medidor.measureText(col.titulo).width;
    medidor.font = FONTE_CELULA;
    for (const linha of linhas) {
      maior = Math.max(maior, medidor.measureText(linha[i] ?? "").width);
    }
    return Math.min(LARGURA_MAX_COLUNA, Math.max(LARGURA_MIN_COLUNA, maior + PADDING_CELULA * 2));
  });

  const margem = 24;
  const alturaLinha = 34;
  const alturaCabecalho = 40;
  const alturaAccent = 4;

  // Logo pequena (empilhada) no canto superior direito, com "agronegócio"
  // embaixo — assim quem recebe a foto encaminhada reconhece a Rede Agro
  // mesmo sem contexto.
  const ALTURA_LOGO = 34;
  const larguraLogo = larguraLogoCanvas(ALTURA_LOGO, "empilhada");
  const FONTE_RODAPE_LOGO = `10px "${FAMILIA_FONTE}"`;
  const alturaBlocoLogo = ALTURA_LOGO + 4 + 12;

  const alturaTitulo = Math.max(44 + (subtitulo ? 22 : 0) + alturaAccent + 8, alturaBlocoLogo + 16);
  const largura = margem * 2 + largurasColunas.reduce((a, b) => a + b, 0);
  const altura = alturaTitulo + alturaCabecalho + alturaLinha * linhas.length + margem;

  const canvas = createCanvas(largura, altura);
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, largura, altura);

  ctx.fillStyle = MARCA_AZUL;
  ctx.font = FONTE_TITULO;
  ctx.textAlign = "left";
  ctx.fillText(titulo, margem, 32);
  if (subtitulo) {
    ctx.font = FONTE_SUBTITULO;
    ctx.fillStyle = MARCA_AZUL;
    ctx.fillText(subtitulo, margem, 54);
  }

  // Friso verde embaixo do título — mesmo acento da logo (ver lib/marca/pdf.ts).
  ctx.fillStyle = MARCA_VERDE;
  ctx.fillRect(margem, alturaTitulo - alturaAccent - 8, 48, alturaAccent);

  const logoX = largura - margem - larguraLogo;
  const logoYTopo = (alturaTitulo - alturaBlocoLogo) / 2;
  desenharLogoCanvas(ctx, { x: logoX, yTopo: logoYTopo, altura: ALTURA_LOGO, variante: "empilhada" });
  ctx.font = FONTE_RODAPE_LOGO;
  ctx.fillStyle = "#52606d";
  ctx.textAlign = "center";
  ctx.fillText("agronegócio", logoX + larguraLogo / 2, logoYTopo + ALTURA_LOGO + 4 + 10);

  let y = alturaTitulo;

  ctx.fillStyle = MARCA_AZUL;
  ctx.fillRect(margem, y, largura - margem * 2, alturaCabecalho);
  ctx.font = FONTE_CABECALHO;
  ctx.fillStyle = "#ffffff";
  let x = margem;
  colunas.forEach((col, i) => {
    const larguraCol = largurasColunas[i];
    ctx.textAlign = col.alinhamento === "direita" ? "right" : "left";
    const tx = col.alinhamento === "direita" ? x + larguraCol - PADDING_CELULA : x + PADDING_CELULA;
    ctx.fillText(col.titulo, tx, y + alturaCabecalho / 2 + 5);
    x += larguraCol;
  });
  y += alturaCabecalho;

  ctx.font = FONTE_CELULA;
  linhas.forEach((linha, indiceLinha) => {
    ctx.fillStyle = indiceLinha % 2 === 0 ? "#ffffff" : "#f3f4f6";
    ctx.fillRect(margem, y, largura - margem * 2, alturaLinha);
    ctx.fillStyle = MARCA_AZUL;
    let x = margem;
    colunas.forEach((col, i) => {
      const larguraCol = largurasColunas[i];
      ctx.textAlign = col.alinhamento === "direita" ? "right" : "left";
      const tx = col.alinhamento === "direita" ? x + larguraCol - PADDING_CELULA : x + PADDING_CELULA;
      let texto = linha[i] ?? "";
      const larguraDisponivel = larguraCol - PADDING_CELULA * 2;
      if (ctx.measureText(texto).width > larguraDisponivel) {
        while (texto.length > 1 && ctx.measureText(`${texto}…`).width > larguraDisponivel) {
          texto = texto.slice(0, -1);
        }
        texto += "…";
      }
      ctx.fillText(texto, tx, y + alturaLinha / 2 + 5);
      x += larguraCol;
    });
    y += alturaLinha;
  });

  ctx.strokeStyle = "#d2d6dc";
  ctx.strokeRect(margem, alturaTitulo, largura - margem * 2, alturaCabecalho + alturaLinha * linhas.length);

  return canvas.toBuffer("image/png");
}
