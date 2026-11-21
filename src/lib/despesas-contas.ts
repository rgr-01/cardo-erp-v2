// Parte pura do plano de contas das despesas (sem banco), usada pelo servidor
// e pela tela.

import type { CategoriaDespesa } from "@/generated/prisma/client";

// Despesas lançadas só com a categoria antiga (app mobile, WhatsApp) caem
// numa conta do plano; e o inverso, para manter `categoria` coerente.
export const CONTA_POR_CATEGORIA: Record<CategoriaDespesa, string> = {
  COMBUSTIVEL: "3.5.01",
  ALIMENTACAO: "3.5.04",
  HOSPEDAGEM: "3.5.04",
  PEDAGIO: "3.5.04",
  MANUTENCAO_VEICULO: "3.5.02",
  MATERIAL_ESCRITORIO: "3.6.01",
  OUTROS: "3.6.99",
};

export const CATEGORIA_POR_CONTA: Record<string, CategoriaDespesa> = {
  "3.5.01": "COMBUSTIVEL",
  "3.5.02": "MANUTENCAO_VEICULO",
  "3.5.04": "HOSPEDAGEM",
  "3.6.01": "MATERIAL_ESCRITORIO",
};

export type MesRef = { y: number; m: number };

export const MESES_NOME = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

export const chaveMes = (y: number, m: number) => y * 12 + m;

// Safra vai de julho a junho. "26/27" = jul/2026 a jun/2027; um nome como
// "24/27" cobre todos os meses entre jul/2024 e jun/2027.
export function mesesDaSafra(nome: string, hoje: MesRef): MesRef[] {
  const t = /^(\d{2})\/(\d{2})$/.exec(nome.trim());
  let inicio = hoje.m >= 6 ? hoje.y : hoje.y - 1;
  let fim = inicio + 1;
  if (t) {
    const a = 2000 + Number(t[1]);
    const b = 2000 + Number(t[2]);
    if (b > a) {
      inicio = a;
      fim = b;
    }
  }
  const total = (fim - inicio) * 12;
  return Array.from({ length: total }, (_, i) => ({
    y: inicio + Math.floor((i + 6) / 12),
    m: (i + 6) % 12,
  }));
}

// No mês corrente o orçamento é proporcional aos dias corridos.
export function fracaoDoMes(y: number, m: number, hoje: { y: number; m: number; d: number }) {
  if (y !== hoje.y || m !== hoje.m) return 1;
  return hoje.d / new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
}
