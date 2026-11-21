import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { fmtBRL } from "@/lib/format";
import { numeroDocumento, type OrigemProposta, type TipoProposta } from "@/lib/propostas";
import { custoDoProduto, margemPonderada, precisaAprovacaoGestor } from "@/lib/margem";
import { numeroDecimal } from "@/lib/dinheiro";
import { totalBrutoItem, totalLiquidoItem, unitarioLiquido } from "@/lib/desconto";
import type { Sessao } from "@/app/actions/helpers";

const itemSchema = z.object({
  produtoId: z.string().min(1, "Produto e obrigatorio"),
  vendaId: z.string().nullish(),
  cultura: z.string().nullish(),
  volume: z.coerce.number().nonnegative().nullish(),
  unidade: z.string().nullish(),
  valorUnitario: z.coerce.number().nonnegative().nullish(),
  // Orcamento cotado a vista e a prazo: valorUnitario = a vista, este = a
  // prazo (ver PropostaItem.valorUnitarioAprazo). So vale no orcamento.
  valorUnitarioAprazo: z.coerce.number().nonnegative().nullish(),
  // Desconto em % so deste item (valorUnitario fica bruto).
  descontoPct: z.coerce.number().min(0).max(100).default(0),
  // A vista/a prazo POR ITEM — cada produto pode ter uma condicao diferente
  // (a negociacao pode mudar item a item). Ao salvar, tambem atualiza a
  // Venda vinculada (ver sincronizarCondicaoNaVenda abaixo).
  condicaoPagamentoTipo: z.enum(["AVISTA", "APRAZO"]).default("AVISTA"),
  // Sobrescrevem o cadastro do Produto so pra este item (ver
  // PropostaItem.ingredienteAtivo/embalagem/recomendacao) — nulo/vazio usa o
  // valor atual do cadastro na hora de exibir.
  ingredienteAtivo: z.string().nullish(),
  embalagem: z.string().nullish(),
  recomendacao: z.string().nullish(),
});

export const propostaSchema = z.object({
  clienteId: z.string().min(1, "Cliente e obrigatorio"),
  consultorId: z.string().optional(),
  validade: z.string().nullish(),
  // So no pedido: a 1a parcela sai nesta data (ver lib/parcelas.ts).
  dataFaturamento: z.string().nullish(),
  // Opcional: o orcamento pode sair sem data — a previsao de entrega e'
  // perguntada na hora de virar pedido (ver fechar_negocio_orcamento no bot).
  previsaoEntrega: z.string().nullish(),
  localEntrega: z.string().nullish(),
  frete: z.string().nullish(),
  condicaoPagamento: z.string().nullish(),
  // Campo legado, mantido no banco por compatibilidade mas nao usado mais
  // pra calculo de margem — cada item tem seu proprio condicaoPagamentoTipo
  // agora (ver itemSchema acima). So grava o do primeiro item, so pra o
  // campo continuar preenchido em telas antigas que ainda leem daqui.
  condicaoPagamentoTipo: z.enum(["AVISTA", "APRAZO"]).default("AVISTA"),
  observacoes: z.string().nullish(),
  termosCondicoes: z.string().nullish(),
  desconto: z.coerce.number().nonnegative().default(0),
  itens: z.array(itemSchema).min(1, "Adicione ao menos um item."),
});

export type PropostaInput = z.input<typeof propostaSchema>;

export function paraData(s: string | null | undefined): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

// Total liquido do item (ja com o desconto em %).
function totalItem(item: z.output<typeof itemSchema>) {
  return totalLiquidoItem(item.volume, item.valorUnitario, item.descontoPct);
}

// Valor de venda liquido por unidade — o que vai pra Venda e pra margem.
export function unitarioLiquidoDoItem(item: z.output<typeof itemSchema>) {
  return unitarioLiquido(item.valorUnitario, item.descontoPct);
}

export function montarDados(
  dados: z.output<typeof propostaSchema>,
  consultorId: string,
  safraId: string
) {
  // subtotal = bruto; desconto = soma dos descontos por item (R$) + o
  // desconto geral legado (bot); total = liquido.
  const subtotal = dados.itens.reduce((soma, item) => soma + totalBrutoItem(item.volume, item.valorUnitario), 0);
  const descontoItens = dados.itens.reduce(
    (soma, item) => soma + (totalBrutoItem(item.volume, item.valorUnitario) - totalItem(item)),
    0
  );
  const desconto = Math.round((descontoItens + (dados.desconto ?? 0)) * 100) / 100;
  return {
    clienteId: dados.clienteId,
    consultorId,
    safraId,
    validade: paraData(dados.validade),
    dataFaturamento: paraData(dados.dataFaturamento),
    previsaoEntrega: paraData(dados.previsaoEntrega),
    localEntrega: dados.localEntrega || null,
    frete: dados.frete || null,
    condicaoPagamento: dados.condicaoPagamento || null,
    condicaoPagamentoTipo: dados.condicaoPagamentoTipo,
    observacoes: dados.observacoes || null,
    termosCondicoes: dados.termosCondicoes || null,
    subtotal,
    desconto,
    total: Math.max(0, subtotal - desconto),
  };
}

// Pedido tem preco unico: o orcamento cotado a vista e a prazo precisa ter
// um dos dois escolhido antes de fechar negocio.
export function ehCotacaoDupla(dados: z.output<typeof propostaSchema>) {
  return dados.itens.some((item) => item.valorUnitarioAprazo != null);
}

export function exigirPrecoUnico(dados: z.output<typeof propostaSchema>) {
  if (ehCotacaoDupla(dados)) {
    throw new Error("Escolha o preço à vista ou a prazo antes de fechar o negócio.");
  }
}

// produtosPorId: mapa produtoId -> custo de compra do produto, usado pra
// congelar custoUnitario de cada item (ver PropostaItem.custoUnitario) — o
// custo de compra e' unico, nao varia por condicaoPagamentoTipo (ver
// custoDoProduto em lib/margem.ts).
export function montarItens(
  dados: z.output<typeof propostaSchema>,
  produtosPorId: Map<string, { custoCompra: number | { toNumber(): number } | null }> = new Map()
) {
  return dados.itens.map((item, index) => {
    const produto = produtosPorId.get(item.produtoId);
    return {
      produtoId: item.produtoId,
      vendaId: item.vendaId || null,
      cultura: item.cultura || null,
      volume: item.volume ?? null,
      unidade: item.unidade || null,
      valorUnitario: item.valorUnitario ?? null,
      valorUnitarioAprazo: item.valorUnitarioAprazo ?? null,
      descontoPct: item.descontoPct,
      condicaoPagamentoTipo: item.condicaoPagamentoTipo,
      ingredienteAtivo: item.ingredienteAtivo || null,
      embalagem: item.embalagem || null,
      recomendacao: item.recomendacao || null,
      custoUnitario: produto ? custoDoProduto(produto) : null,
      total: totalItem(item),
      ordem: index + 1,
    };
  });
}

// A negociacao pode mudar a condicao de pagamento depois que a Venda ja foi
// criada — ao salvar o orcamento/pedido, propaga a condicao de cada item de
// volta pra Venda vinculada, pra ela nao ficar desatualizada.
export async function sincronizarCondicaoNaVenda(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  itens: z.output<typeof itemSchema>[]
) {
  for (const item of itens) {
    if (!item.vendaId) continue;
    await tx.venda.update({
      where: { id: item.vendaId },
      data: { condicaoPagamentoTipo: item.condicaoPagamentoTipo },
    });
  }
}

export async function validarItensPedido(
  sessao: Sessao,
  clienteId: string,
  consultorId: string,
  itens: z.output<typeof itemSchema>[]
) {
  const vendaIds = itens
    .map((item) => item.vendaId?.trim())
    .filter((id): id is string => Boolean(id));

  if (vendaIds.length === 0) return;

  const vendas = await prisma.venda.findMany({
    where: { id: { in: vendaIds } },
    select: {
      id: true,
      clienteId: true,
      consultorId: true,
      produtoId: true,
      status: true,
    },
  });
  const vendasPorId = new Map(vendas.map((v) => [v.id, v]));

  for (const item of itens) {
    if (!item.vendaId) continue;
    const venda = vendasPorId.get(item.vendaId);
    if (!venda) throw new Error("Venda vinculada nao encontrada.");
    if (venda.clienteId !== clienteId) {
      throw new Error("Todos os itens vinculados devem ser do mesmo cliente.");
    }
    if (venda.produtoId !== item.produtoId) {
      throw new Error("Produto do item nao corresponde a venda vinculada.");
    }
    if (venda.status === "FATURADO" || venda.status === "CANCELADO") {
      throw new Error("Vendas faturadas ou canceladas nao podem gerar proposta.");
    }
    if (sessao.role !== "ADMIN" && venda.consultorId !== sessao.id) {
      throw new Error("Voce so pode usar suas proprias vendas.");
    }
    if (sessao.role === "ADMIN" && venda.consultorId !== consultorId) {
      throw new Error("Itens vinculados devem pertencer ao consultor da proposta.");
    }
  }
}

async function registrarHistoricoProposta(sessao: Sessao, acao: string, detalhes: string) {
  await prisma.historico.create({
    data: {
      usuarioNome: sessao.nome,
      acao,
      entidade: "PROPOSTA",
      detalhes,
    },
  });
}

export async function criarPedidoParaConsultor(opts: {
  sessao: Sessao;
  input: PropostaInput;
  tipo: TipoProposta;
  safraId: string;
  // true quando o consultor clicou "Fechar negocio" no orcamento: em vez de
  // salvar como rascunho (tipo PEDIDO), ja nasce como Pedido (tipo PROPOSTA)
  // — negocio fechado na hora. Se a margem estiver abaixo de 27%, nasce com
  // statusMargem AGUARDANDO_APROVACAO e fica bloqueado ate o gestor aprovar
  // (ver bloqueio em lib/servicos/propostas.ts).
  fecharNegocio?: boolean;
  // Quem criou o registro (ver coluna "Origem" em Comercial > Orcamentos):
  // WEB pro formulario normal, BOT quando veio do assistente do WhatsApp.
  origem?: OrigemProposta;
  // false pro bot: fechar negocio pelo WhatsApp cria o Pedido (e a venda em
  // carteira) mas NUNCA dispara a assinatura sozinho — isso fica exclusivo
  // do botao "Enviar para assinatura" na Web, mesmo com margem OK.
  enviarAssinaturaAutomatica?: boolean;
}) {
  const {
    sessao,
    input,
    tipo,
    safraId,
    fecharNegocio = false,
    origem = "WEB",
    enviarAssinaturaAutomatica = true,
  } = opts;
  const dados = propostaSchema.parse(input);
  const consultorId =
    sessao.role === "ADMIN" && dados.consultorId ? dados.consultorId : sessao.id;

  await validarItensPedido(sessao, dados.clienteId, consultorId, dados.itens);

  // A margem so se calcula a partir de um orcamento (o Pedido nascido de
  // "Fechar negocio" carrega a margem calculada nesse momento, igual a um
  // orcamento comum).
  const calculaMargem = tipo === "PEDIDO" || fecharNegocio;
  const tipoFinal: TipoProposta = tipo === "PEDIDO" && fecharNegocio ? "PROPOSTA" : tipo;
  if (tipoFinal === "PROPOSTA") exigirPrecoUnico(dados);

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

  const proposta = await prisma.$transaction(async (tx) => {
    // Orcamento nasce de vendas: todo item precisa estar vinculado a uma.
    // Um item adicionado na hora (sem vendaId) primeiro vira uma venda nova
    // pra aparecer em /vendas — nao existe item "solto" so dentro do
    // orcamento (ver PropostaWizard em propostas-table.tsx).
    const itensComVenda =
      tipo === "PEDIDO"
        ? await Promise.all(
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
                  valorTotal: totalItem(item),
                  status: "NEGOCIACAO",
                  safraId,
                },
              });
              return { ...item, vendaId: venda.id };
            })
          )
        : dados.itens;

    const criada = await tx.proposta.create({
      data: {
        ...montarDados(dados, consultorId, safraId),
        tipo: tipoFinal,
        origem,
        margemPct: margemMedia,
        statusMargem,
        itens: { create: montarItens({ ...dados, itens: itensComVenda }, produtosPorId) },
      },
      include: { cliente: { select: { nome: true } } },
    });

    // Sincroniza a condicao de pagamento de cada item pra Venda vinculada —
    // a negociacao pode ter mudado a condicao no orcamento depois da venda
    // ja criada. Idempotente pras recem-criadas acima (ja nascem certas).
    await sincronizarCondicaoNaVenda(tx, itensComVenda);

    const vendaIds = itensComVenda
      .map((item) => item.vendaId?.trim())
      .filter((id): id is string => Boolean(id));

    if (vendaIds.length > 0) {
      // Orcamento (tipo PEDIDO) so avanca a venda pra negociacao. "Fechar
      // negocio" marca a venda como Fechado — negocio confirmado, mas so
      // vira Em carteira de fato apos a conferencia final do administrativo
      // (ver aprovarConferenciaFinal em lib/servicos/propostas.ts). Vale
      // mesmo com a margem aguardando aprovacao do gestor — so o envio pro
      // cliente fica bloqueado, nao a venda em si.
      await tx.venda.updateMany({
        where: { id: { in: vendaIds }, status: "PROSPECCAO" },
        data: { status: tipoFinal === "PEDIDO" ? "NEGOCIACAO" : "FECHADO" },
      });
    }

    return criada;
  });

  await registrarHistoricoProposta(
    sessao,
    "Criou",
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

  if (tipoFinal === "PROPOSTA" && enviarAssinaturaAutomatica) {
    // Import dinamico pra evitar ciclo estatico: servicos/propostas.ts ja
    // importa deste arquivo (montarDados/montarItens/propostaSchema).
    const { enviarSeLiberado } = await import("@/lib/servicos/propostas");
    await enviarSeLiberado(sessao, proposta.id);
  }

  return proposta;
}
