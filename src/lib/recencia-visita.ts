// Há quanto tempo um cliente não recebe visita, em faixas de cor — usado no
// calendário de visitas (lista lateral) e nos pinos do mapa de clientes.
// Sem dependência de servidor: roda no navegador também.

export type FaixaRecencia = "verde" | "amarelo" | "laranja" | "vermelho" | "nunca";

export const FAIXAS_RECENCIA: { faixa: FaixaRecencia; rotulo: string; cor: string }[] = [
  { faixa: "verde", rotulo: "Até 10 dias", cor: "#22c55e" },
  { faixa: "amarelo", rotulo: "11 a 20 dias", cor: "#eab308" },
  { faixa: "laranja", rotulo: "21 a 30 dias", cor: "#f97316" },
  { faixa: "vermelho", rotulo: "Mais de 30 dias", cor: "#ef4444" },
  { faixa: "nunca", rotulo: "Nunca visitado", cor: "#71717a" },
];

export function faixaPorDias(dias: number | null): FaixaRecencia {
  if (dias === null) return "nunca";
  if (dias <= 10) return "verde";
  if (dias <= 20) return "amarelo";
  if (dias <= 30) return "laranja";
  return "vermelho";
}

export function corDaFaixa(faixa: FaixaRecencia): string {
  return FAIXAS_RECENCIA.find((f) => f.faixa === faixa)!.cor;
}

// yyyy-mm-dd do instante no horário de Brasília.
function diaBrasilia(d: Date): string {
  return d.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

// Dias de calendário (em Brasília) entre a visita e hoje; null = nunca visitado.
export function diasDesde(
  data: Date | string | null | undefined,
  agora: Date = new Date()
): number | null {
  if (!data) return null;
  const de = Date.parse(`${diaBrasilia(new Date(data))}T00:00:00Z`);
  const ate = Date.parse(`${diaBrasilia(agora)}T00:00:00Z`);
  return Math.max(0, Math.round((ate - de) / 86_400_000));
}
