export type StatusProposta =
  | "RASCUNHO"
  | "ENVIADA"
  | "ACEITA"
  | "RECUSADA"
  | "CANCELADA";

export const STATUS_PROPOSTA_ORDEM: StatusProposta[] = [
  "RASCUNHO",
  "ENVIADA",
  "ACEITA",
  "RECUSADA",
  "CANCELADA",
];

export const STATUS_PROPOSTA_LABELS: Record<StatusProposta, string> = {
  RASCUNHO: "Rascunho",
  ENVIADA: "Negócio Fechado",
  ACEITA: "Assinado",
  RECUSADA: "Recusada",
  CANCELADA: "Cancelada",
};

export const STATUS_PROPOSTA_CORES: Record<StatusProposta, string> = {
  RASCUNHO: "#a1a1aa",
  ENVIADA: "#3b82f6",
  ACEITA: "#16a34a",
  RECUSADA: "#ef4444",
  CANCELADA: "#71717a",
};

export function numeroProposta(numero: number): string {
  return `PED-${String(numero).padStart(5, "0")}`;
}

// Quem assina o pedido. O nome sai no campo de assinatura do PDF; quem tem
// e-mail recebe o link de assinatura. Linha de cima do PDF: cliente e empresa;
// linha de baixo: vendedor e testemunha/outros.
export type PapelAssinante = "CLIENTE" | "EMPRESA" | "VENDEDOR" | "OUTRO";

export type AssinanteDoc = {
  papel: PapelAssinante;
  nome: string;
  email?: string;
  // Só para "OUTRO": como aparece embaixo da linha (ex.: Testemunha).
  rotulo?: string;
};

export function assinantesValidos(valor: unknown): AssinanteDoc[] {
  if (!Array.isArray(valor)) return [];
  const papeis = ["CLIENTE", "EMPRESA", "VENDEDOR", "OUTRO"];
  return valor.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const { papel, nome, email, rotulo } = item as Record<string, unknown>;
    if (typeof papel !== "string" || !papeis.includes(papel) || typeof nome !== "string") return [];
    return [
      {
        papel: papel as PapelAssinante,
        nome: nome.trim().slice(0, 120),
        ...(typeof email === "string" && email.trim() ? { email: email.trim().toLowerCase() } : {}),
        ...(typeof rotulo === "string" && rotulo.trim() ? { rotulo: rotulo.trim().slice(0, 40) } : {}),
      },
    ];
  });
}

export type TipoProposta = "PEDIDO" | "PROPOSTA";

export function numeroPedido(numero: number): string {
  return `ORC-${String(numero).padStart(5, "0")}`;
}

export function numeroDocumento(tipo: TipoProposta, numero: number): string {
  return tipo === "PEDIDO" ? numeroPedido(numero) : numeroProposta(numero);
}

export type OrigemProposta = "WEB" | "BOT";

export const ORIGEM_PROPOSTA_LABELS: Record<OrigemProposta, string> = {
  WEB: "Web",
  BOT: "Bot",
};
