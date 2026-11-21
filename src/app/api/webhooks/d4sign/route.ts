import crypto from "node:crypto";
import { sincronizarAssinatura } from "@/lib/assinaturas";

export const runtime = "nodejs";

// https://docapi.d4sign.com.br/docs/segurança-de-webhook
function assinaturaValida(documentoUuid: string, header: string | null): boolean {
  const secret = process.env.D4SIGN_WEBHOOK_HMAC_SECRET;
  if (!secret || !header) return false;
  const recebido = header.startsWith("sha256=") ? header.slice(7) : header;
  if (!/^[a-f0-9]{64}$/i.test(recebido)) return false;
  const esperado = crypto.createHmac("sha256", secret).update(documentoUuid).digest();
  return crypto.timingSafeEqual(Buffer.from(recebido, "hex"), esperado);
}

export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return new Response("Payload inválido", { status: 400 });
  }
  const documentoUuid = form.get("uuid")?.toString();
  const typePost = form.get("type_post")?.toString();
  if (!documentoUuid || !typePost) return new Response("Payload inválido", { status: 400 });
  if (!assinaturaValida(documentoUuid, request.headers.get("content-hmac"))) {
    console.warn(`[D4Sign webhook] autenticação rejeitada: ${documentoUuid}`);
    return new Response("Não autorizado", { status: 401 });
  }
  if (typePost !== "1" && typePost !== "3") return new Response("OK");
  try {
    const resultado = await sincronizarAssinatura(documentoUuid);
    // Não confirmar entrega antes de a API refletir a conclusão, nem antes
    // de o envio inicial persistir o vínculo entre documento e pedido.
    if (resultado === "PENDENTE" || resultado === "NAO_ENCONTRADO") {
      console.warn(`[D4Sign webhook] aguardando confirmação: ${documentoUuid} (${resultado})`);
      return new Response("Aguardando confirmação", { status: 503 });
    }
    return new Response("OK");
  } catch (error) {
    console.error(`[D4Sign webhook] falha ao sincronizar ${documentoUuid}:`, error);
    return new Response("Falha temporária na sincronização", { status: 503 });
  }
}
