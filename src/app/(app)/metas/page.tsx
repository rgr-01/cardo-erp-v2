import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { numeroDecimal } from "@/lib/dinheiro";
import { getSafraAtual } from "@/lib/safra-atual";
import { MetasForm } from "@/components/metas/metas-form";

export const metadata = { title: "Metas" };

export default async function MetasPage() {
  const session = await auth();
  if (session!.user.role !== "ADMIN") redirect("/dashboard");

  const safraAtual = await getSafraAtual();
  const meta = await prisma.meta.findUnique({ where: { safraId: safraAtual.id } });

  return (
    <MetasForm
      safraNome={safraAtual.nome}
      meta={meta ? { id: meta.id, valor: numeroDecimal(meta.valor) } : null}
    />
  );
}
