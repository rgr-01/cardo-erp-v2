"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSafraAtualId } from "@/lib/safra-atual";
import {
  exigirAdmin,
  comErro,
  type ResultadoAcao,
} from "@/app/actions/helpers";

export async function salvarMeta(valor: number): Promise<ResultadoAcao> {
  try {
    await exigirAdmin("VENDAS");
    const valorLimpo = z.number().nonnegative().parse(valor);
    const safraId = await getSafraAtualId();
    await prisma.meta.upsert({
      where: { safraId },
      update: { valor: valorLimpo },
      create: { safraId, valor: valorLimpo },
    });
    revalidatePath("/metas");
    revalidatePath("/dashboard");
    return { ok: true };
  } catch (error) {
    return comErro(error);
  }
}

export async function excluirMeta(id: string): Promise<ResultadoAcao> {
  try {
    await exigirAdmin("VENDAS");
    await prisma.meta.delete({ where: { id } });
    revalidatePath("/metas");
    revalidatePath("/dashboard");
    return { ok: true };
  } catch (error) {
    return comErro(error);
  }
}
