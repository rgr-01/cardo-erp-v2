export const runtime = "nodejs";

import {
  atualizarRelatorio,
  excluirRelatorio,
  obterRelatorio,
} from "@/lib/servicos/relatorios";
import { jsonOk, rotaMobile } from "@/lib/api-mobile";

export const GET = rotaMobile(async ({ sessao, params }) =>
  jsonOk(await obterRelatorio(sessao, params.id))
);

// Corpo: { titulo, dataVisita, conteudo, versaoEsperada? } — clientes novos
// devem mandar `atualizadoEm` do GET; a omissão segue aceita temporariamente
// para manter compatibilidade com versões já instaladas do app.
export const PATCH = rotaMobile(async ({ request, sessao, params }) => {
  const body = await request.json().catch(() => null);
  if (!body) throw new Error("Corpo da requisição inválido.");
  await atualizarRelatorio(sessao, params.id, body, { permitirSemVersao: true });
  return jsonOk(await obterRelatorio(sessao, params.id));
});

export const DELETE = rotaMobile(async ({ sessao, params }) => {
  await excluirRelatorio(sessao, params.id);
  return jsonOk({ ok: true });
});
