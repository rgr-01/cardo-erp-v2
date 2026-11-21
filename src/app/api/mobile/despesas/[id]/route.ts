export const runtime = "nodejs";

import {
  atualizarDespesa,
  excluirDespesa,
  obterDespesa,
} from "@/lib/servicos/despesas";
import { jsonOk, lerImagens, rotaMobile } from "@/lib/api-mobile";

export const GET = rotaMobile(async ({ sessao, params }) =>
  jsonOk(await obterDespesa(sessao, params.id))
);

// Multipart: campos da despesa + "fotos" novas (as antigas continuam; pra
// tirar uma, DELETE em /fotos/[fotoId]).
export const PATCH = rotaMobile(async ({ request, sessao, params }) => {
  const formData = await request.formData();
  await atualizarDespesa(
    sessao,
    params.id,
    {
      categoria: formData.get("categoria"),
      valor: formData.get("valor"),
      data: formData.get("data"),
      clienteId: formData.get("clienteId"),
      estabelecimento: formData.get("estabelecimento"),
      descricao: formData.get("descricao"),
    },
    await lerImagens(formData, "fotos")
  );
  return jsonOk(await obterDespesa(sessao, params.id));
});

export const DELETE = rotaMobile(async ({ sessao, params }) => {
  await excluirDespesa(sessao, params.id);
  return jsonOk({ ok: true });
});
