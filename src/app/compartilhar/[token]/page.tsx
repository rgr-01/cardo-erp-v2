import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { assinarArquivos, assinarBlocosDeFotos, urlLogoParceiro } from "@/lib/storage";
import { lerConteudo, tipoEfetivoRelatorio, orientacaoDe } from "@/lib/relatorio-conteudo";
import { BlocosRender } from "@/components/visitas/blocos-render";
import { visitasDoTrabalho } from "@/lib/relatorios-visita";
import { MarcaEmpresaProvider } from "@/components/marca-empresa";
import { marcaVisualDaEmpresa } from "@/lib/empresa-marca";

export const metadata: Metadata = { title: "Documento compartilhado", robots: { index: false, follow: false } };

export default async function DocumentoCompartilhadoPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const relatorio = await prisma.relatorioVisita.findUnique({
    where: { tokenCompartilhamento: token },
    include: { cliente: { select: { nome: true } }, fazenda: { select: { nome: true } }, consultor: { select: { nome: true } }, safra: { select: { nome: true } }, fotos: { orderBy: { ordem: "asc" } } },
  });
  if (!relatorio) notFound();
  const blocos = await assinarBlocosDeFotos(lerConteudo(relatorio.conteudo, relatorio.texto, await assinarArquivos(relatorio.fotos)));
  const tipo = tipoEfetivoRelatorio(relatorio.tipo, blocos);
  return <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-8"><header className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-white/10 pb-5"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Documento compartilhado</p><h1 className="mt-2 text-2xl font-bold">{relatorio.titulo || (tipo === "TECNICO" ? "Relatório técnico" : "Relatório de visita")}</h1><p className="mt-1 text-sm text-secondary">{relatorio.cliente.nome} · {relatorio.dataVisita.toLocaleDateString("pt-BR")} · {relatorio.consultor.nome}</p></div><a href={`/compartilhar/${token}/pdf`} className="rounded-lg border border-white/15 px-4 py-2 text-sm font-semibold text-zinc-200 hover:bg-white/10">Baixar PDF</a></header><MarcaEmpresaProvider marca={await marcaVisualDaEmpresa(relatorio.empresaId)}><BlocosRender blocos={blocos} tipo={tipo} clienteNome={relatorio.cliente.nome} fazendaNome={relatorio.fazenda?.nome ?? null} titulo={relatorio.titulo} dataVisita={relatorio.dataVisita.toLocaleDateString("pt-BR")} consultorNome={relatorio.consultor.nome} logoParceiroUrl={await urlLogoParceiro(relatorio.logoParceiroPath)} semCapa={relatorio.semCapa} visitasTrabalho={await visitasDoTrabalho(relatorio)} safraNome={relatorio.safra.nome} logoParceiroRotulo={relatorio.logoParceiroRotulo} logoPrincipalUrl={await urlLogoParceiro(relatorio.logoPrincipalPath)} orientacao={orientacaoDe(relatorio.orientacao)} escalaLogoPrincipal={relatorio.escalaLogoPrincipal} logoPrincipalTexto={relatorio.logoPrincipalTexto} escalaLogoParceiro={relatorio.escalaLogoParceiro} escalaLogoPrincipalPaginas={relatorio.escalaLogoPrincipalPaginas} escalaLogoParceiroPaginas={relatorio.escalaLogoParceiroPaginas} /></MarcaEmpresaProvider></main>;
}
