export const runtime = "nodejs";

import {
  atualizarCliente,
  excluirCliente,
  obterCliente,
  type ClienteInput,
} from "@/lib/servicos/clientes";
import { jsonOk, rotaMobile } from "@/lib/api-mobile";

export const GET = rotaMobile(async ({ sessao, params }) => jsonOk(await obterCliente(sessao, params.id)));

export const PATCH = rotaMobile(async ({ request, sessao, params }) => {
  const body = (await request.json().catch(() => null)) as ClienteInput | null;
  if (!body) throw new Error("Corpo da requisição inválido.");
  await atualizarCliente(sessao, params.id, body);
  return jsonOk(await obterCliente(sessao, params.id));
});

export const DELETE = rotaMobile(async ({ sessao, params }) => {
  await excluirCliente(sessao, params.id);
  return jsonOk({ ok: true });
});
