import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { numeroDecimal } from "@/lib/dinheiro";
import { getSafraAtual } from "@/lib/safra-atual";
import { PlanoOrcamentoForm } from "@/components/despesas/plano-orcamento-form";

export const metadata = { title: "Plano de contas e orçamento" };

export default async function OrcamentoDespesasPage() {
  const session = await auth();
  if (session!.user.role !== "ADMIN") redirect("/despesas");

  const safra = await getSafraAtual();
  const [grupos, orcamentos] = await Promise.all([
    prisma.grupoDespesa.findMany({
      include: { contas: { orderBy: [{ ordem: "asc" }, { codigo: "asc" }] } },
      orderBy: { ordem: "asc" },
    }),
    prisma.orcamentoContaDespesa.findMany({ where: { safraId: safra.id } }),
  ]);
  const orcamentoPorConta = new Map(orcamentos.map((o) => [o.contaId, numeroDecimal(o.valorMensal)]));

  return (
    <div className="space-y-4">
      <div>
        <Link href="/despesas" className="text-sm text-muted hover:text-zinc-300">
          ← Despesas
        </Link>
        <h1 className="text-xl font-bold text-white">Plano de contas e orçamento</h1>
        <p className="text-xs text-muted">
          Orçamento mensal por conta da safra {safra.nome}. Para trocar de safra, use o seletor no menu lateral.
        </p>
      </div>
      <PlanoOrcamentoForm
        key={safra.id}
        grupos={grupos.map((g) => ({
          id: g.id,
          nome: g.nome,
          contas: g.contas.map((c) => ({
            id: c.id,
            codigo: c.codigo,
            nome: c.nome,
            ativo: c.ativo,
            valor: orcamentoPorConta.get(c.id) ?? numeroDecimal(c.orcamentoPadrao),
          })),
        }))}
      />
    </div>
  );
}
