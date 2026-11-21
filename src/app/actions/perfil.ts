"use server";

import { revalidatePath } from "next/cache";
import { exigirSessao, comErro, type ResultadoAcao } from "@/app/actions/helpers";
import { prisma } from "@/lib/prisma";
import { enviarBufferFotoPerfil, excluirArquivo } from "@/lib/storage";

async function apagarFotoAnterior(path: string | null | undefined) {
  if (!path) return;
  try {
    await excluirArquivo(path);
  } catch {
    // Foto órfã no storage não deve impedir a troca.
  }
}

export async function enviarFotoPerfil(formData: FormData): Promise<ResultadoAcao> {
  try {
    const sessao = await exigirSessao();
    const arquivo = formData.get("foto");
    if (!(arquivo instanceof File) || arquivo.size === 0) throw new Error("Selecione uma imagem.");

    const buffer = Buffer.from(await arquivo.arrayBuffer());
    const { path } = await enviarBufferFotoPerfil(buffer, arquivo.type, arquivo.name, sessao.id);

    const atual = await prisma.user.findUnique({ where: { id: sessao.id }, select: { fotoPath: true } });
    await prisma.user.update({ where: { id: sessao.id }, data: { fotoPath: path } });
    await apagarFotoAnterior(atual?.fotoPath);

    revalidatePath("/", "layout");
    return { ok: true };
  } catch (error) {
    return comErro(error);
  }
}

export async function removerFotoPerfil(): Promise<ResultadoAcao> {
  try {
    const sessao = await exigirSessao();
    const atual = await prisma.user.findUnique({ where: { id: sessao.id }, select: { fotoPath: true } });
    await prisma.user.update({ where: { id: sessao.id }, data: { fotoPath: null } });
    await apagarFotoAnterior(atual?.fotoPath);

    revalidatePath("/", "layout");
    return { ok: true };
  } catch (error) {
    return comErro(error);
  }
}
