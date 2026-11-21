// Gráficos de clima mandados como foto no WhatsApp (historico_chuva e
// previsao_tempo em lib/whatsapp/ferramentas.ts). Mesma identidade das tabelas
// em imagem (tabela-imagem.ts): Space Grotesk, azul e verde da marca.
//
// - Chuva mensal: por mês, a barra do ano corrente ao lado da barra da média
//   dos anos anteriores, com o
//   acumulado do ano comparado à média do mesmo período.
// - Previsão: chuva por dia em barras e temperatura máx/mín em linhas, com o
//   dia mais chuvoso em destaque.
import { createCanvas, registerFont, type CanvasRenderingContext2D } from "canvas";
import path from "node:path";
import type { PrevisaoDia } from "@/lib/clima";

const PASTA_FONTES = path.join(process.cwd(), "assets", "fonts");
const FAMILIA = "Space Grotesk Clima";
let fontesRegistradas = false;
function garantirFontes() {
  if (fontesRegistradas) return;
  registerFont(path.join(PASTA_FONTES, "SpaceGrotesk-Regular.ttf"), { family: FAMILIA, weight: "normal" });
  registerFont(path.join(PASTA_FONTES, "SpaceGrotesk-Bold.ttf"), { family: FAMILIA, weight: "bold" });
  fontesRegistradas = true;
}
const fonte = (px: number, negrito = false) => `${negrito ? "bold " : ""}${px}px "${FAMILIA}"`;

const AZUL = "#19323b";
const VERDE = "#00dc4d";
const CHUVA = "#2f80ed";
const CHUVA_CLARA = "#a9cbf7";
const MEDIA = "#c3ccd1";
const QUENTE = "#f2994a";
const FRIA = "#56ccf2";
const TEXTO = "#19323b";
const SUAVE = "#6b7c85";
const GRADE = "#e6ecef";

const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const DIAS_SEMANA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

const mm = (v: number) => `${Math.round(v).toLocaleString("pt-BR")} mm`;

// Teto "redondo" do eixo e o passo das linhas de grade.
function escala(maximo: number, passos = 5) {
  const bruto = Math.max(maximo, 1) / passos;
  const potencia = 10 ** Math.floor(Math.log10(bruto));
  const passo = [1, 2, 5, 10].map((m) => m * potencia).find((p) => p >= bruto) ?? bruto;
  return { teto: Math.ceil(Math.max(maximo, 1) / passo) * passo, passo };
}

function cabecalho(ctx: CanvasRenderingContext2D, largura: number, titulo: string, subtitulo: string) {
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, largura, 2000);
  ctx.fillStyle = TEXTO;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.font = fonte(34, true);
  ctx.fillText(titulo, 56, 70);
  ctx.font = fonte(19);
  ctx.fillStyle = SUAVE;
  ctx.fillText(subtitulo, 56, 102);
  ctx.fillStyle = VERDE;
  ctx.fillRect(56, 120, 64, 5);
}

// Cartões de número no topo (rótulo pequeno, valor grande, nota opcional colorida).
function cartoes(ctx: CanvasRenderingContext2D, x0: number, y: number, largura: number,
  itens: { rotulo: string; valor: string; nota?: string; corNota?: string }[]) {
  const gap = 20;
  const w = (largura - gap * (itens.length - 1)) / itens.length;
  itens.forEach((item, i) => {
    const x = x0 + i * (w + gap);
    ctx.fillStyle = "#f4f7f8";
    ctx.beginPath();
    ctx.roundRect(x, y, w, 104, 14);
    ctx.fill();
    ctx.textAlign = "left";
    ctx.fillStyle = SUAVE;
    ctx.font = fonte(16);
    ctx.fillText(item.rotulo.toUpperCase(), x + 22, y + 32);
    ctx.fillStyle = TEXTO;
    ctx.font = fonte(34, true);
    ctx.fillText(item.valor, x + 22, y + 74);
    if (item.nota) {
      const larguraValor = ctx.measureText(item.valor).width;
      ctx.font = fonte(18, true);
      ctx.fillStyle = item.corNota ?? SUAVE;
      ctx.fillText(item.nota, x + 22 + larguraValor + 12, y + 74);
    }
  });
}

function legenda(ctx: CanvasRenderingContext2D, x: number, y: number,
  itens: { rotulo: string; desenhar: (cx: number, cy: number) => void }[]) {
  ctx.font = fonte(16);
  ctx.textAlign = "left";
  let cx = x;
  for (const item of itens) {
    item.desenhar(cx, y);
    ctx.fillStyle = SUAVE;
    ctx.fillText(item.rotulo, cx + 30, y + 6);
    cx += 30 + ctx.measureText(item.rotulo).width + 34;
  }
}

function rodape(ctx: CanvasRenderingContext2D, largura: number, altura: number, texto: string) {
  ctx.font = fonte(14);
  ctx.fillStyle = SUAVE;
  ctx.textAlign = "right";
  ctx.fillText(texto, largura - 56, altura - 24);
}

// ---------------------------------------------------------------------------

export type ChuvaMensal = {
  ano: number;
  ultimoMes: number; // 1–12: último mês com dado no ano corrente
  meses: { mes: number; atual: number | null; media: number; minimo: number; maximo: number }[];
  anosHistorico: number[];
};

export function gerarGraficoChuvaMensal(local: string, dados: ChuvaMensal): Buffer {
  garantirFontes();
  const L = 1600, A = 1000;
  const canvas = createCanvas(L, A);
  const ctx = canvas.getContext("2d");
  const [primeiro, ultimo] = [dados.anosHistorico[0], dados.anosHistorico.at(-1)];
  cabecalho(ctx, L, `Chuva mês a mês — ${local}`,
    `${dados.ano} comparado à média de ${primeiro}–${ultimo} · precipitação mensal (mm)`);

  const ate = dados.meses.filter((m) => m.mes <= dados.ultimoMes);
  const acumulado = ate.reduce((s, m) => s + (m.atual ?? 0), 0);
  const mediaPeriodo = ate.reduce((s, m) => s + m.media, 0);
  const desvio = mediaPeriodo > 0 ? ((acumulado - mediaPeriodo) / mediaPeriodo) * 100 : 0;
  const mediaAno = dados.meses.reduce((s, m) => s + m.media, 0);
  cartoes(ctx, 56, 150, L - 112, [
    { rotulo: `Acumulado ${dados.ano} (jan–${MESES[dados.ultimoMes - 1].toLowerCase()})`, valor: mm(acumulado),
      nota: `${desvio >= 0 ? "+" : ""}${desvio.toFixed(0)}% vs média`, corNota: desvio >= 0 ? "#1a9c4c" : "#d64545" },
    { rotulo: "Média do mesmo período", valor: mm(mediaPeriodo) },
    { rotulo: `Média anual ${primeiro}–${ultimo}`, valor: mm(mediaAno) },
  ]);

  // Duas barras por mês, lado a lado: azul = ano corrente, cinza = média do
  // mesmo mês nos anos anteriores. Mês em andamento marcado como parcial.
  legenda(ctx, 56, 318, [
    { rotulo: `Chuva de ${dados.ano}`, desenhar: (x, y) => { ctx.fillStyle = CHUVA; ctx.fillRect(x, y - 8, 20, 16); } },
    { rotulo: `Média do mesmo mês em ${primeiro}–${ultimo}`, desenhar: (x, y) => { ctx.fillStyle = MEDIA; ctx.fillRect(x, y - 8, 20, 16); } },
  ]);
  const area = { x: 120, y: 370, w: L - 176, h: 480 };
  const maximo = Math.max(...dados.meses.map((m) => Math.max(m.media, m.atual ?? 0)));
  const { teto, passo } = escala(maximo * 1.15, 4);
  const Y = (v: number) => area.y + area.h - (v / teto) * area.h;
  const coluna = area.w / 12;
  const X = (i: number) => area.x + coluna * i + coluna / 2;

  ctx.strokeStyle = GRADE; ctx.lineWidth = 1; ctx.font = fonte(15); ctx.fillStyle = SUAVE; ctx.textAlign = "right";
  for (let v = 0; v <= teto + 0.01; v += passo) {
    ctx.beginPath(); ctx.moveTo(area.x, Y(v)); ctx.lineTo(area.x + area.w, Y(v)); ctx.stroke();
    ctx.fillText(String(Math.round(v)), area.x - 14, Y(v) + 5);
  }

  const larguraBarra = coluna * 0.34;
  const barra = (cx: number, valor: number, cor: string | CanvasGradient, rotuloCor: string) => {
    const y = Y(valor);
    ctx.fillStyle = cor;
    ctx.beginPath();
    ctx.roundRect(cx - larguraBarra / 2, y, larguraBarra, Math.max(2, area.y + area.h - y), [6, 6, 0, 0]);
    ctx.fill();
    ctx.fillStyle = rotuloCor; ctx.font = fonte(14, true); ctx.textAlign = "center";
    ctx.fillText(String(Math.round(valor)), cx, y - 8);
  };
  dados.meses.forEach((m, i) => {
    const temAtual = m.atual != null;
    const xMedia = temAtual ? X(i) + larguraBarra / 2 + 2 : X(i);
    barra(xMedia, m.media, MEDIA, SUAVE);
    if (temAtual) {
      const g = ctx.createLinearGradient(0, Y(m.atual!), 0, area.y + area.h);
      g.addColorStop(0, CHUVA); g.addColorStop(1, CHUVA_CLARA);
      barra(X(i) - larguraBarra / 2 - 2, m.atual!, g, TEXTO);
    }
  });

  ctx.font = fonte(17, true); ctx.fillStyle = TEXTO; ctx.textAlign = "center";
  MESES.forEach((rotulo, i) => ctx.fillText(rotulo, X(i), area.y + area.h + 30));
  ctx.font = fonte(13); ctx.fillStyle = SUAVE;
  ctx.fillText("até agora", X(dados.ultimoMes - 1), area.y + area.h + 50);

  rodape(ctx, L, A, "Fonte: NASA POWER (satélite, chuva corrigida) · os últimos dias podem não estar incluídos");
  return canvas.toBuffer("image/png");
}

// ---------------------------------------------------------------------------

export function gerarGraficoPrevisao(local: string, dias: (PrevisaoDia & { iso: string })[]): Buffer {
  garantirFontes();
  const L = 1600, A = 1000;
  const canvas = createCanvas(L, A);
  const ctx = canvas.getContext("2d");
  cabecalho(ctx, L, `Previsão do tempo — ${local}`, `Próximos ${dias.length} dias · chuva (mm/dia) e temperatura (°C)`);

  const total = dias.reduce((s, d) => s + d.chuvaMm, 0);
  const comChuva = dias.filter((d) => d.chuvaMm >= 1).length;
  const maisChuvoso = dias.reduce((a, b) => (b.chuvaMm > a.chuvaMm ? b : a), dias[0]);
  const maximas = dias.map((d) => d.tempMaxC).filter((v): v is number => v != null);
  const minimas = dias.map((d) => d.tempMinC).filter((v): v is number => v != null);
  cartoes(ctx, 56, 150, L - 112, [
    { rotulo: "Chuva prevista no período", valor: mm(total) },
    { rotulo: "Dias com chuva (≥ 1 mm)", valor: `${comChuva} de ${dias.length}` },
    { rotulo: "Dia mais chuvoso", valor: maisChuvoso.chuvaMm >= 1 ? `${maisChuvoso.data} · ${mm(maisChuvoso.chuvaMm)}` : "sem chuva" },
    { rotulo: "Temperatura", valor: maximas.length ? `${Math.round(Math.min(...minimas))}° a ${Math.round(Math.max(...maximas))}°` : "—" },
  ]);

  // Duas faixas com o mesmo eixo X: temperatura em cima, chuva embaixo —
  // assim número de chuva nunca fica embaixo da linha de temperatura.
  const x0 = 110, w = L - 166;
  const faixaT = { y: 300, h: 200 };
  const area = { x: x0, y: 560, w, h: 280 };
  const { teto, passo } = escala(Math.max(...dias.map((d) => d.chuvaMm), 5) * 1.18, 4);
  const Y = (v: number) => area.y + area.h - (v / teto) * area.h;
  const tMin = Math.floor((Math.min(...minimas, 15) - 2) / 5) * 5;
  const tMax = Math.ceil((Math.max(...maximas, 30) + 2) / 5) * 5;
  const YT = (t: number) => faixaT.y + faixaT.h - ((t - tMin) / (tMax - tMin)) * faixaT.h;
  const coluna = w / dias.length;
  const X = (i: number) => x0 + coluna * i + coluna / 2;

  ctx.strokeStyle = GRADE; ctx.lineWidth = 1; ctx.font = fonte(15); ctx.textAlign = "right";
  for (let v = 0; v <= teto + 0.01; v += passo) {
    ctx.beginPath(); ctx.moveTo(x0, Y(v)); ctx.lineTo(x0 + w, Y(v)); ctx.stroke();
    ctx.fillStyle = CHUVA; ctx.fillText(String(Math.round(v)), x0 - 14, Y(v) + 5);
  }
  for (let t = tMin; t <= tMax; t += 5) {
    ctx.beginPath(); ctx.moveTo(x0, YT(t)); ctx.lineTo(x0 + w, YT(t)); ctx.stroke();
    ctx.fillStyle = QUENTE; ctx.fillText(`${t}°`, x0 - 14, YT(t) + 5);
  }
  ctx.font = fonte(14, true); ctx.textAlign = "left";
  ctx.fillStyle = QUENTE; ctx.fillText("TEMPERATURA (°C)", x0, faixaT.y - 18);
  ctx.fillStyle = CHUVA; ctx.fillText("CHUVA (mm/dia)", x0, area.y - 22);

  dias.forEach((d, i) => {
    const destaque = d === maisChuvoso && d.chuvaMm >= 1;
    const larguraBarra = coluna * 0.56;
    const y = Y(d.chuvaMm);
    if (d.chuvaMm > 0) {
      const g = ctx.createLinearGradient(0, y, 0, area.y + area.h);
      g.addColorStop(0, destaque ? AZUL : CHUVA); g.addColorStop(1, destaque ? "#5a7d8a" : CHUVA_CLARA);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.roundRect(X(i) - larguraBarra / 2, y, larguraBarra, Math.max(2, area.y + area.h - y), [6, 6, 0, 0]);
      ctx.fill();
    }
    if (d.chuvaMm >= 1) {
      ctx.fillStyle = TEXTO; ctx.font = fonte(destaque ? 17 : 15, true); ctx.textAlign = "center";
      ctx.fillText(d.chuvaMm.toFixed(d.chuvaMm < 10 ? 1 : 0), X(i), y - 10);
    }
    const data = new Date(`${d.iso}T12:00:00`);
    const fimDeSemana = data.getDay() === 0 || data.getDay() === 6;
    ctx.textAlign = "center";
    ctx.fillStyle = fimDeSemana ? SUAVE : TEXTO;
    ctx.font = fonte(15, true);
    ctx.fillText(DIAS_SEMANA[data.getDay()], X(i), area.y + area.h + 26);
    ctx.font = fonte(14);
    ctx.fillStyle = SUAVE;
    ctx.fillText(d.data, X(i), area.y + area.h + 46);
  });

  const linhaTemp = (valores: (number | null)[], cor: string, rotuloAcima: boolean) => {
    ctx.strokeStyle = cor; ctx.lineWidth = 3.5; ctx.lineJoin = "round";
    ctx.beginPath();
    let iniciou = false;
    valores.forEach((v, i) => {
      if (v == null) return;
      if (!iniciou) { ctx.moveTo(X(i), YT(v)); iniciou = true; } else ctx.lineTo(X(i), YT(v));
    });
    ctx.stroke();
    valores.forEach((v, i) => {
      if (v == null) return;
      ctx.fillStyle = "#ffffff"; ctx.beginPath(); ctx.arc(X(i), YT(v), 5, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = cor; ctx.lineWidth = 3; ctx.stroke();
      ctx.fillStyle = cor; ctx.font = fonte(14, true); ctx.textAlign = "center";
      ctx.fillText(`${Math.round(v)}°`, X(i), YT(v) + (rotuloAcima ? -12 : 24));
    });
  };
  linhaTemp(dias.map((d) => d.tempMaxC), QUENTE, true);
  linhaTemp(dias.map((d) => d.tempMinC), FRIA, false);

  legenda(ctx, area.x, A - 72, [
    { rotulo: "Chuva (mm)", desenhar: (x, y) => { ctx.fillStyle = CHUVA; ctx.fillRect(x, y - 8, 20, 16); } },
    { rotulo: "Máxima (°C)", desenhar: (x, y) => { ctx.strokeStyle = QUENTE; ctx.lineWidth = 3.5; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 22, y); ctx.stroke(); } },
    { rotulo: "Mínima (°C)", desenhar: (x, y) => { ctx.strokeStyle = FRIA; ctx.lineWidth = 3.5; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 22, y); ctx.stroke(); } },
  ]);
  rodape(ctx, L, A, "Fonte: Open-Meteo · previsão sujeita a mudança, mais confiável nos primeiros dias");
  return canvas.toBuffer("image/png");
}
