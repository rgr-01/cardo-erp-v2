export const runtime = "nodejs";

import { prisma } from "@/lib/prisma";
import { jsonOk, rotaMobile } from "@/lib/api-mobile";

// Todas as safras (filtro das listas no app), mais recentes primeiro.
export const GET = rotaMobile(async () => {
  const safras = await prisma.safra.findMany({
    select: { id: true, nome: true },
    orderBy: { createdAt: "desc" },
  });
  return jsonOk(safras);
});
