export const runtime = "nodejs";

import { prisma } from "@/lib/prisma";
import { jsonOk, rotaMobile } from "@/lib/api-mobile";

export const GET = rotaMobile(async () => {
  const produtos = await prisma.produto.findMany({
    select: { id: true, nome: true, fornecedor: { select: { nome: true } } },
    orderBy: { nome: "asc" },
  });
  return jsonOk(produtos);
});
