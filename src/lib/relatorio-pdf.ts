// Gera o PDF do relatório de visita no servidor, usando exatamente a mesma
// geometria (página/x/y/w/h) que o editor em canvas e a tela de
// visualização usam — o PDF é o "canvas" impresso, não uma foto da tela.
//
// Usado tanto pelo botão "Exportar PDF" (rota da API) quanto pelo bot do
// WhatsApp (envia o arquivo como documento).

import { prepararMarcaPdf } from "@/lib/empresa";
import {
  PDFDocument,
  PDFFont,
  PDFImage,
  PDFPage,
  rgb,
  type RGB,
  pushGraphicsState,
  popGraphicsState,
  moveTo,
  lineTo,
  closePath,
  clip,
  endPath,
  setCharacterSpacing,
  degrees,
} from "pdf-lib";
import sharp from "sharp";
import {
  fotoDeCapa,
  larguraDoBloco,
  montarLayout,
  coresPorCategoria,
  ROTULOS_DESTAQUE,
  tipoEfetivoRelatorio,
  tituloDaSecao,
  type Bloco,
  type BlocoGrafico,
  type BlocoVisual,
  type MapaPaginas,
  type SecaoLayout,
} from "@/lib/relatorio-conteudo";
import {
  MARCA_AZUL,
  MARCA_VERDE,
  desenharLogo,
  embutirFontesMarca,
  embutirFonteTexto,
  larguraLogo,
} from "@/lib/marca/pdf";

const A4_LARGURA = 595.28;
const A4_ALTURA = 841.89;

const CORES_GRAFICO = ["#00dc4d", "#38bdf8", "#fbbf24", "#f472b6", "#a78bfa", "#fb923c"];

function hexParaRgb(hex: string): RGB {
  const n = parseInt(hex.slice(1), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

// Cores da marca (azul #19323b + verde #00DC4D) e tons derivados do azul —
// a mesma paleta usada nos outros relatórios do sistema (propostas, despesas).
const VERDE = MARCA_VERDE;
const BRANCO = rgb(1, 1, 1);
const COR_TEXTO = MARCA_AZUL;
const COR_MUTED = hexParaRgb("#67818a");

// Retângulo arredondado desenhado sem depender de stroke em arco do pdf-lib:
// preenche a área com "tiras" + círculos nos cantos e, quando tem borda,
// desenha a versão maior na cor da borda e a menor (encolhida) por cima.
function preencherRetanguloArredondado(
  page: PDFPage,
  x: number,
  y: number,
  w: number,
  h: number,
  raio: number,
  cor: RGB
) {
  if (w <= 0 || h <= 0) return;
  const r = Math.max(0, Math.min(raio, w / 2, h / 2));
  page.drawRectangle({ x: x + r, y, width: Math.max(0, w - 2 * r), height: h, color: cor });
  if (r > 0) {
    page.drawRectangle({ x, y: y + r, width: r, height: Math.max(0, h - 2 * r), color: cor });
    page.drawRectangle({ x: x + w - r, y: y + r, width: r, height: Math.max(0, h - 2 * r), color: cor });
    page.drawEllipse({ x: x + r, y: y + r, xScale: r, yScale: r, color: cor });
    page.drawEllipse({ x: x + w - r, y: y + r, xScale: r, yScale: r, color: cor });
    page.drawEllipse({ x: x + r, y: y + h - r, xScale: r, yScale: r, color: cor });
    page.drawEllipse({ x: x + w - r, y: y + h - r, xScale: r, yScale: r, color: cor });
  }
}

function desenharCard(
  page: PDFPage,
  geo: { x: number; y: number; w: number; h: number },
  opts: { raio?: number; cor?: RGB; corBorda?: RGB; larguraBorda?: number } = {}
) {
  const raio = opts.raio ?? 10;
  const larguraBorda = opts.larguraBorda ?? 1.4;
  if (opts.corBorda) {
    preencherRetanguloArredondado(page, geo.x, geo.y, geo.w, geo.h, raio, opts.corBorda);
    preencherRetanguloArredondado(
      page,
      geo.x + larguraBorda,
      geo.y + larguraBorda,
      geo.w - 2 * larguraBorda,
      geo.h - 2 * larguraBorda,
      Math.max(0, raio - larguraBorda),
      opts.cor ?? BRANCO
    );
  } else if (opts.cor) {
    preencherRetanguloArredondado(page, geo.x, geo.y, geo.w, geo.h, raio, opts.cor);
  }
}

function quebrarLinhas(font: PDFFont, texto: string, tamanho: number, largura: number): string[] {
  const linhas: string[] = [];
  for (const paragrafo of texto.split("\n")) {
    if (!paragrafo.trim()) {
      linhas.push("");
      continue;
    }
    let atual = "";
    for (const palavra of paragrafo.split(" ")) {
      const tentativa = atual ? `${atual} ${palavra}` : palavra;
      if (font.widthOfTextAtSize(tentativa, tamanho) > largura && atual) {
        linhas.push(atual);
        atual = palavra;
      } else {
        atual = tentativa;
      }
    }
    linhas.push(atual);
  }
  return linhas;
}

async function embutirImagem(pdfDoc: PDFDocument, url: string, tentativas = 2, rotacao?: 0 | 90 | 180 | 270) {
  for (let tentativa = 1; tentativa <= tentativas; tentativa++) {
    try {
      const resp = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!resp.ok) continue;
      const bytes = new Uint8Array(await resp.arrayBuffer());
      // Reencodar sempre: câmeras de celular podem produzir JPEG CMYK, HEIC ou
      // WebP. Alguns leitores de PDF exibem esses JPEGs como retângulos pretos.
      const jpeg = await sharp(bytes, { animated: false })
        .rotate(rotacao)
        .flatten({ background: "#ffffff" })
        .jpeg({ quality: 88, mozjpeg: true })
        .toBuffer();
      return await pdfDoc.embedJpg(jpeg);
    } catch (error) {
      console.warn(`[PDF] Falha ao baixar imagem (tentativa ${tentativa}/${tentativas}):`, url, error);
    }
  }
  return null;
}

// Logo do parceiro: mantém o PNG (transparência) em vez de achatar em JPEG.
async function embutirLogoParceiro(pdfDoc: PDFDocument, url: string): Promise<PDFImage | null> {
  try {
    const resp = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!resp.ok) return null;
    const png = await sharp(new Uint8Array(await resp.arrayBuffer()), { animated: false }).rotate().png().toBuffer();
    return await pdfDoc.embedPng(png);
  } catch (error) {
    console.warn("[PDF] Falha ao carregar a logo do parceiro:", error);
    return null;
  }
}

// Desenha a imagem preenchendo a área (x,y,w,h) tipo "background-size: cover",
// cortando o excesso — sem clip, drawImage nunca corta, só transborda por
// cima do resto da página.
function desenharImagemCover(
  page: PDFPage,
  imagem: PDFImage,
  area: { x: number; y: number; w: number; h: number },
  focoX = 50,
  focoY = 50,
  zoom = 1,
) {
  const escala = Math.max(area.w / imagem.width, area.h / imagem.height) * Math.max(1, zoom);
  const w = imagem.width * escala;
  const h = imagem.height * escala;
  const x = area.x - (w - area.w) * Math.min(100, Math.max(0, focoX)) / 100;
  // CSS mede o foco de cima para baixo; o PDF mede y de baixo para cima.
  const y = area.y - (h - area.h) * (100 - Math.min(100, Math.max(0, focoY))) / 100;

  page.pushOperators(
    pushGraphicsState(),
    moveTo(area.x, area.y),
    lineTo(area.x + area.w, area.y),
    lineTo(area.x + area.w, area.y + area.h),
    lineTo(area.x, area.y + area.h),
    closePath(),
    clip(),
    endPath()
  );
  page.drawImage(imagem, { x, y, width: w, height: h });
  page.pushOperators(popGraphicsState());
}

function desenharImagemContain(
  page: PDFPage,
  imagem: PDFImage,
  area: { x: number; y: number; w: number; h: number }
) {
  const escala = Math.min(area.w / imagem.width, area.h / imagem.height);
  const w = imagem.width * escala;
  const h = imagem.height * escala;
  page.drawImage(imagem, {
    x: area.x + (area.w - w) / 2,
    y: area.y + (area.h - h) / 2,
    width: w,
    height: h,
  });
}

// Escala "redonda" pro eixo Y (0, 5, 10, 15, 20…), como o gráfico do site.
function escalaEixo(maximo: number, divisoes = 4): { topo: number; passo: number } {
  if (maximo <= 0) return { topo: 1, passo: 0.25 };
  const bruto = maximo / divisoes;
  const potencia = 10 ** Math.floor(Math.log10(bruto));
  const passo = [1, 2, 2.5, 5, 10].map((m) => m * potencia).find((p) => p >= bruto) ?? 10 * potencia;
  return { topo: Math.ceil(maximo / passo) * passo, passo };
}

function fmtEixo(valor: number): string {
  return valor.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}

// Corta o texto pra caber na largura (com reticências).
function caber(font: PDFFont, texto: string, tamanho: number, largura: number): string {
  let t = paraPdf(texto);
  if (font.widthOfTextAtSize(t, tamanho) <= largura) return t;
  while (t.length > 1 && font.widthOfTextAtSize(`${t}...`, tamanho) > largura) t = t.slice(0, -1);
  return `${t}...`;
}

// Gráfico do relatório no mesmo visual da tela do site: título, eixo Y com
// escala e grade pontilhada, rótulos das categorias, valor sobre as barras e
// legenda das séries (na pizza, legenda com o percentual de cada fatia).
function desenharGrafico(
  page: PDFPage,
  font: PDFFont,
  bloco: BlocoGrafico,
  geo: { x: number; y: number; w: number; h: number },
  fontTitulo: PDFFont = font
) {
  const corEixo = hexParaRgb("#8ea3ab");
  const corGrade = hexParaRgb("#dde4e7");
  const corDaSerie = (i: number) => hexParaRgb(bloco.cores?.[i] ?? CORES_GRAFICO[i % CORES_GRAFICO.length]);
  const porCategoria = coresPorCategoria(bloco);
  const topoGeo = geo.y + geo.h;

  let yConteudoTopo = topoGeo;
  if (bloco.titulo) {
    const est = bloco.tituloEstilo;
    const tamTitulo = est?.tamanho === "pequeno" ? 7 : est?.tamanho === "grande" ? 11 : 8.5;
    const fonteTitulo = est?.negrito === false ? font : fontTitulo;
    const textoTitulo = caber(fonteTitulo, bloco.titulo, tamTitulo, geo.w);
    const larguraTitulo = fonteTitulo.widthOfTextAtSize(textoTitulo, tamTitulo);
    page.drawText(textoTitulo, {
      x: geo.x + (est?.alinhamento === "centro" ? (geo.w - larguraTitulo) / 2 : est?.alinhamento === "direita" ? geo.w - larguraTitulo : 0),
      y: topoGeo - 9, size: tamTitulo, font: fonteTitulo, color: MARCA_AZUL,
    });
    yConteudoTopo -= 18;
  }
  const detalhesEixos = [
    bloco.eixoX && bloco.eixoY ? `${bloco.eixoX} × ${bloco.eixoY}` : bloco.eixoX || bloco.eixoY,
    bloco.unidade ? `Unidade: ${bloco.unidade}` : null,
  ].filter(Boolean).join(" · ");
  if (detalhesEixos) {
    page.drawText(caber(font, paraPdf(detalhesEixos), 6.5, geo.w), {
      x: geo.x, y: yConteudoTopo - 7, size: 6.5, font, color: COR_MUTED,
    });
    yConteudoTopo -= 13;
  }

  const valores = bloco.linhas.flatMap((l) => l.valores.filter((v): v is number => v !== null));
  if (valores.length === 0) {
    page.drawText("Gráfico sem dados", {
      x: geo.x, y: geo.y + geo.h / 2, size: 8, font, color: COR_MUTED,
    });
    return;
  }

  // ---- Pizza/rosca: disco à esquerda, legenda com percentuais à direita.
  if (bloco.formato === "pizza" || bloco.formato === "rosca") {
    const total = bloco.linhas.reduce((s, l) => s + Math.max(0, l.valores[0] ?? 0), 0) || 1;
    const alturaUtil = yConteudoTopo - geo.y;
    const raio = Math.min(geo.w * 0.45, alturaUtil) / 2 - 2;
    const cx = geo.x + raio + 2;
    const cy = geo.y + alturaUtil / 2;
    let anguloIni = -Math.PI / 2;
    bloco.linhas.forEach((linha, i) => {
      const valor = Math.max(0, linha.valores[0] ?? 0);
      if (valor <= 0) return;
      const anguloFim = anguloIni + (valor / total) * Math.PI * 2;
      const x1 = cx + raio * Math.cos(anguloIni);
      const y1 = cy + raio * Math.sin(anguloIni);
      const x2 = cx + raio * Math.cos(anguloFim);
      const y2 = cy + raio * Math.sin(anguloFim);
      const grandeArco = anguloFim - anguloIni > Math.PI ? 1 : 0;
      // drawSvgPath usa y crescendo pra baixo; nossas coordenadas são y pra
      // cima (sistema da página), por isso o sinal invertido. Com o eixo
      // espelhado, o ângulo crescendo (anti-horário na página) é o sentido
      // negativo do SVG: sweep 0. Com sweep 1 o arco ia pelo lado de fora e
      // as fatias se sobrepunham.
      const svg = `M ${cx} ${-cy} L ${x1} ${-y1} A ${raio} ${raio} 0 ${grandeArco} 0 ${x2} ${-y2} Z`;
      page.drawSvgPath(svg, { color: corDaSerie(i) });
      anguloIni = anguloFim;
    });
    // Rosca: furo no meio com o total.
    if (bloco.formato === "rosca") {
      page.drawCircle({ x: cx, y: cy, size: raio * 0.58, color: BRANCO });
      const textoTotal = fmtEixo(total);
      const tamTotal = Math.min(12, raio * 0.3);
      page.drawText(textoTotal, {
        x: cx - fontTitulo.widthOfTextAtSize(textoTotal, tamTotal) / 2,
        y: cy - tamTotal / 3,
        size: tamTotal,
        font: fontTitulo,
        color: COR_TEXTO,
      });
      page.drawText("Total", {
        x: cx - font.widthOfTextAtSize("Total", 6) / 2,
        y: cy - tamTotal / 3 - 9,
        size: 6,
        font,
        color: COR_MUTED,
      });
    }
    const xLegenda = cx + raio + 14;
    const larguraLegenda = geo.x + geo.w - xLegenda - 12;
    let yLegenda = cy + (bloco.linhas.length * 13) / 2 - 8;
    bloco.linhas.forEach((linha, i) => {
      const valor = Math.max(0, linha.valores[0] ?? 0);
      const pct = Math.round((valor / total) * 100);
      page.drawRectangle({ x: xLegenda, y: yLegenda, width: 7, height: 7, color: corDaSerie(i) });
      page.drawText(caber(font, `${linha.rotulo || `Item ${i + 1}`} — ${pct}%`, 7.5, larguraLegenda), {
        x: xLegenda + 11, y: yLegenda + 0.5, size: 7.5, font, color: COR_TEXTO,
      });
      yLegenda -= 13;
    });
    return;
  }

  // ---- Barras, linha e área: eixos, grade, rótulos e legenda.
  const empilhada = bloco.formato === "barra_empilhada";
  const somaDaLinha = (l: { valores: (number | null)[] }) =>
    l.valores.reduce<number>((s, v) => s + Math.max(0, v ?? 0), 0);
  const maximo = empilhada ? Math.max(...bloco.linhas.map(somaDaLinha), 0) : Math.max(...valores, 0);
  const { topo, passo } = escalaEixo(maximo);
  const tamEixo = 6.5;
  const rotulosY: string[] = [];
  for (let v = 0; v <= topo + passo / 2; v += passo) rotulosY.push(fmtEixo(v));
  const larguraRotulosY = Math.max(...rotulosY.map((r) => font.widthOfTextAtSize(r, tamEixo)));

  // ---- Barras deitadas: categorias à esquerda, valores no eixo de baixo.
  if (bloco.formato === "barra_horizontal") {
    const larguraCategorias = Math.min(
      geo.w * 0.32,
      Math.max(...bloco.linhas.map((l, i) => font.widthOfTextAtSize(paraPdf(l.rotulo || `${i + 1}`), tamEixo)))
    );
    const alturaLegendaH = 14;
    const alturaEixoValores = 12;
    const areaH = {
      x: geo.x + larguraCategorias + 6,
      y: geo.y + alturaLegendaH + alturaEixoValores,
      w: geo.w - larguraCategorias - 6 - 22, // folga pro valor na ponta da barra
      h: yConteudoTopo - geo.y - alturaLegendaH - alturaEixoValores - 4,
    };
    if (areaH.h <= 20 || areaH.w <= 20) return;
    const xDe = (v: number) => areaH.x + (Math.max(0, v) / topo) * areaH.w;

    rotulosY.forEach((rotulo, i) => {
      const x = xDe(i * passo);
      page.drawLine({
        start: { x, y: areaH.y },
        end: { x, y: areaH.y + areaH.h },
        thickness: 0.5,
        color: i === 0 ? corEixo : corGrade,
        dashArray: i === 0 ? undefined : [2, 2],
      });
      page.drawText(rotulo, {
        x: x - font.widthOfTextAtSize(rotulo, tamEixo) / 2,
        y: areaH.y - alturaEixoValores + 3,
        size: tamEixo,
        font,
        color: COR_MUTED,
      });
    });

    const grupoH = areaH.h / Math.max(1, bloco.linhas.length);
    const nSeries = Math.max(1, bloco.series.length);
    const barraH = Math.min(18, (grupoH * 0.78) / nSeries);
    bloco.linhas.forEach((linha, li) => {
      const centro = areaH.y + areaH.h - grupoH * (li + 0.5);
      const rotulo = caber(font, linha.rotulo || `${li + 1}`, tamEixo, larguraCategorias);
      page.drawText(rotulo, {
        x: areaH.x - 6 - font.widthOfTextAtSize(rotulo, tamEixo),
        y: centro - tamEixo / 3,
        size: tamEixo,
        font,
        color: COR_MUTED,
      });
      const topoGrupo = centro + (barraH * nSeries) / 2;
      bloco.series.forEach((_, si) => {
        const v = linha.valores[si];
        if (v === null) return;
        const y = topoGrupo - (si + 1) * barraH;
        const largura = Math.max(0.8, xDe(v) - areaH.x);
        page.drawRectangle({
          x: areaH.x, y: y + 0.75, width: largura, height: barraH - 1.5,
          color: corDaSerie(porCategoria ? li : si),
        });
        const texto = fmtEixo(v);
        const tam = Math.min(6.5, barraH - 1);
        if (tam >= 4) {
          page.drawText(texto, {
            x: areaH.x + largura + 3,
            y: y + barraH / 2 - tam / 3,
            size: tam,
            font,
            color: COR_TEXTO,
          });
        }
      });
    });
    desenharLegenda();
    return;
  }

  const alturaLegenda = 14;
  const alturaRotulosX = 12;
  const area = {
    x: geo.x + larguraRotulosY + 6,
    y: geo.y + alturaLegenda + alturaRotulosX,
    w: geo.w - larguraRotulosY - 8,
    h: yConteudoTopo - geo.y - alturaLegenda - alturaRotulosX - 6,
  };
  if (area.h <= 20 || area.w <= 20) return;
  const yDe = (v: number) => area.y + (Math.max(0, v) / topo) * area.h;

  // Grade pontilhada + valores do eixo Y.
  rotulosY.forEach((rotulo, i) => {
    const y = yDe(i * passo);
    page.drawLine({
      start: { x: area.x, y },
      end: { x: area.x + area.w, y },
      thickness: 0.5,
      color: i === 0 ? corEixo : corGrade,
      dashArray: i === 0 ? undefined : [2, 2],
    });
    page.drawText(rotulo, {
      x: area.x - 4 - font.widthOfTextAtSize(rotulo, tamEixo),
      y: y - tamEixo / 2 + 1,
      size: tamEixo,
      font,
      color: COR_MUTED,
    });
  });

  // Categorias no eixo X (centro de cada grupo).
  const grupoW = area.w / Math.max(1, bloco.linhas.length);
  const centroGrupo = (i: number) => area.x + grupoW * i + grupoW / 2;
  bloco.linhas.forEach((linha, i) => {
    const rotulo = caber(font, linha.rotulo || `${i + 1}`, tamEixo, grupoW - 4);
    page.drawText(rotulo, {
      x: centroGrupo(i) - font.widthOfTextAtSize(rotulo, tamEixo) / 2,
      y: area.y - alturaRotulosX + 3,
      size: tamEixo,
      font,
      color: COR_MUTED,
    });
  });

  if (bloco.formato === "linha" || bloco.formato === "area") {
    bloco.series.forEach((_, si) => {
      const cor = corDaSerie(si);
      const pontos = bloco.linhas.map((linha, li) => {
        const v = linha.valores[si];
        return { x: centroGrupo(li), y: v === null ? 0 : yDe(v), valido: v !== null };
      });
      // Área: cada trecho contínuo (sem buraco) vira um polígono até o eixo.
      if (bloco.formato === "area") {
        let trecho: { x: number; y: number }[] = [];
        const fechar = () => {
          if (trecho.length >= 2) {
            const caminho =
              `M ${trecho[0].x} ${-area.y} ` +
              trecho.map((p) => `L ${p.x} ${-p.y}`).join(" ") +
              ` L ${trecho[trecho.length - 1].x} ${-area.y} Z`;
            page.drawSvgPath(caminho, { color: cor, opacity: 0.22 });
          }
          trecho = [];
        };
        for (const p of pontos) {
          if (p.valido) trecho.push(p);
          else fechar();
        }
        fechar();
      }
      for (let i = 0; i < pontos.length - 1; i++) {
        if (!pontos[i].valido || !pontos[i + 1].valido) continue;
        page.drawLine({ start: pontos[i], end: pontos[i + 1], thickness: 1.5, color: cor });
      }
      for (const p of pontos) if (p.valido) page.drawCircle({ x: p.x, y: p.y, size: 2.2, color: cor });
    });
  } else if (empilhada) {
    // Uma barra por categoria, com as séries empilhadas; total em cima.
    const barraW = Math.min(40, grupoW * 0.6);
    bloco.linhas.forEach((linha, li) => {
      const x = centroGrupo(li) - barraW / 2;
      let base = 0;
      bloco.series.forEach((_, si) => {
        const v = Math.max(0, linha.valores[si] ?? 0);
        if (v <= 0) return;
        const y0 = yDe(base);
        const y1 = yDe(base + v);
        page.drawRectangle({ x, y: y0, width: barraW, height: Math.max(0.8, y1 - y0), color: corDaSerie(si) });
        base += v;
      });
      if (base > 0) {
        const texto = fmtEixo(base);
        const tam = 6;
        page.drawText(texto, {
          x: x + barraW / 2 - font.widthOfTextAtSize(texto, tam) / 2,
          y: yDe(base) + 2,
          size: tam,
          font,
          color: COR_TEXTO,
        });
      }
    });
  } else {
    const nSeries = Math.max(1, bloco.series.length);
    const barraW = Math.min(30, (grupoW * 0.78) / nSeries);
    bloco.linhas.forEach((linha, li) => {
      const inicio = centroGrupo(li) - (barraW * nSeries) / 2;
      bloco.series.forEach((_, si) => {
        const v = linha.valores[si];
        if (v === null) return;
        const x = inicio + si * barraW;
        const altura = Math.max(0.8, yDe(v) - area.y);
        page.drawRectangle({
          x, y: area.y, width: barraW - 1.5, height: altura,
          color: corDaSerie(porCategoria ? li : si),
        });
        const texto = fmtEixo(v);
        const tam = 6;
        const larguraTexto = font.widthOfTextAtSize(texto, tam);
        if (larguraTexto <= barraW + 4) {
          page.drawText(texto, {
            x: x + (barraW - 1.5) / 2 - larguraTexto / 2,
            y: area.y + altura + 2,
            size: tam,
            font,
            color: COR_TEXTO,
          });
        }
      });
    });
  }

  desenharLegenda();

  // Legenda centralizada embaixo: as séries, ou as categorias quando cada
  // barra tem a sua cor (se não couber numa linha, volta pro nome da série —
  // as categorias já estão no eixo).
  function desenharLegenda() {
  const larguraItem = (t: string) => 11 + font.widthOfTextAtSize(t, 7.5) + 10;
  const somaLarguras = (lista: { texto: string }[]) =>
    lista.reduce((soma, it) => soma + larguraItem(it.texto), 0) - 10;
  const itensSeries = bloco.series.map((s, i) => ({ texto: caber(font, s || `Série ${i + 1}`, 7.5, 110), cor: corDaSerie(i) }));
  const itensCategorias = bloco.linhas.map((l, i) => ({ texto: caber(font, l.rotulo || `${i + 1}`, 7.5, 110), cor: corDaSerie(i) }));
  const itens = porCategoria && somaLarguras(itensCategorias) <= geo.w ? itensCategorias : itensSeries;
  const larguraTotal = somaLarguras(itens);
  let xLegenda = geo.x + (geo.w - larguraTotal) / 2;
  for (const it of itens) {
    page.drawRectangle({ x: xLegenda, y: geo.y + 2, width: 7, height: 7, color: it.cor });
    page.drawText(it.texto, { x: xLegenda + 11, y: geo.y + 2.5, size: 7.5, font, color: it.cor });
    xLegenda += larguraItem(it.texto);
  }
  }
}

export type RastreamentoVisita = {
  finalidade?: string | null;
  horaChegada?: Date | null;
  horaSaida?: Date | null;
  kmChegada?: number | null;
  kmSaida?: number | null;
  latitude?: number | null;
  longitude?: number | null;
};

function fmtDataHora(d: Date): string {
  return d.toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtKm(km: number): string {
  return `${km.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} km`;
}

// ---------------------------------------------------------------------------
// Relatório técnico no mesmo visual da tela do site ("Dossiê técnico",
// BlocosRender): faixa verde-escura com título/cliente/data/responsável,
// síntese num quadro verde-claro, gráficos e evidências fotográficas em grade
// de 2 colunas com a legenda embaixo. O conteúdo flui entre as páginas.
// ---------------------------------------------------------------------------

const DOSSIE = {
  fundo: BRANCO,
  rotuloCabecalho: hexParaRgb("#2e7d32"),
  faixa: MARCA_AZUL,
  rotuloFaixa: MARCA_VERDE,
  subtituloFaixa: hexParaRgb("#d6dfe2"),
  divisorFaixa: hexParaRgb("#475b62"), // branco 20% sobre a faixa
  rotuloDadoFaixa: hexParaRgb("#afb7ba"), // branco 65% sobre a faixa
  secao: MARCA_AZUL,
  sinteseFundo: hexParaRgb("#edfaf0"), // verde da marca 6% sobre o fundo
  sinteseBorda: hexParaRgb("#bdf4d0"), // verde da marca 25% sobre o fundo
  texto: hexParaRgb("#34525d"),
  legenda: hexParaRgb("#4a6670"),
  borda: hexParaRgb("#dde4e7"),
  fundoFoto: hexParaRgb("#ecf1f3"),
  rodape: hexParaRgb("#67818a"),
};

const DOSSIE_MARGEM_X = 40;
// Cabeçalho (logo + consultor/safra/data + faixa verde) e rodapé (faixas verde
// e azul + logo do parceiro) repetidos em toda página interna.
const DOSSIE_TOPO_CONTINUACAO = 92;
const DOSSIE_ALTURA_RODAPE = 66;

// Tamanho da folha de cada documento (retrato ou paisagem). Fica preso ao
// PDFDocument, e não num global, porque dois PDFs podem ser gerados juntos.
type Folha = { w: number; h: number };
const folhaPorDocumento = new WeakMap<PDFDocument, Folha>();
function folhaDe(pdfDoc: PDFDocument): Folha {
  return folhaPorDocumento.get(pdfDoc) ?? { w: A4_LARGURA, h: A4_ALTURA };
}
function definirFolha(pdfDoc: PDFDocument, orientacao: "PAISAGEM" | "RETRATO" | undefined) {
  folhaPorDocumento.set(pdfDoc, orientacao === "PAISAGEM" ? { w: A4_ALTURA, h: A4_LARGURA } : { w: A4_LARGURA, h: A4_ALTURA });
}

// Helvetica do PDF só cobre Latin-1: emoji e símbolos vindos do WhatsApp
// derrubariam o drawText.
function paraPdf(texto: string): string {
  return texto
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .normalize("NFC")
    .replace(/[^\n\x20-\x7E\xA0-\xFF]/g, "");
}

function textoEspacado(
  page: PDFPage,
  texto: string,
  opts: { x: number; y: number; size: number; font: PDFFont; color: RGB; espaco: number }
) {
  page.pushOperators(setCharacterSpacing(opts.espaco));
  page.drawText(paraPdf(texto), { x: opts.x, y: opts.y, size: opts.size, font: opts.font, color: opts.color });
  page.pushOperators(setCharacterSpacing(0));
}

function larguraEspacada(font: PDFFont, texto: string, size: number, espaco: number): number {
  const t = paraPdf(texto);
  return font.widthOfTextAtSize(t, size) + espaco * Math.max(0, t.length - 1);
}

type CursorDossie = { page: PDFPage; y: number };


function novaPaginaDossie(pdfDoc: PDFDocument): PDFPage {
  const { w, h } = folhaDe(pdfDoc);
  const page = pdfDoc.addPage([w, h]);
  page.drawRectangle({ x: 0, y: 0, width: w, height: h, color: DOSSIE.fundo });
  return page;
}

type MarcaParceiroPdf = { imagem: PDFImage; rotulo: string | null; escala: number };
type DadosCabecalhoDossie = { consultorNome: string; safraNome?: string | null; dataFmt: string; rotuloData: string; logoPrincipal?: PDFImage | null; escalaLogoPrincipal?: number };

// Logo da esquerda: a escolhida no relatório ou, sem ela, a da empresa.
function desenharLogoPrincipal(page: PDFPage, imagem: PDFImage | null | undefined, opts: { x: number; yTopo: number; altura: number; larguraMax: number }): number {
  if (!imagem) {
    desenharLogo(page, { x: opts.x, yTopo: opts.yTopo, altura: opts.altura });
    return larguraLogo(opts.altura);
  }
  const escala = Math.min(opts.altura / imagem.height, opts.larguraMax / imagem.width);
  const h = imagem.height * escala;
  page.drawImage(imagem, { x: opts.x, y: opts.yTopo - opts.altura + (opts.altura - h) / 2, width: imagem.width * escala, height: h });
  return imagem.width * escala;
}

// Logo do parceiro com o rótulo ("EM PARCERIA COM") por cima, encostada à direita.
function desenharMarcaParceiro(
  page: PDFPage,
  font: PDFFont,
  parceiro: MarcaParceiroPdf,
  caixa: { xDireita: number; yBase: number; alturaMax: number; larguraMax: number; tamanhoRotulo: number }
) {
  const escala = Math.min(caixa.alturaMax * parceiro.escala / parceiro.imagem.height, caixa.larguraMax * parceiro.escala / parceiro.imagem.width);
  const w = parceiro.imagem.width * escala;
  const h = parceiro.imagem.height * escala;
  page.drawImage(parceiro.imagem, { x: caixa.xDireita - w, y: caixa.yBase, width: w, height: h });
  if (parceiro.rotulo) {
    const rotulo = parceiro.rotulo.toUpperCase();
    textoEspacado(page, rotulo, {
      x: caixa.xDireita - larguraEspacada(font, rotulo, caixa.tamanhoRotulo, 1.2),
      y: caixa.yBase + h + 5,
      size: caixa.tamanhoRotulo,
      font,
      color: DOSSIE.rodape,
      espaco: 1.2,
    });
  }
}

// Rodapé: faixa verde sobre faixa azul até a logo do parceiro (ou da empresa).
function desenharRodapeDossie(page: PDFPage, font: PDFFont, parceiro: MarcaParceiroPdf | null) {
  const largura = page.getWidth();
  const reservaLogo = 150;
  const fimFaixa = largura - reservaLogo - 10;
  page.drawRectangle({ x: 0, y: 26, width: fimFaixa, height: 6, color: MARCA_VERDE });
  page.drawRectangle({ x: 0, y: 20, width: fimFaixa, height: 6, color: MARCA_AZUL });
  if (parceiro) {
    desenharMarcaParceiro(page, font, parceiro, { xDireita: largura - DOSSIE_MARGEM_X + 10, yBase: 12, alturaMax: 30, larguraMax: reservaLogo - 20, tamanhoRotulo: 6 });
  } else {
    desenharLogo(page, { x: fimFaixa + 16, yTopo: 34, altura: 14 });
  }
}

// Cabeçalho: logo da empresa à esquerda, consultor/safra/data à direita e a
// faixa verde atravessando a folha.
function desenharCabecalhoDossie(page: PDFPage, fontBold: PDFFont, fontRegular: PDFFont, dados: DadosCabecalhoDossie) {
  const largura = page.getWidth();
  const altura = page.getHeight();
  const e = dados.escalaLogoPrincipal ?? 1;
  desenharLogoPrincipal(page, dados.logoPrincipal, { x: DOSSIE_MARGEM_X - 10, yTopo: altura - 39 + 17 * e, altura: 34 * e, larguraMax: largura * 0.3 * e });
  const campos = ([
    ["CONSULTOR", dados.consultorNome],
    ["SAFRA", dados.safraNome ?? ""],
    [dados.rotuloData, dados.dataFmt],
  ] as [string, string][]).filter(([, valor]) => Boolean(valor));
  const larguraCampo = Math.min(150, (largura * 0.58) / Math.max(1, campos.length));
  const inicio = largura - DOSSIE_MARGEM_X - larguraCampo * campos.length;
  campos.forEach(([rotulo, valor], i) => {
    const x = inicio + i * larguraCampo;
    textoEspacado(page, rotulo, { x, y: altura - 32, size: 6.5, font: fontBold, color: DOSSIE.rotuloCabecalho, espaco: 1.2 });
    page.drawText(caber(fontRegular, paraPdf(valor), 11, larguraCampo - 10), { x, y: altura - 50, size: 11, font: fontRegular, color: MARCA_AZUL });
  });
  page.drawRectangle({ x: 0, y: altura - 74, width: largura, height: 6, color: MARCA_VERDE });
}

function tituloSecaoDossie(page: PDFPage, font: PDFFont, texto: string, x: number, y: number) {
  textoEspacado(page, texto.toUpperCase(), { x, y, size: 7, font, color: DOSSIE.secao, espaco: 1.3 });
}

// Quantas linhas de um texto desenhar agora sem deixar frase pela metade na
// virada da página:
// - cabe tudo no espaço que sobrou → tudo;
// - não cabe aqui mas cabe inteiro numa página limpa → 0 (vai todo pra
//   próxima página);
// - é maior que uma página → corta no fim da última frase que coube (se a
//   frase for enorme, corta na linha mesmo).
function linhasSemCortarFrase(
  linhas: string[],
  cabemAqui: number,
  cabemNumaPagina: number,
  paginaVazia: boolean
): number {
  if (linhas.length <= cabemAqui) return linhas.length;
  if (!paginaVazia && linhas.length <= cabemNumaPagina) return 0;
  if (cabemAqui <= 0) return 0;
  for (let k = cabemAqui; k >= Math.ceil(cabemAqui / 2); k--) {
    const linha = linhas[k - 1].trim();
    if (linha === "" || /[.!?;:]["'”)]*$/.test(linha)) return k;
  }
  return paginaVazia ? cabemAqui : 0;
}

// Garante espaço vertical; se não couber, abre página nova e devolve o topo dela.
function garantirEspaco(pdfDoc: PDFDocument, cursor: CursorDossie, altura: number) {
  if (cursor.y - altura >= DOSSIE_ALTURA_RODAPE) return;
  cursor.page = novaPaginaDossie(pdfDoc);
  cursor.y = folhaDe(pdfDoc).h - DOSSIE_TOPO_CONTINUACAO;
}

// O gerador interno (reserva do PDF impresso da página) só conhece texto, foto,
// gráfico e tabela. Os blocos mais novos viram o equivalente mais próximo:
// destaque → texto com título; indicadores → tabela de uma linha; divisor some.
// As anotações sobre fotos só existem na versão impressa da página.
function adaptarParaGeradorInterno(blocos: Bloco[]): Bloco[] {
  return blocos.flatMap((bloco): Bloco[] => {
    if (bloco.tipo === "destaque") {
      const { variante, ...resto } = bloco;
      return [{ ...resto, tipo: "texto", estilo: "card", titulo: bloco.titulo?.trim() || ROTULOS_DESTAQUE[variante] } as Bloco];
    }
    if (bloco.tipo === "indicadores") {
      return [{
        id: bloco.id, tipo: "tabela", titulo: "", cabecalhos: bloco.itens.map((item) => item.rotulo || " "),
        linhas: [bloco.itens.map((item) => item.valor)], largura: "inteira",
        pagina: bloco.pagina, x: bloco.x, y: bloco.y, w: bloco.w, h: bloco.h, novaPagina: bloco.novaPagina,
      }];
    }
    if (bloco.tipo === "divisor") return [];
    return [bloco];
  });
}

async function gerarDossieTecnico(
  pdfDoc: PDFDocument,
  fontRegular: PDFFont,
  fontBold: PDFFont,
  dados: {
    clienteNome: string;
    fazendaNome: string | null;
    consultorNome: string;
    titulo: string | null;
    dataFmt: string;
    blocos: Bloco[];
    safraNome?: string | null;
    tecnico?: boolean;
    rastreamento?: RastreamentoVisita;
    logoParceiroUrl?: string | null;
    logoParceiroRotulo?: string | null;
    logoPrincipalUrl?: string | null;
    escalaLogoPrincipal?: number;
    logoPrincipalTexto?: string | null;
    escalaLogoPrincipalPaginas?: number;
    escalaLogoParceiro?: number;
    escalaLogoParceiroPaginas?: number;
    semCapa?: boolean;
    orientacao?: "PAISAGEM" | "RETRATO";
  },
  // Só calcular a paginação (mapaDePaginas): sem baixar foto nenhuma — a
  // altura dos cards só depende da largura, não da imagem.
  opcoes: { soPaginacao?: boolean } = {}
): Promise<MapaPaginas> {
  definirFolha(pdfDoc, dados.orientacao);
  const folha = folhaDe(pdfDoc);
  const blocosDoDossie = adaptarParaGeradorInterno(dados.blocos);
  const fotos = blocosDoDossie.filter((b): b is Extract<Bloco, { tipo: "foto" }> => b.tipo === "foto");

  const tecnico = dados.tecnico ?? true;
  const fotoCapa = fotoDeCapa(fotos) ?? undefined;
  const temCapa = !dados.semCapa;
  const mapa: MapaPaginas = { temCapa, totalPaginas: 0, blocos: {} };
  const paginaAtual = () => pdfDoc.getPageCount() - 1;
  const marcarInicio = (ids: string[]) => {
    for (const id of ids) mapa.blocos[id] ??= { inicio: paginaAtual(), fim: paginaAtual() };
  };
  const marcarFim = (ids: string[]) => {
    for (const id of ids) if (mapa.blocos[id]) mapa.blocos[id].fim = paginaAtual();
  };

  const imagemParceiro = !opcoes.soPaginacao && dados.logoParceiroUrl
    ? await embutirLogoParceiro(pdfDoc, dados.logoParceiroUrl)
    : null;
  const logoPrincipal = !opcoes.soPaginacao && dados.logoPrincipalUrl
    ? await embutirLogoParceiro(pdfDoc, dados.logoPrincipalUrl)
    : null;
  const logoParceiro: MarcaParceiroPdf | null = imagemParceiro
    ? { imagem: imagemParceiro, rotulo: dados.logoParceiroRotulo === undefined ? "Em parceria com" : dados.logoParceiroRotulo, escala: dados.escalaLogoParceiro ?? 1 }
    : null;

  if (!temCapa) {
    // Sem capa: o documento começa direto no conteúdo.
  } else if (opcoes.soPaginacao) pdfDoc.addPage([folha.w, folha.h]);
  else await desenharCapaTecnica(pdfDoc, fontBold, fontRegular, {
    logoParceiro,
    logoPrincipal,
    escalaLogoPrincipal: dados.escalaLogoPrincipal,
    logoPrincipalTexto: dados.logoPrincipalTexto,
    titulo: dados.titulo,
    clienteNome: dados.clienteNome,
    fazendaNome: dados.fazendaNome,
    consultorNome: dados.consultorNome,
    dataFmt: dados.dataFmt,
    safraNome: dados.safraNome,
    fotoCapaUrl: fotoCapa?.url,
    fotoCapaFocoX: fotoCapa?.focoX,
    fotoCapaFocoY: fotoCapa?.focoY,
    tecnico,
    rastreamento: dados.rastreamento,
  });

  const largura = folha.w - DOSSIE_MARGEM_X * 2;
  const primeira = novaPaginaDossie(pdfDoc);
  const cursor: CursorDossie = { page: primeira, y: folha.h - DOSSIE_TOPO_CONTINUACAO };

  // O corpo segue a ordem dos blocos (a mesma da tela e do editor, ver
  // montarLayout): síntese com os textos do começo, parágrafos soltos onde o
  // consultor pôs, e fotos/gráficos em linhas de 2 colunas ou largura inteira.
  const secoes = montarLayout(
    blocosDoDossie.filter((b) => b.tipo !== "texto" || Boolean(b.texto.trim()) || b.novaPagina)
  );
  if (!temCapa) {
    const titulo = tituloDoRelatorio(dados.titulo, dados.clienteNome, tecnico);
    for (const linha of quebrarLinhas(fontBold, paraPdf(titulo), 22, largura).slice(0, 2)) {
      cursor.page.drawText(linha, { x: DOSSIE_MARGEM_X, y: cursor.y - 22, size: 22, font: fontBold, color: MARCA_AZUL });
      cursor.y -= 28;
    }
    const sub = [dados.clienteNome, dados.fazendaNome, dados.safraNome ? `Safra ${dados.safraNome}` : null].filter(Boolean).join(" · ");
    cursor.page.drawText(caber(fontRegular, paraPdf(sub), 11, largura), { x: DOSSIE_MARGEM_X, y: cursor.y - 12, size: 11, font: fontRegular, color: COR_MUTED });
    cursor.y -= 34;
  }
  const fontesTexto = new Map<string, { regular: PDFFont; bold: PDFFont }>();
  for (const id of new Set(blocosDoDossie.flatMap((b) => (b.tipo === "texto" && b.fonte && b.fonte !== "padrao" ? [b.fonte] : [])))) {
    const fonte = await embutirFonteTexto(pdfDoc, id);
    if (fonte) fontesTexto.set(id, fonte);
  }
  const imagens = new Map(
    opcoes.soPaginacao
      ? []
      : await Promise.all(fotos.map(async (f) => [f.id, await embutirImagem(pdfDoc, f.url, 2, f.rotacao)] as const))
  );

  const tamanho = 9.5;
  const alturaLinha = 15;
  const padding = 16;
  const topoPagina = folha.h - DOSSIE_TOPO_CONTINUACAO;
  const paginaVazia = () => cursor.y >= topoPagina - 1;
  const virarPagina = () => {
    cursor.page = novaPaginaDossie(pdfDoc);
    cursor.y = topoPagina;
  };
  // Linhas de texto que cabem, descontando `fixo` (paddings, títulos).
  const linhasAqui = (fixo: number) => Math.floor((cursor.y - DOSSIE_ALTURA_RODAPE - fixo) / alturaLinha);
  const linhasPorPagina = (fixo: number) => Math.floor((topoPagina - DOSSIE_ALTURA_RODAPE - fixo) / alturaLinha);
  const gap = 14;
  const larguraColuna = (largura - gap) / 2;
  const larguraTerco = (largura - gap * 2) / 3;
  const tamanhoDoTexto = (bloco: Extract<Bloco, { tipo: "texto" }>) =>
    bloco.tamanhoPt ? bloco.tamanhoPt * (tamanho / 11) : bloco.subtitulo ? 14 : bloco.tamanho === "pequeno" ? 8.5 : bloco.tamanho === "grande" ? 12 : tamanho;
  const corDestaque = (bloco: Extract<Bloco, { tipo: "texto" }>) =>
    bloco.destaque === "verde" ? hexParaRgb("#e6f9ec")
      : bloco.destaque === "azul" ? hexParaRgb("#eaf6fb")
        : bloco.destaque === "amarelo" ? hexParaRgb("#fff7d6") : null;
  const corDoTexto = (bloco: Extract<Bloco, { tipo: "texto" }>) =>
    bloco.cor === "verde" ? MARCA_VERDE : bloco.cor === "azul" || bloco.subtitulo ? DOSSIE.secao : bloco.cor === "vermelho" ? hexParaRgb("#b91c1c") : DOSSIE.texto;
  const alturaLinhaDoTexto = (bloco: Extract<Bloco, { tipo: "texto" }>, tamanhoFonte: number) =>
    tamanhoFonte * (bloco.espacamentoLinha === "compacto" ? 1.3 : bloco.espacamentoLinha === "amplo" ? 1.9 : 1.55);
  const conteudoDoTexto = (bloco: Extract<Bloco, { tipo: "texto" }>) =>
    bloco.lista
      ? bloco.texto.split("\n").filter((linha) => linha.trim()).map((linha) => `- ${linha}`).join("\n")
      : bloco.texto;
  type TrechoPdf = { texto: string; fonte: PDFFont; cor: RGB; fundo?: RGB; italico?: boolean; sublinhado?: boolean };
  type LinhaPdf = { texto: string; trechos: TrechoPdf[]; largura: number };
  const corDoTrecho = (bloco: Extract<Bloco, { tipo: "texto" }>, trecho: NonNullable<typeof bloco.trechos>[number]) =>
    trecho.corHex ? hexParaRgb(trecho.corHex)
      : trecho.cor === "verde" ? MARCA_VERDE
        : trecho.cor === "azul" ? DOSSIE.secao
          : trecho.cor === "vermelho" ? hexParaRgb("#b91c1c") : corDoTexto(bloco);
  const fundoDoTrecho = (trecho: NonNullable<Extract<Bloco, { tipo: "texto" }>["trechos"]>[number]) =>
    trecho.fundoHex ? hexParaRgb(trecho.fundoHex)
      : trecho.destaque === "verde" ? hexParaRgb("#d1fae5")
        : trecho.destaque === "azul" ? hexParaRgb("#e0f2fe")
          : trecho.destaque === "amarelo" ? hexParaRgb("#fde68a") : undefined;
  // Fonte escolhida no bloco (Inter, Roboto...); sem escolha, a da marca.
  const regularDe = (bloco: Extract<Bloco, { tipo: "texto" }>) => (bloco.fonte && fontesTexto.get(bloco.fonte)?.regular) || fontRegular;
  const boldDe = (bloco: Extract<Bloco, { tipo: "texto" }>) => (bloco.fonte && fontesTexto.get(bloco.fonte)?.bold) || fontBold;
  function linhasRicas(bloco: Extract<Bloco, { tipo: "texto" }>, tamanhoFonte: number, larguraDisponivel: number): LinhaPdf[] {
    const origem = bloco.trechos?.length ? bloco.trechos : [{ texto: conteudoDoTexto(bloco) }];
    const linhas: LinhaPdf[] = [];
    let atual: LinhaPdf = { texto: "", trechos: [], largura: 0 };
    const fechar = () => { linhas.push(atual); atual = { texto: "", trechos: [], largura: 0 }; };
    for (const trecho of origem) {
      const estilo = { fonte: trecho.negrito || bloco.negrito || bloco.subtitulo ? boldDe(bloco) : regularDe(bloco), cor: corDoTrecho(bloco, trecho), fundo: fundoDoTrecho(trecho), italico: trecho.italico || bloco.italico, sublinhado: trecho.sublinhado || bloco.sublinhado };
      for (const parte of trecho.texto.split(/(\n|\s+)/)) {
        if (!parte) continue;
        if (parte === "\n") { fechar(); continue; }
        const larguraParte = estilo.fonte.widthOfTextAtSize(parte, tamanhoFonte);
        const ehEspaco = /^\s+$/.test(parte);
        if (!ehEspaco && atual.largura > 0 && atual.largura + larguraParte > larguraDisponivel) fechar();
        if (ehEspaco && atual.largura === 0) continue;
        atual.trechos.push({ texto: parte, ...estilo }); atual.texto += parte; atual.largura += larguraParte;
      }
    }
    if (atual.trechos.length || !linhas.length) linhas.push(atual);
    return linhas;
  }
  function desenharLinhaRica(bloco: Extract<Bloco, { tipo: "texto" }>, linha: LinhaPdf, tamanhoFonte: number, x: number, y: number, larguraDisponivel: number) {
    let cursorX = bloco.alinhamento === "centro" ? x + (larguraDisponivel - linha.largura) / 2 : bloco.alinhamento === "direita" ? x + larguraDisponivel - linha.largura : x;
    for (const trecho of linha.trechos) {
      const larguraTrecho = trecho.fonte.widthOfTextAtSize(trecho.texto, tamanhoFonte);
      if (trecho.fundo) cursor.page.drawRectangle({ x: cursorX - 1, y: y - 3, width: larguraTrecho + 2, height: tamanhoFonte * 1.3, color: trecho.fundo });
      cursor.page.drawText(trecho.texto, { x: cursorX, y, size: tamanhoFonte, font: trecho.fonte, color: trecho.cor, xSkew: trecho.italico ? degrees(12) : undefined });
      if (trecho.sublinhado) cursor.page.drawLine({ start: { x: cursorX, y: y - 1.5 }, end: { x: cursorX + larguraTrecho, y: y - 1.5 }, thickness: 0.65, color: trecho.cor });
      cursorX += larguraTrecho;
    }
  }

  // ---- Síntese (quadro verde-claro; quebra entre páginas se o relato for
  // longo, repetindo o quadro sem o título).
  function desenharSintese(blocos: Extract<Bloco, { tipo: "texto" }>[], titulo: string) {
    const ids = blocos.map((bloco) => bloco.id);
    const linhas = blocos.length
      ? blocos.flatMap((bloco, i) => {
          return [
            ...(i > 0 ? [{ texto: "", bloco }] : []),
            ...linhasRicas(bloco, tamanho, largura - padding * 2).map((linha) => ({ texto: linha.texto, linha, bloco })),
          ];
        })
      : [{ texto: "Nenhuma observação registrada.", bloco: null }];

    let restantes = linhas;
    let primeiroQuadro = true;
    while (restantes.length > 0) {
      const cabecalho = primeiroQuadro ? 22 : 0;
      garantirEspaco(pdfDoc, cursor, padding * 2 + cabecalho + alturaLinha * 2);
      const fixo = padding * 2 + cabecalho;
      const cabem = linhasSemCortarFrase(restantes.map((linha) => linha.texto), linhasAqui(fixo), linhasPorPagina(fixo), paginaVazia());
      if (cabem === 0) {
        virarPagina();
        continue;
      }
      marcarInicio(ids);
      const trecho = restantes.slice(0, cabem);
      restantes = restantes.slice(cabem);

      const altura = padding * 2 + cabecalho + trecho.length * alturaLinha - 4;
      const topo = cursor.y;
      desenharCard(
        cursor.page,
        { x: DOSSIE_MARGEM_X, y: topo - altura, w: largura, h: altura },
        { raio: 8, cor: DOSSIE.sinteseFundo, corBorda: DOSSIE.sinteseBorda, larguraBorda: 0.8 }
      );
      let y = topo - padding - 7;
      if (primeiroQuadro) {
        tituloSecaoDossie(cursor.page, fontBold, titulo, DOSSIE_MARGEM_X + padding, y);
        y -= cabecalho;
      }
      for (const item of trecho) {
        if (item.texto) {
          const fundo = item.bloco ? corDestaque(item.bloco) : null;
          if (fundo) cursor.page.drawRectangle({ x: DOSSIE_MARGEM_X + padding - 3, y: y - 3, width: largura - padding * 2 + 6, height: alturaLinha, color: fundo });
          if (item.bloco && "linha" in item) desenharLinhaRica(item.bloco, item.linha, tamanho, DOSSIE_MARGEM_X + padding, y, largura - padding * 2);
          else cursor.page.drawText(item.texto, { x: DOSSIE_MARGEM_X + padding, y, size: tamanho, font: fontRegular, color: blocos.length ? DOSSIE.texto : DOSSIE.rodape });
        }
        y -= alturaLinha;
      }
      cursor.y = topo - altura - (restantes.length ? 0 : 28);
      primeiroQuadro = false;
    }
    marcarFim(ids);
  }

  // ---- Parágrafos soltos no meio do documento (fora do quadro).
  function desenharParagrafos(paragrafos: Extract<Bloco, { tipo: "texto" }>[]) {
    paragrafos.forEach((bloco, i) => {
      const tamanhoFonte = tamanhoDoTexto(bloco);
      const linhaAtual = alturaLinhaDoTexto(bloco, tamanhoFonte);
      cursor.y -= (bloco.margemSuperior ?? 0) * 0.75;
      if (i > 0) cursor.y -= linhaAtual / 2;
      let restantes = linhasRicas(bloco, tamanhoFonte, largura);
      while (restantes.length > 0) {
        const aqui = Math.floor((cursor.y - DOSSIE_ALTURA_RODAPE) / linhaAtual);
        const pagina = Math.floor((topoPagina - DOSSIE_ALTURA_RODAPE) / linhaAtual);
        const cabem = linhasSemCortarFrase(restantes.map((linha) => linha.texto), aqui, pagina, paginaVazia());
        if (cabem === 0) {
          virarPagina();
          continue;
        }
        marcarInicio([bloco.id]);
        for (const linha of restantes.slice(0, cabem)) {
          if (linha.texto) {
            const fundo = corDestaque(bloco);
            if (fundo) cursor.page.drawRectangle({ x: DOSSIE_MARGEM_X - 4, y: cursor.y - tamanhoFonte - 3, width: largura + 8, height: linhaAtual, color: fundo });
            desenharLinhaRica(bloco, linha, tamanhoFonte, DOSSIE_MARGEM_X, cursor.y - tamanhoFonte, largura);
          }
          cursor.y -= linhaAtual;
        }
        restantes = restantes.slice(cabem);
      }
      cursor.y -= (bloco.margemInferior ?? 0) * 0.75;
      marcarFim([bloco.id]);
    });
    cursor.y -= 20;
  }

  function desenharSecaoTexto(secao: Extract<SecaoLayout, { tipo: "secao_texto" }>) {
    const tituloSecao = paraPdf(tituloDaSecao(secao, tecnico));
    const blocosRender = secao.secao === "encaminhamentos" && secao.blocos.length > 0
      ? [{ ...secao.blocos[0], titulo: null, texto: secao.blocos.map((b, i) => `${i + 1}. ${b.texto}`).join("\n") }]
      : secao.blocos;
    // Encaminhamentos saem num card só: todos os blocos dividem a marcação.
    const idsDoCard = (bloco: { id: string }) =>
      secao.secao === "encaminhamentos" ? secao.blocos.map((b) => b.id) : [bloco.id];
    blocosRender.forEach((bloco, indice) => {
      const titulo = bloco.titulo?.trim();
      const linhasTitulo = titulo ? quebrarLinhas(fontBold, paraPdf(titulo), 9, largura - padding * 2).slice(0, 3) : [];
      const tamanhoFonte = tamanhoDoTexto(bloco);
      const alturaLinhaCard = alturaLinhaDoTexto(bloco, tamanhoFonte);
      let restantes = linhasRicas(bloco, tamanhoFonte, largura - padding * 2);
      let primeiraParte = true;
      while (restantes.length > 0) {
        const cabecalhoSecao = indice === 0 && primeiraParte ? 20 : 0;
        const cabecalhoCard = primeiraParte ? linhasTitulo.length * 12 + (linhasTitulo.length ? 8 : 0) : 0;
        garantirEspaco(pdfDoc, cursor, padding * 2 + alturaLinha * 2 + cabecalhoSecao + cabecalhoCard);
        // O título da seção vai junto com o card: decide antes de desenhá-lo.
        const fixo = padding * 2 + cabecalhoSecao + cabecalhoCard;
        const quantidade = linhasSemCortarFrase(
          restantes.map((linha) => linha.texto),
          Math.floor((cursor.y - DOSSIE_ALTURA_RODAPE - fixo) / alturaLinhaCard),
          Math.floor((topoPagina - DOSSIE_ALTURA_RODAPE - fixo) / alturaLinhaCard),
          paginaVazia()
        );
        if (quantidade === 0) {
          virarPagina();
          continue;
        }
        marcarInicio(idsDoCard(bloco));
        if (cabecalhoSecao) {
          tituloSecaoDossie(cursor.page, fontBold, tituloSecao, DOSSIE_MARGEM_X, cursor.y);
          cursor.y -= 20;
        }
        const trecho = restantes.slice(0, quantidade);
        restantes = restantes.slice(quantidade);
        const margemSuperior = primeiraParte ? (bloco.margemSuperior ?? 0) * 0.75 : 0;
        const margemInferior = restantes.length === 0 ? (bloco.margemInferior ?? 0) * 0.75 : 0;
        const altura = padding * 2 + trecho.length * alturaLinhaCard + cabecalhoCard + margemSuperior + margemInferior;
        const topo = cursor.y;
        desenharCard(cursor.page, { x: DOSSIE_MARGEM_X, y: topo - altura, w: largura, h: altura },
          { raio: 8, cor: corDestaque(bloco) ?? BRANCO, corBorda: DOSSIE.borda, larguraBorda: 0.8 });
        let y = topo - padding - 8 - margemSuperior;
        if (cabecalhoCard) {
          for (const linha of linhasTitulo) {
            cursor.page.drawText(linha, { x: DOSSIE_MARGEM_X + padding, y, size: 9, font: fontBold, color: DOSSIE.secao });
            y -= 12;
          }
          y -= 8;
        }
        for (const linha of trecho) {
          desenharLinhaRica(bloco, linha, tamanhoFonte, DOSSIE_MARGEM_X + padding, y, largura - padding * 2);
          y -= alturaLinhaCard;
        }
        cursor.y = topo - altura - (restantes.length ? 0 : gap);
        primeiraParte = false;
      }
      marcarFim(idsDoCard(bloco));
    });
    cursor.y -= 12;
  }

  // ---- Fotos e gráficos: cada bloco num card; a linha tem 1 ou 2 cards.
  const padFoto = 5;
  const tamanhoLegenda = 8.5;
  const linhaLegenda = 11.5;

  const tamanhoDaLegenda = (foto: Extract<Bloco, { tipo: "foto" }>) =>
    foto.legendaEstilo?.tamanho === "pequeno" ? 7 : foto.legendaEstilo?.tamanho === "grande" ? 11 : tamanhoLegenda;
  const fonteDaLegenda = (foto: Extract<Bloco, { tipo: "foto" }>) => (foto.legendaEstilo?.negrito ? fontBold : fontRegular);

  function legendaDaFoto(foto: Extract<Bloco, { tipo: "foto" }>, larguraCard: number) {
    return foto.legenda?.trim()
      ? quebrarLinhas(fonteDaLegenda(foto), paraPdf(foto.legenda.trim()), tamanhoDaLegenda(foto), larguraCard - padFoto * 2 - 8)
      : [];
  }

  function alturaDoCard(bloco: BlocoVisual, larguraCard: number): number {
    const margens = ((bloco.margemSuperior ?? 0) + (bloco.margemInferior ?? 0)) * 0.75;
    if (bloco.tipo === "grafico") return (larguraCard > larguraColuna + 1 ? 290 : 220) + margens;
    if (bloco.tipo === "tabela") return 38 + (bloco.linhas.length + 1) * 22 + margens;
    const larguraFoto = larguraCard - padFoto * 2;
    const alturaFoto = bloco.proporcao === "quadrada"
      ? larguraFoto
      : bloco.proporcao === "retrato"
        ? (larguraFoto * 4) / 3
        : bloco.proporcao === "panoramica"
          ? (larguraFoto * 9) / 21
          : (larguraFoto * 9) / 16;
    const legenda = legendaDaFoto(bloco, larguraCard);
    return padFoto + alturaFoto + (legenda.length ? 10 + legenda.length * (linhaLegenda * tamanhoDaLegenda(bloco) / tamanhoLegenda) : padFoto) + margens;
  }

  function desenharCardVisual(bloco: BlocoVisual, x: number, topo: number, larguraCard: number, alturaDaLinha?: number) {
    const margemSuperior = (bloco.margemSuperior ?? 0) * 0.75;
    const margemInferior = (bloco.margemInferior ?? 0) * 0.75;
    topo -= margemSuperior;
    const altura = (alturaDaLinha ?? alturaDoCard(bloco, larguraCard)) - margemSuperior - margemInferior;
    desenharCard(
      cursor.page,
      { x, y: topo - altura, w: larguraCard, h: altura },
      { raio: 8, cor: BRANCO, corBorda: DOSSIE.borda, larguraBorda: 0.8 }
    );
    if (bloco.tipo === "grafico") {
      desenharGrafico(
        cursor.page,
        fontRegular,
        bloco,
        { x: x + 14, y: topo - altura + 12, w: larguraCard - 28, h: altura - 26 },
        fontBold
      );
      return;
    }
    if (bloco.tipo === "tabela") {
      const colunas = Math.max(1, bloco.cabecalhos.length);
      const larguraCelula = (larguraCard - 24) / colunas;
      let y = topo - 18;
      if (bloco.titulo) {
        cursor.page.drawText(caber(fontBold, paraPdf(bloco.titulo), 9, larguraCard - 24), { x: x + 12, y, size: 9, font: fontBold, color: MARCA_AZUL });
        y -= 15;
      }
      const desenharLinha = (celulas: string[], cabecalho = false) => {
        celulas.forEach((celula, indice) => {
          const cx = x + 12 + indice * larguraCelula;
          cursor.page.drawRectangle({ x: cx, y: y - 16, width: larguraCelula, height: 17, color: cabecalho ? DOSSIE.fundoFoto : BRANCO, borderColor: DOSSIE.borda, borderWidth: 0.45 });
          cursor.page.drawText(caber(cabecalho ? fontBold : fontRegular, paraPdf(celula || "—"), 6.5, larguraCelula - 6), { x: cx + 3, y: y - 11, size: 6.5, font: cabecalho ? fontBold : fontRegular, color: COR_TEXTO });
        });
        y -= 17;
      };
      desenharLinha(bloco.cabecalhos, true);
      bloco.linhas.forEach((linha) => desenharLinha(bloco.cabecalhos.map((_, indice) => linha[indice] ?? "")));
      return;
    }
    const larguraFoto = larguraCard - padFoto * 2;
    const alturaFoto = bloco.proporcao === "quadrada"
      ? larguraFoto
      : bloco.proporcao === "retrato"
        ? (larguraFoto * 4) / 3
        : bloco.proporcao === "panoramica"
          ? (larguraFoto * 9) / 21
          : (larguraFoto * 9) / 16;
    const areaFoto = { x: x + padFoto, y: topo - padFoto - alturaFoto, w: larguraFoto, h: alturaFoto };
    cursor.page.drawRectangle({
      x: areaFoto.x, y: areaFoto.y, width: areaFoto.w, height: areaFoto.h, color: DOSSIE.fundoFoto,
    });
    const imagem = imagens.get(bloco.id);
    if (imagem) {
      if (bloco.ajuste === "conter") desenharImagemContain(cursor.page, imagem, areaFoto);
      else desenharImagemCover(cursor.page, imagem, areaFoto, bloco.focoX, bloco.focoY, bloco.zoom);
    }
    let y = areaFoto.y - 14;
    const tamLegenda = tamanhoDaLegenda(bloco);
    const fonteLegenda = fonteDaLegenda(bloco);
    const alinhLegenda = bloco.legendaEstilo?.alinhamento;
    const larguraUtil = larguraCard - padFoto * 2 - 8;
    for (const linha of legendaDaFoto(bloco, larguraCard)) {
      const larguraLinha = fonteLegenda.widthOfTextAtSize(linha, tamLegenda);
      cursor.page.drawText(linha, {
        x: x + padFoto + 4 + (alinhLegenda === "centro" ? (larguraUtil - larguraLinha) / 2 : alinhLegenda === "direita" ? larguraUtil - larguraLinha : 0),
        y, size: tamLegenda, font: fonteLegenda, color: DOSSIE.legenda,
      });
      y -= linhaLegenda * tamLegenda / tamanhoLegenda;
    }
  }

  function desenharSecaoVisual(secao: Extract<SecaoLayout, { tipo: "visual" }>) {
    secao.linhas.forEach((linha, indiceLinha) => {
      const larguraCard = (bloco: BlocoVisual) => larguraDoBloco(bloco) === "inteira" ? largura : larguraDoBloco(bloco) === "metade" ? larguraColuna : larguraTerco;
      const alturaLinhaGrade = Math.max(...linha.map((b) => alturaDoCard(b, larguraCard(b))));
      const precisaTitulo = indiceLinha === 0;
      garantirEspaco(pdfDoc, cursor, alturaLinhaGrade + (precisaTitulo ? 22 : 0));
      marcarInicio(linha.map((b) => b.id));
      if (precisaTitulo) {
        tituloSecaoDossie(
          cursor.page,
          fontBold,
          paraPdf(tituloDaSecao(secao, tecnico)),
          DOSSIE_MARGEM_X,
          cursor.y
        );
        cursor.y -= 14;
      }
      const topo = cursor.y;
      let x = DOSSIE_MARGEM_X;
      linha.forEach((bloco) => {
        const larguraAtual = larguraCard(bloco);
         desenharCardVisual(bloco, x, topo, larguraAtual, alturaLinhaGrade);
        x += larguraAtual + gap;
      });
      cursor.y = topo - alturaLinhaGrade - gap;
    });
    cursor.y -= 14;
  }

  for (const secao of secoes) {
    // "Nova página" no editor: a seção vai pro topo de uma página nova
    // (a não ser que a página atual ainda esteja vazia).
    if (secao.novaPagina && cursor.y < topoPagina - 1) {
      cursor.page = novaPaginaDossie(pdfDoc);
      cursor.y = topoPagina;
    }
    const comTexto = (blocos: Extract<Bloco, { tipo: "texto" }>[]) =>
      blocos.map((b) => ({ ...b, texto: paraPdf(b.texto).trim() })).filter((b) => b.texto);
    if (secao.tipo === "sintese") {
      desenharSintese(
        comTexto(secao.blocos),
        paraPdf(tituloDaSecao(secao, tecnico))
      );
    } else if (secao.tipo === "texto") desenharParagrafos(comTexto(secao.blocos));
    else if (secao.tipo === "secao_texto") desenharSecaoTexto(secao);
    else if (secao.tipo === "visual") desenharSecaoVisual(secao);
  }

  // A capa com foto não leva rodapé nem entra na paginação.
  const paginas = pdfDoc.getPages().slice(temCapa ? 1 : 0);
  // Rodapé tem tamanho próprio, independente da logo da capa.
  const parceiroRodape = logoParceiro && { ...logoParceiro, escala: dados.escalaLogoParceiroPaginas ?? 1 };
  const cabecalho: DadosCabecalhoDossie = {
    consultorNome: dados.consultorNome,
    safraNome: dados.safraNome,
    dataFmt: dados.dataFmt,
    rotuloData: tecnico ? "VISITA TÉCNICA" : "DATA DA VISITA",
    logoPrincipal,
    escalaLogoPrincipal: dados.escalaLogoPrincipal,
  };
  paginas.forEach((page) => {
    desenharCabecalhoDossie(page, fontBold, fontRegular, cabecalho);
    desenharRodapeDossie(page, fontBold, parceiroRodape);
  });
  mapa.totalPaginas = paginas.length;
  return mapa;
}

// Paginação do relatório sem gerar o PDF de verdade: a tela e o
// editor mostram "Página 2" onde o PDF vai quebrar. Usa o mesmo desenho do
// dossiê (mesmas fontes e medidas), então a quebra bate com o arquivo.
export async function mapaDePaginas(dados: {
  tipo?: "VISITA" | "TECNICO";
  clienteNome: string;
  fazendaNome?: string | null;
  consultorNome: string;
  titulo: string | null;
  dataVisita: Date;
  blocos: Bloco[];
  safraNome?: string | null;
  rastreamento?: RastreamentoVisita;
  orientacao?: "PAISAGEM" | "RETRATO";
  semCapa?: boolean;
}): Promise<MapaPaginas | null> {
  const tecnico = tipoEfetivoRelatorio(dados.tipo ?? "VISITA", dados.blocos) === "TECNICO";
  const pdfDoc = await PDFDocument.create();
  await prepararMarcaPdf(pdfDoc);
  const { regular, bold } = await embutirFontesMarca(pdfDoc);
  return gerarDossieTecnico(
    pdfDoc,
    regular,
    bold,
    {
      clienteNome: dados.clienteNome,
      fazendaNome: dados.fazendaNome ?? null,
      consultorNome: dados.consultorNome,
      titulo: dados.titulo,
      dataFmt: dados.dataVisita.toLocaleDateString("pt-BR"),
      blocos: dados.blocos,
      safraNome: dados.safraNome,
      tecnico,
      orientacao: dados.orientacao,
      semCapa: dados.semCapa,
    },
    { soPaginacao: true }
  );
}

// O título do relatório muitas vezes é só o nome do cliente (o bot usa o
// cliente como título); aí a capa ficaria com o nome repetido. Nesse caso,
// ou sem título, usa o nome do documento.
function tituloDoRelatorio(titulo: string | null, clienteNome: string, tecnico = true): string {
  const t = titulo?.trim();
  if (!t || t.toLowerCase() === clienteNome.trim().toLowerCase()) return tecnico ? "Relatório técnico" : "Relatório de visita";
  return t;
}

// Capa do relatório técnico (laudo/ensaio), primeira página do dossiê:
// fundo claro com a logo no topo, título grande no azul da marca, foto de
// capa sangrando na metade de baixo (sem foto: bloco azul com o símbolo como
// marca d'água) e uma faixa azul com data/responsável/safra fechando a folha.
// Capa no padrão "Difusão de Tecnologia": logo da empresa e do parceiro no
// topo, faixa verde, título grande (com a foto escolhida ao lado/abaixo) e,
// no pé, faixas verde/azul com consultor, safra, data e cliente.
async function desenharCapaTecnica(
  pdfDoc: PDFDocument,
  fontBold: PDFFont,
  fontRegular: PDFFont,
  dados: {
    titulo: string | null;
    clienteNome: string;
    fazendaNome?: string | null;
    consultorNome: string;
    dataFmt?: string;
    safraNome?: string | null;
    fotoCapaUrl?: string | null;
    fotoCapaFocoX?: number;
    fotoCapaFocoY?: number;
    tecnico: boolean;
    rastreamento?: RastreamentoVisita;
    logoParceiro?: MarcaParceiroPdf | null;
    logoPrincipal?: PDFImage | null;
    escalaLogoPrincipal?: number;
    logoPrincipalTexto?: string | null;
  }
) {
  const { w: L, h: A } = folhaDe(pdfDoc);
  const paisagem = L > A;
  const page = pdfDoc.addPage([L, A]);
  const margem = 34;
  page.drawRectangle({ x: 0, y: 0, width: L, height: A, color: DOSSIE.fundo });

  // Topo: logo da empresa | logo do parceiro.
  const eLogo = dados.escalaLogoPrincipal ?? 1;
  const larguraLogoEsq = desenharLogoPrincipal(page, dados.logoPrincipal, { x: margem, yTopo: A - 52 + 22 * eLogo, altura: 44 * eLogo, larguraMax: L * 0.35 });
  const linhasMarca = (dados.logoPrincipalTexto ?? "").split("\n").map((l) => l.trim()).filter(Boolean);
  if (linhasMarca.length) {
    const x = margem + larguraLogoEsq + 22;
    page.drawLine({ start: { x: x - 11, y: A - 30 }, end: { x: x - 11, y: A - 76 }, thickness: 0.6, color: DOSSIE.borda });
    const [rotulo, ...resto] = linhasMarca;
    const nome = resto.join(" ");
    if (nome) textoEspacado(page, rotulo.toUpperCase(), { x, y: A - 38, size: 6.5, font: fontBold, color: DOSSIE.rodape, espaco: 1.4 });
    page.drawText(paraPdf(nome || rotulo), { x, y: A - 55, size: 14, font: fontBold, color: MARCA_AZUL });
    page.drawText("uma iniciativa", { x, y: A - 72, size: 8, font: fontRegular, color: DOSSIE.rodape });
    desenharLogo(page, { x: x + fontRegular.widthOfTextAtSize("uma iniciativa", 8) + 5, yTopo: A - 64, altura: 10 });
  }
  if (dados.logoParceiro) {
    desenharMarcaParceiro(page, fontBold, dados.logoParceiro, { xDireita: L - margem, yBase: A - 76, alturaMax: 34, larguraMax: 170, tamanhoRotulo: 7 });
  }
  page.drawRectangle({ x: 0, y: A - 104, width: L, height: 8, color: MARCA_VERDE });

  // Pé: faixas + dados do documento.
  const r = dados.rastreamento;
  const itens = ([
    ["CONSULTOR", dados.consultorNome],
    ["SAFRA", dados.safraNome ?? ""],
    [dados.tecnico ? "VISITA TÉCNICA" : "DATA DA VISITA", dados.dataFmt ?? ""],
    ["CLIENTE", dados.clienteNome],
    ["FINALIDADE", r?.finalidade ?? ""],
    ["CHEGADA", r?.horaChegada ? fmtDataHora(r.horaChegada) : ""],
    ["SAÍDA", r?.horaSaida ? fmtDataHora(r.horaSaida) : ""],
    ["KM RODADO", r?.kmChegada != null && r?.kmSaida != null ? fmtKm(r.kmSaida - r.kmChegada) : ""],
    ["LOCALIZAÇÃO", r?.latitude != null && r?.longitude != null ? `${r.latitude.toFixed(5)}, ${r.longitude.toFixed(5)}` : ""],
  ] as [string, string][]).filter(([, valor]) => Boolean(valor));
  const colunas = 4;
  const linhas = Math.ceil(itens.length / colunas);
  const alturaPe = 34 + linhas * 40;
  page.drawRectangle({ x: 0, y: alturaPe + 8, width: L, height: 8, color: MARCA_VERDE });
  page.drawRectangle({ x: 0, y: alturaPe, width: L, height: 8, color: MARCA_AZUL });
  const larguraColuna = (L - margem * 2) / colunas;
  itens.forEach(([rotulo, valor], i) => {
    const x = margem + (i % colunas) * larguraColuna;
    const y = alturaPe - 30 - Math.floor(i / colunas) * 40;
    textoEspacado(page, rotulo, { x, y, size: 6.5, font: fontBold, color: DOSSIE.rotuloCabecalho, espaco: 1.2 });
    page.drawText(caber(fontRegular, paraPdf(valor), 11, larguraColuna - 12), { x, y: y - 16, size: 11, font: fontRegular, color: MARCA_AZUL });
  });

  // Miolo: título (e foto de capa, se houver).
  const topo = A - 104;
  const base = alturaPe + 16;
  const foto = dados.fotoCapaUrl ? await embutirImagem(pdfDoc, dados.fotoCapaUrl) : null;
  let larguraTexto = L - margem * 2;
  let yMeio = (topo + base) / 2;
  if (foto && paisagem) {
    const w = L * 0.4;
    const h = Math.min(topo - base - 48, w * 0.75);
    desenharImagemCover(page, foto, { x: L - margem - w, y: (topo + base) / 2 - h / 2, w, h }, dados.fotoCapaFocoX, dados.fotoCapaFocoY);
    larguraTexto -= w + 30;
  } else if (foto) {
    const h = (topo - base) * 0.42;
    desenharImagemCover(page, foto, { x: margem, y: base + 24, w: L - margem * 2, h }, dados.fotoCapaFocoX, dados.fotoCapaFocoY);
    yMeio = (topo + base + 24 + h) / 2;
  }
  const titulo = tituloDoRelatorio(dados.titulo, dados.clienteNome, dados.tecnico);
  const tamanho = paisagem ? 40 : 34;
  const linhasTitulo = quebrarLinhas(fontBold, paraPdf(titulo), tamanho, larguraTexto).slice(0, 3);
  const alturaBloco = 30 + linhasTitulo.length * tamanho * 1.12 + 30;
  let y = yMeio + alturaBloco / 2;
  page.drawRectangle({ x: margem, y: y - 3, width: 30, height: 2.5, color: MARCA_VERDE });
  textoEspacado(page, dados.tecnico ? "DOSSIÊ TÉCNICO · RELATÓRIO DE CAMPO" : "RELATÓRIO DE VISITA", {
    x: margem + 40, y: y - 5, size: 8, font: fontBold, color: DOSSIE.rotuloCabecalho, espaco: 2,
  });
  y -= 30 + tamanho;
  for (const linha of linhasTitulo) {
    page.drawText(linha, { x: margem, y, size: tamanho, font: fontBold, color: MARCA_AZUL });
    y -= tamanho * 1.12;
  }
  const sub = [dados.clienteNome, dados.fazendaNome, dados.safraNome ? `Safra ${dados.safraNome}` : null].filter(Boolean).join(" · ");
  page.drawText(caber(fontRegular, paraPdf(sub), 15, larguraTexto), { x: margem, y: y - 8, size: 15, font: fontRegular, color: COR_MUTED });
}

export async function gerarPdfRelatorioVisita(dados: {
  tipo?: "VISITA" | "TECNICO";
  clienteNome: string;
  fazendaNome?: string | null;
  consultorNome: string;
  titulo: string | null;
  dataVisita: Date;
  blocos: Bloco[];
  rastreamento?: RastreamentoVisita;
  safraNome?: string | null;
  // Configuráveis em Propriedades; o padrão é mostrar.
  mostrarLocalizacao?: boolean;
  mostrarHorarios?: boolean;
  semCapa?: boolean;
  // Logo do parceiro (URL acessível pelo servidor): capa e rodapé.
  logoParceiroUrl?: string | null;
  // Texto acima da logo; nulo = sem rótulo (programa da empresa).
  logoParceiroRotulo?: string | null;
  // Logo da esquerda escolhida no relatório; nulo = logo da empresa.
  logoPrincipalUrl?: string | null;
  logoPrincipalTexto?: string | null;
  escalaLogoPrincipal?: number;
  escalaLogoPrincipalPaginas?: number;
  escalaLogoParceiro?: number;
  escalaLogoParceiroPaginas?: number;
  orientacao?: "PAISAGEM" | "RETRATO";
}): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  await prepararMarcaPdf(pdfDoc);
  const { regular: fontRegular, bold: fontBold } = await embutirFontesMarca(pdfDoc);

  const dataFmt = dados.dataVisita.toLocaleDateString("pt-BR");
  const r = dados.rastreamento && {
    ...dados.rastreamento,
    ...(dados.mostrarLocalizacao === false ? { latitude: null, longitude: null } : {}),
    ...(dados.mostrarHorarios === false ? { horaChegada: null, horaSaida: null } : {}),
  };
  const tecnico = tipoEfetivoRelatorio(dados.tipo ?? "VISITA", dados.blocos) === "TECNICO";

  // Os dois tipos usam o mesmo fluxo editorial multipágina. Assim texto,
  // gráfico, foto e legenda têm exatamente as mesmas regras de quebra.
  await gerarDossieTecnico(pdfDoc, fontRegular, fontBold, {
    clienteNome: dados.clienteNome,
    fazendaNome: dados.fazendaNome ?? null,
    consultorNome: dados.consultorNome,
    titulo: dados.titulo,
    dataFmt,
    blocos: dados.blocos,
    safraNome: dados.safraNome,
    tecnico,
    rastreamento: r,
    logoParceiroUrl: dados.logoParceiroUrl,
    logoParceiroRotulo: dados.logoParceiroRotulo,
    logoPrincipalUrl: dados.logoPrincipalUrl,
    escalaLogoPrincipal: dados.escalaLogoPrincipal,
    logoPrincipalTexto: dados.logoPrincipalTexto,
    escalaLogoPrincipalPaginas: dados.escalaLogoPrincipalPaginas,
    escalaLogoParceiro: dados.escalaLogoParceiro,
    escalaLogoParceiroPaginas: dados.escalaLogoParceiroPaginas,
    semCapa: dados.semCapa,
    orientacao: dados.orientacao,
  });
  return pdfDoc.save();
}

// Gráfico avulso pedido no WhatsApp ("gráfico das minhas despesas do mês"):
// uma página só, no visual da marca, com o mesmo desenho do gráfico do
// relatório. Vai como PDF (não imagem) porque as fontes da marca só existem
// como arquivo embutido — rasterizar texto no servidor dependeria das fontes
// instaladas no container. A página é pequena de propósito: o WhatsApp mostra
// a prévia ajustada à tela e o texto fica legível.
export async function gerarPdfGrafico(dados: {
  titulo: string;
  subtitulo?: string | null;
  consultorNome: string;
  grafico: Pick<BlocoGrafico, "formato" | "series" | "linhas" | "unidade" | "eixoX" | "eixoY" | "cores">;
}): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  await prepararMarcaPdf(pdfDoc);
  const { regular: fontRegular, bold: fontBold } = await embutirFontesMarca(pdfDoc);
  const largura = 480;
  const altura = 320;
  const margem = 22;
  const page = pdfDoc.addPage([largura, altura]);
  page.drawRectangle({ x: 0, y: 0, width: largura, height: altura, color: BRANCO });
  page.drawRectangle({ x: 0, y: altura - 4, width: largura, height: 4, color: VERDE });

  desenharLogo(page, { x: margem, yTopo: altura - 16, altura: 14 });
  let yTexto = altura - 50;
  page.drawText(caber(fontBold, dados.titulo, 12, largura - margem * 2), {
    x: margem, y: yTexto, size: 12, font: fontBold, color: COR_TEXTO,
  });
  if (dados.subtitulo) {
    yTexto -= 13;
    page.drawText(caber(fontRegular, dados.subtitulo, 7.5, largura - margem * 2), {
      x: margem, y: yTexto, size: 7.5, font: fontRegular, color: COR_MUTED,
    });
  }

  const bloco: BlocoGrafico = {
    id: "grafico",
    tipo: "grafico",
    titulo: "",
    ...dados.grafico,
    pagina: 0, x: 0, y: 0, w: 0, h: 0,
  };
  const base = 26;
  desenharGrafico(
    page,
    fontRegular,
    bloco,
    { x: margem, y: base, w: largura - margem * 2, h: yTexto - 14 - base },
    fontBold
  );

  const rodape = `Gerado para ${dados.consultorNome} em ${new Date().toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  })}`;
  page.drawText(caber(fontRegular, rodape, 6, largura - margem * 2), {
    x: margem, y: 10, size: 6, font: fontRegular, color: COR_MUTED,
  });

  return pdfDoc.save();
}
