import { sincronizarNotaFiscalFocusNfe } from "@/lib/servicos/financeiro";

export const runtime = "nodejs";

// A Focus NFe não assina o payload do webhook — a autenticação aqui é por
// query string (?secret=...) cadastrada junto da URL no painel deles (ver
// FOCUS_NFE_WEBHOOK_SECRET em lib/focusnfe.ts). Sem FOCUS_NFE_WEBHOOK_SECRET
// configurado, o endpoint recusa tudo (falha fechado) — configure a variável
// antes de cadastrar a URL em produção.
function autorizado(request: Request): boolean {
  const secret = process.env.FOCUS_NFE_WEBHOOK_SECRET;
  if (!secret) return false;
  const url = new URL(request.url);
  return url.searchParams.get("secret") === secret;
}

export async function POST(request: Request) {
  if (!autorizado(request)) {
    return new Response("Não autorizado", { status: 401 });
  }

  let body: { ref?: string };
  try {
    body = await request.json();
  } catch {
    return new Response("Payload inválido", { status: 400 });
  }

  const referencia = body.ref;
  if (!referencia) return new Response("Payload inválido", { status: 400 });

  try {
    const resultado = await sincronizarNotaFiscalFocusNfe(referencia);
    if (resultado === "NAO_ENCONTRADO") {
      console.warn(`[Focus NFe webhook] referência não encontrada: ${referencia}`);
      return new Response("Referência não encontrada", { status: 404 });
    }
    return new Response("OK");
  } catch (error) {
    console.error(`[Focus NFe webhook] falha ao sincronizar ${referencia}:`, error);
    return new Response("Falha temporária na sincronização", { status: 503 });
  }
}
