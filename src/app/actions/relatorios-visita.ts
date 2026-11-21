"use server";

import { z } from "zod";
import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { exigirSessao, comErro, type ResultadoAcao } from "@/app/actions/helpers";
import { getSafraAtualId } from "@/lib/safra-atual";
import { salvarRelatorioVisita, type FotoEntrada } from "@/lib/relatorios-visita";
import {
  atualizarRelatorio,
  definirLogoParceiro,
  enviarFotoRelatorio,
  escolherLogoDaBiblioteca,
  escolherLogoPrincipal,
  excluirRelatorio,
  removerLogoParceiro,
} from "@/lib/servicos/relatorios";
import { eventosDoCalendario, type EventoVisita } from "@/lib/visitas-calendario";
import { prisma, empresaIdAtual } from "@/lib/prisma";
import { enviarBufferLogoRelatorio, urlLogoParceiro } from "@/lib/storage";
import { Prisma } from "@/generated/prisma/client";
import { exigirAcessoRelatorio } from "@/lib/servicos/relatorios";
import { conteudoSchema, orientacaoDe, textoDosBlocos, tipoEfetivoRelatorio, type MapaPaginas } from "@/lib/relatorio-conteudo";
import { mapaDePaginas } from "@/lib/relatorio-pdf";
import { categoriaEfetiva, type CategoriaVisita } from "@/lib/visitas-categoria";

// Tamanho da logo vindo do formulário: número entre 0,5 e 2,5 (padrão 1).
function escalaLogo(valor: FormDataEntryValue | null): number {
  const n = Number(valor);
  return Number.isFinite(n) && n > 0 ? Math.min(2.5, Math.max(0.5, n)) : 1;
}

const relatorioSchema = z.object({
  clienteId: z.string().min(1, "Selecione o cliente."),
  fazendaId: z.string().nullish(),
  tipo: z.enum(["VISITA", "TECNICO"]).default("VISITA"),
  categoria: z.enum(["COMERCIAL", "TECNICA", "POS_VENDA", "RELACIONAMENTO"], {
    message: "Selecione a categoria da visita.",
  }),
  agendar: z.boolean().default(false),
  trabalhoId: z.string().nullish(),
  titulo: z.string().nullish(),
  texto: z.string().nullish(),
  dataVisita: z.string().nullish(),
});

export async function criarRelatorioVisita(
  formData: FormData
): Promise<{ ok: true; id: string } | { ok: false; erro: string }> {
  try {
    const sessao = await exigirSessao("VISITAS");

    const dados = relatorioSchema.parse({
      clienteId: formData.get("clienteId"),
      fazendaId: formData.get("fazendaId") || null,
      tipo: formData.get("tipo") || undefined,
      categoria: formData.get("categoria"),
      agendar: formData.get("agendar") === "1",
      trabalhoId: formData.get("trabalhoId") || null,
      titulo: formData.get("titulo"),
      texto: formData.get("texto"),
      dataVisita: formData.get("dataVisita"),
    });

    // Visita agendada ainda não tem relato; as demais precisam de um.
    if (!dados.agendar && !dados.texto?.trim()) throw new Error("Descreva a visita.");
    // O campo de data e hora do navegador vem sem fuso: é o horário de Brasília.
    const dataVisita = dados.dataVisita
      ? new Date(
          /T\d{2}:\d{2}$/.test(dados.dataVisita)
            ? `${dados.dataVisita}:00-03:00`
            : /^\d{4}-\d{2}-\d{2}$/.test(dados.dataVisita)
              ? `${dados.dataVisita}T12:00:00-03:00`
              : dados.dataVisita
        )
      : undefined;
    if (dados.agendar) {
      if (!dataVisita || Number.isNaN(dataVisita.getTime())) throw new Error("Informe a data e a hora da visita.");
      if (dataVisita.getTime() < Date.now() - 60_000) throw new Error("A data de uma visita agendada deve ser futura.");
    }

    const arquivos = formData
      .getAll("fotos")
      .filter((f): f is File => f instanceof File && f.size > 0);
    const conteudoBruto = formData.get("conteudo");
    const conteudo = typeof conteudoBruto === "string" && conteudoBruto
      ? conteudoSchema.parse(JSON.parse(conteudoBruto))
      : undefined;
    if (!dados.agendar && conteudo && !textoDosBlocos(conteudo).trim()) {
      throw new Error("Adicione algum conteúdo ao relatório.");
    }

    const fotos: FotoEntrada[] = await Promise.all(
      arquivos.map(async (arquivo) => {
        if (!arquivo.type.startsWith("image/")) {
          throw new Error(`O arquivo "${arquivo.name}" não é uma imagem.`);
        }
        return {
          buffer: Buffer.from(await arquivo.arrayBuffer()),
          contentType: arquivo.type,
          nomeOriginal: arquivo.name,
        };
      })
    );

    const safraId = await getSafraAtualId();

    const relatorio = await salvarRelatorioVisita({
      clienteId: dados.clienteId,
      fazendaId: dados.fazendaId,
      consultorId: sessao.id,
      safraId,
      tipo: dados.tipo,
      categoria: dados.categoria,
      status: dados.agendar ? "AGENDADA" : "FECHADA",
      trabalhoId: dados.trabalhoId,
      titulo: dados.titulo,
      texto: dados.texto?.trim() || "Visita agendada.",
      dataVisita,
      fotos,
      conteudo,
      mostrarLocalizacao: formData.get("mostrarLocalizacao") !== "0",
      mostrarHorarios: formData.get("mostrarHorarios") !== "0",
      semCapa: formData.get("semCapa") === "1",
      orientacao: formData.get("orientacao") === "RETRATO" ? "RETRATO" : "PAISAGEM",
      escalaLogoPrincipal: escalaLogo(formData.get("escalaLogoPrincipal")),
      logoPrincipalTexto: String(formData.get("logoPrincipalTexto") || "").trim() || null,
      escalaLogoPrincipalPaginas: escalaLogo(formData.get("escalaLogoPrincipalPaginas")),
      escalaLogoParceiro: escalaLogo(formData.get("escalaLogoParceiro")),
      escalaLogoParceiroPaginas: escalaLogo(formData.get("escalaLogoParceiroPaginas")),
    });

    revalidatePath("/relatorios/visitas");
    // Logos escolhidas no editor antes do primeiro salvamento.
    const logoParceiroId = String(formData.get("logoParceiroId") || "");
    const logoPrincipalId = String(formData.get("logoPrincipalId") || "");
    if (logoParceiroId) await escolherLogoDaBiblioteca(sessao, relatorio.id, logoParceiroId).catch(() => {});
    if (logoPrincipalId) await escolherLogoPrincipal(sessao, relatorio.id, logoPrincipalId).catch(() => {});
    return { ok: true, id: relatorio.id };
  } catch (error) {
    return comErro(error);
  }
}

export async function excluirRelatorioVisita(id: string): Promise<ResultadoAcao> {
  try {
    const sessao = await exigirSessao("VISITAS");
    await excluirRelatorio(sessao, id);
    revalidatePath("/relatorios/visitas");
    return { ok: true };
  } catch (error) {
    return comErro(error);
  }
}

export async function atualizarRelatorioVisita(
  id: string,
  dados: {
    titulo?: string | null;
    tipo?: "VISITA" | "TECNICO";
    categoria?: "COMERCIAL" | "TECNICA" | "POS_VENDA" | "RELACIONAMENTO";
    clienteId?: string;
    mostrarLocalizacao?: boolean;
    mostrarHorarios?: boolean;
    semCapa?: boolean;
    orientacao?: "PAISAGEM" | "RETRATO";
    escalaLogoPrincipal?: number;
    logoPrincipalTexto?: string | null;
    escalaLogoPrincipalPaginas?: number;
    escalaLogoParceiro?: number;
    escalaLogoParceiroPaginas?: number;
    dataVisita?: string | null;
    fazendaId?: string | null;
    versaoEsperada: string;
    adiarLimpezaFotos?: boolean;
    criarVersao?: boolean;
    conteudo: unknown;
  }
): Promise<{ ok: true; versao: string } | { ok: false; erro: string }> {
  try {
    const sessao = await exigirSessao("VISITAS");
    const versao = await atualizarRelatorio(sessao, id, dados);
    revalidatePath("/relatorios/visitas");
    revalidatePath(`/relatorios/visitas/${id}`);
    return { ok: true, versao };
  } catch (error) {
    return comErro(error);
  }
}

export async function atualizarStatusEditorialRelatorio(
  id: string,
  statusDocumento: "RASCUNHO" | "EM_REVISAO" | "APROVADO",
): Promise<ResultadoAcao> {
  try {
    const sessao = await exigirSessao("VISITAS");
    await exigirAcessoRelatorio(sessao, id, "editar");
    if (statusDocumento === "APROVADO" && sessao.role !== "ADMIN") {
      throw new Error("A aprovação final deve ser feita por um administrador.");
    }
    await prisma.relatorioVisita.update({
      where: { id },
      data: { statusDocumento, aprovadoEm: statusDocumento === "APROVADO" ? new Date() : null },
    });
    revalidatePath("/relatorios/visitas");
    revalidatePath(`/relatorios/visitas/${id}`);
    revalidatePath(`/relatorios/visitas/${id}/editar`);
    return { ok: true };
  } catch (error) {
    return comErro(error);
  }
}

// A sugestão nunca é salva automaticamente: o editor mostra o texto devolvido
// e o consultor decide se quer mantê-lo ou desfazer.
export type TrechoParaRevisao = { id: string; rotulo: string; texto: string };
export type RevisaoRelatorio = {
  sugestoes: { id: string; sugerido: string; motivo: string }[];
  dicas: string[];
};

// Revisão do relatório inteiro: a IA lê todos os trechos juntos (contexto do
// documento) e devolve só os que precisam mudar, com o motivo, mais dicas
// gerais (ex.: falta conclusão, recomendação sem dose). Nada é aplicado aqui:
// o editor mostra e o consultor escolhe o que aceitar.
export async function revisarRelatorioComIa(
  trechos: TrechoParaRevisao[]
): Promise<{ ok: true; revisao: RevisaoRelatorio } | { ok: false; erro: string }> {
  try {
    await exigirSessao("VISITAS");
    const itens = z.array(z.object({ id: z.string().max(80), rotulo: z.string().max(80), texto: z.string().max(12_000) })).max(200).parse(trechos)
      .filter((item) => item.texto.trim().length >= 2);
    if (!itens.length) throw new Error("Escreva algum texto no relatório antes de pedir a revisão.");
    if (itens.reduce((total, item) => total + item.texto.length, 0) > 60_000) throw new Error("O relatório é grande demais para revisar de uma vez.");
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("A IA ainda não está configurada neste ambiente.");
    const resposta = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
        instructions: [
          "Você revisa relatórios técnicos agrícolas em português do Brasil. Recebe os trechos do relatório em JSON (id, rótulo e texto), na ordem do documento.",
          "Para cada trecho que tiver erro ou puder ficar claramente melhor, devolva em `sugestoes` o id, o texto completo revisado em `sugerido` e um `motivo` curto (ex.: \"ortografia e concordância\", \"frase mais clara\").",
          "Corrija ortografia, acentuação, digitação ou ditado por voz, pontuação, crase, concordância, maiúsculas, espaços e repetições. Padronize números e unidades no padrão brasileiro (R$ 1.000,00; 5 kg/ha; 12%).",
          "Melhore clareza e tom profissional sem mudar o sentido. PRESERVE fatos, números, nomes, marcas e produtos; não invente dados nem conclusões. Mantenha quebras de linha e listas.",
          "Não inclua trechos que já estão bons.",
          "Em `dicas`, até 5 observações sobre o relatório como um todo (o que falta ou está confuso: ex. sem conclusão, recomendação sem dose ou prazo, título genérico). Lista vazia se estiver bom.",
        ].join(" "),
        input: JSON.stringify(itens),
        text: {
          format: {
            type: "json_schema",
            name: "revisao_relatorio",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              required: ["sugestoes", "dicas"],
              properties: {
                sugestoes: {
                  type: "array",
                  items: {
                    type: "object",
                    additionalProperties: false,
                    required: ["id", "sugerido", "motivo"],
                    properties: { id: { type: "string" }, sugerido: { type: "string" }, motivo: { type: "string" } },
                  },
                },
                dicas: { type: "array", items: { type: "string" } },
              },
            },
          },
        },
      }),
      signal: AbortSignal.timeout(90_000),
    });
    const dados = (await resposta.json().catch(() => null)) as {
      output_text?: string;
      output?: { type?: string; content?: { type?: string; text?: string }[] }[];
      error?: { message?: string };
    } | null;
    if (!resposta.ok) throw new Error(dados?.error?.message || `A IA recusou a solicitação (${resposta.status}).`);
    const bruto = dados?.output_text?.trim() || dados?.output
      ?.filter((item) => item.type === "message")
      .flatMap((item) => item.content ?? [])
      .filter((item) => item.type === "output_text")
      .map((item) => item.text ?? "")
      .join("")
      .trim();
    if (!bruto) throw new Error("A IA não devolveu a revisão. Tente novamente.");
    const revisao = z.object({
      sugestoes: z.array(z.object({ id: z.string(), sugerido: z.string(), motivo: z.string() })),
      dicas: z.array(z.string()),
    }).parse(JSON.parse(bruto));
    const originais = new Map(itens.map((item) => [item.id, item.texto.trim()]));
    return {
      ok: true,
      revisao: {
        sugestoes: revisao.sugestoes.filter((sug) => originais.has(sug.id) && sug.sugerido.trim() && sug.sugerido.trim() !== originais.get(sug.id)),
        dicas: revisao.dicas.slice(0, 5),
      },
    };
  } catch (error) {
    return comErro(error);
  }
}

export async function sugerirMelhoriaTextoRelatorio(texto: string): Promise<{ ok: true; texto: string } | { ok: false; erro: string }> {
  try {
    await exigirSessao("VISITAS");
    const original = z.string().trim().min(2, "Escreva algo antes de pedir a revisão.").max(12_000).parse(texto);
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("A IA ainda não está configurada neste ambiente.");
    const resposta = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
        instructions: [
          "Você é o revisor de textos de relatórios técnicos agrícolas, em português do Brasil.",
          "CORRIJA tudo o que estiver errado na escrita: ortografia e acentuação (ex.: \"nmero\" → \"número\", \"pesoas\" → \"pessoas\"), letras trocadas, faltando ou sobrando (ex.: \"uObservou-se\" → \"Observou-se\"), pontuação, crase, concordância verbal e nominal, maiúsculas e minúsculas, espaços duplicados, palavras repetidas e os erros típicos de digitação ou de ditado por voz.",
          "Padronize números, unidades e moeda no padrão brasileiro (ex.: R$ 1.000,00; 5 kg/ha; 12%; 20 L/ha).",
          "Melhore também clareza, coesão e tom profissional, sem mudar o sentido.",
          "PRESERVE todos os fatos, números, nomes próprios, marcas e produtos. Não invente dados, diagnósticos, recomendações ou conclusões; o que estiver ambíguo, deixe como está.",
          "Mantenha a mesma estrutura: parágrafos, quebras de linha, listas e marcadores.",
          "Devolva apenas o texto revisado, sem markdown, sem aspas e sem explicações.",
        ].join(" "),
        input: original,
      }),
      signal: AbortSignal.timeout(30_000),
    });
    const dados = (await resposta.json().catch(() => null)) as {
      output_text?: string;
      output?: { type?: string; content?: { type?: string; text?: string }[] }[];
      error?: { message?: string };
    } | null;
    if (!resposta.ok) {
      // Mostra o motivo útil (modelo indisponível, chave sem permissão etc.)
      // sem devolver detalhes da chave nem do servidor para o navegador.
      throw new Error(dados?.error?.message || `A IA recusou a solicitação (${resposta.status}).`);
    }
    const revisado = dados?.output_text?.trim() || dados?.output
      ?.filter((item) => item.type === "message")
      .flatMap((item) => item.content ?? [])
      .filter((item) => item.type === "output_text")
      .map((item) => item.text ?? "")
      .join(" ")
      .trim();
    if (!revisado) throw new Error("A IA não devolveu texto para revisão. Tente novamente.");
    return { ok: true, texto: revisado };
  } catch (error) {
    return comErro(error);
  }
}

export async function restaurarVersaoRelatorio(
  id: string,
  numero: number,
): Promise<ResultadoAcao> {
  try {
    const sessao = await exigirSessao("VISITAS");
    await exigirAcessoRelatorio(sessao, id, "editar");
    const versao = await prisma.relatorioVisitaVersao.findUnique({
      where: { relatorioId_numero: { relatorioId: id, numero } },
      select: { titulo: true, texto: true, conteudo: true },
    });
    if (!versao) throw new Error("Versão não encontrada.");
    await prisma.relatorioVisita.update({
      where: { id },
      data: { titulo: versao.titulo, texto: versao.texto, conteudo: versao.conteudo === null ? Prisma.JsonNull : versao.conteudo },
    });
    revalidatePath(`/relatorios/visitas/${id}/editar`);
    revalidatePath(`/relatorios/visitas/${id}`);
    revalidatePath("/relatorios/visitas");
    return { ok: true };
  } catch (error) {
    return comErro(error);
  }
}

export async function alterarCompartilhamentoRelatorio(
  id: string,
  ativo: boolean,
): Promise<{ ok: true; token: string | null } | { ok: false; erro: string }> {
  try {
    const sessao = await exigirSessao("VISITAS");
    await exigirAcessoRelatorio(sessao, id, "editar");
    const token = ativo ? randomBytes(32).toString("base64url") : null;
    await prisma.relatorioVisita.update({ where: { id }, data: { tokenCompartilhamento: token } });
    revalidatePath(`/relatorios/visitas/${id}`);
    revalidatePath(`/relatorios/visitas/${id}/editar`);
    return { ok: true, token };
  } catch (error) {
    return { ok: false, erro: comErro(error).erro };
  }
}

// Upload avulso de foto a partir do editor: devolve url/path para virar bloco.
export async function enviarFotoDoEditor(
  relatorioId: string,
  formData: FormData
): Promise<{ ok: true; url: string; path: string } | { ok: false; erro: string }> {
  try {
    const sessao = await exigirSessao("VISITAS");
    const enviado = await enviarFotoRelatorio(sessao, relatorioId, formData.get("foto"));
    return { ok: true, ...enviado };
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Erro inesperado.";
    return { ok: false, erro: msg };
  }
}

// Logo do parceiro (à direita do relatório): anexa/troca e remove no ato.
export async function enviarLogoParceiroDoEditor(
  relatorioId: string,
  formData: FormData
): Promise<{ ok: true; url: string } | { ok: false; erro: string }> {
  try {
    const sessao = await exigirSessao("VISITAS");
    const { url } = await definirLogoParceiro(sessao, relatorioId, formData.get("logo"));
    revalidatePath(`/relatorios/visitas/${relatorioId}`);
    return { ok: true, url };
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Erro inesperado.";
    return { ok: false, erro: msg };
  }
}

export async function escolherLogoDaBibliotecaDoEditor(
  relatorioId: string,
  logoId: string
): Promise<{ ok: true; url: string; rotulo: string | null } | { ok: false; erro: string }> {
  try {
    const sessao = await exigirSessao("VISITAS");
    const escolhida = await escolherLogoDaBiblioteca(sessao, relatorioId, logoId);
    revalidatePath(`/relatorios/visitas/${relatorioId}`);
    return { ok: true, ...escolhida };
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Erro inesperado.";
    return { ok: false, erro: msg };
  }
}

export type LogoDaBibliotecaEditor = { id: string; nome: string; tipo: string; url: string | null };

// Biblioteca de logos vista do editor (qualquer consultor usa e importa; só o
// ADM remove, em Configurações).
export async function listarLogosBiblioteca(): Promise<LogoDaBibliotecaEditor[]> {
  await exigirSessao("VISITAS");
  const logos = await prisma.logoRelatorio.findMany({ orderBy: { nome: "asc" } });
  return Promise.all(logos.map(async (l) => ({ id: l.id, nome: l.nome, tipo: l.tipo, url: await urlLogoParceiro(l.path) })));
}

export async function importarLogoBiblioteca(
  formData: FormData
): Promise<{ ok: true; logo: LogoDaBibliotecaEditor } | { ok: false; erro: string }> {
  try {
    await exigirSessao("VISITAS");
    const empresaId = await empresaIdAtual();
    if (!empresaId) throw new Error("Empresa não identificada.");
    const arquivo = formData.get("arquivo");
    if (!(arquivo instanceof File) || arquivo.size === 0) throw new Error("Escolha uma imagem.");
    const nome = String(formData.get("nome") || "").trim() || arquivo.name.replace(/\.[^.]+$/, "");
    const tipo = formData.get("tipo") === "PROGRAMA" ? "PROGRAMA" : "PARCEIRO";
    const buffer = Buffer.from(await arquivo.arrayBuffer());
    const enviado = await enviarBufferLogoRelatorio(buffer, arquivo.type, arquivo.name, empresaId);
    const logo = await prisma.logoRelatorio.create({ data: { nome, tipo, path: enviado.path } });
    return { ok: true, logo: { id: logo.id, nome: logo.nome, tipo: logo.tipo, url: await urlLogoParceiro(logo.path) } };
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Erro inesperado.";
    return { ok: false, erro: msg };
  }
}

export async function escolherLogoPrincipalDoEditor(
  relatorioId: string,
  logoId: string | null
): Promise<{ ok: true; url: string | null } | { ok: false; erro: string }> {
  try {
    const sessao = await exigirSessao("VISITAS");
    const { url } = await escolherLogoPrincipal(sessao, relatorioId, logoId);
    revalidatePath(`/relatorios/visitas/${relatorioId}`);
    return { ok: true, url };
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Erro inesperado.";
    return { ok: false, erro: msg };
  }
}

export async function removerLogoParceiroDoEditor(relatorioId: string): Promise<ResultadoAcao> {
  try {
    const sessao = await exigirSessao("VISITAS");
    await removerLogoParceiro(sessao, relatorioId);
    revalidatePath(`/relatorios/visitas/${relatorioId}`);
    return { ok: true };
  } catch (error) {
    return comErro(error);
  }
}

// Eventos do calendário de visitas no intervalo visível. Consultor só vê as
// próprias visitas, independente do filtro pedido.
export async function carregarEventosCalendario(
  inicioIso: string,
  fimIso: string,
  consultorIds: string[]
): Promise<EventoVisita[]> {
  const sessao = await exigirSessao("VISITAS");
  const inicio = new Date(inicioIso);
  const fim = new Date(fimIso);
  if (Number.isNaN(inicio.getTime()) || Number.isNaN(fim.getTime())) return [];

  return eventosDoCalendario({
    inicio,
    fim,
    safraId: await getSafraAtualId(),
    // Consultor só vê as próprias; admin pode filtrar por vários.
    ...(sessao.role === "ADMIN" ? { consultorIds } : { consultorId: sessao.id }),
  });
}

// Paginação do PDF pro editor: recalculada com os blocos que estão na tela
// (ainda não salvos), pra mostrar onde cada página vai quebrar.
export async function paginacaoDoRelatorio(
  relatorioId: string,
  blocosBrutos: unknown,
  titulo: string | null
): Promise<MapaPaginas | null> {
  try {
    const sessao = await exigirSessao("VISITAS");
    const relatorio = await prisma.relatorioVisita.findUnique({
      where: { id: relatorioId },
      select: {
        tipo: true,
        consultorId: true,
        dataVisita: true,
        finalidade: true,
        horaChegada: true,
        horaSaida: true,
        kmChegada: true,
        kmSaida: true,
        latitude: true,
        longitude: true,
        orientacao: true,
        semCapa: true,
        cliente: { select: { nome: true } },
        fazenda: { select: { nome: true } },
        consultor: { select: { nome: true } },
      },
    });
    if (!relatorio) return null;
    if (sessao.role !== "ADMIN" && relatorio.consultorId !== sessao.id) return null;
    const blocos = conteudoSchema.safeParse(blocosBrutos);
    if (!blocos.success) return null;
    return await mapaDePaginas({
      tipo: tipoEfetivoRelatorio(relatorio.tipo, blocos.data),
      clienteNome: relatorio.cliente.nome,
      fazendaNome: relatorio.fazenda?.nome ?? null,
      consultorNome: relatorio.consultor.nome,
      titulo,
      dataVisita: relatorio.dataVisita,
      blocos: blocos.data,
      orientacao: orientacaoDe(relatorio.orientacao),
      semCapa: relatorio.semCapa,
      rastreamento: {
        finalidade: relatorio.finalidade,
        horaChegada: relatorio.horaChegada,
        horaSaida: relatorio.horaSaida,
        kmChegada: relatorio.kmChegada,
        kmSaida: relatorio.kmSaida,
        latitude: relatorio.latitude,
        longitude: relatorio.longitude,
      },
    });
  } catch (error) {
    console.error("[Relatório] falha ao calcular páginas do PDF:", error);
    return null;
  }
}

export type VisitaDoCliente = {
  id: string;
  data: string;
  consultor: string;
  titulo: string | null;
  categoria: CategoriaVisita;
  status: string;
  texto: string;
};

// Visitas de um cliente pro modal do mapa: lidas na hora, sempre atuais.
// Consultor vê só as próprias, como na tela do relatório.
export async function visitasDoCliente(clienteId: string): Promise<VisitaDoCliente[]> {
  const sessao = await exigirSessao("VISITAS");
  const visitas = await prisma.relatorioVisita.findMany({
    where: { clienteId, ...(sessao.role === "ADMIN" ? {} : { consultorId: sessao.id }) },
    orderBy: { dataVisita: "desc" },
    take: 100,
    select: {
      id: true,
      dataVisita: true,
      titulo: true,
      categoria: true,
      tipo: true,
      status: true,
      texto: true,
      consultor: { select: { nome: true } },
    },
  });
  return visitas.map((v) => ({
    id: v.id,
    data: v.dataVisita.toISOString(),
    consultor: v.consultor.nome,
    titulo: v.titulo,
    categoria: categoriaEfetiva({ categoria: v.categoria, tipo: v.tipo }),
    status: v.status,
    texto: v.texto,
  }));
}
