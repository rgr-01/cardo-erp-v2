export const runtime = "nodejs";

import { atualizarFazenda, excluirFazenda, type FazendaInput } from "@/lib/servicos/fazendas";
import { jsonOk, rotaMobile } from "@/lib/api-mobile";

export const PATCH = rotaMobile(async ({ sessao, request, params }) => {
  const body = (await request.json().catch(() => null)) as FazendaInput | null;
  if (!body) throw new Error("Corpo da requisição inválido.");
  return jsonOk(await atualizarFazenda(sessao, params.id, body));
});

export const DELETE = rotaMobile(async ({ sessao, params }) => {
  await excluirFazenda(sessao, params.id);
  return jsonOk({ ok: true });
});
