// Seleciona o transporte de WhatsApp em runtime. Padrão: Evolution API
// (self-hosted, já rodando no Railway). WHATSAPP_TRANSPORTE=meta volta para a
// Meta Cloud API oficial, útil se o número da Evolution for bloqueado.

import * as evolution from "./evolution";
import * as meta from "./meta";

const ESCOLHIDO = (process.env.WHATSAPP_TRANSPORTE || "evolution").toLowerCase();

const impl = ESCOLHIDO === "meta" ? meta : evolution;

export const transporteAtivo = ESCOLHIDO === "meta" ? "meta" : "evolution";

export const whatsappConfigurado = impl.whatsappConfigurado;
export const numeroDoBot = impl.numeroDoBot;
export const autorizarWebhook = impl.autorizarWebhook;
export const responderVerificacao = impl.responderVerificacao;
export const enviarMensagemTexto = impl.enviarMensagemTexto;
export const enviarDocumento = impl.enviarDocumento;
export const enviarImagem = impl.enviarImagem;
export const enviarDigitando = impl.enviarDigitando;
export const reagir = impl.reagir;
export const enviarAudio = impl.enviarAudio;
export const enviarEnquete = impl.enviarEnquete;
export const baixarMidia = impl.baixarMidia;
export const extrairMensagens = impl.extrairMensagens;

export type { MensagemRecebida, Midia, RefMidia } from "./tipos";
