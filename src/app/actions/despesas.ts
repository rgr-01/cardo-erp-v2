"use server";

import { revalidatePath } from "next/cache";
import { exigirSessao, comErro, type ResultadoAcao } from "@/app/actions/helpers";
import { prisma } from "@/lib/prisma";
import { getSafraAtualId } from "@/lib/safra-atual";
import { salvarDespesa, type FotoEntrada } from "@/lib/despesas";
import {
  CATEGORIAS_DESPESA,
  despesaSchema,
  exigirAcessoDespesa,
  registrarHistoricoDespesa,
  atualizarDespesa as atualizarDespesaServico,
  excluirDespesa as excluirDespesaServico,
  excluirFotoDespesa as excluirFotoDespesaServico,
} from "@/lib/servicos/despesas";
import { extrairDadosNotaFiscal } from "@/lib/ocr-despesa";

export async function criarDespesa(formData: FormData): Promise<ResultadoAcao> {
  try {
    const sessao = await exigirSessao("DESPESAS");

    const dados = despesaSchema.parse({
      categoria: formData.get("categoria"),
      contaId: formData.get("contaId"),
      documento: formData.get("documento"),
      vencimento: formData.get("vencimento"),
      situacao: formData.get("situacao"),
      filial: formData.get("filial"),
      valor: formData.get("valor"),
      data: formData.get("data"),
      clienteId: formData.get("clienteId"),
      estabelecimento: formData.get("estabelecimento"),
      descricao: formData.get("descricao"),
    });

    const arquivos = formData
      .getAll("fotos")
      .filter((f): f is File => f instanceof File && f.size > 0);

    const fotos: FotoEntrada[] = await Promise.all(
      arquivos.map(async (arquivo) => {
        if (!arquivo.type.startsWith("image/")) {
          throw new Error(`O arquivo "${arquivo.name}" não é uma imagem.`);
        }
        return {
          buffer: Buffer.from(await arquivo.arrayBuffer()),
          contentType: arquivo.type,
          nomeOriginal: arquivo.name,
        };
      })
    );

    const safraId = await getSafraAtualId();

    const despesa = await salvarDespesa({
      consultorId: sessao.id,
      clienteId: dados.clienteId,
      safraId,
      categoria: dados.categoria,
      contaId: dados.contaId,
      documento: dados.documento,
      vencimento: dados.vencimento ? new Date(dados.vencimento) : null,
      situacao: dados.situacao,
      filial: dados.filial,
      valor: dados.valor,
      data: dados.data ? new Date(dados.data) : undefined,
      estabelecimento: dados.estabelecimento,
      descricao: dados.descricao,
      origemOcr: formData.get("origemOcr") === "true",
      fotos,
    });

    await registrarHistoricoDespesa(
      sessao,
      "CRIACAO",
      `Despesa no valor de R$ ${dados.valor.toFixed(2)} (#${despesa.id})`
    );

    revalidatePath("/despesas");
    return { ok: true };
  } catch (error) {
    return comErro(error);
  }
}

export async function atualizarDespesa(
  id: string,
  formData: FormData
): Promise<ResultadoAcao> {
  try {
    const sessao = await exigirSessao("DESPESAS");
    const arquivos = formData
      .getAll("fotos")
      .filter((f): f is File => f instanceof File && f.size > 0);

    const fotosNovas: FotoEntrada[] = await Promise.all(
      arquivos.map(async (arquivo) => {
        if (!arquivo.type.startsWith("image/")) {
          throw new Error(`O arquivo "${arquivo.name}" não é uma imagem.`);
        }
        return {
          buffer: Buffer.from(await arquivo.arrayBuffer()),
          contentType: arquivo.type,
          nomeOriginal: arquivo.name,
        };
      })
    );

    await atualizarDespesaServico(
      sessao,
      id,
      {
        categoria: formData.get("categoria"),
        contaId: formData.get("contaId"),
        documento: formData.get("documento"),
        vencimento: formData.get("vencimento"),
        situacao: formData.get("situacao"),
        filial: formData.get("filial"),
        valor: formData.get("valor"),
        data: formData.get("data"),
        clienteId: formData.get("clienteId"),
        estabelecimento: formData.get("estabelecimento"),
        descricao: formData.get("descricao"),
      },
      fotosNovas
    );

    revalidatePath("/despesas");
    return { ok: true };
  } catch (error) {
    return comErro(error);
  }
}

export async function baixarDespesa(id: string): Promise<ResultadoAcao> {
  try {
    const sessao = await exigirSessao("DESPESAS");
    await exigirAcessoDespesa(sessao, id, "editar");
    await prisma.despesa.update({ where: { id }, data: { situacao: "PAGO" } });
    await registrarHistoricoDespesa(sessao, "EDICAO", `Despesa marcada como paga (#${id})`);
    revalidatePath("/despesas");
    revalidatePath("/financeiro", "layout");
    return { ok: true };
  } catch (error) {
    return comErro(error);
  }
}

export async function excluirFotoDespesa(fotoId: string, despesaId: string): Promise<ResultadoAcao> {
  try {
    const sessao = await exigirSessao("DESPESAS");
    await excluirFotoDespesaServico(sessao, despesaId, fotoId);
    revalidatePath("/despesas");
    return { ok: true };
  } catch (error) {
    return comErro(error);
  }
}

export async function excluirDespesa(id: string): Promise<ResultadoAcao> {
  try {
    const sessao = await exigirSessao("DESPESAS");
    await excluirDespesaServico(sessao, id);
    revalidatePath("/despesas");
    return { ok: true };
  } catch (error) {
    return comErro(error);
  }
}

export type ExtracaoDespesaResultado =
  | {
      ok: true;
      valor: number | null;
      data: string | null;
      estabelecimento: string | null;
      categoria: (typeof CATEGORIAS_DESPESA)[number] | null;
      confianca: "alta" | "media" | "baixa";
    }
  | { ok: false; erro: string };

export async function extrairDespesaDeFoto(
  formData: FormData
): Promise<ExtracaoDespesaResultado> {
  try {
    await exigirSessao("DESPESAS");

    const arquivo = formData.get("foto");
    if (!(arquivo instanceof File) || arquivo.size === 0) {
      throw new Error("Envie uma foto da nota fiscal.");
    }
    if (!arquivo.type.startsWith("image/")) {
      throw new Error("O arquivo enviado não é uma imagem.");
    }
    if (arquivo.size > 8 * 1024 * 1024) {
      throw new Error("A foto excede 8MB.");
    }

    const buffer = Buffer.from(await arquivo.arrayBuffer());
    const extraido = await extrairDadosNotaFiscal(buffer, arquivo.type);

    return { ok: true, ...extraido };
  } catch (error) {
    return comErro(error) as ExtracaoDespesaResultado;
  }
}
