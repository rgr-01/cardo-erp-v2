import crypto from "node:crypto";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { comEmpresa, semFiltroEmpresa } from "@/lib/empresa-contexto";
import { normalizarModulos } from "@/lib/modulos";
import {
  enviarRelatorioMensal,
  hojeEmBrasilia,
  montarRelatorioMensal,
  chaveCompetencia,
  type Competencia,
} from "@/lib/relatorio-mensal";

export const runtime = "nodejs";
// Resumo da IA por consultor + PDF + envio com novas tentativas.
export const maxDuration = 300;

// Chamada diária pelo agendador (GitHub Actions) com
// "Authorization: Bearer <CRON_SECRET>". Só envia no último dia do mês
// (horário de Brasília); nos outros dias responde "ignorado".
//
//   ?mes=2026-09    competência específica (envia mesmo fora do último dia)
//   ?reenviar=1     envia de novo pra quem já recebeu essa competência
//   ?previa=1       só devolve o PDF, sem enviar — admin logado também pode
export async function GET(request: Request) {
  const url = new URL(request.url);
  const previa = url.searchParams.get("previa") === "1";

  if (!(await autorizado(request, previa))) {
    return Response.json({ erro: "Não autorizado." }, { status: 401 });
  }

  const hoje = hojeEmBrasilia();
  const mesParam = url.searchParams.get("mes");
  let competencia: Competencia = { ano: hoje.ano, mes: hoje.mes };
  if (mesParam) {
    const m = /^(\d{4})-(\d{2})$/.exec(mesParam);
    if (!m || Number(m[2]) < 1 || Number(m[2]) > 12) {
      return Response.json({ erro: "Use mes=AAAA-MM." }, { status: 400 });
    }
    competencia = { ano: Number(m[1]), mes: Number(m[2]) };
  }

  if (previa) {
    const { pdf } = await montarRelatorioMensal(competencia);
    const body = pdf.buffer.slice(pdf.byteOffset, pdf.byteOffset + pdf.byteLength) as ArrayBuffer;
    return new Response(body, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="relatorio-visitas-${chaveCompetencia(competencia)}.pdf"`,
      },
    });
  }

  if (!mesParam && !hoje.ultimoDia) {
    return Response.json({ ignorado: "Hoje não é o último dia do mês." });
  }

  // Um relatório por empresa (com Gestão de Visitas), cada um preso à sua
  // empresa: consultores, visitas e destinatários não se misturam.
  const empresas = await semFiltroEmpresa(() =>
    prisma.empresa.findMany({ where: { ativo: true }, select: { id: true, nomeFantasia: true, modulos: true } })
  );
  const resultados = [];
  for (const empresa of empresas) {
    if (!normalizarModulos(empresa.modulos).includes("VISITAS")) continue;
    const resultado = await comEmpresa(empresa.id, () =>
      enviarRelatorioMensal(competencia, { reenviar: url.searchParams.get("reenviar") === "1" })
    );
    resultados.push({ empresa: empresa.nomeFantasia, ...resultado });
  }
  return Response.json({ empresas: resultados });
}

async function autorizado(request: Request, previa: boolean): Promise<boolean> {
  const segredo = process.env.CRON_SECRET;
  const cabecalho = request.headers.get("authorization") ?? "";
  const recebido = cabecalho.startsWith("Bearer ") ? cabecalho.slice(7) : "";
  if (segredo && recebido) {
    const a = Buffer.from(recebido);
    const b = Buffer.from(segredo);
    if (a.byteLength === b.byteLength && crypto.timingSafeEqual(a, b)) return true;
  }
  if (previa) {
    const session = await auth();
    return session?.user?.role === "ADMIN";
  }
  return false;
}
