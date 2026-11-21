"use server";

import { revalidatePath } from "next/cache";
import { getSafraAtualId } from "@/lib/safra-atual";
import { prisma } from "@/lib/prisma";
import { assinarUrlArmazenada } from "@/lib/storage";
import { numeroDecimal, numeroDecimalOuNulo } from "@/lib/dinheiro";
import type { PropostaLinha } from "@/components/propostas/tipos";
import { type AssinanteDoc, type StatusProposta, type TipoProposta } from "@/lib/propostas";
import { criarPedidoParaConsultor, type PropostaInput } from "@/lib/pedidos";
import {
  alterarStatusProposta as alterarStatusServico,
  aprovarPedido as aprovarPedidoServico,
  aprovarMargem as aprovarMargemServico,
  recusarMargem as recusarMargemServico,
  aprovarConferenciaFinal as aprovarConferenciaFinalServico,
  recusarConferenciaFinal as recusarConferenciaFinalServico,
  atualizarProposta as atualizarPropostaServico,
  excluirProposta as excluirPropostaServico,
  exigirAcessoProposta,
  dadosParaAssinatura as dadosParaAssinaturaServico,
  gerarPdfPreview as gerarPdfPreviewServico,
  importarContratoAssinado as importarContratoAssinadoServico,
  temFinanceiro,
} from "@/lib/servicos/propostas";

import {
  comErro,
  exigirSessao,
  type ResultadoAcao,
} from "@/app/actions/helpers";

function revalidar() {
  revalidatePath("/propostas");
  revalidatePath("/pedidos");
  revalidatePath("/vendas");
  revalidatePath("/dashboard");
  revalidatePath("/historico");
}

async function criarDocumento(
  input: PropostaInput,
  tipo: TipoProposta,
  fecharNegocio = false
): Promise<ResultadoAcao> {
  try {
    const sessao = await exigirSessao("VENDAS");
    const safraId = await getSafraAtualId();
    await criarPedidoParaConsultor({ sessao, input, tipo, safraId, fecharNegocio });
    revalidar();
    return { ok: true };
  } catch (error) {
    return comErro(error);
  }
}

// "Gerar orcamento": salva como rascunho editavel (tipo PEDIDO), consultor
// pode voltar depois e continuar ajustando.
export async function criarPedido(
  input: PropostaInput
): Promise<ResultadoAcao> {
  return criarDocumento(input, "PEDIDO");
}

// "Fechar negocio": cadastra a venda de fato — o orcamento ja nasce como
// Pedido (tipo PROPOSTA). Com margem abaixo de 27%, nasce bloqueado
// (statusMargem AGUARDANDO_APROVACAO) ate o gestor aprovar.
export async function fecharNegocio(
  input: PropostaInput
): Promise<ResultadoAcao> {
  return criarDocumento(input, "PEDIDO", true);
}

export async function aprovarPedido(id: string): Promise<ResultadoAcao> {
  try {
    const sessao = await exigirSessao("VENDAS");
    await aprovarPedidoServico(sessao, id);
    revalidar();
    return { ok: true };
  } catch (error) {
    return comErro(error);
  }
}

export async function atualizarProposta(
  id: string,
  input: PropostaInput,
  fecharNegocio = false
): Promise<ResultadoAcao> {
  try {
    const sessao = await exigirSessao("VENDAS");
    await atualizarPropostaServico(sessao, id, input, fecharNegocio);
    revalidar();
    return { ok: true };
  } catch (error) {
    return comErro(error);
  }
}

export async function alterarStatusProposta(
  id: string,
  statusInput: StatusProposta,
  emailsExtras: string[] = [],
  assinantes?: AssinanteDoc[]
): Promise<ResultadoAcao> {
  try {
    const sessao = await exigirSessao("VENDAS");
    await alterarStatusServico(sessao, id, statusInput, emailsExtras, assinantes);
    revalidar();
    return { ok: true };
  } catch (error) {
    return comErro(error);
  }
}

// Preview do PDF a partir do formulario em edicao, sem salvar nada — ver
// gerarPdfPreview em lib/servicos/propostas.ts. Base64 porque server actions
// nao retornam Uint8Array/Buffer de forma direta pro client.
export async function visualizarPdfProposta(
  input: PropostaInput,
  tipo: TipoProposta,
  numeroExistente: number | null
): Promise<{ ok: true; base64: string } | { ok: false; erro: string }> {
  try {
    const sessao = await exigirSessao("VENDAS");
    const bytes = await gerarPdfPreviewServico(sessao, tipo, input, numeroExistente);
    return { ok: true, base64: Buffer.from(bytes).toString("base64") };
  } catch (error) {
    const resultado = comErro(error);
    return { ok: false, erro: resultado.ok ? "Não foi possível gerar o PDF." : resultado.erro };
  }
}

// Dados do pedido/orcamento para abrir o editor fora da tela dele (ex.: a
// partir da lista de vendas). Mesmo formato das telas de Pedidos/Orcamentos.
export async function carregarPropostaParaEdicao(
  id: string
): Promise<{ ok: true; proposta: PropostaLinha } | { ok: false; erro: string }> {
  try {
    const sessao = await exigirSessao("VENDAS");
    await exigirAcessoProposta(sessao, id);
    const p = await prisma.proposta.findUniqueOrThrow({
      where: { id },
      include: {
        cliente: { select: { nome: true } },
        consultor: { select: { nome: true } },
        itens: {
          include: {
            produto: {
              select: {
                nome: true,
                fornecedor: { select: { nome: true } },
                ingredienteAtivo: true,
                embalagem: true,
                recomendacao: true,
              },
            },
            venda: { select: { status: true } },
          },
          orderBy: { ordem: "asc" },
        },
      },
    });
    return {
      ok: true,
      proposta: {
        id: p.id,
        tipo: p.tipo,
        origem: p.origem,
        numero: p.numero,
        clienteId: p.clienteId,
        clienteNome: p.cliente.nome,
        consultorId: p.consultorId,
        consultorNome: p.consultor.nome,
        status: p.status as StatusProposta,
        validade: p.validade?.toISOString() ?? null,
        dataFaturamento: p.dataFaturamento?.toISOString() ?? null,
        previsaoEntrega: p.previsaoEntrega?.toISOString() ?? null,
        localEntrega: p.localEntrega,
        frete: p.frete,
        condicaoPagamento: p.condicaoPagamento,
        condicaoPagamentoTipo: p.condicaoPagamentoTipo,
        observacoes: p.observacoes,
        termosCondicoes: p.termosCondicoes,
        subtotal: numeroDecimal(p.subtotal),
        desconto: numeroDecimal(p.desconto),
        total: numeroDecimal(p.total),
        createdAt: p.createdAt.toISOString(),
        statusAssinatura: p.statusAssinatura,
        pdfAssinadoUrl: p.pdfAssinadoUrl ? await assinarUrlArmazenada({ url: p.pdfAssinadoUrl }) : null,
        statusMargem: p.statusMargem,
        margemMotivoRecusa: p.margemMotivoRecusa,
        margemPct: p.margemPct,
        aguardandoConferencia: p.itens.some((item) => item.venda?.status === "FECHADO"),
        itens: p.itens.map((item) => ({
          id: item.id,
          produtoId: item.produtoId,
          vendaId: item.vendaId,
          produtoNome: item.produto.nome,
          fornecedorNome: item.produto.fornecedor.nome,
          ingredienteAtivo: item.ingredienteAtivo ?? item.produto.ingredienteAtivo,
          embalagem: item.embalagem ?? item.produto.embalagem,
          recomendacao: item.recomendacao ?? item.produto.recomendacao,
          cultura: item.cultura,
          volume: item.volume,
          unidade: item.unidade,
          condicaoPagamentoTipo: item.condicaoPagamentoTipo,
          valorUnitario: numeroDecimalOuNulo(item.valorUnitario),
          valorUnitarioAprazo: numeroDecimalOuNulo(item.valorUnitarioAprazo),
          descontoPct: numeroDecimal(item.descontoPct),
          total: numeroDecimal(item.total),
          ordem: item.ordem,
        })),
      },
    };
  } catch (error) {
    return comErro(error);
  }
}

// Dados já preenchidos para o modal "Enviar para assinatura".
export async function carregarDadosAssinatura(id: string): Promise<
  | {
      ok: true;
      dados: Awaited<ReturnType<typeof dadosParaAssinaturaServico>>;
    }
  | { ok: false; erro: string }
> {
  try {
    const sessao = await exigirSessao("VENDAS");
    return { ok: true, dados: await dadosParaAssinaturaServico(sessao, id) };
  } catch (error) {
    return comErro(error);
  }
}

export async function excluirProposta(id: string): Promise<ResultadoAcao> {
  try {
    const sessao = await exigirSessao("VENDAS");
    await excluirPropostaServico(sessao, id);
    revalidar();
    return { ok: true };
  } catch (error) {
    return comErro(error);
  }
}

export async function aprovarMargem(id: string): Promise<ResultadoAcao> {
  try {
    const sessao = await exigirSessao("VENDAS");
    await aprovarMargemServico(sessao, id);
    revalidar();
    revalidatePath("/propostas/aprovacao-margem");
    return { ok: true };
  } catch (error) {
    return comErro(error);
  }
}

export async function recusarMargem(id: string, motivo: string): Promise<ResultadoAcao> {
  try {
    const sessao = await exigirSessao("VENDAS");
    await recusarMargemServico(sessao, id, motivo);
    revalidar();
    revalidatePath("/propostas/aprovacao-margem");
    return { ok: true };
  } catch (error) {
    return comErro(error);
  }
}

export async function aprovarConferenciaFinal(id: string): Promise<ResultadoAcao> {
  try {
    const sessao = await exigirSessao("ERP");
    await aprovarConferenciaFinalServico(sessao, id);
    revalidar();
    revalidatePath("/propostas/aprovacao-margem");
    return { ok: true };
  } catch (error) {
    return comErro(error);
  }
}

export async function recusarConferenciaFinal(id: string, motivo: string): Promise<ResultadoAcao> {
  try {
    const sessao = await exigirSessao("ERP");
    await recusarConferenciaFinalServico(sessao, id, motivo);
    revalidar();
    revalidatePath("/propostas/aprovacao-margem");
    return { ok: true };
  } catch (error) {
    return comErro(error);
  }
}

// Cliente assinou no papel (contrato impresso, sem D4Sign) — o
// administrativo digitaliza/fotografa e sobe aqui. Aceita PDF ou foto.
export async function importarContratoAssinado(
  id: string,
  formData: FormData
): Promise<ResultadoAcao | { ok: true; aviso: string }> {
  try {
    const sessao = await exigirSessao("VENDAS");
    if (!(await temFinanceiro(sessao))) throw new Error("Contrato assinado não faz parte do plano contratado pela empresa.");
    const arquivo = formData.get("arquivo");
    if (!(arquivo instanceof File) || arquivo.size === 0) {
      throw new Error("Selecione o arquivo do contrato assinado.");
    }
    const tiposAceitos = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
    if (!tiposAceitos.includes(arquivo.type)) {
      throw new Error("Envie um PDF ou uma foto (JPEG/PNG/WEBP) do contrato assinado.");
    }
    if (arquivo.size > 15 * 1024 * 1024) {
      throw new Error("O arquivo excede 15MB.");
    }

    const buffer = Buffer.from(await arquivo.arrayBuffer());
    const resultado = await importarContratoAssinadoServico(sessao, id, {
      buffer,
      contentType: arquivo.type,
      nomeOriginal: arquivo.name,
    });
    revalidar();
    if (resultado.avisoVerificacaoIndisponivel) {
      return { ok: true, aviso: resultado.avisoVerificacaoIndisponivel };
    }
    return { ok: true };
  } catch (error) {
    return comErro(error);
  }
}

// Em Carteira com assinatura pendente: consulta leve a cada 30 s; a tela só
// recarrega inteira quando alguma assinatura mudou de situação.
export async function assinaturasMudaram(antes: { id: string; status: string; temPdf: boolean }[]): Promise<boolean> {
  try {
    await exigirSessao("ERP");
    if (antes.length === 0) return false;
    const agora = await prisma.proposta.findMany({
      where: { id: { in: antes.map((a) => a.id) } },
      select: { id: true, statusAssinatura: true, pdfAssinadoUrl: true },
    });
    const porId = new Map(agora.map((p) => [p.id, p]));
    return antes.some((a) => {
      const p = porId.get(a.id);
      return !p || p.statusAssinatura !== a.status || Boolean(p.pdfAssinadoUrl) !== a.temPdf;
    });
  } catch {
    return false;
  }
}
