// PDF do relatório gerado a partir da PRÓPRIA página web (a mesma que o usuário
// vê na tela), impressa por um Chromium sem tela. Assim texto, gráficos,
// barras, fotos e cores saem idênticos — não existe um segundo desenho a manter.
//
// O Chromium abre /api/pdf-render/[id] (fora do login, protegida por um token
// assinado de curta duração, ver tokenRenderPdf). Se o navegador não subir, o
// chamador cai no gerador interno (relatorio-pdf.ts) em vez de falhar.

import { createHmac, timingSafeEqual } from "crypto";
import { existsSync } from "fs";
import type { Browser, Page } from "puppeteer-core";
import { prisma } from "@/lib/prisma";
import { orientacaoDe } from "@/lib/relatorio-conteudo";
import { PDFDocument } from "pdf-lib";
import { createCanvas, loadImage } from "canvas";
import { paginasComoJpeg } from "@/lib/pdf-para-imagem";

// A tela de leitura tem no máximo 1024px de largura (max-w-5xl). O PDF em
// retrato é impresso com essa largura de layout, reduzida pra caber no A4; o
// em paisagem usa 1448px (mesma escala, folha deitada).
const LARGURA_LAYOUT = { RETRATO: 1024, PAISAGEM: 1448 } as const;
const LARGURA_A4_PX = { RETRATO: 793.7, PAISAGEM: 1122.5 } as const;
const VALIDADE_TOKEN_MS = 2 * 60 * 1000;
const MAX_SIMULTANEOS = 2;

function segredo(): string {
  const valor = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
  if (!valor) throw new Error("AUTH_SECRET não configurado: não dá pra assinar a renderização do PDF.");
  return valor;
}

function assinatura(id: string, expira: number): string {
  return createHmac("sha256", segredo()).update(`pdf-render:${id}:${expira}`).digest("hex");
}

export function tokenRenderPdf(id: string): string {
  const expira = Date.now() + VALIDADE_TOKEN_MS;
  return `${expira}.${assinatura(id, expira)}`;
}

export function tokenRenderPdfValido(id: string, token: string | undefined): boolean {
  if (!token) return false;
  const [expiraTexto, recebida] = token.split(".");
  const expira = Number(expiraTexto);
  if (!recebida || !Number.isFinite(expira) || expira < Date.now()) return false;
  try {
    const esperada = Buffer.from(assinatura(id, expira));
    const informada = Buffer.from(recebida);
    return esperada.length === informada.length && timingSafeEqual(esperada, informada);
  } catch {
    return false;
  }
}

// "localhost" (e não 127.0.0.1): o servidor de desenvolvimento do Next bloqueia
// os scripts de outras origens e a página não hidrataria (gráficos em branco).
function urlBase(): string {
  return (process.env.PDF_RENDER_BASE_URL || `http://localhost:${process.env.PORT || 3000}`).replace(/\/$/, "");
}

const NAVEGADORES_LOCAIS = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
];

async function abrirNavegador(): Promise<Browser> {
  const puppeteer = (await import("puppeteer-core")).default;

  // Máquina de desenvolvimento (Windows/Mac): usa o Chrome instalado.
  const local = process.env.CHROME_PATH || NAVEGADORES_LOCAIS.find((caminho) => existsSync(caminho));
  if (process.platform !== "linux" || process.env.CHROME_PATH) {
    if (!local) throw new Error("Navegador não encontrado. Defina CHROME_PATH com o caminho do Chrome.");
    return puppeteer.launch({ executablePath: local, headless: true });
  }

  // Servidor (Linux): Chromium embutido no pacote. Ele só extrai as bibliotecas
  // de sistema de que precisa se achar que roda num ambiente AL2023 — a variável
  // tem que existir ANTES do primeiro import do pacote.
  const nodeMajor = process.versions.node.split(".")[0];
  process.env.AWS_EXECUTION_ENV ||= `AWS_Lambda_nodejs${nodeMajor}.x`;
  const chromium = (await import("@sparticuz/chromium")).default;
  return puppeteer.launch({
    args: await puppeteer.defaultArgs({ args: chromium.args, headless: "shell" }),
    executablePath: await chromium.executablePath(),
    headless: "shell",
  });
}

// Chromium pesa na memória: no máximo MAX_SIMULTANEOS PDFs ao mesmo tempo.
let emUso = 0;
const fila: (() => void)[] = [];

async function comVaga<T>(tarefa: () => Promise<T>): Promise<T> {
  if (emUso >= MAX_SIMULTANEOS) await new Promise<void>((liberar) => fila.push(liberar));
  emUso += 1;
  try {
    return await tarefa();
  } finally {
    emUso -= 1;
    fila.shift()?.();
  }
}

// Espera fontes, fotos e gráficos (desenhados no navegador depois que a
// página carrega) antes de imprimir.
async function esperarPagina(pagina: Page) {
  await pagina.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(
      Array.from(document.images).map((img) =>
        img.complete ? null : new Promise((fim) => { img.onload = img.onerror = fim; })
      )
    );
    const graficos = document.querySelectorAll(".recharts-responsive-container").length;
    const inicio = Date.now();
    while (document.querySelectorAll(".recharts-surface").length < graficos && Date.now() - inicio < 10_000) {
      await new Promise((fim) => setTimeout(fim, 100));
    }
  });
}

// Respiro entre o cabeçalho e o conteúdo de cada folha: 2 cm impressos.
const RESPIRO_CABECALHO_MM = 20;
const PX_PARA_MM = 25.4 / 96;

// numerar: prévia do bot (previa_relatorio) — cada item ganha um número na
// página, o mesmo de itensDoRelatorio, pro consultor dizer "muda o 3".
//
// Impressão em duas partes. Com a mídia "screen" (que garante o visual da
// tela) o Chromium não repete o <thead> nas folhas seguintes, então:
// 1) imprime a MOLDURA (cabeçalho + rodapé numa folha transparente) e mede a
//    altura de cada um;
// 2) imprime o CONTEÚDO com margem de @page em cima (cabeçalho + 2 cm) e
//    embaixo (rodapé) em toda folha — a capa, se houver, fica sem margem;
// 3) carimba a moldura em cada folha do conteúdo (menos a capa).
export async function gerarPdfPelaPaginaWeb(relatorioId: string, opcoes: { numerar?: boolean } = {}): Promise<Uint8Array> {
  return comVaga(async () => {
    const navegador = await abrirNavegador();
    try {
      const { orientacao, semCapa } = await prisma.relatorioVisita.findUniqueOrThrow({
        where: { id: relatorioId },
        select: { orientacao: true, semCapa: true },
      });
      const folha = orientacaoDe(orientacao);
      const escala = LARGURA_A4_PX[folha] / LARGURA_LAYOUT[folha];
      const abrir = async (extra: string) => {
        const pagina = await navegador.newPage();
        await pagina.setViewport({ width: LARGURA_LAYOUT[folha], height: 1400, deviceScaleFactor: 1 });
        const url = `${urlBase()}/api/pdf-render/${encodeURIComponent(relatorioId)}?t=${tokenRenderPdf(relatorioId)}${extra}`;
        const resposta = await pagina.goto(url, { waitUntil: "networkidle0", timeout: 60_000 });
        if (!resposta?.ok()) throw new Error(`A página de renderização respondeu ${resposta?.status() ?? "sem resposta"}.`);
        await esperarPagina(pagina);
        await pagina.emulateMediaType("screen");
        return pagina;
      };
      const imprimir = (pagina: Page) => pagina.pdf({ printBackground: true, preferCSSPageSize: true, scale: escala });

      const paginaMoldura = await abrir("&m=moldura");
      const alturas = await paginaMoldura.evaluate(() => ({
        cabecalho: document.querySelector("[data-moldura=cabecalho]")?.getBoundingClientRect().height ?? 0,
        rodape: document.querySelector("[data-moldura=rodape]")?.getBoundingClientRect().height ?? 0,
      }));
      const moldura = await imprimir(paginaMoldura);

      const mt = (alturas.cabecalho * escala * PX_PARA_MM + RESPIRO_CABECALHO_MM).toFixed(1);
      const mb = (alturas.rodape * escala * PX_PARA_MM + 2).toFixed(1);
      const conteudo = await imprimir(await abrir(`&m=conteudo&mt=${mt}&mb=${mb}${opcoes.numerar ? "&n=1" : ""}`));

      const doc = await PDFDocument.load(conteudo);
      const [folhaMoldura] = await doc.embedPdf(moldura, [0]);
      doc.getPages().forEach((pag, i) => {
        if (i === 0 && !semCapa) return;
        const { width, height } = pag.getSize();
        pag.drawPage(folhaMoldura, { x: 0, y: 0, width, height });
      });
      return await semPaginasEmBranco(await doc.save());
    } finally {
      await navegador.close().catch(() => {});
    }
  });
}

// PDF idêntico à página; se o Chromium falhar, usa o gerador interno pra o
// download não quebrar (e registra o motivo no log do servidor).
export async function pdfIdenticoAPagina(
  relatorioId: string,
  alternativa: () => Promise<Uint8Array>,
  opcoes: { numerar?: boolean } = {}
): Promise<Uint8Array> {
  try {
    return await gerarPdfPelaPaginaWeb(relatorioId, opcoes);
  } catch (error) {
    console.error("[PDF] Chromium indisponível, usando o gerador interno:", error);
    return alternativa();
  }
}

// O Chromium às vezes solta uma folha a mais no fim, só com o rodapé fixo
// (conteúdo que passa poucos pixels da última folha). Uma página é "em branco"
// quando tudo acima do rodapé (88% de cima) é branco; a primeira nunca sai.
export async function semPaginasEmBranco(pdf: Uint8Array): Promise<Uint8Array> {
  try {
    const imagens = await paginasComoJpeg(Buffer.from(pdf), 40, 0.3);
    const vazias: number[] = [];
    for (const [i, jpeg] of imagens.entries()) {
      if (i === 0) continue;
      const img = await loadImage(jpeg);
      const canvas = createCanvas(img.width, img.height);
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0);
      const { data } = ctx.getImageData(0, 0, img.width, Math.floor(img.height * 0.88));
      let marcados = 0;
      for (let p = 0; p < data.length; p += 4) if (data[p] < 235 || data[p + 1] < 235 || data[p + 2] < 235) marcados++;
      if (marcados / (data.length / 4) < 0.002) vazias.push(i);
    }
    if (vazias.length === 0) return pdf;
    const doc = await PDFDocument.load(pdf);
    for (const i of vazias.reverse()) doc.removePage(i);
    return await doc.save();
  } catch (error) {
    console.error("[PDF] não consegui conferir páginas em branco:", error);
    return pdf;
  }
}
