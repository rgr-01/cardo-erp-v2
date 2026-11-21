export const runtime = "nodejs";

import { atualizarLocalizacaoCliente, obterCliente } from "@/lib/servicos/clientes";
import { jsonOk, rotaMobile } from "@/lib/api-mobile";

export const PUT = rotaMobile(async ({ request, sessao, params }) => {
  const body = (await request.json().catch(() => null)) as
    | { latitude?: number; longitude?: number }
    | null;
  await atualizarLocalizacaoCliente(
    sessao,
    params.id,
    Number(body?.latitude),
    Number(body?.longitude)
  );
  return jsonOk(await obterCliente(sessao, params.id));
});
