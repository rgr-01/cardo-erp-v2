import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import { comEmpresa, semFiltroEmpresa } from "@/lib/empresa-contexto";
import { normalizarModulos } from "@/lib/modulos";
import { combinadosPendentes } from "@/lib/combinados";
import { previsaoTempo } from "@/lib/clima";
import { sintetizarVoz } from "@/lib/whatsapp/audio";
import { enviarAudio, enviarMensagemTexto } from "@/lib/whatsapp/transporte";

export const runtime = "nodejs";
export const maxDuration = 300;

// Chamada todo dia às 7h de Brasília pelo agendador (GitHub Actions, ver
// .github/workflows/agenda-bot.yml) com "Authorization: Bearer <CRON_SECRET>".
// - Todo dia: lembra no WhatsApp os combinados que vencem hoje ou atrasados
//   (uma vez por dia por combinado).
// - Segunda (ou ?semanal=1): resumo da semana em áudio + texto — visitas da
//   semana passada, combinados da semana e chuva prevista nas fazendas.
export async function GET(request: Request) {
  if (!autorizado(request)) return Response.json({ erro: "Não autorizado." }, { status: 401 });
  const url = new URL(request.url);
  const agora = new Date();
  const semanal = url.searchParams.get("semanal") === "1"
    || agora.toLocaleDateString("en-US", { timeZone: "America/Sao_Paulo", weekday: "short" }) === "Mon";

  const empresas = await semFiltroEmpresa(() =>
    prisma.empresa.findMany({ where: { ativo: true }, select: { id: true, nomeFantasia: true, modulos: true } })
  );
  const resultados = [];
  for (const empresa of empresas) {
    if (!normalizarModulos(empresa.modulos).includes("VISITAS")) continue;
    const enviados = await comEmpresa(empresa.id, () => rodarEmpresa(agora, semanal));
    resultados.push({ empresa: empresa.nomeFantasia, ...enviados });
  }
  return Response.json({ semanal, empresas: resultados });
}

const dia = (d: Date) => d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" });

function fimDoDia(d: Date): Date {
  const hoje = d.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  return new Date(`${hoje}T23:59:59-03:00`);
}

async function rodarEmpresa(agora: Date, semanal: boolean) {
  const vinculos = await prisma.whatsAppVinculo.findMany({
    // Quem teve Gestão de Visitas desligado pelo admin não recebe lembrete.
    where: { waId: { not: null }, user: { ativo: true, NOT: { modulosBloqueados: { has: "VISITAS" } } } },
    select: { waId: true, user: { select: { id: true, nome: true } } },
  });
  let lembretes = 0, resumos = 0;
  const inicioHoje = new Date(fimDoDia(agora).getTime() - 86_400_000 + 1000);

  for (const vinculo of vinculos) {
    const waId = vinculo.waId!;
    const primeiroNome = vinculo.user.nome.split(" ")[0];
    try {
      // Lembrete diário.
      const vencendo = (await combinadosPendentes({ consultorId: vinculo.user.id, ate: fimDoDia(agora) }))
        .filter((c) => c.dataPrevista);
      const aAvisar = await prisma.combinado.findMany({
        where: { id: { in: vencendo.map((c) => c.id) }, OR: [{ avisadoEm: null }, { avisadoEm: { lt: inicioHoje } }] },
        select: { id: true },
      });
      const ids = new Set(aAvisar.map((c) => c.id));
      const lista = vencendo.filter((c) => ids.has(c.id));
      if (lista.length > 0 && !semanal) {
        const linhas = lista.map((c) => {
          const atrasado = c.dataPrevista!.getTime() < inicioHoje.getTime();
          return `• ${c.cliente.nome}: ${c.texto}${atrasado ? ` (era pra ${dia(c.dataPrevista!)})` : ""}`;
        });
        await enviarMensagemTexto(waId,
          `Bom dia, ${primeiroNome}! Pra hoje ficou combinado:\n${linhas.join("\n")}\n\nQuando fizer, me conta que eu dou baixa.`);
        await prisma.combinado.updateMany({ where: { id: { in: [...ids] } }, data: { avisadoEm: agora } });
        lembretes++;
      }

      if (semanal) {
        const resumo = await resumoDaSemana(vinculo.user.id, agora);
        if (!resumo) continue;
        await enviarMensagemTexto(waId, `Bom dia, ${primeiroNome}! Resumo da semana:\n\n${resumo.texto}`);
        const voz = await sintetizarVoz(`Bom dia, ${primeiroNome}! ${resumo.falado}`);
        if (voz) await enviarAudio(waId, voz);
        if (lista.length) await prisma.combinado.updateMany({ where: { id: { in: [...ids] } }, data: { avisadoEm: agora } });
        resumos++;
      }
    } catch (e) {
      console.error(`[agenda-bot] falhou para ${vinculo.user.nome}:`, e);
    }
  }
  return { lembretes, resumos };
}

async function resumoDaSemana(consultorId: string, agora: Date): Promise<{ texto: string; falado: string } | null> {
  const semanaPassada = new Date(agora.getTime() - 7 * 86_400_000);
  const proximaSemana = new Date(fimDoDia(agora).getTime() + 6 * 86_400_000);
  const [visitas, combinados] = await Promise.all([
    prisma.relatorioVisita.findMany({
      where: { consultorId, dataVisita: { gte: semanaPassada, lte: agora } },
      select: {
        cliente: { select: { nome: true } },
        fazenda: { select: { id: true, nome: true, latitude: true, longitude: true } },
      },
    }),
    combinadosPendentes({ consultorId, ate: proximaSemana }),
  ]);
  if (visitas.length === 0 && combinados.length === 0) return null;

  const clientes = [...new Set(visitas.map((v) => v.cliente.nome))];
  const atrasados = combinados.filter((c) => c.dataPrevista && c.dataPrevista.getTime() < agora.getTime() - 86_400_000);
  const daSemana = combinados.filter((c) => !atrasados.includes(c));

  // Chuva dos próximos 7 dias nas fazendas visitadas (até 3, com coordenada).
  const fazendas = [...new Map(visitas.flatMap((v) => (v.fazenda?.latitude != null && v.fazenda.longitude != null ? [[v.fazenda.id, v.fazenda] as const] : []))).values()].slice(0, 3);
  const chuvas = await Promise.all(fazendas.map(async (f) => {
    try {
      const dias = (await previsaoTempo(f.latitude!, f.longitude!, 7));
      return { nome: f.nome, total: Math.round(dias.reduce((s, d) => s + d.chuvaMm, 0)), dias: dias.filter((d) => d.chuvaMm >= 5).map((d) => d.data) };
    } catch {
      return null;
    }
  }));

  const texto = [
    `📋 Semana passada: ${visitas.length} visita${visitas.length === 1 ? "" : "s"}${clientes.length ? ` (${clientes.slice(0, 6).join(", ")}${clientes.length > 6 ? "…" : ""})` : ""}.`,
    atrasados.length ? `⚠️ Atrasados:\n${atrasados.map((c) => `• ${c.cliente.nome}: ${c.texto} (${dia(c.dataPrevista!)})`).join("\n")}` : null,
    daSemana.length ? `🗓️ Combinados da semana:\n${daSemana.map((c) => `• ${c.dataPrevista ? `${dia(c.dataPrevista)} — ` : ""}${c.cliente.nome}: ${c.texto}`).join("\n")}` : null,
    chuvas.some(Boolean) ? `🌧️ Chuva prevista (7 dias):\n${chuvas.filter(Boolean).map((c) => `• ${c!.nome}: ${c!.total} mm${c!.dias.length ? ` (mais forte ${c!.dias.join(", ")})` : ""}`).join("\n")}` : null,
  ].filter(Boolean).join("\n\n");

  const falado = [
    `Semana passada você fez ${visitas.length} visita${visitas.length === 1 ? "" : "s"}.`,
    atrasados.length ? `Tem ${atrasados.length} combinado${atrasados.length === 1 ? "" : "s"} atrasado${atrasados.length === 1 ? "" : "s"}.` : null,
    daSemana.length ? `Pra essa semana são ${daSemana.length} combinado${daSemana.length === 1 ? "" : "s"}.` : null,
    "Os detalhes estão aqui na mensagem.",
  ].filter(Boolean).join(" ");
  return { texto, falado };
}

function autorizado(request: Request): boolean {
  const segredo = process.env.CRON_SECRET;
  const cabecalho = request.headers.get("authorization") ?? "";
  const recebido = cabecalho.startsWith("Bearer ") ? cabecalho.slice(7) : "";
  if (!segredo || !recebido) return false;
  const a = Buffer.from(recebido), b = Buffer.from(segredo);
  return a.byteLength === b.byteLength && crypto.timingSafeEqual(a, b);
}
