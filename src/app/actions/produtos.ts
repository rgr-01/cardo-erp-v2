"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { detalhesProdutoSchema, editarProdutoSchema, type DetalhesProdutoInput, type EditarProdutoInput } from "@/lib/produtos";
import {
  exigirSessao,
  exigirAdmin,
  comErro,
  type ResultadoAcao,
} from "@/app/actions/helpers";

export async function criarFornecedor(nome: string): Promise<ResultadoAcao> {
  try {
    await exigirAdmin("CADASTROS");
    const nomeLimpo = z.string().trim().min(1).max(120).parse(nome);
    await prisma.fornecedor.create({ data: { nome: nomeLimpo } });
    revalidatePath("/produtos");
    revalidatePath("/fornecedores");
    return { ok: true };
  } catch (error) {
    return comErro(error);
  }
}

export async function criarProduto(
  nome: string,
  fornecedorId: string,
  detalhes: DetalhesProdutoInput = {}
): Promise<ResultadoAcao | { ok: true; id: string }> {
  try {
    await exigirSessao("ESTOQUE");
    const nomeLimpo = z.string().min(1).parse(nome).trim();
    // Mesmo nome (so muda maiuscula/minuscula) no mesmo fornecedor gerava
    // produtos duplicados no passado — bloqueia aqui em vez de deixar
    // acumular registros que precisam ser limpos manualmente depois.
    const existente = await prisma.produto.findFirst({
      where: { fornecedorId, nome: { equals: nomeLimpo, mode: "insensitive" } },
    });
    if (existente) {
      throw new Error(`Já existe um produto "${existente.nome}" cadastrado para este fornecedor.`);
    }
    const criado = await prisma.produto.create({
      data: { nome: nomeLimpo, fornecedorId, ...detalhesProdutoSchema.parse(detalhes) },
    });
    revalidatePath("/produtos");
    revalidatePath("/fornecedores");
    return { ok: true, id: criado.id };
  } catch (error) {
    return comErro(error);
  }
}

// Custo de compra do produto (nao o preco de venda) — base do simulador de
// margem do orcamento. So o gestor mexe, ja que fica oculto pra equipe
// comercial (ver lib/margem.ts e SimuladorMargem).
export async function atualizarCustoProduto(
  id: string,
  custoAvista: number | null,
  custoAprazo: number | null,
  custoCompra: number | null,
  margemPct: number | null = null
): Promise<ResultadoAcao> {
  try {
    await exigirAdmin("ESTOQUE");
    const schema = z.number().nonnegative().nullable();
    await prisma.produto.update({
      where: { id },
      data: {
        custoAvista: schema.parse(custoAvista),
        custoAprazo: schema.parse(custoAprazo),
        custoCompra: schema.parse(custoCompra),
        // Fracao (0.30 = 30%); tem que ficar abaixo de 100% pra o preco existir.
        margemPct: z.number().min(0).max(0.99).nullable().parse(margemPct),
      },
    });
    revalidatePath("/produtos");
    revalidatePath("/fornecedores");
    return { ok: true };
  } catch (error) {
    return comErro(error);
  }
}

export async function atualizarDetalhesProduto(id: string, input: DetalhesProdutoInput): Promise<ResultadoAcao> {
  try {
    await exigirAdmin("ESTOQUE");
    await prisma.produto.update({ where: { id }, data: detalhesProdutoSchema.parse(input) });
    revalidatePath("/produtos");
    revalidatePath("/fornecedores");
    return { ok: true };
  } catch (error) {
    return comErro(error);
  }
}

export async function atualizarProduto(id: string, input: EditarProdutoInput): Promise<ResultadoAcao> {
  try {
    await exigirAdmin("ESTOQUE");
    const dados = editarProdutoSchema.parse(input);
    const duplicado = await prisma.produto.findFirst({
      where: { id: { not: id }, fornecedorId: dados.fornecedorId, nome: { equals: dados.nome, mode: "insensitive" } },
      select: { id: true },
    });
    if (duplicado) throw new Error("Já existe um produto com esse nome para este fornecedor.");
    await prisma.produto.update({ where: { id }, data: dados });
    revalidatePath("/produtos");
    revalidatePath("/fornecedores");
    revalidatePath("/vendas");
    revalidatePath("/pedidos");
    revalidatePath("/propostas");
    return { ok: true };
  } catch (error) {
    return comErro(error);
  }
}

export async function excluirProduto(id: string): Promise<ResultadoAcao> {
  try {
    await exigirAdmin("ESTOQUE");
    const vendas = await prisma.venda.count({ where: { produtoId: id } });
    if (vendas > 0) {
      throw new Error(
        `Produto possui ${vendas} venda(s) registrada(s) e não pode ser excluído.`
      );
    }
    await prisma.produto.delete({ where: { id } });
    revalidatePath("/produtos");
    revalidatePath("/fornecedores");
    return { ok: true };
  } catch (error) {
    return comErro(error);
  }
}

export async function excluirFornecedor(id: string): Promise<ResultadoAcao> {
  try {
    await exigirAdmin("CADASTROS");
    const produtos = await prisma.produto.count({
      where: { fornecedorId: id },
    });
    if (produtos > 0) {
      throw new Error(
        `Fornecedor possui ${produtos} produto(s) cadastrado(s) e não pode ser excluído.`
      );
    }
    await prisma.fornecedor.delete({ where: { id } });
    revalidatePath("/produtos");
    revalidatePath("/fornecedores");
    return { ok: true };
  } catch (error) {
    return comErro(error);
  }
}
