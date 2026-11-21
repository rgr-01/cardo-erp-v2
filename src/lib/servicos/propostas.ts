// Regras de pedidos e propostas, compartilhadas entre as server actions do web
// e a API do app: acesso, edição, status, aprovação, exclusão e PDF.

import { z } from "zod";
import type { Sessao } from "@/app/actions/helpers";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { empresaTemModulo } from "@/lib/modulos-servidor";
import { assinarUrlArmazenada } from "@/lib/storage";
import { fmtBRL, fmtNum } from "@/lib/format";
import { gerarPdfPropostaSimples as gerarPdfProposta } from "@/lib/pdf-simples";
import { enviarDocumento, definirSignatario, enviarParaAssinatura, listarSignatarios } from "@/lib/d4sign";
import { enviarBufferAssinatura } from "@/lib/storage";
import { checarDocumentoAssinado } from "@/lib/ocr-assinatura";
import {
  STATUS_PROPOSTA_LABELS,
  assinantesValidos,
  numeroDocumento,
  numeroPedido,
  numeroProposta,
  type AssinanteDoc,
  type StatusProposta,
  type TipoProposta,
} from "@/lib/propostas";
import {
  montarDados,
  montarItens,
  propostaSchema,
  validarItensPedido,
  sincronizarCondicaoNaVenda,
  paraData,
  unitarioLiquidoDoItem,
  exigirPrecoUnico,
  type PropostaInput,
} from "@/lib/pedidos";
import { totalLiquidoItem, unitarioLiquido } from "@/lib/desconto";
import { parcelasDoPedido } from "@/lib/parcelas";
import { getSafraAtual } from "@/lib/safra-atual";
import { custoDoProduto, margemPonderada, precisaAprovacaoGestor } from "@/lib/margem";
import { clienteCompleto } from "@/lib/clientes";
import { ErroNaoEncontrado, ErroPermissao } from "@/lib/servicos/erros";
import { numeroDecimal, numeroDecimalOuNulo } from "@/lib/dinheiro";
import { avisarPedidoLiberadoParaFaturamento } from "@/lib/notificacoes-assinatura";

export const statusPropostaSchema = z.enum([
  "RASCUNHO",
  "ENVIADA",
  "ACEITA",
  "RECUSADA",
  "CANCELADA",
]);

const ehAdmin = (sessao: Sessao) => sessao.role === "ADMIN";

async function registrar(sessao: Sessao, acao: string, detalhes: string) {
  await prisma.historico.create({
    data: {
      usuarioNome: sessao.nome,
      acao,
      entidade: "PROPOSTA",
      detalhes,
    },
  });
}

export async function exigirAcessoProposta(sessao: Sessao, id: string) {
  const proposta = await prisma.proposta.findUnique({
    where: { id },
    include: {
      cliente: { select: { nome: true } },
      itens: { select: { vendaId: true } },
    },
  });
  if (!proposta) throw new ErroNaoEncontrado("Pedido/proposta não encontrado.");
  if (!ehAdmin(sessao) && proposta.consultorId !== sessao.id) {
    throw new ErroPermissao("Voce so pode acessar suas proprias propostas.");
  }
  return proposta;
}

const incluirLeitura = {
  cliente: { select: { id: true, nome: true } },
  consultor: { select: { id: true, nome: true } },
  safra: { select: { id: true, nome: true } },
  itens: {
    include: {
      produto: { select: { id: true, nome: true, fornecedor: { select: { nome: true } } } },
      venda: { select: { status: true } },
    },
    orderBy: { ordem: "asc" as const },
  },
} satisfies Prisma.PropostaInclude;

type PropostaLida = Prisma.PropostaGetPayload<{ include: typeof incluirLeitura }>;

const dataIso = (d: Date | null) => (d ? d.toISOString() : null);

async function formatar(sessao: Sessao, p: PropostaLida) {
  return {
    id: p.id,
    numero: p.numero,
    codigo: numeroDocumento(p.tipo, p.numero),
    tipo: p.tipo,
    origem: p.origem,
    status: p.status,
    cliente: p.cliente,
    consultor: p.consultor,
    safra: p.safra,
    validade: dataIso(p.validade),
    dataFaturamento: dataIso(p.dataFaturamento),
    previsaoEntrega: dataIso(p.previsaoEntrega),
    localEntrega: p.localEntrega,
    frete: p.frete,
    condicaoPagamento: p.condicaoPagamento,
    condicaoPagamentoTipo: p.condicaoPagamentoTipo,
    observacoes: p.observacoes,
    subtotal: numeroDecimal(p.subtotal),
    desconto: numeroDecimal(p.desconto),
    total: numeroDecimal(p.total),
    margemPct: p.margemPct,
    statusMargem: p.statusMargem,
    margemMotivoRecusa: p.margemMotivoRecusa,
    statusAssinatura: p.statusAssinatura,
    pdfAssinadoUrl: p.pdfAssinadoUrl ? await assinarUrlArmazenada({ url: p.pdfAssinadoUrl }) : null,
    autorizadoFaturarEm: dataIso(p.autorizadoFaturarEm),
    vendaFaturada: p.itens.some((i) => i.venda?.status === "FATURADO"),
    itens: p.itens.map((i) => ({
      id: i.id,
      produtoId: i.produtoId,
      produtoNome: i.produto.nome,
      fornecedorNome: i.produto.fornecedor.nome,
      vendaId: i.vendaId,
      cultura: i.cultura,
      volume: i.volume,
      unidade: i.unidade,
      valorUnitario: numeroDecimalOuNulo(i.valorUnitario),
      valorUnitarioAprazo: numeroDecimalOuNulo(i.valorUnitarioAprazo),
      descontoPct: numeroDecimal(i.descontoPct),
      custoUnitario: numeroDecimalOuNulo(i.custoUnitario),
      total: numeroDecimal(i.total),
    })),
    criadoEm: p.createdAt.toISOString(),
    atualizadoEm: p.updatedAt.toISOString(),
    podeEditar: (ehAdmin(sessao) || p.consultorId === sessao.id) && p.status !== "ACEITA",
  };
}

export async function listarPropostas(
  sessao: Sessao,
  filtros: { tipo?: "PEDIDO" | "PROPOSTA" | null; safraId?: string | null } = {}
) {
  const propostas = await prisma.proposta.findMany({
    where: {
      ...(ehAdmin(sessao) ? {} : { consultorId: sessao.id }),
      ...(filtros.tipo ? { tipo: filtros.tipo } : {}),
      ...(filtros.safraId ? { safraId: filtros.safraId } : {}),
    },
    include: incluirLeitura,
    orderBy: [{ updatedAt: "desc" }],
    take: 500,
  });
  return Promise.all(propostas.map((p) => formatar(sessao, p)));
}

// Pedidos ja enviados pro D4Sign (documento saiu de fato pra assinatura) —
// a tela "Em Carteira" mostra so quem chegou nessa etapa, ate a assinatura
// confirmada. Espelha exatamente o complemento do filtro da tela Pedidos
// (statusAssinatura: NAO_ENVIADA, ver app/(app)/propostas/page.tsx) — nunca
// deve haver pedido nas duas listas ao mesmo tempo. Quem ainda esta
// AGUARDANDO_APROVACAO de margem fica so em /propostas/aprovacao-margem.
// Ao contrario de Pedidos/Orcamentos, o pedido NAO some daqui quando fatura
// (EM_CARTEIRA -> FATURADO) — Em Carteira e' tela de consulta persistente
// pro consultor acompanhar o pedido ate o fim.
export async function listarEmCarteira(sessao: Sessao) {
  const propostas = await prisma.proposta.findMany({
    where: {
      tipo: "PROPOSTA",
      statusAssinatura: { not: "NAO_ENVIADA" },
      // So depois da conferencia final do administrativo (venda de fato
      // EM_CARTEIRA ou ja FATURADO) — enviado/assinado mas ainda em FECHADO
      // continua aparecendo so em Pedidos, com o badge "Aguardando
      // conferência" (ver aprovarConferenciaFinal acima).
      itens: { some: { venda: { status: { in: ["EM_CARTEIRA", "FATURADO"] } } } },
      ...(ehAdmin(sessao) ? {} : { consultorId: sessao.id }),
    },
    include: incluirLeitura,
    orderBy: [{ updatedAt: "desc" }],
    take: 500,
  });
  return Promise.all(propostas.map((p) => formatar(sessao, p)));
}

export async function obterProposta(sessao: Sessao, id: string) {
  await exigirAcessoProposta(sessao, id);
  const proposta = await prisma.proposta.findUniqueOrThrow({ where: { id }, include: incluirLeitura });
  return await formatar(sessao, proposta);
}

export async function atualizarProposta(
  sessao: Sessao,
  id: string,
  input: PropostaInput,
  // true = "Fechar negocio" na edicao: salva e, se ainda for Orcamento
  // (PEDIDO), promove pra Pedido (PROPOSTA) na mesma operacao — mesma
  // semantica do fecharNegocio em lib/pedidos.ts na criacao.
  fecharNegocio = false
) {
  const existente = await exigirAcessoProposta(sessao, id);
  // Recusado na conferencia final continua com status ACEITA (nao cancela,
  // ver recusarConferenciaFinal) mas precisa poder ser corrigido e reenviado
  // — so bloqueia edicao de uma proposta ACEITA de verdade (sem pendencia).
  if (existente.status === "ACEITA" && existente.statusMargem !== "RECUSADA_CONFERENCIA") {
    throw new Error("Propostas aceitas nao podem ser editadas.");
  }

  const dados = propostaSchema.parse(input);
  const consultorId =
    ehAdmin(sessao) && dados.consultorId ? dados.consultorId : existente.consultorId;

  await validarItensPedido(sessao, dados.clienteId, consultorId, dados.itens);

  const tipoFinal: TipoProposta =
    existente.tipo === "PEDIDO" && fecharNegocio ? "PROPOSTA" : (existente.tipo as TipoProposta);
  if (tipoFinal === "PROPOSTA") exigirPrecoUnico(dados);
  const calculaMargem = existente.tipo === "PEDIDO" || fecharNegocio;
  // Corrigindo um pedido recusado na conferencia final: o contrato assinado
  // antes nao vale mais pro conteudo novo, entao volta pra NAO_ENVIADA e
  // reenvia pro D4Sign de novo (ver enviarSeLiberado abaixo).
  const reenviarAssinatura = existente.statusMargem === "RECUSADA_CONFERENCIA";

  const produtos = await prisma.produto.findMany({
    where: { id: { in: dados.itens.map((item) => item.produtoId) } },
    select: { id: true, custoCompra: true },
  });
  const produtosPorId = new Map(produtos.map((p) => [p.id, p]));
  const margemMedia = calculaMargem
    ? margemPonderada(
        dados.itens.map((item) => ({
          precoVenda: unitarioLiquidoDoItem(item),
          volume: item.volume ?? 0,
          custo: produtosPorId.has(item.produtoId)
            ? custoDoProduto(produtosPorId.get(item.produtoId)!)
            : null,
        }))
      )
    : null;
  const statusMargem =
    calculaMargem && precisaAprovacaoGestor(margemMedia)
      ? ("AGUARDANDO_APROVACAO" as const)
      : ("OK" as const);

  // Vendas que estavam vinculadas a itens deste orcamento antes da edicao —
  // usado abaixo pra detectar item removido (ex: trocou de produto removendo
  // o antigo) e cancelar a Venda orfa, e pra sincronizar produto/volume/valor
  // dos itens que continuam vinculados.
  const vendaIdsAntigos = existente.itens
    .map((item) => item.vendaId)
    .filter((vid): vid is string => Boolean(vid));

  const proposta = await prisma.$transaction(async (tx) => {
    await tx.propostaItem.deleteMany({ where: { propostaId: id } });

    // Item novo sem venda vinculada (produto adicionado na edicao) vira uma
    // Venda nova, igual acontece na criacao do orcamento (ver
    // criarPedidoParaConsultor em lib/pedidos.ts) — assim aparece em /vendas.
    const itensComVenda = await Promise.all(
      dados.itens.map(async (item) => {
        if (item.vendaId) return item;
        const venda = await tx.venda.create({
          data: {
            clienteId: dados.clienteId,
            produtoId: item.produtoId,
            consultorId,
            cultura: item.cultura || null,
            volume: item.volume ?? null,
            condicaoPagamentoTipo: item.condicaoPagamentoTipo,
            valorUnitario: item.valorUnitario != null ? unitarioLiquidoDoItem(item) : null,
            valorTotal: totalLiquidoItem(item.volume, item.valorUnitario, item.descontoPct),
            status: tipoFinal === "PEDIDO" ? "NEGOCIACAO" : "FECHADO",
            safraId: existente.safraId,
          },
        });
        return { ...item, vendaId: venda.id };
      })
    );

    const atualizada = await tx.proposta.update({
      where: { id },
      data: {
        ...montarDados({ ...dados, itens: itensComVenda }, consultorId, existente.safraId),
        tipo: tipoFinal,
        margemPct: margemMedia,
        statusMargem,
        itens: { create: montarItens({ ...dados, itens: itensComVenda }, produtosPorId) },
        ...(reenviarAssinatura
          ? { statusAssinatura: "NAO_ENVIADA", pdfAssinadoUrl: null, linkAssinaturaCliente: null }
          : {}),
      },
      include: { cliente: { select: { nome: true } } },
    });

    // O item pode ter trocado de produto/volume/valor na negociacao —
    // propaga de volta pra Venda vinculada, senao a lista de Vendas fica
    // com os dados antigos (ver sincronizarCondicaoNaVenda em
    // lib/pedidos.ts, que ja cuida da condicao de pagamento).
    for (const item of itensComVenda) {
      if (!item.vendaId) continue;
      await tx.venda.update({
        where: { id: item.vendaId },
        data: {
          produtoId: item.produtoId,
          cultura: item.cultura || null,
          volume: item.volume ?? null,
          valorUnitario: item.valorUnitario != null ? unitarioLiquidoDoItem(item) : null,
          valorTotal: totalLiquidoItem(item.volume, item.valorUnitario, item.descontoPct),
        },
      });
    }
    await sincronizarCondicaoNaVenda(tx, itensComVenda);

    // Item removido do orcamento (ex: trocou de produto removendo o antigo)
    // deixa a Venda vinculada orfa — cancela pra sumir da lista de Vendas em
    // vez de ficar parada com dados desatualizados.
    const vendaIdsAtuais = new Set(
      itensComVenda.map((item) => item.vendaId).filter((vid): vid is string => Boolean(vid))
    );
    const vendaIdsOrfas = vendaIdsAntigos.filter((vid) => !vendaIdsAtuais.has(vid));
    if (vendaIdsOrfas.length > 0) {
      // Nunca cancela venda ja faturada/em carteira so por ter sido
      // desvinculada do orcamento — so mesmo em negociacao/fechado, que
      // ainda nao virou venda de fato (ver StatusVenda em schema.prisma).
      await tx.venda.updateMany({
        where: {
          id: { in: vendaIdsOrfas },
          status: { in: ["PROSPECCAO", "NEGOCIACAO", "FECHADO"] },
        },
        data: { status: "CANCELADO" },
      });
    }

    if (tipoFinal === "PROPOSTA" && existente.tipo === "PEDIDO") {
      const vendaIds = [...vendaIdsAtuais];
      if (vendaIds.length > 0) {
        // Fechado, nao Em carteira direto — ver aprovarConferenciaFinal.
        await tx.venda.updateMany({
          where: { id: { in: vendaIds }, status: "NEGOCIACAO" },
          data: { status: "FECHADO" },
        });
      }
    }

    return atualizada;
  });

  await registrar(
    sessao,
    "Atualizou",
    `${numeroDocumento(tipoFinal, proposta.numero)} - ${proposta.cliente.nome} (${fmtBRL(numeroDecimal(proposta.total))})`
  );

  if (tipoFinal === "PROPOSTA" && statusMargem === "AGUARDANDO_APROVACAO") {
    const consultor = await prisma.user.findUnique({ where: { id: consultorId }, select: { nome: true } });
    const { avisarSolicitacaoMargem } = await import("@/lib/notificacoes-margem");
    await avisarSolicitacaoMargem({
      id: proposta.id,
      numero: proposta.numero,
      total: numeroDecimal(proposta.total),
      margemPct: proposta.margemPct,
      cliente: proposta.cliente,
      consultorNome: consultor?.nome ?? sessao.nome,
    });
  }

  if ((tipoFinal === "PROPOSTA" && existente.tipo === "PEDIDO") || reenviarAssinatura) {
    await enviarSeLiberado(sessao, id);
  }
}

export async function alterarStatusProposta(
  sessao: Sessao,
  id: string,
  statusInput: unknown,
  // E-mails extras (fora o do cliente) que também vão assinar — só usado
  // quando status === "ENVIADA", vem do modal "Enviar para assinatura".
  emailsExtras: string[] = [],
  // Quem assina o pedido (modal "Enviar para assinatura" da Web).
  assinantes?: AssinanteDoc[]
) {
  const status = statusPropostaSchema.parse(statusInput);
  const existente = await exigirAcessoProposta(sessao, id);
  if (status === "ENVIADA" && !(await temFinanceiro(sessao))) {
    throw new Error("Envio para assinatura não faz parte do plano contratado pela empresa.");
  }

  if (
    status === "ENVIADA" &&
    existente.tipo === "PROPOSTA" &&
    existente.statusMargem === "AGUARDANDO_APROVACAO"
  ) {
    throw new Error(
      "Este pedido fechou com margem abaixo de 27% e aguarda aprovação do gestor antes de seguir para assinatura."
    );
  }
  if (status === "ENVIADA" && existente.tipo === "PROPOSTA" && existente.statusMargem === "RECUSADA_GESTOR") {
    throw new Error(
      "O gestor recusou a margem deste pedido — corrija o preço/produto (edite o pedido) antes de reenviar."
    );
  }

  const proposta = await prisma.$transaction(async (tx) => {

    const atualizada = await tx.proposta.update({
      where: { id },
      data: { status },
      include: {
        cliente: { select: { nome: true } },
        itens: { select: { vendaId: true } },
      },
    });

    if (status === "ACEITA") {
      const vendaIds = atualizada.itens
        .map((item) => item.vendaId)
        .filter((vendaId): vendaId is string => Boolean(vendaId));
      if (vendaIds.length > 0) {
        // Fechado, nao Em carteira direto — so a conferencia final do
        // administrativo (aprovarConferenciaFinal) confirma a venda de fato.
        await tx.venda.updateMany({
          where: {
            id: { in: vendaIds },
            status: { in: ["PROSPECCAO", "NEGOCIACAO"] },
          },
          data: { status: "FECHADO" },
        });
      }
    }

    return atualizada;
  });

  await registrar(
    sessao,
    STATUS_PROPOSTA_LABELS[status],
    `${numeroProposta(proposta.numero)} - ${proposta.cliente.nome}`
  );

  // Assinatura digital só se aplica à PROPOSTA final (documento pro
  // cliente assinar); PEDIDO é fluxo interno, aprovado por dentro do
  // sistema. Só dispara na primeira vez que vira ENVIADA — reenvios
  // (trocar o status pra frente e voltar) não duplicam no D4Sign.
  if (status === "ENVIADA" && proposta.tipo === "PROPOSTA" && !existente.d4signDocumentoId) {
    await enviarPropostaParaD4Sign(sessao, id, emailsExtras, assinantes);
  }
}

// Cliente assinou no papel (contrato impresso) em vez de pela D4Sign — o
// consultor (dono do pedido) ou o administrativo fotografa/digitaliza e sobe
// aqui, mesma regra de acesso de alterarStatusProposta/exigirAcessoProposta:
// dono do pedido ou admin, não é exclusivo do administrativo. Mesmo efeito
// final de sincronizarAssinatura (lib/assinaturas.ts) quando o D4Sign
// confirma a assinatura online: marca ASSINADA, guarda o PDF e avança a
// venda pra Fechado — só que sem depender do webhook/consulta na API do
// D4Sign.
export async function importarContratoAssinado(
  sessao: Sessao,
  id: string,
  arquivo: { buffer: Buffer; contentType: string; nomeOriginal: string }
) {
  const existente = await exigirAcessoProposta(sessao, id);
  if (existente.tipo !== "PROPOSTA") {
    throw new Error("Isso ainda não é um pedido fechado.");
  }
  if (existente.statusAssinatura === "ASSINADA") {
    throw new Error("Este pedido já está com contrato assinado.");
  }
  // Nao da pra escapar da aprovacao de margem importando um contrato "por
  // fora" — mesma trava de alterarStatusProposta pro envio via D4Sign.
  if (existente.statusMargem === "AGUARDANDO_APROVACAO") {
    throw new Error(
      "Este pedido fechou com margem abaixo de 27% e aguarda aprovação do gestor antes de importar contrato assinado."
    );
  }
  if (existente.statusMargem === "RECUSADA_GESTOR") {
    throw new Error(
      "O gestor recusou a margem deste pedido — corrija o preço/produto (edite o pedido) antes de importar contrato assinado."
    );
  }

  // Recusa de cara um arquivo que a IA não reconhece como assinado — evita
  // aceitar por engano um PDF em branco/rascunho como se fosse o documento
  // assinado (ver checarDocumentoAssinado). IA indisponível (assinado: null)
  // não bloqueia: só não dá pra confirmar automaticamente, quem decidiu subir
  // o arquivo segue responsável pela conferência final do administrativo.
  const checagem = await checarDocumentoAssinado(arquivo.buffer, arquivo.contentType);
  if (checagem.assinado === false) {
    throw new Error(`Este documento não parece estar assinado: ${checagem.motivo}`);
  }

  const upload = await enviarBufferAssinatura(
    arquivo.buffer,
    arquivo.contentType,
    arquivo.nomeOriginal,
    id
  );

  const avisoVerificacaoIndisponivel =
    checagem.assinado === null
      ? "Não foi possível verificar automaticamente se o documento está assinado (verificação por IA indisponível no momento) — confira manualmente."
      : null;

  await prisma.$transaction(async (tx) => {
    await tx.proposta.update({
      where: { id },
      data: {
        statusAssinatura: "ASSINADA",
        pdfAssinadoUrl: upload.url,
        assinadaEm: new Date(),
        status: "ACEITA",
      },
    });

    const vendaIds = existente.itens
      .map((item) => item.vendaId)
      .filter((vendaId): vendaId is string => Boolean(vendaId));
    if (vendaIds.length > 0) {
      await tx.venda.updateMany({
        where: { id: { in: vendaIds }, status: { in: ["PROSPECCAO", "NEGOCIACAO"] } },
        data: { status: "FECHADO" },
      });
    }
  });

  await registrar(
    sessao,
    "Importou contrato assinado",
    `${numeroProposta(existente.numero)} - ${existente.cliente.nome}`
  );

  return { avisoVerificacaoIndisponivel };
}

// Documento unico: assim que um Pedido (tipo PROPOSTA) fica liberado —
// margem OK desde o inicio, ou aprovada pelo gestor depois — ja envia
// sozinho pro D4Sign, sem precisar de "Enviar para assinatura" manual (esse
// botao continua existindo so como fallback se o envio automatico falhar).
// Reaproveita alterarStatusProposta (idempotente: so envia se ainda nao tem
// d4signDocumentoId) pra nao duplicar a logica de status + historico.
// Exportada porque criarPedidoParaConsultor (lib/pedidos.ts) tambem chama —
// e' o 4o ponto onde uma Proposta pode virar tipo PROPOSTA liberada.
// Empresa só com Plano de Vendas vai até gerar o pedido; mandar para
// assinatura exige o Financeiro contratado (qualquer consultor da empresa manda).
export async function temFinanceiro(sessao: Sessao): Promise<boolean> {
  return empresaTemModulo(sessao.id, "ERP");
}

export async function enviarSeLiberado(sessao: Sessao, id: string) {
  if (!(await temFinanceiro(sessao))) return;
  const proposta = await prisma.proposta.findUniqueOrThrow({ where: { id } });
  if (proposta.tipo !== "PROPOSTA" || proposta.statusMargem === "AGUARDANDO_APROVACAO") return;
  try {
    await alterarStatusProposta(sessao, id, "ENVIADA");
  } catch (error) {
    // Nao propaga: fechar negocio/aprovar margem ja aconteceu de fato, o
    // envio pro D4Sign e' best-effort aqui — se falhar, "Enviar para
    // assinatura" aparece na UI pra tentar de novo manualmente.
    console.error(`[D4Sign] falha ao enviar automaticamente proposta ${id}:`, error);
  }
}

export async function aprovarPedido(
  sessao: Sessao,
  id: string,
  // false pro bot: fechar negocio pelo WhatsApp nunca dispara a assinatura
  // sozinho — isso fica exclusivo do botao "Enviar para assinatura" na Web.
  enviarAssinaturaAutomatica = true
) {
  const pedido = await exigirAcessoProposta(sessao, id);
  if (pedido.tipo !== "PEDIDO") {
    throw new Error("Isso já é uma proposta.");
  }

  const atualizado = await prisma.$transaction(async (tx) => {
    const proposta = await tx.proposta.update({
      where: { id },
      data: { tipo: "PROPOSTA" },
      include: { cliente: { select: { nome: true } } },
    });

    // So aqui o negocio fica de fato confirmado: o orcamento (PEDIDO) virou
    // um Pedido (PROPOSTA), entao as vendas vinculadas saem de negociacao
    // pra Fechado (ver criarPedidoParaConsultor em lib/pedidos.ts) — so vira
    // Em carteira de verdade apos a conferencia final do administrativo
    // (ver aprovarConferenciaFinal abaixo).
    const vendaIds = pedido.itens
      .map((item) => item.vendaId)
      .filter((vendaId): vendaId is string => Boolean(vendaId));
    if (vendaIds.length > 0) {
      await tx.venda.updateMany({
        where: { id: { in: vendaIds }, status: "NEGOCIACAO" },
        data: { status: "FECHADO" },
      });
    }

    return proposta;
  });

  await registrar(
    sessao,
    "Aprovou",
    `${numeroPedido(pedido.numero)} virou ${numeroProposta(atualizado.numero)} - ${atualizado.cliente.nome}`
  );

  if (enviarAssinaturaAutomatica) {
    await enviarSeLiberado(sessao, id);
  }
}

// Pedidos (tipo PROPOSTA) fechados com margem media abaixo de 27% ficam
// represados aqui ate o gestor decidir — ver precisaAprovacaoGestor em
// lib/margem.ts e o bloqueio em alterarStatusProposta acima (nao pode
// enviar pra assinatura enquanto AGUARDANDO_APROVACAO).
export async function listarOrcamentosAguardandoMargem(sessao: Sessao, filtros: { safraId?: string } = {}) {
  if (!ehAdmin(sessao)) {
    throw new ErroPermissao("Somente o gestor pode ver pedidos aguardando aprovacao de margem.");
  }
  const pedidos = await prisma.proposta.findMany({
    where: {
      tipo: "PROPOSTA",
      statusMargem: "AGUARDANDO_APROVACAO",
      ...(filtros.safraId ? { safraId: filtros.safraId } : {}),
    },
    include: incluirLeitura,
    orderBy: [{ createdAt: "asc" }],
  });
  return Promise.all(pedidos.map((p) => formatar(sessao, p)));
}

export async function aprovarMargem(sessao: Sessao, id: string) {
  if (!ehAdmin(sessao)) {
    throw new ErroPermissao("Somente o gestor pode aprovar margem.");
  }
  const pedido = await prisma.proposta.findUniqueOrThrow({
    where: { id },
    include: { cliente: { select: { nome: true } } },
  });
  if (pedido.tipo !== "PROPOSTA") {
    throw new Error("Isso ainda não é um pedido fechado.");
  }
  if (pedido.statusMargem !== "AGUARDANDO_APROVACAO") {
    throw new Error("Este pedido não está aguardando aprovação de margem.");
  }

  await prisma.proposta.update({
    where: { id },
    data: {
      statusMargem: "APROVADA_GESTOR",
      margemAprovadorId: sessao.id,
      margemAprovadaEm: new Date(),
      margemMotivoRecusa: null,
    },
  });

  await registrar(
    sessao,
    "Aprovou margem",
    `${numeroProposta(pedido.numero)} - ${pedido.cliente.nome} (margem ${((pedido.margemPct ?? 0) * 100).toFixed(1)}%)`
  );

  await enviarSeLiberado(sessao, id);
}

export async function recusarMargem(sessao: Sessao, id: string, motivo: string) {
  if (!ehAdmin(sessao)) {
    throw new ErroPermissao("Somente o gestor pode recusar margem.");
  }
  if (!motivo.trim()) {
    throw new Error("Informe o motivo da recusa.");
  }
  const pedido = await prisma.proposta.findUniqueOrThrow({
    where: { id },
    include: { cliente: { select: { nome: true } } },
  });
  if (pedido.tipo !== "PROPOSTA") {
    throw new Error("Isso ainda não é um pedido fechado.");
  }
  if (pedido.statusMargem !== "AGUARDANDO_APROVACAO") {
    throw new Error("Este pedido não está aguardando aprovação de margem.");
  }

  await prisma.proposta.update({
    where: { id },
    data: {
      statusMargem: "RECUSADA_GESTOR",
      margemAprovadorId: sessao.id,
      margemAprovadaEm: new Date(),
      margemMotivoRecusa: motivo.trim(),
    },
  });

  await registrar(
    sessao,
    "Recusou margem",
    `${numeroProposta(pedido.numero)} - ${pedido.cliente.nome}: ${motivo.trim()}`
  );
}

// Pedidos com negocio fechado (venda em status FECHADO — ver
// criarPedidoParaConsultor/aprovarPedido/alterarStatusProposta em
// lib/pedidos.ts e aqui) mas ainda sem a conferencia final do
// administrativo. Assinado ou nao, so vira Em carteira de fato depois dessa
// aprovacao manual.
export async function listarPropostasAguardandoConferencia(sessao: Sessao, filtros: { safraId?: string } = {}) {
  if (!ehAdmin(sessao)) {
    throw new ErroPermissao("Somente o administrativo pode ver pedidos aguardando conferência.");
  }
  const pedidos = await prisma.proposta.findMany({
    where: {
      tipo: "PROPOSTA",
      ...(filtros.safraId ? { safraId: filtros.safraId } : {}),
      itens: { some: { venda: { status: "FECHADO" } } },
      // Enquanto a margem aguarda aprovação do gestor, o pedido fica só na
      // lista "Aprovação de margem" — não pode seguir pra assinatura ainda
      // (ver bloqueio em alterarStatusProposta), então não faz sentido
      // aparecer aqui como se já estivesse pronto pra conferência.
      // RECUSADA_GESTOR (margem recusada) e RECUSADA_CONFERENCIA (contrato
      // recusado na conferência) também saem daqui — já foi decidido
      // (recusado), fica parado em /pedidos aguardando o consultor corrigir
      // e reenviar (ver recusarMargem/recusarConferenciaFinal acima e
      // atualizarProposta, que reseta statusAssinatura nesse caso).
      statusMargem: { notIn: ["AGUARDANDO_APROVACAO", "RECUSADA_GESTOR", "RECUSADA_CONFERENCIA"] },
    },
    include: incluirLeitura,
    orderBy: [{ updatedAt: "asc" }],
  });
  return Promise.all(pedidos.map((p) => formatar(sessao, p)));
}

export async function aprovarConferenciaFinal(sessao: Sessao, id: string) {
  if (!ehAdmin(sessao)) {
    throw new ErroPermissao("Somente o administrativo pode aprovar a conferência final.");
  }
  const pedido = await prisma.proposta.findUniqueOrThrow({
    where: { id },
    include: { cliente: { select: { nome: true } }, itens: { select: { vendaId: true } } },
  });
  if (pedido.tipo !== "PROPOSTA") {
    throw new Error("Isso ainda não é um pedido fechado.");
  }
  if (pedido.statusAssinatura !== "ASSINADA") {
    throw new Error("O cliente ainda não assinou o contrato — não é possível aprovar sem a assinatura.");
  }

  const vendaIds = pedido.itens.map((item) => item.vendaId).filter((v): v is string => Boolean(v));
  if (vendaIds.length === 0) {
    throw new Error("Este pedido não tem venda vinculada.");
  }

  const atualizado = await prisma.venda.updateMany({
    where: { id: { in: vendaIds }, status: "FECHADO" },
    data: { status: "EM_CARTEIRA" },
  });
  if (atualizado.count === 0) {
    throw new Error("Este pedido não está aguardando conferência final.");
  }

  await registrar(
    sessao,
    "Aprovou conferência final",
    `${numeroProposta(pedido.numero)} - ${pedido.cliente.nome}`
  );
  // A mensagem é informativa; uma falha no WhatsApp nunca desfaz a aprovação.
  void avisarPedidoLiberadoParaFaturamento({ numero: pedido.numero, clienteNome: pedido.cliente.nome, consultorId: pedido.consultorId })
    .catch((erro) => console.error("[notificacoes-pedidos] falha ao notificar liberação", erro));
}

export async function recusarConferenciaFinal(sessao: Sessao, id: string, motivo: string) {
  if (!ehAdmin(sessao)) {
    throw new ErroPermissao("Somente o administrativo pode recusar a conferência final.");
  }
  if (!motivo.trim()) {
    throw new Error("Informe o motivo da recusa.");
  }
  const pedido = await prisma.proposta.findUniqueOrThrow({
    where: { id },
    include: { cliente: { select: { nome: true } }, itens: { select: { vendaId: true } } },
  });
  if (pedido.tipo !== "PROPOSTA") {
    throw new Error("Isso ainda não é um pedido fechado.");
  }

  const vendaIds = pedido.itens.map((item) => item.vendaId).filter((v): v is string => Boolean(v));
  if (vendaIds.length === 0) {
    throw new Error("Este pedido não tem venda vinculada.");
  }

  // Nao cancela: devolve pro consultor corrigir, igual recusarMargem —
  // venda continua FECHADO (ainda aparece em /propostas, aguardando acao),
  // so o motivo/status de margem sinalizam a recusa.
  const atualizado = await prisma.venda.updateMany({
    where: { id: { in: vendaIds }, status: "FECHADO" },
    data: {},
  });
  if (atualizado.count === 0) {
    throw new Error("Este pedido não está aguardando conferência final.");
  }

  await prisma.proposta.update({
    where: { id },
    data: {
      statusMargem: "RECUSADA_CONFERENCIA",
      margemAprovadorId: sessao.id,
      margemAprovadaEm: new Date(),
      margemMotivoRecusa: motivo.trim(),
    },
  });

  await registrar(
    sessao,
    "Recusou conferência final",
    `${numeroProposta(pedido.numero)} - ${pedido.cliente.nome}: ${motivo.trim()}`
  );
}

export async function excluirProposta(sessao: Sessao, id: string) {
  const proposta = await exigirAcessoProposta(sessao, id);
  if (proposta.status === "ACEITA") {
    throw new Error("Propostas aceitas nao podem ser excluidas.");
  }

  // So o gestor apaga de fato — mesma regra de excluirVenda em
  // app/actions/vendas.ts. Consultor "exclui" mas na pratica so cancela
  // (status CANCELADA), preservando numero e historico em vez de sumir.
  // Pedido (tipo PROPOSTA) nunca e apagado, nem pelo gestor: so cancela e
  // fica no historico.
  if (!ehAdmin(sessao) || proposta.tipo === "PROPOSTA") {
    await alterarStatusProposta(sessao, id, "CANCELADA");
    return;
  }

  const vendaIds = proposta.itens
    .map((item) => item.vendaId)
    .filter((vid): vid is string => Boolean(vid));

  await prisma.$transaction(async (tx) => {
    await tx.proposta.delete({ where: { id } });

    if (vendaIds.length === 0) return;

    // Simetrico a transicao feita ao criar: excluir o unico documento que
    // levou a venda pra "em carteira" desfaz isso. Mas uma venda pode estar
    // referenciada por mais de um pedido/proposta (nao ha unique em
    // vendaId) — so reverte quem ficou de fato sem nenhum vinculo restante.
    const aindaVinculadas = await tx.propostaItem.findMany({
      where: { vendaId: { in: vendaIds } },
      select: { vendaId: true },
    });
    const vinculadasSet = new Set(aindaVinculadas.map((i) => i.vendaId));
    const orfas = vendaIds.filter((vid) => !vinculadasSet.has(vid));

    if (orfas.length > 0) {
      await tx.venda.updateMany({
        where: { id: { in: orfas }, status: { in: ["NEGOCIACAO", "FECHADO", "EM_CARTEIRA"] } },
        data: { status: "PROSPECCAO" },
      });
    }
  });

  await registrar(
    sessao,
    "Excluiu",
    `${numeroProposta(proposta.numero)} - ${proposta.cliente.nome}`
  );
}

function dataBR(data: Date | null): string {
  if (!data) return "";
  return data.toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

// Pedido: data de faturamento e parcelas (1ª na própria data, as demais pelos dias
// da condição). Orçamento não tem nada disso (usa a validade).
function dadosFaturamento(
  tipo: TipoProposta,
  dataFaturamento: Date | null,
  condicao: string | null,
  total: number
) {
  if (tipo !== "PROPOSTA" || !dataFaturamento) return {};
  const parcelas = parcelasDoPedido({
    condicao,
    dataFaturamento: dataFaturamento.toISOString(),
    total,
  });
  return {
    dataFaturamento: dataBR(dataFaturamento),
    parcelas: parcelas.map((p) => ({
      numero: p.numero,
      data: dataBR(new Date(`${p.data}T00:00:00Z`)),
      valor: fmtBRL(p.valor),
    })),
  };
}


const incluirParaPdf = {
  cliente: true,
  consultor: { select: { nome: true, email: true } },
  safra: { select: { nome: true } },
  itens: {
    include: {
      produto: {
        include: { fornecedor: { select: { nome: true } } },
      },
    },
    orderBy: { ordem: "asc" as const },
  },
} satisfies Prisma.PropostaInclude;

type PropostaParaPdf = Prisma.PropostaGetPayload<{ include: typeof incluirParaPdf }>;

function validarPropostaParaPdf(proposta: PropostaParaPdf) {
  if (proposta.tipo === "PROPOSTA" && !clienteCompleto(proposta.cliente)) {
    throw new Error(
      "Complete CPF/CNPJ, endereco, cidade, UF, CEP e telefone ou e-mail do cliente antes de gerar o PDF."
    );
  }
  // Validade, condicao de pagamento, previsao/local de entrega e frete sao
  // opcionais — nao travam o envio pra assinatura; o PDF sai "a combinar"
  // / "Não informado" no que faltar.
  if (
    proposta.itens.length === 0 ||
    proposta.itens.some((item) => item.volume == null || item.valorUnitario == null)
  ) {
    throw new Error("Todos os itens precisam ter volume e valor unitario para gerar o PDF.");
  }
}

// Orcamento cotado a vista e a prazo: colunas a prazo do item (unitario ja
// com o desconto do item, como o a vista no orcamento).
function precosAprazo(volume: number | null, unitario: number, descontoPct: number) {
  return {
    valorUnitarioAprazo: fmtBRL(unitarioLiquido(unitario, descontoPct)),
    totalAprazo: fmtBRL(totalLiquidoItem(volume, unitario, descontoPct)),
  };
}

// Total a prazo e a condicao "A vista ou <parcelas>" — so quando algum item
// tem preco a prazo; senao nao muda nada no PDF.
function cotacaoDupla(
  itens: { volume: number | null; valorUnitarioAprazo: number | null; descontoPct: number }[],
  condicaoPagamento: string | null
) {
  if (!itens.some((i) => i.valorUnitarioAprazo != null)) return {};
  const totalAprazo = itens.reduce(
    (soma, i) => soma + totalLiquidoItem(i.volume, i.valorUnitarioAprazo ?? 0, i.descontoPct),
    0
  );
  const prazo = condicaoPagamento && condicaoPagamento !== "À vista" ? condicaoPagamento : "a combinar";
  return { totalAprazo: fmtBRL(totalAprazo), condicaoPagamento: `À vista ou a prazo (${prazo})` };
}

async function montarPdfProposta(proposta: PropostaParaPdf): Promise<Uint8Array> {
  return gerarPdfProposta({
    numero: numeroDocumento(proposta.tipo, proposta.numero),
    tipo: proposta.tipo,
    status: STATUS_PROPOSTA_LABELS[proposta.status as StatusProposta],
    safra: proposta.safra.nome,
    data: dataBR(new Date()),
    validade: dataBR(proposta.validade),
    ...dadosFaturamento(proposta.tipo, proposta.dataFaturamento, proposta.condicaoPagamento, numeroDecimal(proposta.total)),
    assinantes: assinantesValidos(proposta.signatarios),
    previsaoEntrega: dataBR(proposta.previsaoEntrega),
    localEntrega: proposta.localEntrega || "Não informado",
    frete: proposta.frete || "Não informado",
    cliente: {
      nome: proposta.cliente.nome,
      razaoSocial: proposta.cliente.razaoSocial || proposta.cliente.nome,
      documento: proposta.cliente.documento ?? "",
      inscricaoEstadual:
        proposta.cliente.inscricaoEstadual || "Isento/não informada",
      endereco: proposta.cliente.endereco ?? "",
      cidadeUfCep: `${proposta.cliente.cidade}/${proposta.cliente.uf} - CEP ${proposta.cliente.cep}`,
      telefone: proposta.cliente.telefone ?? "",
      email: proposta.cliente.email ?? "",
    },
    consultor: {
      nome: proposta.consultor.nome,
      email: proposta.consultor.email,
    },
    itens: proposta.itens.map((item) => ({
      fornecedor: item.produto.fornecedor.nome,
      produto: item.produto.nome,
      // Sem fallback pro cadastro: se o item foi salvo sem esses campos
      // (vazio de proposito no orcamento), fica vazio e some do PDF.
      ingredienteAtivo: item.ingredienteAtivo ?? "",
      embalagem: item.embalagem ?? "",
      recomendacao: item.recomendacao ?? "",
      cultura: item.cultura ?? "",
      volume: fmtNum(item.volume ?? 0),
      unidade: item.unidade ?? "",
      // O desconto so aparece no Pedido (PROPOSTA). No orcamento (PEDIDO) o
      // cliente ve so o valor ja com desconto, sem coluna nem linha de desconto.
      valorUnitario:
        proposta.tipo === "PROPOSTA"
          ? fmtBRL(numeroDecimal(item.valorUnitario))
          : fmtBRL(unitarioLiquido(numeroDecimal(item.valorUnitario), numeroDecimal(item.descontoPct))),
      desconto:
        proposta.tipo === "PROPOSTA" && numeroDecimal(item.descontoPct) > 0
          ? `${fmtNum(numeroDecimal(item.descontoPct))}%`
          : "",
      total: fmtBRL(numeroDecimal(item.total)),
      ...(item.valorUnitarioAprazo != null
        ? precosAprazo(item.volume, numeroDecimal(item.valorUnitarioAprazo), numeroDecimal(item.descontoPct))
        : {}),
    })),
    subtotal: fmtBRL(numeroDecimal(proposta.tipo === "PROPOSTA" ? proposta.subtotal : proposta.total)),
    desconto: fmtBRL(proposta.tipo === "PROPOSTA" ? numeroDecimal(proposta.desconto) : 0),
    total: fmtBRL(numeroDecimal(proposta.total)),
    condicaoPagamento: proposta.condicaoPagamento || "Não informado",
    ...cotacaoDupla(
      proposta.itens.map((i) => ({
        volume: i.volume,
        valorUnitarioAprazo: numeroDecimalOuNulo(i.valorUnitarioAprazo),
        descontoPct: numeroDecimal(i.descontoPct),
      })),
      proposta.condicaoPagamento
    ),
    observacoes: proposta.observacoes || "Sem observações.",
    termosCondicoes: proposta.termosCondicoes || "",
  });
}

// Baixar/visualizar o PDF nunca bloqueia por cadastro do cliente incompleto
// — isso e' conferencia interna. So itens sem volume/valor bloqueiam (o PDF
// não tem o que mostrar). O cadastro completo so e' exigido pra ENVIAR pra
// assinatura de verdade (ver enviarPropostaParaD4Sign), que manda o
// documento oficial pra fora.
export async function gerarPdfDaProposta(sessao: Sessao, id: string) {
  await exigirAcessoProposta(sessao, id);
  const proposta = await prisma.proposta.findUniqueOrThrow({
    where: { id },
    include: incluirParaPdf,
  });

  if (proposta.itens.length === 0 || proposta.itens.some((item) => item.volume == null || item.valorUnitario == null)) {
    throw new Error("Todos os itens precisam ter volume e valor unitario para gerar o PDF.");
  }

  await prisma.historico.create({
    data: {
      usuarioNome: sessao.nome,
      acao: "Gerou PDF",
      entidade: proposta.tipo,
      detalhes: `${numeroDocumento(proposta.tipo, proposta.numero)} - ${proposta.cliente.nome}`,
    },
  });

  const bytes = await montarPdfProposta(proposta);

  return { bytes, nomeArquivo: `${numeroDocumento(proposta.tipo, proposta.numero)}.pdf` };
}

// Preview do PDF a partir do que esta no formulario (rascunho em memoria),
// sem gravar nada no banco — usado pelo botao "Visualizar" no wizard antes de
// salvar. Diferente de gerarPdfDaProposta, que le uma Proposta ja persistida.
export async function gerarPdfPreview(
  sessao: Sessao,
  tipo: TipoProposta,
  input: PropostaInput,
  numeroExistente: number | null
): Promise<Uint8Array> {
  const dados = propostaSchema.parse(input);
  const consultorId =
    ehAdmin(sessao) && dados.consultorId ? dados.consultorId : sessao.id;

  const [cliente, consultor, safraAtual, produtos] = await Promise.all([
    prisma.cliente.findUniqueOrThrow({ where: { id: dados.clienteId } }),
    prisma.user.findUniqueOrThrow({ where: { id: consultorId }, select: { nome: true, email: true } }),
    getSafraAtual(),
    prisma.produto.findMany({
      where: { id: { in: dados.itens.map((item) => item.produtoId) } },
      include: { fornecedor: { select: { nome: true } } },
    }),
  ]);
  const produtosPorId = new Map(produtos.map((p) => [p.id, p]));

  const itens = montarItens(dados);
  const montado = montarDados(dados, consultorId, "previa");

  return gerarPdfProposta({
    numero: numeroExistente ? numeroDocumento(tipo, numeroExistente) : "PRÉVIA",
    tipo,
    status: "Rascunho (pré-visualização)",
    safra: safraAtual.nome,
    data: dataBR(new Date()),
    validade: dataBR(paraData(dados.validade)),
    ...dadosFaturamento(tipo, paraData(dados.dataFaturamento), dados.condicaoPagamento ?? null, montado.total),
    previsaoEntrega: dataBR(paraData(dados.previsaoEntrega)),
    localEntrega: dados.localEntrega || "Não informado",
    frete: dados.frete || "Não informado",
    cliente: {
      nome: cliente.nome,
      razaoSocial: cliente.razaoSocial || cliente.nome,
      documento: cliente.documento ?? "",
      inscricaoEstadual: cliente.inscricaoEstadual || "Isento/não informada",
      endereco: cliente.endereco ?? "",
      cidadeUfCep: `${cliente.cidade ?? ""}/${cliente.uf ?? ""} - CEP ${cliente.cep ?? ""}`,
      telefone: cliente.telefone ?? "",
      email: cliente.email ?? "",
    },
    consultor: { nome: consultor.nome, email: consultor.email },
    itens: itens.map((item) => {
      const produto = produtosPorId.get(item.produtoId);
      return {
        fornecedor: produto?.fornecedor.nome ?? "—",
        produto: produto?.nome ?? "—",
        ingredienteAtivo: item.ingredienteAtivo ?? "",
        embalagem: item.embalagem ?? "",
        recomendacao: item.recomendacao ?? "",
        cultura: item.cultura ?? "",
        volume: fmtNum(item.volume ?? 0),
        unidade: item.unidade ?? "",
        valorUnitario:
          tipo === "PROPOSTA"
            ? fmtBRL(item.valorUnitario ?? 0)
            : fmtBRL(unitarioLiquido(item.valorUnitario, item.descontoPct)),
        desconto: tipo === "PROPOSTA" && item.descontoPct > 0 ? `${fmtNum(item.descontoPct)}%` : "",
        total: fmtBRL(item.total),
        ...(item.valorUnitarioAprazo != null
          ? precosAprazo(item.volume, item.valorUnitarioAprazo, item.descontoPct)
          : {}),
      };
    }),
    subtotal: fmtBRL(tipo === "PROPOSTA" ? montado.subtotal : montado.total),
    desconto: fmtBRL(tipo === "PROPOSTA" ? montado.desconto : 0),
    total: fmtBRL(montado.total),
    condicaoPagamento: dados.condicaoPagamento || "Não informado",
    ...cotacaoDupla(itens, dados.condicaoPagamento ?? null),
    observacoes: dados.observacoes || "Sem observações.",
    termosCondicoes: dados.termosCondicoes || "",
  });
}

// Documento unico: dispara pro D4Sign automaticamente assim que o pedido
// esta liberado (margem OK, ou aprovada pelo gestor) — ver
// criarPedidoParaConsultor em lib/pedidos.ts e aprovarMargem abaixo. Gera o
// PDF completo (produtos + clausulas), envia pro D4Sign, cadastra o cliente
// como signatario e dispara pra assinatura. Se falhar (rede, cliente sem
// e-mail etc.), o pedido fica sem d4signDocumentoId e o botao "Enviar para
// assinatura" aparece na UI como fallback manual (ver enviarPropostaParaD4Sign
// exportada e seu uso em app/actions/propostas.ts).
// Dados que o modal "Enviar para assinatura" mostra já preenchidos: cliente (com
// o e-mail do cadastro), vendedor (usuário logado) e os administrativos.
export async function dadosParaAssinatura(sessao: Sessao, id: string) {
  const proposta = await exigirAcessoProposta(sessao, id);
  const [cliente, vendedor, administrativos, salvos] = await Promise.all([
    prisma.cliente.findUniqueOrThrow({
      where: { id: proposta.clienteId },
      select: {
        id: true,
        nome: true,
        razaoSocial: true,
        documento: true,
        telefone: true,
        email: true,
        endereco: true,
        cidade: true,
        uf: true,
        cep: true,
      },
    }),
    prisma.user.findUnique({ where: { id: sessao.id }, select: { nome: true, email: true } }),
    prisma.user.findMany({
      where: { role: "ADMIN", ativo: true },
      select: { id: true, nome: true, email: true },
      orderBy: { nome: "asc" },
    }),
    prisma.proposta.findUnique({ where: { id }, select: { signatarios: true } }),
  ]);
  return {
    // Cadastro do cliente: o e-mail de assinatura é SEMPRE o do cadastro.
    cliente,
    vendedor: { nome: vendedor?.nome ?? sessao.nome, email: vendedor?.email ?? "" },
    administrativos: administrativos.map((u) => ({ nome: u.nome, email: u.email })),
    // Escolhas de um envio anterior (reenvio): reaproveita nomes e e-mails.
    anteriores: assinantesValidos(salvos?.signatarios),
  };
}

export async function enviarPropostaParaD4Sign(
  sessao: Sessao,
  id: string,
  // E-mails extras que também vão assinar (além do cliente) — usado pelo bot.
  // Duplicados e o e-mail do cliente repetido aqui são ignorados.
  emailsExtras: string[] = [],
  // Quem assina, vindo do modal "Enviar para assinatura" da Web: cliente,
  // vendedor, administrativo e outros. Os nomes saem nos campos de assinatura
  // do PDF e quem tem e-mail recebe o link.
  assinantesInput?: AssinanteDoc[]
) {
  const assinantes = assinantesValidos(assinantesInput);
  if (assinantes.length > 0) {
    // O e-mail do cliente vem só do cadastro dele (não vale o que veio no pedido).
    const cadastro = await prisma.proposta.findUniqueOrThrow({
      where: { id },
      select: { cliente: { select: { email: true } } },
    });
    const doCadastro = cadastro.cliente.email?.trim().toLowerCase();
    if (!doCadastro) {
      throw new Error("Cliente sem e-mail no cadastro: complete o cadastro do cliente antes de enviar.");
    }
    const guardados = assinantes.map((a) => (a.papel === "CLIENTE" ? { ...a, email: doCadastro } : a));
    await prisma.proposta.update({
      where: { id },
      data: { signatarios: guardados as unknown as Prisma.InputJsonValue },
    });
  }

  const proposta = await prisma.proposta.findUniqueOrThrow({
    where: { id },
    include: incluirParaPdf,
  });

  validarPropostaParaPdf(proposta);

  const doDocumento = assinantesValidos(proposta.signatarios);
  const emailCliente = proposta.cliente.email;
  if (!emailCliente) {
    throw new Error("Cliente sem e-mail cadastrado: necessário para enviar a assinatura.");
  }

  const vistos = new Set<string>();
  const emails = [
    emailCliente,
    ...doDocumento.filter((a) => a.papel !== "CLIENTE" && a.email).map((a) => a.email as string),
    ...emailsExtras,
  ]
    .map((email) => email.trim().toLowerCase())
    .filter((email) => {
      if (!email || vistos.has(email)) return false;
      vistos.add(email);
      return true;
    });

  const bytes = await montarPdfProposta(proposta);
  const nomeArquivo = `${numeroDocumento(proposta.tipo, proposta.numero)}.pdf`;

  const documentoUuid = await enviarDocumento(bytes, nomeArquivo);
  // Só o cliente (primeiro da lista) ganha link direto, pro consultor
  // encaminhar pelo WhatsApp; os e-mails extras seguem só por e-mail.
  const signatarios = await definirSignatario(
    documentoUuid,
    emails.map((email, i) => ({ email, assinaturaPresencial: i === 0 }))
  );
  await enviarParaAssinatura(documentoUuid, {
    mensagem: `${numeroDocumento(proposta.tipo, proposta.numero)} - ${proposta.cliente.nome}`,
  });

  await prisma.proposta.update({
    where: { id },
    data: {
      d4signDocumentoId: documentoUuid,
      statusAssinatura: "AGUARDANDO_ASSINATURA",
      linkAssinaturaCliente: linkDoSignatario(signatarios, emailCliente),
    },
  });

  await prisma.historico.create({
    data: {
      usuarioNome: sessao.nome,
      acao: "Enviou para assinatura (D4Sign)",
      entidade: proposta.tipo,
      detalhes: `${numeroDocumento(proposta.tipo, proposta.numero)} - ${proposta.cliente.nome}`,
    },
  });
}

function linkDoSignatario(
  signatarios: { email: string; link: string | null }[],
  email: string | null
): string | null {
  if (!email) return null;
  const alvo = email.trim().toLowerCase();
  return signatarios.find((s) => s.email.trim().toLowerCase() === alvo && s.link)?.link ?? null;
}

// Link direto de assinatura do cliente (o mesmo documento que ele recebe por
// e-mail), pro bot mandar pro consultor encaminhar pelo WhatsApp. Se não foi
// gravado no envio, tenta buscar de novo no D4Sign e grava.
export async function obterLinkAssinaturaCliente(sessao: Sessao, id: string): Promise<string | null> {
  await exigirAcessoProposta(sessao, id);
  const proposta = await prisma.proposta.findUniqueOrThrow({
    where: { id },
    select: { linkAssinaturaCliente: true, d4signDocumentoId: true, cliente: { select: { email: true } } },
  });
  if (proposta.linkAssinaturaCliente) return proposta.linkAssinaturaCliente;
  if (!proposta.d4signDocumentoId) return null;
  const link = linkDoSignatario(await listarSignatarios(proposta.d4signDocumentoId), proposta.cliente.email);
  if (link) {
    await prisma.proposta.update({ where: { id }, data: { linkAssinaturaCliente: link } });
  }
  return link;
}
