import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { numeroDecimal } from "@/lib/dinheiro";
import { ContasPagarPainel } from "@/components/financeiro/contas-pagar-painel";
import { linhasTitulos, opcoesClientesFinanceiro, usaFinanceiroAvulso } from "@/lib/servicos/financeiro-avulso";
import { TitulosAvulsosPainel } from "@/components/financeiro/titulos-avulsos-painel";

export const metadata = { title: "Contas a pagar" };

// Contas a pagar = despesas lançadas como "A pagar", de qualquer safra: o que
// importa aqui é o vencimento, não a safra do lançamento.
export default async function ContasAPagarPage() {
  const session = await auth();
  if (session!.user.role !== "ADMIN") redirect("/dashboard");

  const despesas = await prisma.despesa.findMany({
    where: { situacao: "A_PAGAR" },
    include: {
      conta: { select: { codigo: true, nome: true } },
      consultor: { select: { nome: true } },
    },
    orderBy: [{ vencimento: { sort: "asc", nulls: "last" } }, { data: "asc" }],
    take: 2000,
  });
  const sessao = { id: session!.user.id, nome: session!.user.nome, role: session!.user.role };
  const avulso = await usaFinanceiroAvulso(sessao.id);
  const [titulos, clientes] = avulso ? await Promise.all([linhasTitulos(sessao, "PAGAR"), opcoesClientesFinanceiro()]) : [[], []];
  const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());

  return (
    <div className="space-y-6">
    <ContasPagarPainel
      hoje={hoje}
      contas={despesas.map((d) => ({
        id: d.id,
        valor: numeroDecimal(d.valor),
        vencimento: d.vencimento?.toISOString().slice(0, 10) ?? null,
        data: d.data.toISOString().slice(0, 10),
        descricao: d.estabelecimento || d.descricao || "Sem descrição",
        documento: d.documento,
        conta: d.conta ? `${d.conta.codigo} · ${d.conta.nome}` : null,
        consultorNome: d.consultor.nome,
      }))}
    />
    {avulso && <TitulosAvulsosPainel tipo="PAGAR" titulos={titulos} clientes={clientes} hoje={hoje} provedorBoleto={null} />}
    </div>
  );
}
