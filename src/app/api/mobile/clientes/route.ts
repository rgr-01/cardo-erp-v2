export const runtime = "nodejs";

import { prisma } from "@/lib/prisma";
import { criarCliente, listarClientes, type ClienteInput } from "@/lib/servicos/clientes";
import { jsonOk, rotaMobile } from "@/lib/api-mobile";

// Sem parâmetro: id/nome + fazendas (seletores do app, que guardam isso pra
// escolher a fazenda offline). ?completo=1: cadastro inteiro. Consultor só
// vê os próprios clientes, admin vê todos (ver lib/servicos/clientes.ts).
export const GET = rotaMobile(async ({ request, sessao }) => {
  if (new URL(request.url).searchParams.get("completo")) {
    return jsonOk(await listarClientes(sessao));
  }
  const clientes = await prisma.cliente.findMany({
    where: sessao.role === "ADMIN" ? {} : { consultorId: sessao.id },
    select: {
      id: true,
      nome: true,
      fazendas: { select: { id: true, nome: true }, orderBy: { nome: "asc" } },
    },
    orderBy: { nome: "asc" },
  });
  return jsonOk(clientes);
});

export const POST = rotaMobile(async ({ request, sessao }) => {
  const body = (await request.json().catch(() => null)) as ClienteInput | null;
  if (!body) throw new Error("Corpo da requisição inválido.");
  return jsonOk(await criarCliente(sessao, body), 201);
});
