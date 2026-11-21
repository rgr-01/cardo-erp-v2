// PDF do plano de contas (orçado x realizado). Roda no navegador, a partir dos
// mesmos números que a tela mostra, então o relatório sempre bate com o painel.

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

export type ValoresPlano = { r: number; o: number; ra: number; oa: number };
export type GrupoPdf = ValoresPlano & {
  nome: string;
  contas: (ValoresPlano & { codigo: string; nome: string })[];
};

const MM = 72 / 25.4;
const W = 297;
const H = 210;
const M = 12;

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }).replace(/ /g, " ");

const variacao = (r: number, o: number, temOrc: boolean) => {
  if (!temOrc || !o) return "-";
  const v = (r / o - 1) * 100;
  return (v > 0 ? "+" : "") + v.toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + "%";
};

const COLUNAS: { titulo: string; largura: number; dir: boolean }[] = [
  { titulo: "Conta", largura: 92, dir: false },
  { titulo: "Realizado mês", largura: 28, dir: true },
  { titulo: "Orçado mês", largura: 28, dir: true },
  { titulo: "Var. %", largura: 18, dir: true },
  { titulo: "Acum. safra", largura: 30, dir: true },
  { titulo: "Orçado acum.", largura: 30, dir: true },
  { titulo: "Var. %", largura: 18, dir: true },
  { titulo: "% total", largura: 19, dir: true },
];

export async function gerarPdfPlanoDespesas(opts: {
  subtitulo: string;
  grupos: GrupoPdf[];
  total: ValoresPlano;
  temOrc: boolean;
  // Gerado no navegador: o nome vem da tela (contexto da marca).
  nomeEmpresa?: string;
}): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const nomeEmpresa = opts.nomeEmpresa ?? "";
  const fonte = await pdf.embedFont(StandardFonts.Helvetica);
  const negrito = await pdf.embedFont(StandardFonts.HelveticaBold);
  const escala = (W - 2 * M) / COLUNAS.reduce((s, c) => s + c.largura, 0);
  const cols = COLUNAS.map((c) => ({ ...c, largura: c.largura * escala }));

  let page: PDFPage;
  let y = 0; // mm a partir do topo

  const py = (mm: number) => (H - mm) * MM;
  const texto = (
    t: string,
    xMm: number,
    yMm: number,
    f: PDFFont,
    size: number,
    cor: [number, number, number],
    dir = false
  ) => {
    const x = xMm * MM - (dir ? f.widthOfTextAtSize(t, size) : 0);
    page.drawText(t, { x, y: py(yMm), size, font: f, color: rgb(cor[0] / 255, cor[1] / 255, cor[2] / 255) });
  };
  const faixa = (yMm: number, altura: number, cor: [number, number, number]) =>
    page.drawRectangle({
      x: M * MM,
      y: py(yMm + altura),
      width: (W - 2 * M) * MM,
      height: altura * MM,
      color: rgb(cor[0] / 255, cor[1] / 255, cor[2] / 255),
    });
  const cortar = (t: string, f: PDFFont, size: number, larguraMm: number) => {
    let s = t;
    while (s.length > 1 && f.widthOfTextAtSize(s, size) > larguraMm * MM) s = s.slice(0, -1);
    return s;
  };

  const cabecalho = () => {
    page = pdf.addPage([W * MM, H * MM]);
    texto("Despesas administrativas gerais", M, 16, negrito, 15, [30, 30, 30]);
    texto(opts.subtitulo, M, 22, fonte, 9, [90, 90, 90]);
    y = 28;
    faixa(y, 7, [232, 240, 238]);
    let x = M;
    for (const c of cols) {
      texto(c.titulo, c.dir ? x + c.largura - 2 : x + 2, y + 4.8, negrito, 8.5, [30, 30, 30], c.dir);
      x += c.largura;
    }
    y += 7;
  };

  const rodapes: PDFPage[] = [];
  const fechaPagina = () => rodapes.push(page);

  const linha = (
    rotulo: string,
    v: ValoresPlano,
    negritoLinha: boolean,
    fundo: [number, number, number] | null,
    recuo: boolean
  ) => {
    if (y > 190) {
      fechaPagina();
      cabecalho();
    }
    if (fundo) faixa(y, 6.3, fundo);
    const f = negritoLinha ? negrito : fonte;
    const celulas = [
      rotulo,
      brl(v.r),
      opts.temOrc ? brl(v.o) : "-",
      variacao(v.r, v.o, opts.temOrc),
      brl(v.ra),
      opts.temOrc ? brl(v.oa) : "-",
      variacao(v.ra, v.oa, opts.temOrc),
      opts.total.r ? ((v.r / opts.total.r) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + "%" : "-",
    ];
    let x = M;
    celulas.forEach((t, j) => {
      const c = cols[j];
      const acima =
        opts.temOrc && ((j === 3 && v.o && v.r > v.o * 1.1) || (j === 6 && v.oa && v.ra > v.oa * 1.1));
      const cor: [number, number, number] = acima ? [190, 40, 40] : [30, 30, 30];
      const s = cortar(t, f, 8.5, c.largura - 4);
      texto(s, c.dir ? x + c.largura - 2 : x + 2 + (j === 0 && recuo ? 5 : 0), y + 4.4, f, 8.5, cor, c.dir);
      x += c.largura;
    });
    y += 6.3;
  };

  cabecalho();
  for (const g of opts.grupos) {
    linha(g.nome, g, true, [244, 247, 246], false);
    for (const c of g.contas) linha(`${c.codigo}  ${c.nome}`, c, false, null, true);
  }
  y += 1;
  linha("Total das despesas administrativas", opts.total, true, [225, 236, 233], false);
  fechaPagina();

  rodapes.forEach((p, i) => {
    page = p;
    texto(nomeEmpresa, M, 200, fonte, 8, [120, 120, 120]);
    texto(`Página ${i + 1}`, W - M, 200, fonte, 8, [120, 120, 120], true);
  });

  return pdf.save();
}
