export const runtime = "nodejs";

import { aprovarPedido, obterProposta } from "@/lib/servicos/propostas";
import { jsonOk, rotaMobile } from "@/lib/api-mobile";

// Pedido aprovado vira proposta (mesmo fluxo do botão "Aprovar" do web).
export const POST = rotaMobile(async ({ sessao, params }) => {
  await aprovarPedido(sessao, params.id);
  return jsonOk(await obterProposta(sessao, params.id));
});
