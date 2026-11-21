// Relato mensal de visitas por consultor, enviado no WhatsApp dos admins no
// último dia do mês (disparado pela rota /api/cron/relatorio-mensal).

import { prisma } from "@/lib/prisma";
import { fmtDataHoraBrasilia, fmtNum } from "@/lib/format";
import { gerarPdfRelatorioMensalVisitas } from "@/lib/pdf";
import { recenciaDosClientes } from "@/lib/visitas-calendario";
import { enviarDocumento, enviarMensagemTexto } from "@/lib/whatsapp/transporte";

const MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

export type Competencia = { ano: number; mes: number }; // mes 1-12

export function chaveCompetencia({ ano, mes }: Competencia): string {
  return `${ano}-${String(mes).padStart(2, "0")}`;
}

function nomeCompetencia({ ano, mes }: Competencia): string {
  const nome = MESES[mes - 1];
  return `${nome[0].toUpperCase()}${nome.slice(1)} de ${ano}`;
}

// Hoje (Brasília) e se é o último dia do mês.
export function hojeEmBrasilia(agora = new Date()): Competencia & { dia: number; ultimoDia: boolean } {
  const [ano, mes, dia] = agora
    .toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" })
    .split("-")
    .map(Number);
  const diasNoMes = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  return { ano, mes, dia, ultimoDia: dia === diasNoMes };
}

function intervaloBrasilia({ ano, mes }: Competencia) {
  const mm = String(mes).padStart(2, "0");
  const proximo = mes === 12 ? { ano: ano + 1, mes: 1 } : { ano, mes: mes + 1 };
  const pm = String(proximo.mes).padStart(2, "0");
  return {
    inicio: new Date(`${ano}-${mm}-01T00:00:00-03:00`),
    fim: new Date(`${proximo.ano}-${pm}-01T00:00:00-03:00`),
  };
}

function fmtHoras(ms: number): string {
  const minutos = Math.round(ms / 60000);
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  if (h === 0) return `${m}min`;
  return m ? `${h}h${String(m).padStart(2, "0")}` : `${h}h`;
}

type ResumoConsultor = {
  nome: string;
  visitas: number;
  tecnicos: number;
  clientes: number;
  km: number;
  msEmCampo: number;
  semVisita30: number;
  clientesSemVisita: { cliente: string; dias: number | null }[];
  relatos: string[];
  detalhe: { data: string; cliente: string; tipo: string; km: string; tempo: string }[];
  resumo: string | null;
};

export async function dadosDoMes(competencia: Competencia): Promise<ResumoConsultor[]> {
  const { inicio, fim } = intervaloBrasilia(competencia);

  const [usuarios, visitas] = await Promise.all([
    prisma.user.findMany({
      where: { ativo: true },
      select: { id: true, nome: true, _count: { select: { clientes: true } } },
      orderBy: { nome: "asc" },
    }),
    prisma.relatorioVisita.findMany({
      where: { dataVisita: { gte: inicio, lt: fim }, status: { not: "AGENDADA" } },
      select: {
        consultorId: true,
        clienteId: true,
        tipo: true,
        texto: true,
        finalidade: true,
        dataVisita: true,
        horaChegada: true,
        horaSaida: true,
        kmChegada: true,
        kmSaida: true,
        cliente: { select: { nome: true } },
        _count: { select: { fotos: true } },
      },
      orderBy: { dataVisita: "asc" },
    }),
  ]);

  const resumos: ResumoConsultor[] = [];
  for (const u of usuarios) {
    const doConsultor = visitas.filter((v) => v.consultorId === u.id);
    // Quem não visitou nada e não tem carteira não entra no relato.
    if (doConsultor.length === 0 && u._count.clientes === 0) continue;

    let km = 0;
    let msEmCampo = 0;
    const detalhe = doConsultor.map((v) => {
      const kmVisita =
        v.kmChegada != null && v.kmSaida != null && v.kmSaida >= v.kmChegada
          ? v.kmSaida - v.kmChegada
          : null;
      const ms =
        v.horaChegada && v.horaSaida ? v.horaSaida.getTime() - v.horaChegada.getTime() : null;
      if (kmVisita) km += kmVisita;
      if (ms && ms > 0) msEmCampo += ms;
      return {
        data: v.dataVisita.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }),
        cliente: v.cliente.nome,
        tipo: v.tipo === "TECNICO" || v._count.fotos > 0 ? "Tecnica" : "Visita",
        km: kmVisita != null ? `${fmtNum(kmVisita)} km` : "-",
        tempo: ms && ms > 0 ? fmtHoras(ms) : "-",
      };
    });

    const carteira = u._count.clientes > 0 ? await recenciaDosClientes({ consultorId: u.id }) : [];
    const semVisita = carteira
      .filter((c) => c.dias === null || c.dias > 30)
      .sort((a, b) => (b.dias ?? Infinity) - (a.dias ?? Infinity));

    resumos.push({
      nome: u.nome,
      visitas: doConsultor.length,
      tecnicos: detalhe.filter((d) => d.tipo === "Tecnica").length,
      clientes: new Set(doConsultor.map((v) => v.clienteId)).size,
      km,
      msEmCampo,
      semVisita30: semVisita.length,
      clientesSemVisita: semVisita.slice(0, 10).map((c) => ({ cliente: c.nome, dias: c.dias })),
      // Relato de verdade: o texto provisório do check-in é só a finalidade.
      relatos: doConsultor
        .filter((v) => v.texto.trim() && v.texto.trim() !== (v.finalidade ?? "").trim())
        .map((v) => `${v.cliente.nome}: ${v.texto.trim()}`),
      detalhe,
      resumo: null,
    });
  }
  return resumos;
}

// 2-3 frases sobre o mês do consultor a partir dos relatos. null se não
// houver relato ou a IA falhar — o relatório sai só com os números.
async function resumirComIA(nome: string, relatos: string[]): Promise<string | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || relatos.length === 0) return null;

  try {
    const resp = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
        instructions:
          "Você resume o mês de trabalho de campo de um consultor comercial do agronegócio para o gestor dele. " +
          "Escreva 2 ou 3 frases objetivas em português do Brasil, sem markdown: principais clientes/assuntos, " +
          "problemas de lavoura relatados e oportunidades de venda. Use só o que está nos relatos, não invente.",
        input: `Consultor: ${nome}\n\nRelatos das visitas do mês:\n${relatos.join("\n---\n").slice(0, 12000)}`,
      }),
    });
    const data = (await resp.json().catch(() => null)) as {
      output?: { type?: string; content?: { type?: string; text?: string }[] }[];
    } | null;
    if (!resp.ok || !data?.output) return null;
    const texto = data.output
      .filter((item) => item.type === "message")
      .flatMap((item) => item.content ?? [])
      .filter((c) => c.type === "output_text")
      .map((c) => c.text ?? "")
      .join(" ")
      .trim();
    return texto || null;
  } catch (error) {
    console.warn("[Relatório mensal] falha no resumo da IA:", error);
    return null;
  }
}

function totaisDaEquipe(resumos: ResumoConsultor[]) {
  return resumos.reduce(
    (acc, r) => ({
      visitas: acc.visitas + r.visitas,
      tecnicos: acc.tecnicos + r.tecnicos,
      km: acc.km + r.km,
      ms: acc.ms + r.msEmCampo,
    }),
    { visitas: 0, tecnicos: 0, km: 0, ms: 0 }
  );
}

function textoWhatsApp(competencia: Competencia, resumos: ResumoConsultor[]): string {
  const total = totaisDaEquipe(resumos);

  const partes = [
    `📊 *Relatório de visitas — ${nomeCompetencia(competencia)}*`,
    `Equipe: ${total.visitas} visitas (${total.tecnicos} técnicas) · ${fmtNum(total.km)} km · ${fmtHoras(total.ms)} em campo`,
  ];
  for (const r of resumos) {
    const linhas = [
      `*${r.nome}* — ${r.visitas === 0 ? "nenhuma visita" : `${r.visitas} visita${r.visitas > 1 ? "s" : ""} · ${r.clientes} cliente${r.clientes > 1 ? "s" : ""} · ${fmtNum(r.km)} km · ${fmtHoras(r.msEmCampo)}`}`,
    ];
    if (r.resumo) linhas.push(r.resumo);
    if (r.semVisita30 > 0) linhas.push(`⚠️ ${r.semVisita30} cliente${r.semVisita30 > 1 ? "s" : ""} da carteira sem visita há mais de 30 dias`);
    partes.push(linhas.join("\n"));
  }
  partes.push("PDF completo em anexo.");
  return partes.join("\n\n");
}

async function comTentativas(envio: () => Promise<boolean>, tentativas = 3): Promise<boolean> {
  for (let i = 1; i <= tentativas; i++) {
    if (await envio()) return true;
    // A Evolution pode estar acordando e reconectando ao WhatsApp.
    if (i < tentativas) await new Promise((r) => setTimeout(r, 20_000));
  }
  return false;
}

// Texto do WhatsApp + PDF do mês. Também usado pela prévia (sem envio).
export async function montarRelatorioMensal(
  competencia: Competencia
): Promise<{ texto: string; pdf: Uint8Array; consultores: number }> {
  const { inicio, fim } = intervaloBrasilia(competencia);
  const resumos = await dadosDoMes(competencia);
  for (const r of resumos) r.resumo = await resumirComIA(r.nome, r.relatos);

  const totais = totaisDaEquipe(resumos);
  const clientesVisitados = await prisma.relatorioVisita.findMany({
    where: { dataVisita: { gte: inicio, lt: fim }, status: { not: "AGENDADA" } },
    select: { clienteId: true },
    distinct: ["clienteId"],
  });
  const pdf = await gerarPdfRelatorioMensalVisitas({
    periodo: nomeCompetencia(competencia),
    dataGeracao: fmtDataHoraBrasilia(new Date()),
    totais: {
      visitas: fmtNum(totais.visitas),
      tecnicos: fmtNum(totais.tecnicos),
      clientes: fmtNum(clientesVisitados.length),
      km: `${fmtNum(totais.km)} km`,
      horas: fmtHoras(totais.ms),
    },
    consultores: resumos.map((r) => ({
      nome: r.nome,
      visitas: fmtNum(r.visitas),
      tecnicos: fmtNum(r.tecnicos),
      clientes: fmtNum(r.clientes),
      km: fmtNum(r.km),
      horas: fmtHoras(r.msEmCampo),
      semVisita30: fmtNum(r.semVisita30),
      resumo: r.resumo,
      detalhe: r.detalhe,
      clientesSemVisita: r.clientesSemVisita.map((c) => ({
        cliente: c.cliente,
        dias: c.dias === null ? "nunca visitado" : `${c.dias} dias`,
      })),
    })),
  });

  return { texto: textoWhatsApp(competencia, resumos), pdf, consultores: resumos.length };
}

export type ResultadoEnvio = {
  competencia: string;
  consultores: number;
  enviados: string[];
  jaEnviados: string[];
  falharam: string[];
  semWhatsapp: string[];
};

export async function enviarRelatorioMensal(
  competencia: Competencia,
  opts: { reenviar?: boolean } = {}
): Promise<ResultadoEnvio> {
  const chave = chaveCompetencia(competencia);
  const resultado: ResultadoEnvio = {
    competencia: chave,
    consultores: 0,
    enviados: [],
    jaEnviados: [],
    falharam: [],
    semWhatsapp: [],
  };

  const admins = await prisma.user.findMany({
    where: { role: "ADMIN", ativo: true },
    // Cada admin escolhe, por número, se recebe o relato (tela do WhatsApp).
    select: {
      id: true,
      nome: true,
      whatsappVinculos: {
        where: { waId: { not: null }, receberRelatorioMensal: true },
        select: { waId: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  // O histórico marca o envio por número (final do número), pra uma nova
  // tentativa não pular um número que falhou. O formato antigo, sem número,
  // continua valendo como "já enviado" pra esse admin.
  const detalhesEnvio = (nome: string) => `Relatório mensal de visitas ${chave} enviado para ${nome}`;
  const detalhesEnvioNumero = (nome: string, waId: string) =>
    `${detalhesEnvio(nome)} (final ${waId.replace(/\D/g, "").slice(-4)})`;
  const pendentes: { nome: string; waId: string; detalhes: string }[] = [];
  for (const admin of admins) {
    const numeros = admin.whatsappVinculos.map((v) => v.waId!).filter(Boolean);
    if (numeros.length === 0) {
      resultado.semWhatsapp.push(admin.nome);
      continue;
    }
    for (const waId of numeros) {
      const detalhes = detalhesEnvioNumero(admin.nome, waId);
      if (!opts.reenviar) {
        const jaFoi = await prisma.historico.findFirst({
          where: {
            entidade: "RELATORIO_MENSAL",
            detalhes: { in: [detalhes, detalhesEnvio(admin.nome)] },
          },
          select: { id: true },
        });
        if (jaFoi) {
          resultado.jaEnviados.push(admin.nome);
          continue;
        }
      }
      pendentes.push({ nome: admin.nome, waId, detalhes });
    }
  }
  if (pendentes.length === 0) return resultado;

  const { texto, pdf, consultores } = await montarRelatorioMensal(competencia);
  resultado.consultores = consultores;
  const nomeArquivo = `relatorio-visitas-${chave}.pdf`;

  for (const admin of pendentes) {
    const okTexto = await comTentativas(() => enviarMensagemTexto(admin.waId, texto));
    const okPdf =
      okTexto &&
      (await comTentativas(() =>
        enviarDocumento(
          admin.waId,
          Buffer.from(pdf),
          nomeArquivo,
          "application/pdf",
          `Relatório de visitas — ${nomeCompetencia(competencia)}`
        )
      ));
    if (okTexto && okPdf) {
      resultado.enviados.push(admin.nome);
      await prisma.historico.create({
        data: {
          usuarioNome: "Sistema",
          acao: "Enviou",
          entidade: "RELATORIO_MENSAL",
          detalhes: admin.detalhes,
        },
      });
    } else {
      resultado.falharam.push(admin.nome);
    }
  }

  return resultado;
}
