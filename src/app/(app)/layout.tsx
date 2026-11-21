import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { COOKIE_TEMA, temaValido } from "@/lib/tema";
import { iconeDaEmpresa, marcaDaEmpresa } from "@/lib/empresa-marca";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { sair } from "@/app/actions/auth";
import { AppShell } from "@/components/app-shell";
import { getSafraAtual, getSafras } from "@/lib/safra-atual";
import { prisma } from "@/lib/prisma";
import { modulosParaUsuario } from "@/lib/modulos";
import { criarUrlAssinada, storageConfigurado } from "@/lib/storage";

// Ícone da aba da empresa do usuário logado.
export async function generateMetadata(): Promise<Metadata> {
  const session = await auth();
  if (!session?.user) return {};
  const usuario = await prisma.user.findUnique({ where: { id: session.user.id }, select: { empresaId: true } });
  return { icons: { icon: await iconeDaEmpresa(usuario?.empresaId) } };
}

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  // O JWT pode ter um papel antigo até expirar. A navegação usa o usuário
  // atual para não exibir opções administrativas a um consultor.
  const usuario = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      nome: true,
      role: true,
      ativo: true,
      fotoPath: true,
      superAdmin: true,
      empresaId: true,
      modulosBloqueados: true,
      empresa: { select: { modulos: true } },
    },
  });
  if (!usuario?.ativo) redirect("/login");
  const { nome, role, fotoPath, superAdmin } = usuario;
  // Equipe Cardo AI tem painel próprio, sem as telas das empresas.
  if (superAdmin) redirect("/master");
  const modulos = modulosParaUsuario(usuario.empresa.modulos, usuario.modulosBloqueados, role);

  let fotoUrl: string | null = null;
  if (fotoPath && storageConfigurado()) {
    try {
      fotoUrl = await criarUrlAssinada(fotoPath, 60 * 60 * 6);
    } catch {
      fotoUrl = null;
    }
  }

  const [safras, safraAtual, marcaEmpresa] = await Promise.all([
    getSafras(),
    getSafraAtual(),
    marcaDaEmpresa(usuario.empresaId),
  ]);
  const marca = {
    nome: marcaEmpresa?.nome ?? "Cardo AI",
    claro: marcaEmpresa?.logoClaro ?? null,
    escuro: marcaEmpresa?.logoEscuro ?? null,
  };

  // Página aberta numa janela sobreposta (iframe) de outra tela, ex.: ver/editar
  // relatório dentro de Trabalhos da safra: sem menu lateral nem assistente.
  const embutido = (await headers()).get("sec-fetch-dest") === "iframe";

  return (
    <AppShell
      embutido={embutido}
      nome={nome}
      fotoUrl={fotoUrl}
      role={role}
      modulos={modulos}
      tema={temaValido((await cookies()).get(COOKIE_TEMA)?.value)}
      marca={marca}
      safras={safras}
      safraAtual={safraAtual}
      sair={sair}
    >
      {children}
    </AppShell>
  );
}
