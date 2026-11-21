import { auth } from "@/auth";
import { assinarUrlArmazenada } from "@/lib/storage";
import { numeroDecimal, numeroDecimalOuNulo } from "@/lib/dinheiro";
import { prisma } from "@/lib/prisma";
import { getSafraAtualId } from "@/lib/safra-atual";
import { PropostasTable } from "@/components/propostas/propostas-table";
import type { StatusProposta } from "@/lib/propostas";

export const metadata = { title: "Orçamentos" };

export default async function PedidosPage() {
  const session = await auth();
  const user = session!.user;
  const ehAdmin = user.role === "ADMIN";
  const safraId = await getSafraAtualId();

  const [pedidos, clientes, produtos, consultores, vendasAbertas] =
    await Promise.all([
      prisma.proposta.findMany({
        where: {
          safraId,
          tipo: "PEDIDO",
          ...(ehAdmin ? {} : { consultorId: user.id }),
        },
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
        orderBy: [{ updatedAt: "desc" }],
      }),
      prisma.cliente.findMany({
        select: {
          id: true,
          nome: true,
          documento: true,
          razaoSocial: true,
          telefone: true,
          email: true,
          endereco: true,
          cidade: true,
          uf: true,
          cep: true,
        },
        orderBy: { nome: "asc" },
      }),
      prisma.produto.findMany({
        select: {
          id: true,
          nome: true,
          fornecedor: { select: { nome: true } },
          ingredienteAtivo: true,
          embalagem: true,
          recomendacao: true,
          custoAvista: true,
          custoAprazo: true,
          custoCompra: true,
        },
        orderBy: [{ fornecedor: { nome: "asc" } }, { nome: "asc" }],
      }),
      ehAdmin
        ? prisma.user.findMany({
            where: { ativo: true },
            select: { id: true, nome: true },
            orderBy: { nome: "asc" },
          })
        : Promise.resolve([]),
      prisma.venda.findMany({
        where: {
          safraId,
          status: { in: ["PROSPECCAO", "NEGOCIACAO", "EM_CARTEIRA"] },
          ...(ehAdmin ? {} : { consultorId: user.id }),
        },
        include: {
          produto: {
            select: { nome: true, fornecedor: { select: { nome: true } } },
          },
        },
        orderBy: [{ clienteId: "asc" }, { createdAt: "desc" }],
      }),
    ]);

  return (
    <PropostasTable
      tipo="PEDIDO"
      ehAdmin={ehAdmin}
      propostas={await Promise.all(pedidos.map(async (p) => ({
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
          descontoPct: numeroDecimal(item.descontoPct),
          total: numeroDecimal(item.total),
          ordem: item.ordem,
        })),
      })))}
      clientes={clientes}
      produtos={produtos.map((p) => ({
        id: p.id,
        nome: p.nome,
        fornecedorNome: p.fornecedor.nome,
        ingredienteAtivo: p.ingredienteAtivo,
        embalagem: p.embalagem,
        recomendacao: p.recomendacao,
        custoAvista: numeroDecimalOuNulo(p.custoAvista),
        custoAprazo: numeroDecimalOuNulo(p.custoAprazo),
        custoCompra: numeroDecimalOuNulo(p.custoCompra),
      }))}
      consultores={consultores}
      vendasAbertas={vendasAbertas.map((v) => ({
        id: v.id,
        clienteId: v.clienteId,
        consultorId: v.consultorId,
        produtoId: v.produtoId,
        produtoNome: v.produto.nome,
        fornecedorNome: v.produto.fornecedor.nome,
        cultura: v.cultura,
        volume: v.volume,
        condicaoPagamentoTipo: v.condicaoPagamentoTipo,
        valorUnitario: numeroDecimalOuNulo(v.valorUnitario),
        valorTotal: numeroDecimal(v.valorTotal),
      }))}
    />
  );
}
