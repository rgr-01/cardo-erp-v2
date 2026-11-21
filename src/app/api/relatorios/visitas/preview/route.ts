import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { coordenadasDoRelatorio } from "@/lib/relatorios-visita";
import { conteudoSchema } from "@/lib/relatorio-conteudo";
import { gerarPdfRelatorioVisita } from "@/lib/relatorio-pdf";
import { urlLogoParceiro } from "@/lib/storage";

export const runtime = "nodejs";

const MAX_FOTO = 8 * 1024 * 1024;

export async function POST(request: Request) {
  const session = await auth();
  if (!session) return new NextResponse("Não autorizado", { status: 401 });

  try {
    const formData = await request.formData();
    const conteudoBruto = formData.get("conteudo");
    if (typeof conteudoBruto !== "string") throw new Error("Conteúdo inválido.");
    const blocos = conteudoSchema.parse(JSON.parse(conteudoBruto));
    const arquivos = formData.getAll("fotos").filter((item): item is File => item instanceof File);
    // Foto já salva (URL http) segue como está; só as recém-escolhidas no
    // navegador (blob:/rascunho:) chegam como arquivo.
    const jaSalva = (url: string) => /^https?:/i.test(url);
    const fotos = blocos.filter((bloco) => bloco.tipo === "foto" && !jaSalva(bloco.url));
    if (fotos.length !== arquivos.length) throw new Error("As fotos da prévia estão incompletas.");

    let indiceFoto = 0;
    const blocosComFotos = await Promise.all(blocos.map(async (bloco) => {
      if (bloco.tipo !== "foto" || jaSalva(bloco.url)) return bloco;
      const arquivo = arquivos[indiceFoto++];
      if (!arquivo.type.startsWith("image/")) throw new Error("Um dos arquivos não é uma imagem.");
      if (arquivo.size > MAX_FOTO) throw new Error(`A foto "${arquivo.name}" excede 8MB.`);
      const base64 = Buffer.from(await arquivo.arrayBuffer()).toString("base64");
      return { ...bloco, url: `data:${arquivo.type};base64,${base64}`, path: null };
    }));

    // Relatório já salvo: check-in, horários e localização vêm do banco.
    const relatorioId = String(formData.get("relatorioId") || "");
    const salvo = relatorioId
      ? await prisma.relatorioVisita.findUnique({
          where: { id: relatorioId },
          select: {
            consultorId: true,
            logoParceiroPath: true,
            logoParceiroRotulo: true,
            logoPrincipalPath: true,
            finalidade: true,
            horaChegada: true,
            horaSaida: true,
            kmChegada: true,
            kmSaida: true,
            latitude: true,
            longitude: true,
            cliente: { select: { latitude: true, longitude: true } },
            fazenda: { select: { latitude: true, longitude: true } },
            consultor: { select: { nome: true } },
            safra: { select: { nome: true } },
          },
        })
      : null;
    if (salvo && session.user.role !== "ADMIN" && salvo.consultorId !== session.user.id) {
      throw new Error("Esse relatório não é seu.");
    }

    const dataTexto = String(formData.get("dataVisita") || "");
    const dataVisita = /^\d{4}-\d{2}-\d{2}$/.test(dataTexto)
      ? new Date(`${dataTexto}T12:00:00-03:00`)
      : new Date();
    const bytes = await gerarPdfRelatorioVisita({
      tipo: formData.get("tipo") === "TECNICO" ? "TECNICO" : "VISITA",
      clienteNome: String(formData.get("clienteNome") || "Cliente não selecionado"),
      fazendaNome: String(formData.get("fazendaNome") || "") || null,
      consultorNome: salvo?.consultor.nome ?? session.user.nome,
      titulo: String(formData.get("titulo") || "") || null,
      dataVisita,
      blocos: blocosComFotos,
      logoParceiroUrl: await urlLogoParceiro(salvo?.logoParceiroPath),
      safraNome: salvo?.safra.nome,
      rastreamento: salvo
        ? {
            finalidade: salvo.finalidade,
            horaChegada: salvo.horaChegada,
            horaSaida: salvo.horaSaida,
            kmChegada: salvo.kmChegada,
            kmSaida: salvo.kmSaida,
            ...coordenadasDoRelatorio(salvo),
          }
        : undefined,
      mostrarLocalizacao: formData.get("mostrarLocalizacao") !== "0",
      mostrarHorarios: formData.get("mostrarHorarios") !== "0",
      semCapa: formData.get("semCapa") === "1",
      orientacao: formData.get("orientacao") === "RETRATO" ? "RETRATO" : "PAISAGEM",
      escalaLogoPrincipal: Number(formData.get("escalaLogoPrincipal")) || 1,
      logoPrincipalTexto: String(formData.get("logoPrincipalTexto") || "").trim() || null,
      escalaLogoPrincipalPaginas: Number(formData.get("escalaLogoPrincipalPaginas")) || 1,
      escalaLogoParceiro: Number(formData.get("escalaLogoParceiro")) || 1,
      escalaLogoParceiroPaginas: Number(formData.get("escalaLogoParceiroPaginas")) || 1,
      logoParceiroRotulo: salvo?.logoParceiroRotulo ?? null,
      logoPrincipalUrl: await urlLogoParceiro(salvo?.logoPrincipalPath),
    });
    return new NextResponse(Buffer.from(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": "inline; filename=previa-relatorio.pdf",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const mensagem = error instanceof Error ? error.message : "Não foi possível gerar a prévia.";
    return NextResponse.json({ erro: mensagem }, { status: 400 });
  }
}
