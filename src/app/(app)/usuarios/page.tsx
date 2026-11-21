import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { UsuariosTable } from "@/components/usuarios/usuarios-table";
import { modulosDaSessao } from "@/lib/modulos-servidor";

export const metadata = { title: "Usuários" };

export default async function UsuariosPage() {
  const session = await auth();
  if (session!.user.role !== "ADMIN") redirect("/dashboard");

  const usuarios = await prisma.user.findMany({
    include: { _count: { select: { vendas: true, clientes: true } } },
    orderBy: { nome: "asc" },
  });
  // Admin enxerga todos os módulos da empresa: é o que dá para ligar por usuário.
  const modulosEmpresa = await modulosDaSessao();

  return (
    <div className="space-y-3">
    <Link href="/configuracoes" className="inline-flex items-center gap-1 text-xs text-secondary hover:text-white"><ArrowLeft size={13} /> Configurações</Link>
    <UsuariosTable
      meuId={session!.user.id}
      modulosEmpresa={modulosEmpresa}
      usuarios={usuarios.map((u) => ({
        id: u.id,
        nome: u.nome,
        email: u.email,
        role: u.role,
        ativo: u.ativo,
        modulosBloqueados: u.modulosBloqueados,
        qtdVendas: u._count.vendas,
        qtdClientes: u._count.clientes,
      }))}
    />
    </div>
  );
}
