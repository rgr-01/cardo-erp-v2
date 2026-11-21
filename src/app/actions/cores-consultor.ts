"use server";

import { revalidatePath } from "next/cache";
import { exigirAdmin, comErro, type ResultadoAcao } from "@/app/actions/helpers";
import { corValida } from "@/lib/cores-consultor";
import { prisma } from "@/lib/prisma";

// cor nula volta o consultor à cor padrão. Só o admin escolhe.
export async function definirCorConsultor(consultorId: string, cor: string | null): Promise<ResultadoAcao> {
  try {
    await exigirAdmin();
    if (cor !== null && !corValida(cor)) throw new Error("Cor inválida.");
    await prisma.user.update({ where: { id: consultorId }, data: { corMapa: cor ? cor.toLowerCase() : null } });
    revalidatePath("/clientes");
    revalidatePath("/localizacao");
    return { ok: true };
  } catch (error) {
    return comErro(error);
  }
}

export async function restaurarCoresPadrao(): Promise<ResultadoAcao> {
  try {
    await exigirAdmin();
    await prisma.user.updateMany({ where: { corMapa: { not: null } }, data: { corMapa: null } });
    revalidatePath("/clientes");
    revalidatePath("/localizacao");
    return { ok: true };
  } catch (error) {
    return comErro(error);
  }
}
