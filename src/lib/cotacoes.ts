// Cotação agrícola via CEPEA/ESALQ (cepea.org.br) — sem API oficial, então lê
// a página pública do indicador. Layout confirmado por print de tela em
// 2026-09-25: cada indicador é uma tabela precedida por um cabeçalho tipo
// "INDICADOR DA SOJA CEPEA/ESALQ - PARANÁ", com colunas Data / Valor R$ /
// Var. dia / Var. mês / Valor US$. Ainda não testado contra a página ao vivo
// (sem acesso de rede a cepea.org.br neste ambiente) — validar assim que
// possível e ajustar os seletores se o CEPEA tiver mudado o HTML.
import * as cheerio from "cheerio";
import * as XLSX from "xlsx";
import { gerarGraficoBarras } from "@/lib/graficos";

export interface ProdutoCotacao {
  slug: string;
  nome: string;
}

// Produtos com indicador diário publicado pelo CEPEA/ESALQ
// (cepea.org.br/br/indicador/<slug>.aspx). Sorgo e milheto não têm indicador
// próprio no CEPEA — não incluídos aqui de propósito.
export const PRODUTOS_COTACAO: ProdutoCotacao[] = [
  { slug: "soja", nome: "Soja" },
  { slug: "milho", nome: "Milho" },
  { slug: "algodao", nome: "Algodão" },
  { slug: "boi-gordo", nome: "Boi gordo" },
  { slug: "bezerro", nome: "Bezerro" },
  { slug: "cafe", nome: "Café" },
  { slug: "acucar", nome: "Açúcar" },
  { slug: "etanol", nome: "Etanol" },
  { slug: "trigo", nome: "Trigo" },
  { slug: "arroz", nome: "Arroz" },
  { slug: "leite", nome: "Leite" },
  { slug: "frango", nome: "Frango" },
  { slug: "suino", nome: "Suíno" },
];

export interface CotacaoIndicador {
  regiao: string | null;
  data: string;
  valorReais: number;
  variacaoDiaPct: number | null;
  variacaoMesPct: number | null;
  valorDolar: number | null;
}

export interface CotacaoProduto {
  produto: string;
  unidade: string | null;
  indicadores: CotacaoIndicador[];
}

function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
}

export function encontrarProduto(nome: string): ProdutoCotacao | null {
  const alvo = normalizar(nome);
  if (!alvo) return null;
  return (
    PRODUTOS_COTACAO.find((p) => {
      const chave = normalizar(p.nome);
      return chave === alvo || chave.includes(alvo) || alvo.includes(chave);
    }) ?? null
  );
}

function paraNumero(texto: string): number | null {
  const limpo = texto.replace(/\./g, "").replace(",", ".").replace("%", "").trim();
  if (!limpo) return null;
  const n = Number(limpo);
  return Number.isFinite(n) ? n : null;
}

export async function buscarCotacao(produtoSlug: string): Promise<CotacaoProduto> {
  const url = `https://www.cepea.org.br/br/indicador/${produtoSlug}.aspx`;
  const resposta = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; RedeAgroBot/1.0)" },
  });
  if (!resposta.ok) throw new Error("Não consegui acessar a cotação agora.");
  const html = await resposta.text();
  const $ = cheerio.load(html);

  const notaUnidade =
    $("body")
      .text()
      .match(/Nota\s*1\s*:?\s*([^*\n]+)/i)?.[1]
      ?.trim() ?? null;

  const indicadores: CotacaoIndicador[] = [];
  $("table").each((_, tabela) => {
    let regiao: string | null = null;
    let cursor = $(tabela).prev();
    for (let tentativas = 0; tentativas < 8 && cursor.length; tentativas++) {
      const m = cursor.text().match(/CEPEA\/?\s?ESALQ(?:\s*-\s*(.+))?/i);
      if (m) {
        regiao = m[1]?.trim() ?? null;
        break;
      }
      cursor = cursor.prev();
    }

    const linhaDados = $(tabela).find("tr").eq(1);
    const celulas = linhaDados.find("td");
    if (celulas.length < 2) return;

    const data = $(celulas[0]).text().trim();
    const valorReais = paraNumero($(celulas[1]).text());
    if (!/\d{2}\/\d{2}\/\d{4}/.test(data) || valorReais == null) return;

    indicadores.push({
      regiao,
      data,
      valorReais,
      variacaoDiaPct: celulas.length > 2 ? paraNumero($(celulas[2]).text()) : null,
      variacaoMesPct: celulas.length > 3 ? paraNumero($(celulas[3]).text()) : null,
      valorDolar: celulas.length > 4 ? paraNumero($(celulas[4]).text()) : null,
    });
  });

  if (indicadores.length === 0) {
    throw new Error(
      "Não encontrei o valor da cotação nessa página — o CEPEA pode ter mudado o layout."
    );
  }

  return { produto: produtoSlug, unidade: notaUnidade, indicadores };
}

// Link direto do botão "SÉRIE DE PREÇOS" (baixa um .xls) de cada indicador.
// Confirmado por um arquivo real baixado em 2026-09-26 pra soja/Paranaguá —
// os demais produtos ficam faltando até termos o link de cada um.
const URLS_SERIE_HISTORICA: Partial<Record<string, string>> = {
  soja: "https://www.cepea.org.br/br/indicador/series/soja.aspx?id=92",
};

export interface PrecoDiario {
  data: Date;
  valorReais: number;
  valorDolar: number | null;
}

export interface PrecoAnual {
  ano: number;
  mediaReais: number;
}

// Igual ao formato confirmado no .xls: título, linha em branco, "Fonte: Cepea",
// cabeçalho "Data / À vista R$ / À vista US$" e depois uma linha por dia útil,
// com data dd/mm/yyyy e valores já com ponto decimal (não vírgula, diferente
// da página HTML).
export function parseSerieHistorica(bufferXls: ArrayBuffer): PrecoDiario[] {
  const pasta = XLSX.read(bufferXls, { type: "array" });
  const nomeAba = pasta.SheetNames.find((nome) => pasta.Sheets[nome]["!ref"]) ?? pasta.SheetNames[0];
  const linhas: unknown[][] = XLSX.utils.sheet_to_json(pasta.Sheets[nomeAba], {
    header: 1,
    raw: false,
  });

  const serie: PrecoDiario[] = [];
  for (const linha of linhas) {
    const [dataTexto, valorReaisTexto, valorDolarTexto] = linha.map((c) => String(c ?? "").trim());
    const m = dataTexto?.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!m) continue;
    const valorReais = Number(valorReaisTexto);
    if (!Number.isFinite(valorReais)) continue;
    const valorDolar = Number(valorDolarTexto);
    serie.push({
      data: new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1])),
      valorReais,
      valorDolar: Number.isFinite(valorDolar) ? valorDolar : null,
    });
  }
  return serie;
}

export async function buscarSerieHistorica(produtoSlug: string): Promise<PrecoDiario[]> {
  const url = URLS_SERIE_HISTORICA[produtoSlug];
  if (!url) {
    throw new Error(
      `Ainda não tenho o link da série histórica de "${produtoSlug}" — só dá pra ver a cotação do dia por enquanto.`
    );
  }
  const resposta = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; RedeAgroBot/1.0)" },
  });
  if (!resposta.ok) throw new Error("Não consegui baixar a série histórica agora.");
  return parseSerieHistorica(await resposta.arrayBuffer());
}

// Média do preço em cada um dos últimos N anos completos (não inclui o ano
// corrente, ainda em andamento).
export function mediaPrecoAnual(serie: PrecoDiario[], quantidadeAnos = 10): PrecoAnual[] {
  const anoAtual = new Date().getUTCFullYear();
  const anos: number[] = [];
  for (let i = quantidadeAnos; i >= 1; i--) anos.push(anoAtual - i);

  return anos.map((ano) => {
    const doAno = serie.filter((p) => p.data.getFullYear() === ano);
    const media = doAno.length
      ? doAno.reduce((soma, p) => soma + p.valorReais, 0) / doAno.length
      : 0;
    return { ano, mediaReais: Math.round(media * 100) / 100 };
  });
}

export function gerarGraficoPrecoAnual(produtoNome: string, dados: PrecoAnual[]): Buffer {
  return gerarGraficoBarras({
    titulo: `Histórico de preço — ${produtoNome}`,
    subtitulo: "Média do preço em cada ano (R$)",
    dados: dados.map((d) => ({ rotulo: String(d.ano), valor: d.mediaReais })),
    formatarValor: (v) => `R$ ${v.toFixed(2)}`,
    formatarEixoY: (v) => v.toFixed(0),
    corBarraInicio: "#2f855a",
    corBarraFim: "#68d391",
  });
}
