import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { assinarArquivos, assinarBlocosDeFotos, storageConfigurado, urlLogoParceiro } from "@/lib/storage";
import { lerConteudo, tipoEfetivoRelatorio, orientacaoDe } from "@/lib/relatorio-conteudo";
import { NovoRelatorioEditor } from "@/components/visitas/novo-relatorio-editor";

export const metadata = { title: "Editar relatório" };

export default async function EditarRelatorioPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  const ehAdmin = session!.user.role === "ADMIN";

  const relatorio = await prisma.relatorioVisita.findUnique({
    where: { id },
    include: {
      cliente: {
        select: {
          nome: true,
          fazendas: { select: { id: true, nome: true }, orderBy: { nome: "asc" } },
        },
      },
      consultor: { select: { nome: true } },
      safra: { select: { nome: true } },
      fotos: { orderBy: { ordem: "asc" } },
    },
  });

  if (!relatorio) notFound();
  if (!ehAdmin && relatorio.consultorId !== session!.user.id) notFound();

  const blocos = await assinarBlocosDeFotos(lerConteudo(relatorio.conteudo, relatorio.texto, await assinarArquivos(relatorio.fotos)));
  const clientes = await prisma.cliente.findMany({
    select: { id: true, nome: true, fazendas: { select: { id: true, nome: true }, orderBy: { nome: "asc" } } },
    orderBy: { nome: "asc" },
  });

  const tipo = tipoEfetivoRelatorio(relatorio.tipo, blocos);

  return (
    <NovoRelatorioEditor
      clientes={clientes}
      trabalhos={[]}
      consultorNome={relatorio.consultor.nome}
      safraNome={relatorio.safra.nome}
      hoje={new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" })}
      tipoInicial={tipo}
      trabalhoInicial={relatorio.trabalhoId ?? ""}
      storageConfigurado={storageConfigurado()}
      edicao={{
        id: relatorio.id,
        versao: relatorio.updatedAt.toISOString(),
        statusDocumento: relatorio.statusDocumento as "RASCUNHO" | "EM_REVISAO" | "APROVADO",
        podeAprovar: ehAdmin,
        logoParceiroUrl: await urlLogoParceiro(relatorio.logoParceiroPath),
        logoParceiroRotulo: relatorio.logoParceiroRotulo,
        logoPrincipalUrl: await urlLogoParceiro(relatorio.logoPrincipalPath),
        logosBiblioteca: await Promise.all((await prisma.logoRelatorio.findMany({ orderBy: { nome: "asc" } })).map(async (l) => ({ id: l.id, nome: l.nome, tipo: l.tipo, url: await urlLogoParceiro(l.path) }))),
        versoes: (await prisma.relatorioVisitaVersao.findMany({ where: { relatorioId: relatorio.id }, select: { numero: true, criadoEm: true }, orderBy: { numero: "desc" }, take: 8 })).map((versao) => ({ numero: versao.numero, criadoEm: versao.criadoEm.toISOString() })),
        blocos,
        rascunho: {
          // Mesma regra da leitura: relatório antigo salvo como VISITA mas com
          // fotos é técnico.
          tipo,
          categoria: relatorio.categoria ?? (tipo === "TECNICO" ? "TECNICA" : "COMERCIAL"),
          clienteId: relatorio.clienteId,
          fazendaId: relatorio.fazendaId ?? "",
          trabalhoId: relatorio.trabalhoId ?? "",
          mostrarLocalizacao: relatorio.mostrarLocalizacao,
          mostrarHorarios: relatorio.mostrarHorarios,
          semCapa: relatorio.semCapa,
          orientacao: orientacaoDe(relatorio.orientacao),
          escalaLogoPrincipal: relatorio.escalaLogoPrincipal,
          logoPrincipalTexto: relatorio.logoPrincipalTexto ?? "",
          escalaLogoPrincipalPaginas: relatorio.escalaLogoPrincipalPaginas,
          escalaLogoParceiro: relatorio.escalaLogoParceiro,
          escalaLogoParceiroPaginas: relatorio.escalaLogoParceiroPaginas,
          titulo: relatorio.titulo ?? "",
          dataVisita: relatorio.dataVisita.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }),
        },
      }}
    />
  );
}
