"use server";

import { z } from "zod";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import {
  exigirSessao,
  comErro,
  type ResultadoAcao,
} from "@/app/actions/helpers";

const COOKIE_SAFRA = "safra_ativa";

function revalidar() {
  revalidatePath("/dashboard");
  revalidatePath("/vendas");
  revalidatePath("/metas");
  revalidatePath("/propostas");
  revalidatePath("/historico");
  revalidatePath("/apresentacao");
  revalidatePath("/clientes");
  revalidatePath("/localizacao");
  revalidatePath("/despesas");
  revalidatePath("/relatorios/visitas");
  revalidatePath("/relatorios/trabalhos");
}

async function registrar(nome: string, acao: string, detalhes: string) {
  await prisma.historico.create({
    data: { usuarioNome: nome, acao, entidade: "SAFRA", detalhes },
  });
}

export async function selecionarSafra(safraId: string): Promise<ResultadoAcao> {
  try {
    await exigirSessao();
    const safra = await prisma.safra.findUniqueOrThrow({
      where: { id: safraId },
    });
    const jar = await cookies();
    jar.set(COOKIE_SAFRA, safra.id, {
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
      sameSite: "lax",
    });
    revalidar();
    return { ok: true };
  } catch (error) {
    return comErro(error);
  }
}

const nomeSchema = z.string().trim().min(1, "Informe o nome da safra.");

export async function criarSafra(nome: string): Promise<ResultadoAcao> {
  try {
    const sessao = await exigirSessao();
    const nomeLimpo = nomeSchema.parse(nome);
    const safra = await prisma.safra.create({ data: { nome: nomeLimpo } });
    await registrar(sessao.nome, "Criou", `Safra ${safra.nome}`);
    const jar = await cookies();
    jar.set(COOKIE_SAFRA, safra.id, {
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
      sameSite: "lax",
    });
    revalidar();
    return { ok: true };
  } catch (error) {
    return comErro(error);
  }
}

export async function atualizarSafra(
  id: string,
  nome: string
): Promise<ResultadoAcao> {
  try {
    const sessao = await exigirSessao();
    const nomeLimpo = nomeSchema.parse(nome);
    const existente = await prisma.safra.findUniqueOrThrow({ where: { id } });
    const nova = await prisma.safra.update({
      where: { id },
      data: { nome: nomeLimpo },
    });
    await registrar(
      sessao.nome,
      "Renomeou",
      `Safra ${existente.nome} → ${nova.nome}`
    );
    revalidar();
    return { ok: true };
  } catch (error) {
    return comErro(error);
  }
}

export async function excluirSafra(id: string): Promise<ResultadoAcao> {
  try {
    const sessao = await exigirSessao();
    const existente = await prisma.safra.findUniqueOrThrow({ where: { id } });

    const [vendas, propostas, metas, visitas, despesas, trabalhos] = await Promise.all([
      prisma.venda.count({ where: { safraId: id } }),
      prisma.proposta.count({ where: { safraId: id } }),
      prisma.meta.count({ where: { safraId: id } }),
      prisma.relatorioVisita.count({ where: { safraId: id } }),
      prisma.despesa.count({ where: { safraId: id } }),
      prisma.trabalho.count({ where: { safraId: id } }),
    ]);
    if (vendas + propostas + metas + visitas + despesas + trabalhos > 0) {
      throw new Error(
        `Não é possível excluir a safra ${existente.nome}: existem ${vendas} venda(s), ${propostas} proposta(s), ${metas} meta(s), ${visitas} visita(s), ${despesas} despesa(s) e ${trabalhos} trabalho(s) vinculados.`
      );
    }

    await prisma.safra.delete({ where: { id } });
    await registrar(sessao.nome, "Excluiu", `Safra ${existente.nome}`);

    const jar = await cookies();
    if (jar.get(COOKIE_SAFRA)?.value === id) {
      const restante = await prisma.safra.findFirst({
        orderBy: { createdAt: "desc" },
      });
      if (restante) {
        jar.set(COOKIE_SAFRA, restante.id, {
          path: "/",
          maxAge: 60 * 60 * 24 * 365,
          sameSite: "lax",
        });
      } else {
        jar.delete(COOKIE_SAFRA);
      }
    }

    revalidar();
    return { ok: true };
  } catch (error) {
    return comErro(error);
  }
}
