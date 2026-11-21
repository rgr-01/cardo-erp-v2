import type { CategoriaDespesa } from "@/generated/prisma/client";

export type Status =
  | "PROSPECCAO"
  | "NEGOCIACAO"
  | "FECHADO"
  | "EM_CARTEIRA"
  | "FATURADO"
  | "CANCELADO";

export const STATUS_ORDEM: Status[] = [
  "PROSPECCAO",
  "NEGOCIACAO",
  "FECHADO",
  "EM_CARTEIRA",
  "FATURADO",
  "CANCELADO",
];

// FECHADO/EM_CARTEIRA/FATURADO só devem ser atingidos pelos fluxos
// automáticos (fechar negócio, conferência final, Financeiro emitindo NF +
// boleto) — nunca escolhidos à mão, senão dá pra pular etapas do processo
// (ver alterarStatusEmMassa e atualizarVenda em app/actions/vendas.ts).
export const STATUS_EDITAVEL_MANUAL: Status[] = [
  "PROSPECCAO",
  "NEGOCIACAO",
  "CANCELADO",
];

export const STATUS_LABELS: Record<Status, string> = {
  PROSPECCAO: "Prospecção",
  NEGOCIACAO: "Negociação",
  FECHADO: "Negócio fechado",
  EM_CARTEIRA: "Em carteira",
  FATURADO: "Faturado",
  CANCELADO: "Cancelado",
};

export const STATUS_CORES: Record<Status, string> = {
  PROSPECCAO: "#eab308",
  NEGOCIACAO: "#3b82f6",
  FECHADO: "#22d3ee",
  EM_CARTEIRA: "#86efac",
  FATURADO: "#16a34a",
  CANCELADO: "#ef4444",
};

export const CULTURA_CORES: Record<string, string> = {
  Soja: "#22c55e",
  Milho: "#d4d4d8",
  "Algodão": "#fafafa",
  "Feijão": "#b45309",
  Sorgo: "#15803d",
  "Milho 2ªsafra": "#71717a",
  "Sorgo 2ªsafra": "#166534",
  Soja_milho: "#f97316",
  Arroz: "#fbbf24",
  Trigo: "#d97706",
};

export const CULTURAS = Object.keys(CULTURA_CORES);

export function corCultura(cultura: string): string {
  return CULTURA_CORES[cultura] ?? "#a3a3a3";
}

export const CATEGORIA_DESPESA_ORDEM: CategoriaDespesa[] = [
  "COMBUSTIVEL",
  "ALIMENTACAO",
  "HOSPEDAGEM",
  "MANUTENCAO_VEICULO",
  "PEDAGIO",
  "MATERIAL_ESCRITORIO",
  "OUTROS",
];

export const CATEGORIA_DESPESA_LABELS: Record<CategoriaDespesa, string> = {
  COMBUSTIVEL: "Combustível",
  ALIMENTACAO: "Alimentação",
  HOSPEDAGEM: "Hospedagem",
  MANUTENCAO_VEICULO: "Manutenção de veículo",
  PEDAGIO: "Pedágio",
  MATERIAL_ESCRITORIO: "Material de escritório",
  OUTROS: "Outros",
};

export const CATEGORIA_DESPESA_CORES: Record<CategoriaDespesa, string> = {
  COMBUSTIVEL: "#3987e5",
  ALIMENTACAO: "#d95926",
  HOSPEDAGEM: "#199e70",
  MANUTENCAO_VEICULO: "#c98500",
  PEDAGIO: "#d55181",
  MATERIAL_ESCRITORIO: "#008300",
  OUTROS: "#9085e9",
};

export function fmtBRL(v: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(v);
}

// Formatação manual (sem Intl compact): Node e navegador divergem no resultado
// ("R$ 945 mil" x "R$ 945,0 mil"), o que quebrava a hidratação.
export function fmtBRLCompacto(v: number): string {
  const abs = Math.abs(v);
  const sinal = v < 0 ? "-" : "";
  const [div, sufixo] =
    abs >= 1e9 ? [1e9, " bi"] : abs >= 1e6 ? [1e6, " mi"] : abs >= 1e3 ? [1e3, " mil"] : [1, ""];
  const n = (abs / div).toFixed(div === 1 ? 0 : 1).replace(/\.0$/, "").replace(".", ",");
  return `${sinal}R$ ${n}${sufixo}`;
}

export function fmtNum(v: number): string {
  return new Intl.NumberFormat("pt-BR").format(v);
}

export function fmtPct(v: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "percent",
    maximumFractionDigits: 1,
  }).format(v);
}

export function fmtData(d: Date | string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

// Data e hora de um instante (ex.: check-in), no horário de Brasília — o
// servidor roda em UTC.
export function fmtDataHoraBrasilia(d: Date | string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
