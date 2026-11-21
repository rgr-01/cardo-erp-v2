export const runtime = "nodejs";

import { criarFazenda, listarFazendas, type FazendaInput } from "@/lib/servicos/fazendas";
import { jsonOk, rotaMobile } from "@/lib/api-mobile";

export const GET = rotaMobile(async ({ sessao, params }) => jsonOk(await listarFazendas(sessao, params.id)));

export const POST = rotaMobile(async ({ sessao, request, params }) => {
  const body = (await request.json().catch(() => null)) as FazendaInput | null;
  if (!body) throw new Error("Corpo da requisição inválido.");
  return jsonOk(await criarFazenda(sessao, params.id, body), 201);
});
