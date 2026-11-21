import {
  extrairMensagens,
  autorizarWebhook,
  responderVerificacao,
} from "@/lib/whatsapp/transporte";
import { receberMensagens, iniciarVarreduraFila } from "@/lib/whatsapp/fila";

export const runtime = "nodejs";

export async function GET(request: Request) {
  // Só a Meta Cloud API faz handshake de verificação; a Evolution devolve null.
  const resposta = responderVerificacao(request);
  return resposta ?? new Response("Forbidden", { status: 403 });
}

export async function POST(request: Request) {
  const bodyRaw = await request.text();

  if (!autorizarWebhook(request, bodyRaw)) {
    return new Response("Não autorizado", { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(bodyRaw);
  } catch {
    return new Response("OK", { status: 200 });
  }

  // Grava no banco e responde na hora; o processamento (agente, OpenAI, PDF)
  // roda depois, agrupando o que chegar junto — ver fila.ts. Segurar o
  // webhook esse tempo todo fazia o provedor achar que falhou e reenviar.
  iniciarVarreduraFila();
  try {
    await receberMensagens(extrairMensagens(payload));
  } catch (error) {
    // Sem gravar, a mensagem se perderia: 500 faz o provedor reenviar.
    console.error("[WhatsApp] falha ao gravar mensagem recebida:", error);
    return new Response("Erro", { status: 500 });
  }

  return new Response("OK", { status: 200 });
}
