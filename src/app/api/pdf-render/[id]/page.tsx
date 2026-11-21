import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { assinarArquivos, assinarBlocosDeFotos, urlLogoParceiro } from "@/lib/storage";
import { lerConteudo, tipoEfetivoRelatorio, orientacaoDe } from "@/lib/relatorio-conteudo";
import { tokenRenderPdfValido } from "@/lib/relatorio-pdf-web";
import { visitasDoTrabalho } from "@/lib/relatorios-visita";
import { BlocosRender } from "@/components/visitas/blocos-render";
import { MarcaEmpresaProvider } from "@/components/marca-empresa";
import { marcaVisualDaEmpresa } from "@/lib/empresa-marca";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Relatório", robots: { index: false, follow: false } };

// Página só pro Chromium do servidor imprimir em PDF (ver relatorio-pdf-web.ts):
// o mesmo relatório da tela de leitura, sem menu nem botões. Fica em /api pra
// escapar do login; o acesso exige o token assinado que o próprio servidor gera.
export default async function PdfRenderPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ t?: string | string[]; n?: string | string[]; m?: string | string[]; mt?: string | string[]; mb?: string | string[] }>;
}) {
  const { id } = await params;
  const { t, n, m, mt, mb } = await searchParams;
  // Impressão em duas partes (ver relatorio-pdf-web.ts): m=conteudo com as
  // margens mt/mb (mm) de cada folha; m=moldura só com cabeçalho e rodapé.
  const moldura = m === "moldura" ? "so" as const : m === "conteudo" ? "conteudo" as const : undefined;
  const mm = (v: unknown) => (typeof v === "string" && /^\d+(\.\d+)?$/.test(v) ? Number(v) : 0);
  if (!tokenRenderPdfValido(id, typeof t === "string" ? t : undefined)) notFound();

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

  const blocos = await assinarBlocosDeFotos(
    lerConteudo(relatorio.conteudo, relatorio.texto, await assinarArquivos(relatorio.fotos))
  );

  return (
    <div className={`mx-auto w-full ${moldura === "so" ? "" : "bg-white"} ${orientacaoDe(relatorio.orientacao) === "PAISAGEM" ? "max-w-[1448px]" : "max-w-5xl"}`}>
      {/* Folha A4 sem margem: capa e faixas de cabeçalho/rodapé sangram até a borda. */}
      <style>{`
        @page { size: A4 ${orientacaoDe(relatorio.orientacao) === "PAISAGEM" ? "landscape" : "portrait"}; margin: ${moldura === "conteudo" ? `${mm(mt)}mm 0 ${mm(mb)}mm 0` : "0"}; }
        ${moldura === "conteudo" && !relatorio.semCapa ? "@page :first { margin: 0; }" : ""}
        html, body { background: ${moldura === "so" ? "transparent" : "#ffffff"} !important; }
        /* Sombra não se divide na quebra de página: vaza como uma linha no pé da folha anterior. */
        *, *::before, *::after { box-shadow: none !important; }
        /* O Chromium começa o bloco no pé da folha antes de empurrá-lo pra próxima
           e deixa 1px da borda pra trás: a folga transparente é o que fica. */
        .break-inside-avoid { padding-top: 3px; }
      `}</style>
      <MarcaEmpresaProvider marca={await marcaVisualDaEmpresa(relatorio.empresaId)}>
      <BlocosRender
        modoPdf
        blocos={blocos}
        numerosItens={n === "1" ? Object.fromEntries(blocos.map((b, i) => [b.id, i + 1])) : undefined}
        moldura={moldura}
        tipo={tipoEfetivoRelatorio(relatorio.tipo, blocos)}
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
      </MarcaEmpresaProvider>
    </div>
  );
}
