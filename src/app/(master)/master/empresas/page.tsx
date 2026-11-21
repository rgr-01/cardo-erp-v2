import { prisma } from "@/lib/prisma";
import { semFiltroEmpresa } from "@/lib/empresa-contexto";
import { normalizarModulos } from "@/lib/modulos";
import { EMPRESA_CARDO_AI } from "@/lib/master";
import { EmpresasTable } from "@/components/admin/empresas-table";

export const metadata = { title: "Empresas — Cardo AI" };

export default async function EmpresasPage() {
  // Visão da Cardo AI: contagens de todas as empresas, sem filtro.
  const empresas = await semFiltroEmpresa(() =>
    prisma.empresa.findMany({
      // A própria Cardo AI não é cliente: fica fora da lista.
      where: { id: { not: EMPRESA_CARDO_AI } },
      include: { _count: { select: { users: true, clientes: true } } },
      orderBy: { createdAt: "asc" },
    })
  );

  return (
    <EmpresasTable
      empresas={empresas.map((e) => ({
        id: e.id,
        nomeFantasia: e.nomeFantasia,
        cnpj: e.cnpj,
        ativo: e.ativo,
        modulos: normalizarModulos(e.modulos),
        qtdUsuarios: e._count.users,
        qtdClientes: e._count.clientes,
        plano: e.plano,
        limiteUsuarios: e.limiteUsuarios,
      }))}
    />
  );
}
