import { cache } from "react";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";

const COOKIE_SAFRA = "safra_ativa";

type SafraResumo = { id: string; nome: string };

// Memoizadas por requisição: o layout e a página pedem as safras/safra atual
// na mesma renderização, e sem o cache cada chamada ia ao banco de novo.
export const getSafras = cache(async (): Promise<SafraResumo[]> => {
  return prisma.safra.findMany({
    select: { id: true, nome: true },
    orderBy: { createdAt: "desc" },
  });
});

export async function getSafraMaisRecente(): Promise<SafraResumo> {
  const [maisRecente] = await getSafras();
  if (maisRecente) return maisRecente;

  return prisma.safra.create({
    data: { nome: "24/27" },
    select: { id: true, nome: true },
  });
}

export const getSafraAtual = cache(async (): Promise<SafraResumo> => {
  const jar = await cookies();
  const idCookie = jar.get(COOKIE_SAFRA)?.value;

  if (idCookie) {
    const safra = (await getSafras()).find((s) => s.id === idCookie);
    if (safra) return safra;
  }

  return getSafraMaisRecente();
});

export async function getSafraAtualId(): Promise<string> {
  return (await getSafraAtual()).id;
}
