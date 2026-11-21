// Aritmética de períodos "yyyy-mm" e "yyyy-mm-dd" (sem fuso: são só rótulos de
// calendário) para o seletor do resumo de visitas.

export const MESES_ABREV = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

const MESES_COMPLETOS = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

export function somarMeses(mes: string, delta: number): string {
  const [ano, m] = mes.slice(0, 7).split("-").map(Number);
  const indice = ano * 12 + (m - 1) + delta;
  return `${Math.floor(indice / 12)}-${String((indice % 12) + 1).padStart(2, "0")}`;
}

export function somarDias(dia: string, delta: number): string {
  const d = new Date(`${dia}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

export function rotuloMes(mes: string): string {
  const [ano, m] = mes.slice(0, 7).split("-").map(Number);
  return `${MESES_COMPLETOS[m - 1]} de ${ano}`;
}
