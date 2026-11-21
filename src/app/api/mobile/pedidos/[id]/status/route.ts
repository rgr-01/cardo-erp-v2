export const runtime = "nodejs";

import { alterarStatusProposta, obterProposta } from "@/lib/servicos/propostas";
import { jsonOk, rotaMobile } from "@/lib/api-mobile";

export const POST = rotaMobile(async ({ request, sessao, params }) => {
  const body = (await request.json().catch(() => null)) as { status?: string } | null;
  await alterarStatusProposta(sessao, params.id, body?.status);
  return jsonOk(await obterProposta(sessao, params.id));
});
