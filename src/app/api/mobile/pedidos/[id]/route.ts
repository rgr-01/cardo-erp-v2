export const runtime = "nodejs";

import type { PropostaInput } from "@/lib/pedidos";
import {
  atualizarProposta,
  excluirProposta,
  obterProposta,
} from "@/lib/servicos/propostas";
import { jsonOk, rotaMobile } from "@/lib/api-mobile";

export const GET = rotaMobile(async ({ sessao, params }) =>
  jsonOk(await obterProposta(sessao, params.id))
);

// Corpo: o documento inteiro (cliente, itens, condições), como no web.
export const PUT = rotaMobile(async ({ request, sessao, params }) => {
  const body = (await request.json().catch(() => null)) as PropostaInput | null;
  if (!body) throw new Error("Corpo da requisição inválido.");
  await atualizarProposta(sessao, params.id, body);
  return jsonOk(await obterProposta(sessao, params.id));
});

export const DELETE = rotaMobile(async ({ sessao, params }) => {
  await excluirProposta(sessao, params.id);
  return jsonOk({ ok: true });
});
