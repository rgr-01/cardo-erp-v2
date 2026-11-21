// Financeiro avulso: notas fiscais e títulos (a receber / a pagar) sem pedido.
// Serve à empresa que contrata só o Financeiro e a lançamentos fora das vendas.
// Emissão por provedor externo (Siagri...) passa por src/lib/fiscal/provedores.ts.

import { z } from "zod";
import type { Sessao } from "@/app/actions/helpers";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { ErroPermissao } from "@/lib/servicos/erros";
import { empresaTemModulo } from "@/lib/modulos-servidor";
import { provedorBoleto, provedorNota, type ItemNota } from "@/lib/fiscal/provedores";

function exigirAdminFinanceiro(sessao: Sessao) {
  if (sessao.role !== "ADMIN") throw new ErroPermissao("Somente o administrativo acessa o Financeiro.");
}

async function registrar(sessao: Sessao, acao: string, entidade: string, detalhes: string) {
  await prisma.historico.create({ data: { usuarioNome: sessao.nome, acao, entidade, detalhes } });
}

const textoOpcional = z.string().trim().optional().transform((s) => s || null);
const dataIso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida");
const paraData = (iso: string) => new Date(`${iso}T12:00:00Z`);
const arred = (v: number) => Math.round(v * 100) / 100;

const itemSchema = z.object({
  descricao: z.string().trim().min(1, "Descreva cada item"),
  ncm: z.string().trim().optional(),
  unidade: z.string().trim().min(1).default("UN"),
  quantidade: z.number().positive("Quantidade deve ser maior que zero"),
  valorUnitario: z.number().nonnegative(),
});

// Parcelas a receber geradas junto com a nota (opcional).
const parcelasSchema = z.object({
  quantidade: z.number().int().min(1).max(60),
  primeiroVencimento: dataIso,
  intervaloDias: z.number().int().min(1).max(365).default(30),
});

const notaSchema = z.object({
  clienteId: z.string().min(1, "Escolha o cliente"),
  naturezaOperacao: z.string().trim().min(1, "Informe a natureza da operação"),
  cfop: textoOpcional,
  itens: z.array(itemSchema).min(1, "Inclua ao menos um item"),
  observacoes: textoOpcional,
  parcelas: parcelasSchema.nullish(),
});

export type NotaAvulsaInput = z.input<typeof notaSchema>;

const registroManualSchema = z.object({
  numero: z.string().trim().min(1, "Informe o número da nota"),
  serie: textoOpcional,
  chaveAcesso: textoOpcional,
  dataEmissao: dataIso.optional(),
  pdfUrl: textoOpcional,
  xmlUrl: textoOpcional,
});

export type RegistroNotaInput = z.input<typeof registroManualSchema>;

function totalItens(itens: ItemNota[]): number {
  return arred(itens.reduce((s, i) => s + i.quantidade * i.valorUnitario, 0));
}

// Divide o total em parcelas iguais; a diferença de centavos vai na última.
function montarParcelas(total: number, p: z.output<typeof parcelasSchema>) {
  const base = arred(total / p.quantidade);
  const inicio = paraData(p.primeiroVencimento);
  return Array.from({ length: p.quantidade }, (_, i) => ({
    parcela: i + 1,
    totalParcelas: p.quantidade,
    valor: i === p.quantidade - 1 ? arred(total - base * (p.quantidade - 1)) : base,
    vencimento: new Date(inicio.getTime() + i * p.intervaloDias * 86_400_000),
  }));
}

export async function listarNotasAvulsas(sessao: Sessao) {
  exigirAdminFinanceiro(sessao);
  return prisma.notaAvulsa.findMany({
    include: {
      cliente: { select: { nome: true } },
      titulos: { where: { status: { not: "CANCELADO" } }, select: { id: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 1000,
  });
}

export async function criarNotaAvulsa(sessao: Sessao, input: NotaAvulsaInput) {
  exigirAdminFinanceiro(sessao);
  const dados = notaSchema.parse(input);
  const cliente = await prisma.cliente.findUnique({ where: { id: dados.clienteId }, select: { nome: true } });
  if (!cliente) throw new Error("Cliente não encontrado.");
  const valorTotal = totalItens(dados.itens);
  if (valorTotal <= 0) throw new Error("O total da nota precisa ser maior que zero.");

  const nota = await prisma.$transaction(async (tx) => {
    const criada = await tx.notaAvulsa.create({
      data: {
        clienteId: dados.clienteId,
        naturezaOperacao: dados.naturezaOperacao,
        cfop: dados.cfop,
        itens: dados.itens as unknown as Prisma.InputJsonValue,
        valorTotal,
        observacoes: dados.observacoes,
        criadoPor: sessao.nome,
      },
    });
    if (dados.parcelas) {
      await tx.tituloFinanceiro.createMany({
        data: montarParcelas(valorTotal, dados.parcelas).map((p) => ({
          ...p,
          tipo: "RECEBER" as const,
          descricao: `Nota avulsa - ${cliente.nome}`,
          clienteId: dados.clienteId,
          notaAvulsaId: criada.id,
          criadoPor: sessao.nome,
        })),
      });
    }
    return criada;
  });
  await registrar(sessao, "Criou nota avulsa", "NOTA_AVULSA", `${cliente.nome} - ${valorTotal.toFixed(2)}`);
  return nota;
}

async function notaOuFalha(id: string) {
  const nota = await prisma.notaAvulsa.findUnique({ where: { id }, include: { cliente: true } });
  if (!nota) throw new Error("Nota não encontrada.");
  return nota;
}

// Emitida por fora (sistema do contador, SEFAZ, Siagri...): só registra os dados.
export async function registrarNotaAvulsaManual(sessao: Sessao, id: string, input: RegistroNotaInput) {
  exigirAdminFinanceiro(sessao);
  const dados = registroManualSchema.parse(input);
  const nota = await notaOuFalha(id);
  if (nota.status === "CANCELADA") throw new Error("Nota cancelada.");
  await prisma.notaAvulsa.update({
    where: { id },
    data: {
      status: "EMITIDA",
      numero: dados.numero,
      serie: dados.serie,
      chaveAcesso: dados.chaveAcesso,
      dataEmissao: dados.dataEmissao ? paraData(dados.dataEmissao) : new Date(),
      pdfUrl: dados.pdfUrl,
      xmlUrl: dados.xmlUrl,
      provedor: "MANUAL",
      mensagemErro: null,
    },
  });
  await registrar(sessao, "Registrou nota avulsa", "NOTA_AVULSA", `NF ${dados.numero} - ${nota.cliente.nome}`);
}

export async function emitirNotaAvulsaPeloProvedor(sessao: Sessao, id: string) {
  exigirAdminFinanceiro(sessao);
  const provedor = provedorNota();
  if (!provedor?.emitirNota) throw new Error("Nenhum provedor de nota fiscal configurado.");
  const nota = await notaOuFalha(id);
  if (nota.status === "EMITIDA" || nota.status === "PROCESSANDO") throw new Error("Esta nota já foi emitida.");
  if (nota.status === "CANCELADA") throw new Error("Nota cancelada.");

  const r = await provedor.emitirNota({
    id: nota.id,
    naturezaOperacao: nota.naturezaOperacao,
    cfop: nota.cfop,
    itens: nota.itens as unknown as ItemNota[],
    valorTotal: Number(nota.valorTotal),
    observacoes: nota.observacoes,
    cliente: nota.cliente,
  });
  const base = { provedor: provedor.id };
  if (r.status === "ERRO") {
    await prisma.notaAvulsa.update({ where: { id }, data: { ...base, status: "ERRO", mensagemErro: r.mensagem } });
    throw new Error(r.mensagem);
  }
  if (r.status === "PROCESSANDO") {
    await prisma.notaAvulsa.update({ where: { id }, data: { ...base, status: "PROCESSANDO", referenciaExterna: r.referencia, mensagemErro: null } });
  } else {
    await prisma.notaAvulsa.update({
      where: { id },
      data: {
        ...base,
        status: "EMITIDA",
        numero: r.numero,
        serie: r.serie ?? null,
        chaveAcesso: r.chaveAcesso ?? null,
        pdfUrl: r.pdfUrl ?? null,
        xmlUrl: r.xmlUrl ?? null,
        referenciaExterna: r.referencia ?? null,
        dataEmissao: new Date(),
        mensagemErro: null,
      },
    });
  }
  await registrar(sessao, `Emitiu nota avulsa (${provedor.nome})`, "NOTA_AVULSA", nota.cliente.nome);
}

// Cancela a nota e as parcelas em aberto dela. Emitida pelo provedor: cancela lá também.
export async function cancelarNotaAvulsa(sessao: Sessao, id: string, justificativa?: string) {
  exigirAdminFinanceiro(sessao);
  const nota = await notaOuFalha(id);
  if (nota.status === "CANCELADA") return;
  if (nota.provedor !== "MANUAL" && nota.referenciaExterna && nota.status === "EMITIDA") {
    const provedor = provedorNota();
    if (!provedor?.cancelarNota) throw new Error("Provedor da nota indisponível para cancelar.");
    const motivo = justificativa?.trim() ?? "";
    if (motivo.length < 15) throw new Error("A justificativa do cancelamento precisa de ao menos 15 caracteres.");
    await provedor.cancelarNota(nota.referenciaExterna, motivo);
  }
  await prisma.$transaction([
    prisma.notaAvulsa.update({ where: { id }, data: { status: "CANCELADA" } }),
    prisma.tituloFinanceiro.updateMany({ where: { notaAvulsaId: id, status: "ABERTO" }, data: { status: "CANCELADO" } }),
  ]);
  await registrar(sessao, "Cancelou nota avulsa", "NOTA_AVULSA", `${nota.numero ?? "sem número"} - ${nota.cliente.nome}`);
}

// ---------------------------------------------------------------------------
// Títulos a receber / a pagar

const tituloSchema = z
  .object({
    tipo: z.enum(["RECEBER", "PAGAR"]),
    descricao: z.string().trim().min(1, "Informe a descrição"),
    clienteId: textoOpcional,
    favorecido: textoOpcional,
    categoria: textoOpcional,
    documento: textoOpcional,
    valorTotal: z.number().positive("Valor deve ser maior que zero"),
    parcelas: parcelasSchema,
    observacoes: textoOpcional,
  })
  .refine((t) => t.clienteId || t.favorecido, { message: "Informe o cliente ou o favorecido" });

export type TituloInput = z.input<typeof tituloSchema>;

export async function listarTitulos(sessao: Sessao, tipo: "RECEBER" | "PAGAR") {
  exigirAdminFinanceiro(sessao);
  return prisma.tituloFinanceiro.findMany({
    where: { tipo, status: { not: "CANCELADO" } },
    include: { cliente: { select: { nome: true } }, notaAvulsa: { select: { numero: true } } },
    orderBy: [{ status: "asc" }, { vencimento: "asc" }],
    take: 3000,
  });
}

export async function criarTitulos(sessao: Sessao, input: TituloInput) {
  exigirAdminFinanceiro(sessao);
  const dados = tituloSchema.parse(input);
  if (dados.clienteId) {
    const existe = await prisma.cliente.count({ where: { id: dados.clienteId } });
    if (!existe) throw new Error("Cliente não encontrado.");
  }
  const parcelas = montarParcelas(dados.valorTotal, dados.parcelas);
  await prisma.tituloFinanceiro.createMany({
    data: parcelas.map((p) => ({
      ...p,
      tipo: dados.tipo,
      descricao: dados.descricao,
      clienteId: dados.clienteId,
      favorecido: dados.favorecido,
      categoria: dados.categoria,
      documento: dados.documento,
      observacoes: dados.observacoes,
      criadoPor: sessao.nome,
    })),
  });
  await registrar(
    sessao,
    dados.tipo === "RECEBER" ? "Lançou conta a receber" : "Lançou conta a pagar",
    "TITULO",
    `${dados.descricao} - ${dados.valorTotal.toFixed(2)} em ${parcelas.length}x`,
  );
}

async function tituloOuFalha(id: string) {
  const titulo = await prisma.tituloFinanceiro.findUnique({ where: { id }, include: { cliente: true } });
  if (!titulo) throw new Error("Título não encontrado.");
  return titulo;
}

export async function baixarTitulo(sessao: Sessao, id: string, dataPagamento?: string) {
  exigirAdminFinanceiro(sessao);
  const titulo = await tituloOuFalha(id);
  if (titulo.status !== "ABERTO") throw new Error("Este título não está em aberto.");
  await prisma.tituloFinanceiro.update({
    where: { id },
    data: { status: "PAGO", dataPagamento: dataPagamento ? paraData(dataIso.parse(dataPagamento)) : new Date() },
  });
  await registrar(sessao, titulo.tipo === "RECEBER" ? "Recebeu título" : "Pagou título", "TITULO", titulo.descricao);
}

export async function reabrirTitulo(sessao: Sessao, id: string) {
  exigirAdminFinanceiro(sessao);
  const titulo = await tituloOuFalha(id);
  await prisma.tituloFinanceiro.update({ where: { id }, data: { status: "ABERTO", dataPagamento: null } });
  await registrar(sessao, "Reabriu título", "TITULO", titulo.descricao);
}

export async function cancelarTitulo(sessao: Sessao, id: string) {
  exigirAdminFinanceiro(sessao);
  const titulo = await tituloOuFalha(id);
  await prisma.tituloFinanceiro.update({ where: { id }, data: { status: "CANCELADO" } });
  await registrar(sessao, "Cancelou título", "TITULO", titulo.descricao);
}

// Boleto emitido por fora (banco, Siagri...): guarda linha digitável e PDF.
export async function registrarBoletoTitulo(
  sessao: Sessao,
  id: string,
  dados: { linhaDigitavel?: string; boletoPdfUrl?: string },
) {
  exigirAdminFinanceiro(sessao);
  const titulo = await tituloOuFalha(id);
  if (titulo.tipo !== "RECEBER") throw new Error("Boleto só vale para conta a receber.");
  const linha = dados.linhaDigitavel?.trim() || null;
  const pdf = dados.boletoPdfUrl?.trim() || null;
  if (!linha && !pdf) throw new Error("Informe a linha digitável ou o link do PDF.");
  await prisma.tituloFinanceiro.update({
    where: { id },
    data: { linhaDigitavel: linha, boletoPdfUrl: pdf, provedorBoleto: "MANUAL" },
  });
  await registrar(sessao, "Registrou boleto", "TITULO", titulo.descricao);
}

export async function emitirBoletoTituloPeloProvedor(sessao: Sessao, id: string) {
  exigirAdminFinanceiro(sessao);
  const provedor = provedorBoleto();
  if (!provedor?.emitirBoleto) throw new Error("Nenhum provedor de boleto configurado.");
  const titulo = await tituloOuFalha(id);
  if (titulo.tipo !== "RECEBER" || titulo.status !== "ABERTO") throw new Error("Só conta a receber em aberto gera boleto.");
  if (!titulo.cliente) throw new Error("Boleto pelo provedor precisa de cliente cadastrado (pagador).");
  const r = await provedor.emitirBoleto({
    id: titulo.id,
    valor: Number(titulo.valor),
    vencimento: titulo.vencimento,
    descricao: titulo.descricao,
    pagador: titulo.cliente,
  });
  if (r.status === "ERRO") throw new Error(r.mensagem);
  await prisma.tituloFinanceiro.update({
    where: { id },
    data: { linhaDigitavel: r.linhaDigitavel, boletoPdfUrl: r.pdfUrl ?? null, referenciaExterna: r.referencia ?? null, provedorBoleto: provedor.id },
  });
  await registrar(sessao, `Emitiu boleto (${provedor.nome})`, "TITULO", titulo.descricao);
}

// ---------------------------------------------------------------------------
// Dados prontos para as telas

// Avulsos são para quem contrata só o Financeiro; com o Plano de Vendas junto,
// tudo nasce dos pedidos e as telas ficam como sempre foram.
export async function usaFinanceiroAvulso(userId: string): Promise<boolean> {
  return !(await empresaTemModulo(userId, "VENDAS"));
}

export async function opcoesClientesFinanceiro() {
  const clientes = await prisma.cliente.findMany({ select: { id: true, nome: true }, orderBy: { nome: "asc" } });
  return clientes.map((c) => ({ id: c.id, label: c.nome }));
}

export async function linhasTitulos(sessao: Sessao, tipo: "RECEBER" | "PAGAR") {
  const titulos = await listarTitulos(sessao, tipo);
  return titulos.map((t) => ({
    id: t.id,
    status: t.status,
    descricao: t.descricao,
    pessoa: t.cliente?.nome ?? t.favorecido ?? "-",
    categoria: t.categoria,
    documento: t.documento,
    valor: Number(t.valor),
    vencimento: t.vencimento.toISOString().slice(0, 10),
    dataPagamento: t.dataPagamento?.toISOString().slice(0, 10) ?? null,
    parcela: t.parcela,
    totalParcelas: t.totalParcelas,
    linhaDigitavel: t.linhaDigitavel,
    boletoPdfUrl: t.boletoPdfUrl,
    notaNumero: t.notaAvulsa?.numero ?? null,
  }));
}
