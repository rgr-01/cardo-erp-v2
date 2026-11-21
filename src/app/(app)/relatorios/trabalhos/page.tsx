import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getSafraAtual } from "@/lib/safra-atual";
import { listarAvulsos, listarTrabalhos } from "@/lib/servicos/trabalhos";
import { TrabalhosPainel } from "@/components/visitas/trabalhos-painel";

export const metadata = { title: "Geração de demanda" };

export default async function TrabalhosPage() {
  const session = await auth();
  const sessao = {
    id: session!.user.id,
    nome: session!.user.name ?? "",
    role: session!.user.role,
  };
  const safra = await getSafraAtual();

  const [trabalhos, avulsos, clientes] = await Promise.all([
    listarTrabalhos(safra.id),
    listarAvulsos(sessao, safra.id),
    prisma.cliente.findMany({ select: { id: true, nome: true }, orderBy: { nome: "asc" } }),
  ]);

  return (
    <TrabalhosPainel
      safraNome={safra.nome}
      trabalhos={trabalhos}
      avulsos={avulsos}
      clientes={clientes}
      ehAdmin={sessao.role === "ADMIN"}
    />
  );
}
