"use server";

import { exigirSessao } from "@/app/actions/helpers";
import { responderComAgente } from "@/lib/whatsapp/agente";

// Mesmo agente do WhatsApp, mas no site: as ferramentas já ficam amarradas ao
// usuário logado (consultor só vê o que é dele; admin vê a equipe).

const MAX_MENSAGEM = 2000;
const MAX_TURNOS = 10;
const MAX_BYTES_HISTORICO = 200_000;

export type RespostaAssistente =
  | { ok: true; resposta: string; historico: unknown[][] }
  | { ok: false; erro: string };

export async function perguntarAssistente(mensagem: string, historico: unknown): Promise<RespostaAssistente> {
  try {
    const sessao = await exigirSessao();
    const texto = String(mensagem ?? "").trim();
    if (!texto) return { ok: false, erro: "Escreva uma pergunta." };
    if (texto.length > MAX_MENSAGEM) return { ok: false, erro: "Mensagem muito longa." };

    const turnos = Array.isArray(historico) ? historico.filter(Array.isArray).slice(-MAX_TURNOS) : [];
    if (JSON.stringify(turnos).length > MAX_BYTES_HISTORICO) {
      return { ok: false, erro: "A conversa ficou longa demais. Comece uma nova." };
    }

    const r = await responderComAgente({
      consultorId: sessao.id,
      consultorNome: sessao.nome,
      role: sessao.role,
      waId: "web",
      canal: "web",
      mensagem: texto,
      historico: turnos as unknown[][],
      fotosPendentes: [],
      fotosAnexadas: [],
      respostaEmAudio: false,
    });
    return { ok: true, resposta: r.resposta, historico: r.historico.slice(-MAX_TURNOS) };
  } catch (error) {
    console.error("[assistente] erro:", error);
    return { ok: false, erro: error instanceof Error ? error.message : "Não consegui responder agora." };
  }
}
