import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { exigirModuloPagina, modulosDaSessao } from "@/lib/modulos-servidor";
import { FornecedoresLista } from "@/components/fornecedores/fornecedores-lista";

export const metadata = { title: "Fornecedores — Cadastros" };

export default async function FornecedoresPage() {
  await exigirModuloPagina("CADASTROS");
  const session = await auth();
  if (session!.user.role !== "ADMIN") redirect("/dashboard");
  const [fornecedores, modulos] = await Promise.all([
    prisma.fornecedor.findMany({ select: { id: true, numero: true, nome: true, _count: { select: { produtos: true } } }, orderBy: { nome: "asc" } }),
    modulosDaSessao(),
  ]);
  return <FornecedoresLista fornecedores={fornecedores.map(f => ({ id: f.id, numero: f.numero, nome: f.nome, produtos: f._count.produtos }))} podeVerProdutos={modulos.includes("ESTOQUE")} />;
}
