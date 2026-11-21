import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getSafraAtual, getSafraAtualId } from "@/lib/safra-atual";
import { storageConfigurado } from "@/lib/storage";
import { NovoRelatorioEditor } from "@/components/visitas/novo-relatorio-editor";

export const metadata = { title: "Novo relatório" };

export default async function NovoRelatorioPage({
  searchParams,
}: {
  searchParams: Promise<{ tipo?: string; trabalho?: string }>;
}) {
  const session = await auth();
  const params = await searchParams;
  const safraId = await getSafraAtualId();
  const [clientes, trabalhos] = await Promise.all([
    prisma.cliente.findMany({
      select: { id: true, nome: true, fazendas: { select: { id: true, nome: true }, orderBy: { nome: "asc" } } },
      orderBy: { nome: "asc" },
    }),
    prisma.trabalho.findMany({
      where: { safraId, status: { not: "CONCLUIDO" } },
      select: { id: true, nome: true },
      orderBy: { nome: "asc" },
    }),
  ]);

  return (
    <NovoRelatorioEditor
      clientes={clientes}
      trabalhos={trabalhos}
      consultorNome={session!.user.name ?? "Consultor"}
      safraNome={(await getSafraAtual()).nome}
      hoje={new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" })}
      tipoInicial={params.tipo === "TECNICO" ? "TECNICO" : "VISITA"}
      trabalhoInicial={params.trabalho ?? ""}
      storageConfigurado={storageConfigurado()}
    />
  );
}
