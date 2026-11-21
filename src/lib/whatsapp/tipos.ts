// Contrato comum entre os transportes de WhatsApp (Evolution API e Meta Cloud
// API). O webhook conversa só com estes tipos, então trocar de transporte é
// reescrever um arquivo, sem mexer no fluxo de conversa.

export type RefMidia =
  | { transporte: "meta"; mediaId: string }
  | {
      transporte: "evolution";
      mensagem: unknown;
      base64?: string;
      mimetype?: string;
    };

export type MensagemRecebida = {
  // Id da mensagem no provedor — usado pra ignorar reentregas do webhook.
  id?: string;
  waId: string;
  tipo: "text" | "image" | "audio" | "location" | "outro";
  // Texto da mensagem, ou a legenda quando é uma foto.
  texto?: string;
  // Id da mensagem que esta responde (WhatsApp > Responder), ex.: a foto que
  // o consultor selecionou pra escrever a descrição.
  respondendoA?: string;
  midia?: RefMidia;
  localizacao?: { latitude: number; longitude: number };
  // Quando o consultor enviou (ms). Sem internet na fazenda, a mensagem sai do
  // celular horas depois — é esse horário que vale pra data da visita,
  // check-in etc., não o da chegada no webhook.
  enviadaEm: number;
};

// Timestamp do provedor em segundos (número, string ou Long {low, high} da
// Evolution). Sem timestamp válido, vale a hora da chegada.
export function timestampEmMs(valor: unknown): number {
  let segundos: number;
  if (typeof valor === "number") segundos = valor;
  else if (typeof valor === "string") segundos = Number(valor);
  else if (valor && typeof valor === "object" && "low" in valor) {
    const longo = valor as { low?: number; high?: number };
    segundos = (longo.high ?? 0) * 2 ** 32 + ((longo.low ?? 0) >>> 0);
  } else segundos = NaN;

  const ms = segundos * 1000;
  const agora = Date.now();
  // Relógio do celular adiantado não pode jogar a mensagem pro futuro.
  if (!Number.isFinite(ms) || ms <= 0 || ms > agora) return agora;
  return ms;
}

export type Midia = {
  buffer: Buffer;
  contentType: string;
};
