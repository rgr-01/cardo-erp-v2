import { notFound } from "next/navigation";
import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { assinarArquivos, assinarBlocosDeFotos, urlLogoParceiro } from "@/lib/storage";
import { lerConteudo, tipoEfetivoRelatorio, orientacaoDe } from "@/lib/relatorio-conteudo";
import { BlocosRender } from "@/components/visitas/blocos-render";
import { visitasDoTrabalho } from "@/lib/relatorios-visita";
import { BotaoVoltarRelatorio } from "@/components/visitas/botao-voltar-relatorio";
import { BotaoImprimir } from "@/components/visitas/botao-imprimir";
import { BotaoCompartilharRelatorio } from "@/components/visitas/botao-compartilhar-relatorio";
import { categoriaEfetiva, corDaCategoria, rotuloDaCategoria } from "@/lib/visitas-categoria";

export const metadata = { title: "Relatório de visita" };

export default async function RelatorioVisitaPage({
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
      cliente: { select: { nome: true } },
      fazenda: { select: { nome: true } },
      consultor: { select: { nome: true } },
      safra: { select: { nome: true } },
      fotos: { orderBy: { ordem: "asc" } },
    },
  });

  if (!relatorio) notFound();
  if (!ehAdmin && relatorio.consultorId !== session!.user.id) notFound();

  const blocos = await assinarBlocosDeFotos(lerConteudo(relatorio.conteudo, relatorio.texto, await assinarArquivos(relatorio.fotos)));
  const podeEditar = ehAdmin || relatorio.consultorId === session!.user.id;
  // Antes de existir a separação de tipos, alguns relatórios técnicos foram
  // salvos como VISITA. Fotos são exclusivas do técnico, então preservamos a
  // classificação correta na leitura sem alterar os dados antigos.
  const tipo = tipoEfetivoRelatorio(relatorio.tipo, blocos);
  const categoria = categoriaEfetiva({ categoria: relatorio.categoria, tipo });
  const agendada = relatorio.status === "AGENDADA";

  return (
    <article className="mx-auto max-w-5xl pb-10">
      <div className="mb-5 print:hidden">
        <BotaoVoltarRelatorio className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-red-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950">
          Voltar
        </BotaoVoltarRelatorio>
      </div>

      <header className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-white/[0.08] pb-6 print:hidden">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-accent">
            {agendada ? "Visita agendada" : tipo === "TECNICO" ? "Relatório técnico" : "Relatório de visita"}
            <span
              className="ml-3 rounded-full px-2 py-0.5 text-[11px] font-semibold normal-case tracking-normal"
              style={{ backgroundColor: `${corDaCategoria(categoria)}26`, color: corDaCategoria(categoria) }}
            >
              {rotuloDaCategoria(categoria)}
            </span>
          </p>
          <h1 className="text-2xl font-bold tracking-tight text-white">
            {relatorio.cliente.nome}
            {relatorio.titulo ? (
              <span className="font-normal text-secondary"> — {relatorio.titulo}</span>
            ) : null}
          </h1>
          <p className="mt-1 text-sm text-secondary">
            {relatorio.dataVisita.toLocaleDateString("pt-BR")}
            {agendada ? ` às ${relatorio.dataVisita.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" })}` : ""} ·{" "}
            {relatorio.consultor.nome}
          </p>
        </div>
        <div className="flex gap-2 print:hidden">
          {relatorio.linkExterno && (
            <a
              href={relatorio.linkExterno}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg border border-surface-border px-4 py-2 text-sm font-medium text-zinc-300 hover:bg-zinc-800"
            >
              Abrir no TBDC
            </a>
          )}
          <BotaoImprimir relatorioId={relatorio.id} />
          {podeEditar && <BotaoCompartilharRelatorio relatorioId={relatorio.id} ativoInicial={Boolean(relatorio.tokenCompartilhamento)} />}
          {podeEditar && (
            <Link
              href={`/relatorios/visitas/${relatorio.id}/editar`}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground hover:brightness-110"
            >
              Editar
            </Link>
          )}
        </div>
      </header>

      <BlocosRender
        blocos={blocos}
        tipo={tipo}
        clienteNome={relatorio.cliente.nome}
        fazendaNome={relatorio.fazenda?.nome ?? null}
        titulo={relatorio.titulo}
        dataVisita={relatorio.dataVisita.toLocaleDateString("pt-BR")}
        consultorNome={relatorio.consultor.nome}
        logoParceiroUrl={await urlLogoParceiro(relatorio.logoParceiroPath)}
        semCapa={relatorio.semCapa} visitasTrabalho={await visitasDoTrabalho(relatorio)}
        safraNome={relatorio.safra.nome}
        logoParceiroRotulo={relatorio.logoParceiroRotulo}
        logoPrincipalUrl={await urlLogoParceiro(relatorio.logoPrincipalPath)}
        orientacao={orientacaoDe(relatorio.orientacao)}
        escalaLogoPrincipal={relatorio.escalaLogoPrincipal}
        logoPrincipalTexto={relatorio.logoPrincipalTexto}
        escalaLogoPrincipalPaginas={relatorio.escalaLogoPrincipalPaginas}
        escalaLogoParceiro={relatorio.escalaLogoParceiro}
        escalaLogoParceiroPaginas={relatorio.escalaLogoParceiroPaginas}
      />
    </article>
  );
}
