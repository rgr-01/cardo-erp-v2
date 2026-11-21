import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { normalizarModulos } from "@/lib/modulos";
import { usoDaEmpresa } from "@/lib/limites-empresa";
import { EMPRESA_CARDO_AI } from "@/lib/master";
import { EmpresaDetalhe } from "@/components/master/empresa-detalhe";

export const metadata = { title: "Empresa — Cardo AI" };

export default async function EmpresaMasterPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (id === EMPRESA_CARDO_AI) notFound();
  // Usuários vêm pela relação da Empresa (modelo sem filtro de tenant): uma
  // consulta direta em User seria presa à empresa da Cardo AI.
  const empresa = await prisma.empresa.findUnique({
    where: { id },
    include: { users: { select: { id: true, nome: true, email: true, role: true, ativo: true }, orderBy: [{ role: "asc" }, { nome: "asc" }] } },
  });
  if (!empresa) notFound();
  const usuarios = empresa.users;
  const uso = await usoDaEmpresa(id);

  return (
    <EmpresaDetalhe
      empresa={{
        id: empresa.id,
        ativo: empresa.ativo,
        criadaEm: empresa.createdAt.toLocaleDateString("pt-BR"),
        dados: {
          nomeFantasia: empresa.nomeFantasia,
          razaoSocial: empresa.razaoSocial ?? "",
          cnpj: empresa.cnpj ?? "",
          endereco: empresa.endereco ?? "",
          cidadeUfCep: empresa.cidadeUfCep ?? "",
        },
        modulos: normalizarModulos(empresa.modulos),
        plano: {
          plano: empresa.plano ?? "",
          limiteUsuarios: empresa.limiteUsuarios,
          limiteRelatoriosMes: empresa.limiteRelatoriosMes,
          limiteArmazenamentoGb: empresa.limiteArmazenamentoGb,
          observacoesPlano: empresa.observacoesPlano ?? "",
        },
      }}
      usuarios={usuarios}
      uso={uso}
    />
  );
}
