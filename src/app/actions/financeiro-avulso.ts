"use server";

import { revalidatePath } from "next/cache";
import { exigirAdmin, comErro, type ResultadoAcao } from "@/app/actions/helpers";
import {
  criarNotaAvulsa as criarNotaAvulsaServico,
  registrarNotaAvulsaManual as registrarNotaAvulsaManualServico,
  emitirNotaAvulsaPeloProvedor as emitirNotaAvulsaPeloProvedorServico,
  cancelarNotaAvulsa as cancelarNotaAvulsaServico,
  criarTitulos as criarTitulosServico,
  baixarTitulo as baixarTituloServico,
  reabrirTitulo as reabrirTituloServico,
  cancelarTitulo as cancelarTituloServico,
  registrarBoletoTitulo as registrarBoletoTituloServico,
  emitirBoletoTituloPeloProvedor as emitirBoletoTituloPeloProvedorServico,
  type NotaAvulsaInput,
  type RegistroNotaInput,
  type TituloInput,
} from "@/lib/servicos/financeiro-avulso";

function revalidar() {
  revalidatePath("/financeiro", "layout");
}

async function executar(fn: (sessao: Awaited<ReturnType<typeof exigirAdmin>>) => Promise<unknown>): Promise<ResultadoAcao> {
  try {
    const sessao = await exigirAdmin("ERP");
    await fn(sessao);
    revalidar();
    return { ok: true };
  } catch (error) {
    return comErro(error);
  }
}

export async function criarNotaAvulsa(dados: NotaAvulsaInput) {
  return executar((s) => criarNotaAvulsaServico(s, dados));
}

export async function registrarNotaAvulsaManual(id: string, dados: RegistroNotaInput) {
  return executar((s) => registrarNotaAvulsaManualServico(s, id, dados));
}

export async function emitirNotaAvulsaPeloProvedor(id: string) {
  return executar((s) => emitirNotaAvulsaPeloProvedorServico(s, id));
}

export async function cancelarNotaAvulsa(id: string, justificativa?: string) {
  return executar((s) => cancelarNotaAvulsaServico(s, id, justificativa));
}

export async function criarTitulos(dados: TituloInput) {
  return executar((s) => criarTitulosServico(s, dados));
}

export async function baixarTitulo(id: string, dataPagamento?: string) {
  return executar((s) => baixarTituloServico(s, id, dataPagamento));
}

export async function reabrirTitulo(id: string) {
  return executar((s) => reabrirTituloServico(s, id));
}

export async function cancelarTitulo(id: string) {
  return executar((s) => cancelarTituloServico(s, id));
}

export async function registrarBoletoTitulo(id: string, dados: { linhaDigitavel?: string; boletoPdfUrl?: string }) {
  return executar((s) => registrarBoletoTituloServico(s, id, dados));
}

export async function emitirBoletoTituloPeloProvedor(id: string) {
  return executar((s) => emitirBoletoTituloPeloProvedorServico(s, id));
}
