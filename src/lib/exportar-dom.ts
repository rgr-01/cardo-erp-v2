import { toPng } from "html-to-image";
import { PDFDocument } from "pdf-lib";

const COR_FUNDO = "#10232a";
const ESCALA = 2;

function dataUrlParaBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(",")[1] ?? "";
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

export async function elementoParaPng(elemento: HTMLElement, fundo = "#ffffff"): Promise<Blob> {
  const dataUrl = await toPng(elemento, {
    pixelRatio: ESCALA,
    backgroundColor: fundo,
    width: elemento.scrollWidth,
    height: elemento.scrollHeight,
    cacheBust: true,
  });
  return new Blob([dataUrlParaBytes(dataUrl) as BlobPart], { type: "image/png" });
}

// Fotografa o elemento como está na tela e devolve um PDF de uma página
// com o tamanho exato da imagem, para o PDF sair igual ao dashboard.
export async function elementoParaPdf(elemento: HTMLElement): Promise<Blob> {
  const largura = elemento.scrollWidth;
  const altura = elemento.scrollHeight;

  const dataUrl = await toPng(elemento, {
    pixelRatio: ESCALA,
    backgroundColor: COR_FUNDO,
    width: largura,
    height: altura,
    cacheBust: true,
    filter: (no) => !(no instanceof HTMLElement && no.dataset.semExport !== undefined),
  });

  const pdf = await PDFDocument.create();
  const imagem = await pdf.embedPng(dataUrlParaBytes(dataUrl));
  const pagina = pdf.addPage([largura, altura]);
  pagina.drawImage(imagem, { x: 0, y: 0, width: largura, height: altura });

  const bytes = await pdf.save();
  return new Blob([bytes as BlobPart], { type: "application/pdf" });
}

export function baixarBlob(blob: Blob, nomeArquivo: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = nomeArquivo;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function slugArquivo(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
