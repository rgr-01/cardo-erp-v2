"use server";

import { revalidatePath } from "next/cache";
import {
  exigirSessao,
  comErro,
  type ResultadoAcao,
} from "@/app/actions/helpers";
import * as servico from "@/lib/servicos/clientes";

export type ClienteInput = servico.ClienteInput;

export async function criarCliente(input: ClienteInput): Promise<ResultadoAcao> {
  try {
    const sessao = await exigirSessao("CADASTROS");
    await servico.criarCliente(sessao, input);
    revalidatePath("/clientes");
    revalidatePath("/localizacao");
    return { ok: true };
  } catch (error) {
    return comErro(error);
  }
}

export async function atualizarCliente(
  id: string,
  input: ClienteInput
): Promise<ResultadoAcao> {
  try {
    const sessao = await exigirSessao("CADASTROS");
    await servico.atualizarCliente(sessao, id, input);
    revalidatePath("/clientes");
    revalidatePath("/localizacao");
    return { ok: true };
  } catch (error) {
    return comErro(error);
  }
}

// Completa o cadastro do cliente direto do editor de pedido (sem abrir Clientes).
export async function completarCadastroCliente(
  id: string,
  input: servico.CadastroParaPedidoInput
): Promise<
  | {
      ok: true;
      cliente: {
        id: string;
        razaoSocial: string | null;
        documento: string | null;
        endereco: string | null;
        cidade: string | null;
        uf: string | null;
        cep: string | null;
        telefone: string | null;
        email: string | null;
      };
    }
  | { ok: false; erro: string }
> {
  try {
    const sessao = await exigirSessao("VENDAS");
    const cliente = await servico.completarCadastroParaPedido(sessao, id, input);
    revalidatePath("/clientes");
    revalidatePath("/localizacao");
    revalidatePath("/pedidos");
    revalidatePath("/propostas");
    return { ok: true, cliente };
  } catch (error) {
    return comErro(error);
  }
}

export async function atualizarLocalizacaoCliente(
  id: string,
  latitude: number,
  longitude: number
): Promise<ResultadoAcao> {
  try {
    const sessao = await exigirSessao("CADASTROS");
    await servico.atualizarLocalizacaoCliente(sessao, id, latitude, longitude);
    revalidatePath("/clientes");
    revalidatePath("/localizacao");
    return { ok: true };
  } catch (error) {
    return comErro(error);
  }
}

export async function excluirCliente(id: string): Promise<ResultadoAcao> {
  try {
    const sessao = await exigirSessao("CADASTROS");
    await servico.excluirCliente(sessao, id);
    revalidatePath("/clientes");
    revalidatePath("/localizacao");
    return { ok: true };
  } catch (error) {
    return comErro(error);
  }
}
