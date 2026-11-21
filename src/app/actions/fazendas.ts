"use server";

import { revalidatePath } from "next/cache";
import { exigirSessao, comErro, type ResultadoAcao } from "@/app/actions/helpers";
import * as servico from "@/lib/servicos/fazendas";

export type FazendaInput = servico.FazendaInput;
export type Fazenda = servico.Fazenda;

export async function listarFazendasDoCliente(
  clienteId: string
): Promise<{ ok: true; fazendas: Fazenda[] } | { ok: false; erro: string }> {
  try {
    const sessao = await exigirSessao();
    return { ok: true, fazendas: await servico.listarFazendas(sessao, clienteId) };
  } catch (error) {
    return comErro(error) as { ok: false; erro: string };
  }
}

export async function criarFazenda(clienteId: string, input: FazendaInput): Promise<ResultadoAcao> {
  try {
    const sessao = await exigirSessao("CADASTROS");
    await servico.criarFazenda(sessao, clienteId, input);
    revalidatePath("/clientes");
    revalidatePath("/localizacao");
    return { ok: true };
  } catch (error) {
    return comErro(error);
  }
}

export async function atualizarFazenda(id: string, input: FazendaInput): Promise<ResultadoAcao> {
  try {
    const sessao = await exigirSessao("CADASTROS");
    await servico.atualizarFazenda(sessao, id, input);
    revalidatePath("/clientes");
    revalidatePath("/localizacao");
    return { ok: true };
  } catch (error) {
    return comErro(error);
  }
}

export async function excluirFazenda(id: string): Promise<ResultadoAcao> {
  try {
    const sessao = await exigirSessao("CADASTROS");
    await servico.excluirFazenda(sessao, id);
    revalidatePath("/clientes");
    revalidatePath("/localizacao");
    return { ok: true };
  } catch (error) {
    return comErro(error);
  }
}
