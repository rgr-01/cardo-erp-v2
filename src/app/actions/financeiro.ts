"use server";

import { revalidatePath } from "next/cache";
import { exigirSessao, comErro, type ResultadoAcao } from "@/app/actions/helpers";
import {
  solicitarFaturamento as solicitarFaturamentoServico,
  emitirNotaFiscal as emitirNotaFiscalServico,
  emitirNotaFiscalFocusNfe as emitirNotaFiscalFocusNfeServico,
  cancelarNotaFiscal as cancelarNotaFiscalServico,
  emitirBoleto as emitirBoletoServico,
  marcarBoletoPago as marcarBoletoPagoServico,
  cancelarBoleto as cancelarBoletoServico,
} from "@/lib/servicos/financeiro";

function revalidar() {
  revalidatePath("/financeiro", "layout");
  revalidatePath("/financeiro/notas-fiscais");
  revalidatePath("/financeiro/boletos");
  revalidatePath("/financeiro/cobranca");
  revalidatePath("/vendas");
  revalidatePath("/dashboard");
  revalidatePath("/em-carteira");
}

function paraData(s: string | null | undefined): Date | undefined {
  if (!s) return undefined;
  const d = new Date(s);
  return isNaN(d.getTime()) ? undefined : d;
}

export async function solicitarFaturamento(propostaId: string): Promise<ResultadoAcao> {
  try {
    const sessao = await exigirSessao("ERP");
    await solicitarFaturamentoServico(sessao, propostaId);
    revalidar();
    return { ok: true };
  } catch (error) {
    return comErro(error);
  }
}

export async function emitirNotaFiscal(
  propostaId: string,
  dados: {
    numero: string;
    serie?: string;
    chaveAcesso?: string;
    valor?: string;
    dataEmissao?: string;
    pdfUrl?: string;
    xmlUrl?: string;
    observacoes?: string;
  }
): Promise<ResultadoAcao> {
  try {
    const sessao = await exigirSessao("ERP");
    await emitirNotaFiscalServico(sessao, propostaId, {
      numero: dados.numero,
      serie: dados.serie,
      chaveAcesso: dados.chaveAcesso,
      valor: dados.valor ? Number(dados.valor) : undefined,
      dataEmissao: paraData(dados.dataEmissao),
      pdfUrl: dados.pdfUrl,
      xmlUrl: dados.xmlUrl,
      observacoes: dados.observacoes,
    });
    revalidar();
    return { ok: true };
  } catch (error) {
    return comErro(error);
  }
}

export async function emitirNotaFiscalFocusNfe(propostaId: string): Promise<ResultadoAcao> {
  try {
    const sessao = await exigirSessao("ERP");
    await emitirNotaFiscalFocusNfeServico(sessao, propostaId);
    revalidar();
    return { ok: true };
  } catch (error) {
    return comErro(error);
  }
}

export async function cancelarNotaFiscal(propostaId: string, justificativa?: string): Promise<ResultadoAcao> {
  try {
    const sessao = await exigirSessao("ERP");
    await cancelarNotaFiscalServico(sessao, propostaId, justificativa);
    revalidar();
    return { ok: true };
  } catch (error) {
    return comErro(error);
  }
}

export async function emitirBoleto(
  propostaId: string,
  dados: {
    numeroDocumento?: string;
    valor?: string;
    vencimento?: string;
    linhaDigitavel?: string;
    pdfUrl?: string;
    observacoes?: string;
  }
): Promise<ResultadoAcao> {
  try {
    const sessao = await exigirSessao("ERP");
    await emitirBoletoServico(sessao, propostaId, {
      numeroDocumento: dados.numeroDocumento,
      valor: dados.valor ? Number(dados.valor) : undefined,
      vencimento: paraData(dados.vencimento),
      linhaDigitavel: dados.linhaDigitavel,
      pdfUrl: dados.pdfUrl,
      observacoes: dados.observacoes,
    });
    revalidar();
    return { ok: true };
  } catch (error) {
    return comErro(error);
  }
}

export async function marcarBoletoPago(propostaId: string, dataPagamento?: string): Promise<ResultadoAcao> {
  try {
    const sessao = await exigirSessao("ERP");
    await marcarBoletoPagoServico(sessao, propostaId, paraData(dataPagamento));
    revalidar();
    return { ok: true };
  } catch (error) {
    return comErro(error);
  }
}

export async function cancelarBoleto(propostaId: string): Promise<ResultadoAcao> {
  try {
    const sessao = await exigirSessao("ERP");
    await cancelarBoletoServico(sessao, propostaId);
    revalidar();
    return { ok: true };
  } catch (error) {
    return comErro(error);
  }
}
