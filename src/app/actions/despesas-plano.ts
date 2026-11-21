"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { exigirAdmin, comErro, type ResultadoAcao } from "@/app/actions/helpers";
import { prisma } from "@/lib/prisma";
import { getSafraAtualId } from "@/lib/safra-atual";

const linhaSchema = z.object({
  id: z.string().min(1),
  nome: z.string().trim().min(1, "Toda conta precisa de um nome."),
  ativo: z.boolean(),
  valor: z.number("Informe o orçamento de todas as contas.").min(0, "O orçamento não pode ser negativo."),
});

function revalidar() {
  revalidatePath("/despesas");
  revalidatePath("/despesas/orcamento");
}

// Grava nome, situação e orçamento mensal das contas na safra atual. O valor
// também vira o padrão da conta, que as safras novas herdam.
export async function salvarPlanoDespesas(linhas: unknown): Promise<ResultadoAcao> {
  try {
    await exigirAdmin("DESPESAS");
    const dados = z.array(linhaSchema).parse(linhas);
    const safraId = await getSafraAtualId();

    await prisma.$transaction(
      dados.flatMap((l) => [
        prisma.contaDespesa.update({
          where: { id: l.id },
          data: { nome: l.nome, ativo: l.ativo, orcamentoPadrao: l.valor },
        }),
        prisma.orcamentoContaDespesa.upsert({
          where: { contaId_safraId: { contaId: l.id, safraId } },
          create: { contaId: l.id, safraId, valorMensal: l.valor },
          update: { valorMensal: l.valor },
        }),
      ])
    );

    revalidar();
    return { ok: true };
  } catch (error) {
    return comErro(error);
  }
}

export async function criarGrupoDespesa(nome: string): Promise<ResultadoAcao> {
  try {
    await exigirAdmin("DESPESAS");
    const limpo = z.string().trim().min(1, "Informe o nome do grupo.").parse(nome);
    const ultimo = await prisma.grupoDespesa.aggregate({ _max: { ordem: true } });
    await prisma.grupoDespesa.create({
      data: { nome: limpo, ordem: (ultimo._max.ordem ?? -1) + 1 },
    });
    revalidar();
    return { ok: true };
  } catch (error) {
    return comErro(error);
  }
}

const novaContaSchema = z.object({
  grupoId: z.string().min(1, "Escolha o grupo."),
  codigo: z.string().trim().min(1, "Informe o código da conta."),
  nome: z.string().trim().min(1, "Informe o nome da conta."),
  valor: z.number().min(0, "O orçamento não pode ser negativo."),
});

export async function criarContaDespesa(entrada: unknown): Promise<ResultadoAcao> {
  try {
    await exigirAdmin("DESPESAS");
    const dados = novaContaSchema.parse(entrada);
    if (await prisma.contaDespesa.findFirst({ where: { codigo: dados.codigo } })) {
      throw new Error(`Já existe uma conta com o código ${dados.codigo}.`);
    }
    const safraId = await getSafraAtualId();
    const ultima = await prisma.contaDespesa.aggregate({
      where: { grupoId: dados.grupoId },
      _max: { ordem: true },
    });
    await prisma.contaDespesa.create({
      data: {
        codigo: dados.codigo,
        nome: dados.nome,
        grupoId: dados.grupoId,
        ordem: (ultima._max.ordem ?? -1) + 1,
        orcamentoPadrao: dados.valor,
        orcamentos: { create: { safraId, valorMensal: dados.valor } },
      },
    });
    revalidar();
    return { ok: true };
  } catch (error) {
    return comErro(error);
  }
}
