"use server";

import { revalidatePath } from "next/cache";
import { exigirSessao, comErro, type ResultadoAcao } from "@/app/actions/helpers";
import { getSafraAtualId } from "@/lib/safra-atual";
import type { RelatorioDoTrabalho } from "@/lib/trabalhos";
import {
  atualizarTrabalho,
  criarTrabalho,
  excluirTrabalho,
  listarRelatoriosDoTrabalho,
  unirEmNovoTrabalho,
  vincularRelatorios,
  type DadosTrabalho,
} from "@/lib/servicos/trabalhos";

function atualizarTelas() {
  revalidatePath("/relatorios/trabalhos");
  revalidatePath("/relatorios/visitas");
}

export async function criarTrabalhoDaSafra(dados: DadosTrabalho): Promise<ResultadoAcao> {
  try {
    const sessao = await exigirSessao("VISITAS");
    await criarTrabalho(sessao, await getSafraAtualId(), dados);
    atualizarTelas();
    return { ok: true };
  } catch (error) {
    return comErro(error);
  }
}

export async function atualizarTrabalhoDaSafra(id: string, dados: DadosTrabalho): Promise<ResultadoAcao> {
  try {
    const sessao = await exigirSessao("VISITAS");
    await atualizarTrabalho(sessao, id, dados);
    atualizarTelas();
    return { ok: true };
  } catch (error) {
    return comErro(error);
  }
}

export async function excluirTrabalhoDaSafra(id: string): Promise<ResultadoAcao> {
  try {
    const sessao = await exigirSessao("VISITAS");
    await excluirTrabalho(sessao, id);
    atualizarTelas();
    return { ok: true };
  } catch (error) {
    return comErro(error);
  }
}

export async function relatoriosDoTrabalho(
  trabalhoId: string
): Promise<{ ok: true; relatorios: RelatorioDoTrabalho[] } | { ok: false; erro: string }> {
  try {
    const sessao = await exigirSessao("VISITAS");
    return { ok: true, relatorios: await listarRelatoriosDoTrabalho(sessao, trabalhoId) };
  } catch (error) {
    const r = comErro(error);
    return { ok: false, erro: r.ok ? "Não foi possível carregar os relatórios." : r.erro };
  }
}

export async function vincularRelatoriosAoTrabalho(
  relatorioIds: string[],
  trabalhoId: string | null
): Promise<ResultadoAcao> {
  try {
    const sessao = await exigirSessao("VISITAS");
    await vincularRelatorios(sessao, relatorioIds, trabalhoId);
    atualizarTelas();
    return { ok: true };
  } catch (error) {
    return comErro(error);
  }
}

export async function unirRelatoriosEmTrabalho(
  relatorioIds: string[],
  dados: DadosTrabalho
): Promise<ResultadoAcao> {
  try {
    const sessao = await exigirSessao("VISITAS");
    await unirEmNovoTrabalho(sessao, await getSafraAtualId(), relatorioIds, dados);
    atualizarTelas();
    return { ok: true };
  } catch (error) {
    return comErro(error);
  }
}
