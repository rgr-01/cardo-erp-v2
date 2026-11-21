import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { assinarArquivos, storageConfigurado } from "@/lib/storage";
import { numeroDecimal } from "@/lib/dinheiro";
import { getSafraAtual } from "@/lib/safra-atual";
import { DespesasPainel } from "@/components/despesas/despesas-painel";

export const metadata = { title: "Despesas" };

export default async function DespesasPage() {
  const session = await auth();
  const ehAdmin = session!.user.role === "ADMIN";
  const usuarioId = session!.user.id;
  const safra = await getSafraAtual();

  const [clientes, despesas, grupos, orcamentos] = await Promise.all([
    prisma.cliente.findMany({
      select: { id: true, nome: true },
      orderBy: { nome: "asc" },
    }),
    prisma.despesa.findMany({
      where: { safraId: safra.id, ...(ehAdmin ? {} : { consultorId: usuarioId }) },
      include: {
        cliente: { select: { nome: true } },
        consultor: { select: { nome: true } },
        fotos: { orderBy: { ordem: "asc" } },
      },
      orderBy: [{ data: "desc" }, { createdAt: "desc" }],
      take: 5000,
    }),
    prisma.grupoDespesa.findMany({
      include: { contas: { orderBy: [{ ordem: "asc" }, { codigo: "asc" }] } },
      orderBy: { ordem: "asc" },
    }),
    prisma.orcamentoContaDespesa.findMany({ where: { safraId: safra.id } }),
  ]);

  const orcamentoPorConta = new Map(orcamentos.map((o) => [o.contaId, numeroDecimal(o.valorMensal)]));
  const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());

  return (
    <DespesasPainel
      clientes={clientes}
      usuarioId={usuarioId}
      ehAdmin={ehAdmin}
      storageConfigurado={storageConfigurado()}
      safraNome={safra.nome}
      hoje={hoje}
      grupos={grupos.map((g) => ({
        id: g.id,
        nome: g.nome,
        contas: g.contas.map((c) => ({
          id: c.id,
          codigo: c.codigo,
          nome: c.nome,
          ativo: c.ativo,
          orcamento: orcamentoPorConta.get(c.id) ?? numeroDecimal(c.orcamentoPadrao),
        })),
      }))}
      despesas={await Promise.all(despesas.map(async (d) => ({
        id: d.id,
        contaId: d.contaId,
        valor: numeroDecimal(d.valor),
        data: d.data.toISOString(),
        estabelecimento: d.estabelecimento,
        descricao: d.descricao,
        documento: d.documento,
        vencimento: d.vencimento?.toISOString() ?? null,
        situacao: d.situacao,
        filial: d.filial,
        origemOcr: d.origemOcr,
        clienteNome: d.cliente?.nome ?? null,
        consultorNome: d.consultor.nome,
        consultorId: d.consultorId,
        fotos: (await assinarArquivos(d.fotos)).map((f) => ({ id: f.id, url: f.url })),
      })))}
    />
  );
}
