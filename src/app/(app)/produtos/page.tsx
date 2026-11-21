import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { numeroDecimalOuNulo } from "@/lib/dinheiro";
import { ProdutosLista } from "@/components/produtos/produtos-lista";

export const metadata = { title: "Produtos — Estoque" };

export default async function ProdutosPage({ searchParams }: { searchParams: Promise<{ fornecedor?: string }> }) {
  const { fornecedor } = await searchParams;
  const session = await auth();
  if (session!.user.role !== "ADMIN") redirect("/dashboard");
  const ehAdmin = true;

  const fornecedores = await prisma.fornecedor.findMany({
    include: {
      produtos: {
        select: {
          id: true,
          nome: true,
          ingredienteAtivo: true,
          embalagem: true,
          recomendacao: true,
          ncm: true,
          cfop: true,
          custoAvista: true,
          custoAprazo: true,
          custoCompra: true,
          margemPct: true,
          _count: { select: { vendas: true } },
        },
        orderBy: { nome: "asc" },
      },
    },
    orderBy: { nome: "asc" },
  });

  return (
    <ProdutosLista
      ehAdmin={ehAdmin}
      fornecedorInicial={fornecedor}
      fornecedores={fornecedores.map((f) => ({
        id: f.id,
        nome: f.nome,
        produtos: f.produtos.map((p) => ({
          id: p.id,
          nome: p.nome,
          ingredienteAtivo: p.ingredienteAtivo,
          embalagem: p.embalagem,
          recomendacao: p.recomendacao,
          ncm: p.ncm,
          cfop: p.cfop,
          qtdVendas: p._count.vendas,
          custoAvista: numeroDecimalOuNulo(p.custoAvista),
          custoAprazo: numeroDecimalOuNulo(p.custoAprazo),
          custoCompra: numeroDecimalOuNulo(p.custoCompra),
          margemPct: numeroDecimalOuNulo(p.margemPct),
        })),
      }))}
    />
  );
}
