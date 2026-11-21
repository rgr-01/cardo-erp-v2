import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { comEmpresa } from "@/lib/empresa-contexto";
import { assinarArquivos, assinarBlocosDeFotos, urlLogoParceiro } from "@/lib/storage";
import { lerConteudo, tipoEfetivoRelatorio, orientacaoDe } from "@/lib/relatorio-conteudo";
import { gerarPdfRelatorioVisita } from "@/lib/relatorio-pdf";
import { pdfIdenticoAPagina } from "@/lib/relatorio-pdf-web";
import { coordenadasDoRelatorio } from "@/lib/relatorios-visita";

export const runtime = "nodejs";

// PDF disponível somente para quem possui o token secreto do compartilhamento.
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const relatorio = await prisma.relatorioVisita.findUnique({
    where: { tokenCompartilhamento: token },
    include: {
      cliente: { select: { nome: true, latitude: true, longitude: true } },
      fazenda: { select: { nome: true, latitude: true, longitude: true } },
      consultor: { select: { nome: true } }, safra: { select: { nome: true } }, fotos: { orderBy: { ordem: "asc" } },
    },
  });
  if (!relatorio) return new NextResponse("Link não encontrado ou revogado.", { status: 404 });
  // PDF impresso da própria página (idêntico à tela); gerador interno só como reserva.
  // Link público não tem usuário: o PDF de reserva usa a marca da empresa do relatório.
  const bytes = await comEmpresa(relatorio.empresaId, () => pdfIdenticoAPagina(relatorio.id, async () => {
    const blocos = await assinarBlocosDeFotos(lerConteudo(relatorio.conteudo, relatorio.texto, await assinarArquivos(relatorio.fotos)));
    return gerarPdfRelatorioVisita({
      tipo: tipoEfetivoRelatorio(relatorio.tipo, blocos), clienteNome: relatorio.cliente.nome, fazendaNome: relatorio.fazenda?.nome ?? null,
      consultorNome: relatorio.consultor.nome, titulo: relatorio.titulo, dataVisita: relatorio.dataVisita, safraNome: relatorio.safra.nome,
      blocos, logoParceiroUrl: await urlLogoParceiro(relatorio.logoParceiroPath), mostrarLocalizacao: relatorio.mostrarLocalizacao, mostrarHorarios: relatorio.mostrarHorarios, semCapa: relatorio.semCapa,
      orientacao: orientacaoDe(relatorio.orientacao), escalaLogoPrincipal: relatorio.escalaLogoPrincipal, logoPrincipalTexto: relatorio.logoPrincipalTexto, escalaLogoParceiro: relatorio.escalaLogoParceiro, escalaLogoPrincipalPaginas: relatorio.escalaLogoPrincipalPaginas, escalaLogoParceiroPaginas: relatorio.escalaLogoParceiroPaginas, logoParceiroRotulo: relatorio.logoParceiroRotulo, logoPrincipalUrl: await urlLogoParceiro(relatorio.logoPrincipalPath),
      rastreamento: { finalidade: relatorio.finalidade, horaChegada: relatorio.horaChegada, horaSaida: relatorio.horaSaida, kmChegada: relatorio.kmChegada, kmSaida: relatorio.kmSaida, ...coordenadasDoRelatorio(relatorio) },
    });
  }));
  return new NextResponse(Buffer.from(bytes), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="relatorio-${relatorio.cliente.nome.replace(/[^a-zA-Z0-9]+/g, "-")}.pdf"` } });
}
