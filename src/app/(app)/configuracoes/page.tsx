import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { marcaDaEmpresa } from "@/lib/empresa-marca";
import { NOMES_MODULO } from "@/lib/modulos";
import { urlLogoParceiro } from "@/lib/storage";
import { ConfiguracoesEmpresa } from "@/components/configuracoes/configuracoes-empresa";

export const metadata = { title: "Configurações" };

export default async function ConfiguracoesPage() {
  const session = await auth();
  if (session!.user.role !== "ADMIN") redirect("/dashboard");

  const usuario = await prisma.user.findUnique({ where: { id: session!.user.id }, select: { empresaId: true } });
  const empresa = await prisma.empresa.findUnique({ where: { id: usuario!.empresaId } });
  const marca = await marcaDaEmpresa(usuario!.empresaId);
  if (!empresa || !marca) redirect("/dashboard");
  const logos = await prisma.logoRelatorio.findMany({ orderBy: { nome: "asc" } });
  const [usuariosAtivos, usuariosTotal] = await Promise.all([prisma.user.count({ where: { ativo: true } }), prisma.user.count()]);

  return (
    <ConfiguracoesEmpresa
      dados={{
        nomeFantasia: empresa.nomeFantasia,
        razaoSocial: empresa.razaoSocial ?? "",
        cnpj: empresa.cnpj ?? "",
        regimeTributario: empresa.regimeTributario ?? "",
        endereco: empresa.endereco ?? "",
        cidadeUfCep: empresa.cidadeUfCep ?? "",
        corPrimaria: empresa.corPrimaria ?? "",
      }}
      imagens={{
        logo: marca.logoClaro,
        "logo-escuro": marca.logoEscuro,
        icone: empresa.iconePath ? marca.icone : null,
      }}
      modulos={marca.modulos.map((m) => NOMES_MODULO[m])}
      usuarios={{ ativos: usuariosAtivos, total: usuariosTotal, limite: empresa.limiteUsuarios }}
      logosRelatorio={await Promise.all(
        logos.map(async (l) => ({
          id: l.id,
          nome: l.nome,
          tipo: l.tipo === "PROGRAMA" ? ("PROGRAMA" as const) : ("PARCEIRO" as const),
          url: await urlLogoParceiro(l.path),
        }))
      )}
    />
  );
}
