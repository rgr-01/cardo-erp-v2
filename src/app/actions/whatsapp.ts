"use server";

import { revalidatePath } from "next/cache";
import { exigirSessao, comErro, type ResultadoAcao } from "@/app/actions/helpers";
import {
  definirModoRespostaDoVinculo,
  definirReceberRelatorioMensal,
  definirReceberAlertasSeguranca,
  definirReceberAlertasMargem,
  definirReceberNotificacoesPedidos,
  desvincularNumero,
  gerarCodigoVinculo,
  normalizarModoResposta,
} from "@/lib/whatsapp/vinculo";

export async function gerarCodigoWhatsapp(): Promise<
  ResultadoAcao & { codigo?: string }
> {
  try {
    const sessao = await exigirSessao();
    const codigo = await gerarCodigoVinculo(sessao.id, sessao.role);
    revalidatePath("/whatsapp");
    return { ok: true, codigo };
  } catch (error) {
    return comErro(error);
  }
}

export async function salvarModoRespostaWhatsapp(
  vinculoId: string,
  modo: string
): Promise<ResultadoAcao> {
  try {
    const sessao = await exigirSessao();
    await definirModoRespostaDoVinculo(sessao.id, vinculoId, normalizarModoResposta(modo));
    revalidatePath("/whatsapp");
    return { ok: true };
  } catch (error) {
    return comErro(error);
  }
}

export async function salvarRecebimentoRelatorioMensal(
  vinculoId: string,
  receber: boolean
): Promise<ResultadoAcao> {
  try {
    const sessao = await exigirSessao();
    await definirReceberRelatorioMensal(sessao.id, sessao.role, vinculoId, receber);
    revalidatePath("/whatsapp");
    return { ok: true };
  } catch (error) {
    return comErro(error);
  }
}

export async function salvarRecebimentoAlertasSeguranca(vinculoId: string, receber: boolean): Promise<ResultadoAcao> {
  try {
    const sessao = await exigirSessao();
    await definirReceberAlertasSeguranca(sessao.id, sessao.role, vinculoId, receber);
    revalidatePath("/whatsapp");
    return { ok: true };
  } catch (error) {
    return comErro(error);
  }
}

export async function salvarRecebimentoAlertasMargem(vinculoId: string, receber: boolean): Promise<ResultadoAcao> {
  try {
    const sessao = await exigirSessao();
    await definirReceberAlertasMargem(sessao.id, sessao.role, vinculoId, receber);
    revalidatePath("/whatsapp");
    return { ok: true };
  } catch (error) {
    return comErro(error);
  }
}

export async function salvarRecebimentoNotificacoesPedidos(vinculoId: string, receber: boolean): Promise<ResultadoAcao> {
  try {
    const sessao = await exigirSessao();
    await definirReceberNotificacoesPedidos(sessao.id, sessao.role, vinculoId, receber);
    revalidatePath("/whatsapp");
    return { ok: true };
  } catch (error) {
    return comErro(error);
  }
}

export async function desvincularWhatsapp(vinculoId: string): Promise<ResultadoAcao> {
  try {
    const sessao = await exigirSessao();
    await desvincularNumero(sessao.id, vinculoId);
    revalidatePath("/whatsapp");
    return { ok: true };
  } catch (error) {
    return comErro(error);
  }
}
