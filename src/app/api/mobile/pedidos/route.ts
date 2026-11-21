export const runtime = "nodejs";

import { criarPedidoParaConsultor, type PropostaInput } from "@/lib/pedidos";
import { listarPropostas } from "@/lib/servicos/propostas";
import { jsonOk, rotaMobile } from "@/lib/api-mobile";

// ?tipo=PEDIDO|PROPOSTA (sem tipo: os dois) e ?safraId= opcionais.
export const GET = rotaMobile(async ({ request, sessao }) => {
  const busca = new URL(request.url).searchParams;
  const tipoParam = busca.get("tipo");
  const tipo = tipoParam === "PEDIDO" || tipoParam === "PROPOSTA" ? tipoParam : null;
  return jsonOk(await listarPropostas(sessao, { tipo, safraId: busca.get("safraId") }));
});

// Um Pedido (tipo PROPOSTA) só nasce da aprovação de um Orçamento existente
// (ver /api/mobile/pedidos/[id]/aprovar) — a criação aqui é sempre um
// Orçamento (tipo PEDIDO), mesma regra da tela web em propostas-table.tsx.
export const POST = rotaMobile(async ({ request, sessao }) => {
  const body = (await request.json().catch(() => null)) as
    | (PropostaInput & { safraId?: string })
    | null;
  if (!body) throw new Error("Corpo da requisição inválido.");

  const { safraId, ...input } = body;
  if (!safraId) throw new Error("Informe a safra.");

  const proposta = await criarPedidoParaConsultor({
    sessao,
    input,
    tipo: "PEDIDO",
    safraId,
  });

  return jsonOk({ id: proposta.id, numero: proposta.numero }, 201);
});
