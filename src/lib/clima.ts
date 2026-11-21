// Histórico de chuva por cidade. Geocodificação do nome via Open-Meteo
// (gratuito, sem chave); dados históricos de chuva via NASA POWER (gratuito,
// sem chave, sem limite de uso conhecido — https://power.larc.nasa.gov/docs/services/api/).
import { gerarGraficoBarras } from "@/lib/graficos";
import type { ChuvaMensal } from "@/lib/graficos-clima";

const GEOCODING_URL = "https://geocoding-api.open-meteo.com/v1/search";
const NASA_POWER_URL = "https://power.larc.nasa.gov/api/temporal/daily/point";
// Previsão (dias futuros): a NASA POWER só tem dado histórico, então usa o
// forecast da própria Open-Meteo aqui (gratuito, sem chave, até 16 dias).
const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";
// Valor de preenchimento que a NASA POWER usa quando não há dado pro dia.
const NASA_POWER_VALOR_AUSENTE = -999;

export interface CidadeGeocodificada {
  latitude: number;
  longitude: number;
  nomeExibicao: string;
}

export interface ChuvaAnual {
  ano: number;
  totalMm: number;
}

export async function geocodificarCidade(nome: string): Promise<CidadeGeocodificada | null> {
  const url = new URL(GEOCODING_URL);
  url.searchParams.set("name", nome);
  url.searchParams.set("count", "5");
  url.searchParams.set("language", "pt");

  const resposta = await fetch(url);
  if (!resposta.ok) return null;
  const dados = await resposta.json();
  const resultados: Array<{
    latitude: number;
    longitude: number;
    name: string;
    admin1?: string;
    country_code?: string;
  }> = dados.results ?? [];
  if (resultados.length === 0) return null;

  const escolhido = resultados.find((r) => r.country_code === "BR") ?? resultados[0];
  return {
    latitude: escolhido.latitude,
    longitude: escolhido.longitude,
    nomeExibicao: [escolhido.name, escolhido.admin1].filter(Boolean).join(", "),
  };
}

// Últimos N anos completos (não inclui o ano corrente, ainda em andamento).
function ultimosAnosCompletos(quantidade: number): number[] {
  const anoAtual = new Date().getUTCFullYear();
  const anos: number[] = [];
  for (let i = quantidade; i >= 1; i--) anos.push(anoAtual - i);
  return anos;
}

// A API da NASA POWER retorna melhor um ano por chamada; busca os 5 anos em paralelo.
async function chuvaTotalDoAno(latitude: number, longitude: number, ano: number): Promise<number> {
  const url = new URL(NASA_POWER_URL);
  url.searchParams.set("parameters", "PRECTOTCORR");
  url.searchParams.set("community", "AG");
  url.searchParams.set("latitude", String(latitude));
  url.searchParams.set("longitude", String(longitude));
  url.searchParams.set("start", `${ano}0101`);
  url.searchParams.set("end", `${ano}1231`);
  url.searchParams.set("format", "JSON");

  const resposta = await fetch(url);
  if (!resposta.ok) throw new Error("Não consegui buscar o histórico de chuva agora.");
  const dados = await resposta.json();
  const diario: Record<string, number> = dados.properties?.parameter?.PRECTOTCORR ?? {};
  const total = Object.values(diario)
    .filter((valor) => typeof valor === "number" && valor > NASA_POWER_VALOR_AUSENTE)
    .reduce((soma, valor) => soma + valor, 0);
  return Math.round(total);
}

export async function historicoChuvaAnual(
  latitude: number,
  longitude: number,
  quantidadeAnos = 5
): Promise<ChuvaAnual[]> {
  const anos = ultimosAnosCompletos(quantidadeAnos);
  const totais = await Promise.all(anos.map((ano) => chuvaTotalDoAno(latitude, longitude, ano)));
  return anos.map((ano, i) => ({ ano, totalMm: totais[i] }));
}

export function gerarGraficoChuvaAnual(cidade: string, dados: ChuvaAnual[]): Buffer {
  return gerarGraficoBarras({
    titulo: `Histórico de chuva — ${cidade}`,
    subtitulo: "Total anual de precipitação (mm)",
    dados: dados.map((d) => ({ rotulo: String(d.ano), valor: d.totalMm })),
    formatarValor: (v) => `${Math.round(v)} mm`,
    formatarEixoY: (v) => String(Math.round(v)),
  });
}

// Chuva diária (mm) de um período na NASA POWER, por data yyyymmdd.
async function chuvaDiaria(latitude: number, longitude: number, inicio: string, fim: string): Promise<Record<string, number>> {
  const url = new URL(NASA_POWER_URL);
  url.searchParams.set("parameters", "PRECTOTCORR");
  url.searchParams.set("community", "AG");
  url.searchParams.set("latitude", String(latitude));
  url.searchParams.set("longitude", String(longitude));
  url.searchParams.set("start", inicio);
  url.searchParams.set("end", fim);
  url.searchParams.set("format", "JSON");
  const resposta = await fetch(url);
  if (!resposta.ok) throw new Error("Não consegui buscar o histórico de chuva agora.");
  const dados = await resposta.json();
  const diario: Record<string, number> = dados.properties?.parameter?.PRECTOTCORR ?? {};
  return Object.fromEntries(Object.entries(diario).filter(([, v]) => typeof v === "number" && v > NASA_POWER_VALOR_AUSENTE));
}

function somaPorMes(diario: Record<string, number>): number[] {
  const meses = Array<number>(12).fill(0);
  for (const [data, valor] of Object.entries(diario)) meses[Number(data.slice(4, 6)) - 1] += valor;
  return meses;
}

// Ano corrente mês a mês contra os últimos N anos completos (média, mínimo e
// máximo de cada mês). A NASA POWER publica com uns dias de atraso: o ano
// corrente vai até 5 dias atrás, e o mês em andamento entra parcial.
export async function chuvaMensalComparada(latitude: number, longitude: number, quantidadeAnos = 5): Promise<ChuvaMensal> {
  const anos = ultimosAnosCompletos(quantidadeAnos);
  const fim = new Date(Date.now() - 5 * 86_400_000);
  const ano = fim.getUTCFullYear();
  const fimTexto = fim.toISOString().slice(0, 10).replaceAll("-", "");
  const [atual, ...historico] = await Promise.all([
    chuvaDiaria(latitude, longitude, `${ano}0101`, fimTexto),
    ...anos.map((a) => chuvaDiaria(latitude, longitude, `${a}0101`, `${a}1231`)),
  ]);
  const mesesAtual = somaPorMes(atual);
  const mesesHistorico = historico.map(somaPorMes);
  const ultimoMes = fim.getUTCMonth() + 1;
  return {
    ano,
    ultimoMes,
    anosHistorico: anos,
    meses: Array.from({ length: 12 }, (_, i) => {
      const valores = mesesHistorico.map((m) => m[i]);
      return {
        mes: i + 1,
        atual: i + 1 <= ultimoMes ? Math.round(mesesAtual[i]) : null,
        media: Math.round(valores.reduce((a, b) => a + b, 0) / valores.length),
        minimo: Math.round(Math.min(...valores)),
        maximo: Math.round(Math.max(...valores)),
      };
    }),
  };
}

export interface PrevisaoDia {
  iso: string; // yyyy-mm-dd
  data: string; // dd/mm
  chuvaMm: number;
  tempMinC: number | null;
  tempMaxC: number | null;
}

export async function previsaoTempo(
  latitude: number,
  longitude: number,
  dias = 15
): Promise<PrevisaoDia[]> {
  const url = new URL(FORECAST_URL);
  url.searchParams.set("latitude", String(latitude));
  url.searchParams.set("longitude", String(longitude));
  url.searchParams.set("daily", "precipitation_sum,temperature_2m_max,temperature_2m_min");
  url.searchParams.set("forecast_days", String(dias));
  url.searchParams.set("timezone", "auto");

  const resposta = await fetch(url);
  if (!resposta.ok) throw new Error("Não consegui buscar a previsão do tempo agora.");
  const dados = await resposta.json();
  const datas: string[] = dados.daily?.time ?? [];
  const chuva: Array<number | null> = dados.daily?.precipitation_sum ?? [];
  const tempMax: Array<number | null> = dados.daily?.temperature_2m_max ?? [];
  const tempMin: Array<number | null> = dados.daily?.temperature_2m_min ?? [];

  return datas.map((data, i) => {
    const [, mes, dia] = data.split("-");
    return {
      iso: data,
      data: `${dia}/${mes}`,
      chuvaMm: Math.round((chuva[i] ?? 0) * 10) / 10,
      tempMaxC: tempMax[i] ?? null,
      tempMinC: tempMin[i] ?? null,
    };
  });
}

export function gerarGraficoPrevisaoChuva(cidade: string, dados: PrevisaoDia[]): Buffer {
  return gerarGraficoBarras({
    titulo: `Previsão de chuva — ${cidade}`,
    subtitulo: `Próximos ${dados.length} dias (mm por dia)`,
    dados: dados.map((d) => ({ rotulo: d.data, valor: d.chuvaMm })),
    formatarValor: (v) => `${v.toFixed(1)}`,
    formatarEixoY: (v) => String(Math.round(v)),
  });
}
