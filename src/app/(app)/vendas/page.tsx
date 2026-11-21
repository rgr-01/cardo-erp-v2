import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { numeroDecimal, numeroDecimalOuNulo } from "@/lib/dinheiro";
import { getSafraAtualId, getSafras } from "@/lib/safra-atual";
import { VendasTable } from "@/components/vendas/vendas-table";
import { numeroDocumento } from "@/lib/propostas";
import type { Status } from "@/lib/format";
import { assinarUrlArmazenada } from "@/lib/storage";

export const metadata = { title: "Plano de vendas" };

export default async function VendasPage() {
  const session = await auth();
  const user = session!.user;
  const ehAdmin = user.role === "ADMIN";
  const safraId = await getSafraAtualId();

  const [vendas, clientes, produtos, consultores, safras] = await Promise.all([
    prisma.venda.findMany({
      where: ehAdmin ? { safraId } : { safraId, consultorId: user.id },
      include: {
        cliente: { select: { nome: true } },
        produto: {
          select: { nome: true, fornecedorId: true, fornecedor: { select: { nome: true } } },
        },
        consultor: { select: { nome: true } },
        // Pro tooltip do status: qual orcamento/pedido gerou essa venda.
        propostaItens: {
          select: { proposta: { select: { id: true, tipo: true, numero: true, pdfAssinadoUrl: true, cliente: { select: { nome: true } } } } },
          orderBy: { proposta: { updatedAt: "desc" } },
          take: 1,
        },
      },
      orderBy: [{ cliente: { nome: "asc" } }, { createdAt: "desc" }],
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
      // So produtos com valor cadastrado pelo gestor podem ser escolhidos em
      // vendas novas — evita lancar venda sem preco definido. Vendas ja
      // existentes com produto sem valor nao sao afetadas por esse filtro —
      // o produto de cada venda entra sempre, senao o editor de orcamento/pedido
      // nao acha produto/fornecedor do item vinculado e mostra "—".
      where: {
        OR: [
          { custoAvista: { not: null } },
          { custoAprazo: { not: null } },
          { vendas: { some: {} } },
        ],
      },
      select: {
        id: true,
        nome: true,
        fornecedorId: true,
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
    getSafras(),
  ]);

  // Bucket privado: o link salvo precisa ser assinado pra abrir o PDF.
  const pdfsAssinados = new Map<string, string>();
  await Promise.all(
    vendas.map(async (v) => {
      const url = v.propostaItens[0]?.proposta.pdfAssinadoUrl;
      if (url) pdfsAssinados.set(v.id, await assinarUrlArmazenada({ url }));
    })
  );

  return (
    <VendasTable
      ehAdmin={ehAdmin}
      vendas={vendas.map((v) => ({
        id: v.id,
        clienteId: v.clienteId,
        clienteNome: v.cliente.nome,
        produtoId: v.produtoId,
        produtoNome: v.produto.nome,
        fornecedorId: v.produto.fornecedorId,
        fornecedorNome: v.produto.fornecedor.nome,
        consultorId: v.consultorId,
        consultorNome: v.consultor.nome,
        cultura: v.cultura,
        volume: v.volume,
        condicaoPagamentoTipo: v.condicaoPagamentoTipo,
        valorUnitario: numeroDecimalOuNulo(v.valorUnitario),
        valorTotal: numeroDecimal(v.valorTotal),
        status: v.status as Status,
        dataFechamento: v.dataFechamento?.toISOString() ?? null,
        previsaoEntrega: v.previsaoEntrega?.toISOString() ?? null,
        observacoes: v.observacoes,
        safraId: v.safraId,
        documentoOrigem: v.propostaItens[0]
          ? {
              id: v.propostaItens[0].proposta.id,
              tipo: v.propostaItens[0].proposta.tipo,
              numero: numeroDocumento(v.propostaItens[0].proposta.tipo, v.propostaItens[0].proposta.numero),
              clienteNome: v.propostaItens[0].proposta.cliente.nome,
              pdfAssinadoUrl: pdfsAssinados.get(v.id) ?? null,
            }
          : null,
      }))}
      clientes={clientes}
      produtos={produtos.map((p) => ({
        id: p.id,
        nome: p.nome,
        fornecedorId: p.fornecedorId,
        fornecedorNome: p.fornecedor.nome,
        ingredienteAtivo: p.ingredienteAtivo,
        embalagem: p.embalagem,
        recomendacao: p.recomendacao,
        custoAvista: numeroDecimalOuNulo(p.custoAvista),
        custoAprazo: numeroDecimalOuNulo(p.custoAprazo),
        custoCompra: numeroDecimalOuNulo(p.custoCompra),
      }))}
      consultores={consultores}
      safras={safras}
    />
  );
}
