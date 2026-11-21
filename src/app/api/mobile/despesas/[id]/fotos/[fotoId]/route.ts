export const runtime = "nodejs";

import { excluirFotoDespesa, obterDespesa } from "@/lib/servicos/despesas";
import { jsonOk, rotaMobile } from "@/lib/api-mobile";

export const DELETE = rotaMobile(async ({ sessao, params }) => {
  await excluirFotoDespesa(sessao, params.id, params.fotoId);
  return jsonOk(await obterDespesa(sessao, params.id));
});
