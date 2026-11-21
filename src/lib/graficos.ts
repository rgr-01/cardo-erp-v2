// Gráfico de barras genérico (PNG), usado pra mandar histórico de chuva,
// cotação agrícola etc. como foto no WhatsApp — sempre com o mesmo visual.
import { createCanvas } from "canvas";

export interface BarraGrafico {
  rotulo: string;
  valor: number;
}

export interface OpcoesGraficoBarras {
  titulo: string;
  subtitulo: string;
  dados: BarraGrafico[];
  formatarValor?: (valor: number) => string;
  formatarEixoY?: (valor: number) => string;
  corBarraInicio?: string;
  corBarraFim?: string;
}

export function gerarGraficoBarras(opcoes: OpcoesGraficoBarras): Buffer {
  const {
    titulo,
    subtitulo,
    dados,
    formatarValor = (v) => String(Math.round(v)),
    formatarEixoY = formatarValor,
    corBarraInicio = "#2b6cb0",
    corBarraFim = "#63b3ed",
  } = opcoes;

  // Com muitas barras (ex.: previsão de 15 dias), alarga a imagem e encolhe
  // fonte/espaçamento pra elas continuarem legíveis lado a lado.
  const muitasBarras = dados.length > 8;
  const largura = muitasBarras ? Math.min(1500, 620 + dados.length * 55) : 900;
  const altura = 560;
  const fonteRotulo = muitasBarras ? "12px sans-serif" : "14px sans-serif";
  const fonteValor = muitasBarras ? "bold 12px sans-serif" : "bold 14px sans-serif";
  const espacamentoBarras = muitasBarras ? 12 : 24;
  const canvas = createCanvas(largura, altura);
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, largura, altura);

  ctx.fillStyle = "#1f2933";
  ctx.font = "bold 26px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(titulo, largura / 2, 46);
  ctx.font = "16px sans-serif";
  ctx.fillStyle = "#52606d";
  ctx.fillText(subtitulo, largura / 2, 72);

  const margemEsquerda = 90;
  const margemDireita = 40;
  const margemInferior = 70;
  const margemSuperior = 110;
  const areaLargura = largura - margemEsquerda - margemDireita;
  const areaAltura = altura - margemSuperior - margemInferior;

  const maiorValor = Math.max(...dados.map((d) => d.valor), 1);
  const escalaMaxima = Math.ceil((maiorValor * 1.15) / 100) * 100 || maiorValor * 1.15;
  const media = dados.reduce((soma, d) => soma + d.valor, 0) / dados.length;

  ctx.strokeStyle = "#e4e7eb";
  ctx.fillStyle = "#7b8794";
  ctx.font = "13px sans-serif";
  ctx.textAlign = "right";
  const passos = 5;
  for (let i = 0; i <= passos; i++) {
    const valor = (escalaMaxima / passos) * i;
    const y = margemSuperior + areaAltura - (valor / escalaMaxima) * areaAltura;
    ctx.beginPath();
    ctx.moveTo(margemEsquerda, y);
    ctx.lineTo(largura - margemDireita, y);
    ctx.stroke();
    ctx.fillText(formatarEixoY(valor), margemEsquerda - 10, y + 4);
  }

  const larguraBarra = (areaLargura - espacamentoBarras * (dados.length - 1)) / dados.length;

  dados.forEach((d, i) => {
    const x = margemEsquerda + i * (larguraBarra + espacamentoBarras);
    const alturaBarra = (d.valor / escalaMaxima) * areaAltura;
    const y = margemSuperior + areaAltura - alturaBarra;

    const gradiente = ctx.createLinearGradient(0, y, 0, margemSuperior + areaAltura);
    gradiente.addColorStop(0, corBarraInicio);
    gradiente.addColorStop(1, corBarraFim);
    ctx.fillStyle = gradiente;
    ctx.fillRect(x, y, larguraBarra, alturaBarra);

    ctx.fillStyle = "#1f2933";
    ctx.font = fonteValor;
    ctx.textAlign = "center";
    ctx.fillText(formatarValor(d.valor), x + larguraBarra / 2, y - 10);

    ctx.font = fonteRotulo;
    ctx.fillStyle = "#323f4b";
    ctx.fillText(d.rotulo, x + larguraBarra / 2, margemSuperior + areaAltura + 24);
  });

  const yMedia = margemSuperior + areaAltura - (media / escalaMaxima) * areaAltura;
  ctx.strokeStyle = "#e53e3e";
  ctx.setLineDash([6, 6]);
  ctx.beginPath();
  ctx.moveTo(margemEsquerda, yMedia);
  ctx.lineTo(largura - margemDireita, yMedia);
  ctx.stroke();
  ctx.setLineDash([]);

  // Fundo sólido atrás do rótulo da média — sem isso, o texto some quando a
  // linha cruza por cima de uma barra alta.
  const rotuloMedia = `Média: ${formatarValor(media)}`;
  ctx.font = "13px sans-serif";
  ctx.textAlign = "left";
  const larguraRotulo = ctx.measureText(rotuloMedia).width;
  const boxX = largura - margemDireita - larguraRotulo - 14;
  const boxY = yMedia - 20;
  ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
  ctx.fillRect(boxX, boxY, larguraRotulo + 10, 20);
  ctx.fillStyle = "#e53e3e";
  ctx.fillText(rotuloMedia, boxX + 5, boxY + 14);

  ctx.strokeStyle = "#9aa5b1";
  ctx.beginPath();
  ctx.moveTo(margemEsquerda, margemSuperior + areaAltura);
  ctx.lineTo(largura - margemDireita, margemSuperior + areaAltura);
  ctx.stroke();

  return canvas.toBuffer("image/png");
}
