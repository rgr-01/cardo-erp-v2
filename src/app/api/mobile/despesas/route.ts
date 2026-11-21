export const runtime = "nodejs";

import { z } from "zod";
import { salvarDespesa } from "@/lib/despesas";
import { despesaSchema, listarDespesas } from "@/lib/servicos/despesas";
import { jsonOk, lerImagens, rotaMobile } from "@/lib/api-mobile";

const criacaoSchema = despesaSchema.extend({
  safraId: z.string().min(1, "Informe a safra."),
});

export const GET = rotaMobile(async ({ request, sessao }) => {
  const safraId = new URL(request.url).searchParams.get("safraId");
  return jsonOk(await listarDespesas(sessao, { safraId }));
});

export const POST = rotaMobile(async ({ request, sessao }) => {
  const formData = await request.formData();

  const dados = criacaoSchema.parse({
    categoria: formData.get("categoria"),
    valor: formData.get("valor"),
    safraId: formData.get("safraId"),
    data: formData.get("data"),
    clienteId: formData.get("clienteId"),
    estabelecimento: formData.get("estabelecimento"),
    descricao: formData.get("descricao"),
  });

  const despesa = await salvarDespesa({
    consultorId: sessao.id,
    clienteId: dados.clienteId,
    safraId: dados.safraId,
    categoria: dados.categoria,
    valor: dados.valor,
    data: dados.data ? new Date(dados.data) : undefined,
    estabelecimento: dados.estabelecimento,
    descricao: dados.descricao,
    origemOcr: formData.get("origemOcr") === "true",
    fotos: await lerImagens(formData, "fotos"),
  });

  return jsonOk({ id: despesa.id }, 201);
});
