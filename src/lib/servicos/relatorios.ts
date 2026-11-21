// Regras dos relatórios de visita, compartilhadas entre as server actions do
// web e a API do app: quem vê o quê, quem edita, e o formato de leitura.

import { z } from "zod";
import type { Sessao } from "@/app/actions/helpers";
import { prisma } from "@/lib/prisma";
import {
  acrescentarBlocos,
  conteudoSchema,
  fotoDeCapa,
  lerConteudo,
  tipoEfetivoRelatorio,
  textoDosBlocos,
  type Bloco,
  type SemGeometria, orientacaoDe } from "@/lib/relatorio-conteudo";
import { gerarPdfRelatorioVisita } from "@/lib/relatorio-pdf";
import { pdfIdenticoAPagina } from "@/lib/relatorio-pdf-web";
import { coordenadasDoRelatorio, excluirRelatorioVisitaPorId } from "@/lib/relatorios-visita";
import { assinarArquivos, assinarBlocosDeFotos, criarUrlAssinada, enviarBufferFotoVisita, enviarBufferLogoParceiro, excluirArquivo, excluirFotoVisita, urlLogoParceiro, validarImagem } from "@/lib/storage";
import { ErroNaoEncontrado, ErroPermissao } from "@/lib/servicos/erros";
import { validarFazendaDoCliente } from "@/lib/servicos/fazendas";
import { safraIdDaVisita } from "@/lib/safra-da-visita";

const ehAdmin = (sessao: Sessao) => sessao.role === "ADMIN";

// Só o dono do relatório ou um admin mexem nele.
export async function exigirAcessoRelatorio(
  sessao: Sessao,
  id: string,
  verbo: "ver" | "editar" | "excluir" = "editar"
) {
  const relatorio = await prisma.relatorioVisita.findUnique({
    where: { id },
    select: { consultorId: true },
  });
  if (!relatorio) throw new ErroNaoEncontrado("Relatório não encontrado.");
  if (!ehAdmin(sessao) && relatorio.consultorId !== sessao.id) {
    throw new ErroPermissao(`Você só pode ${verbo} seus próprios relatórios.`);
  }
  return relatorio;
}

export async function listarRelatorios(sessao: Sessao, filtros: { safraId?: string | null } = {}) {
  const relatorios = await prisma.relatorioVisita.findMany({
    where: {
      ...(ehAdmin(sessao) ? {} : { consultorId: sessao.id }),
      ...(filtros.safraId ? { safraId: filtros.safraId } : {}),
    },
    select: {
      id: true,
      tipo: true,
      titulo: true,
      texto: true,
      conteudo: true,
      status: true,
      dataVisita: true,
      updatedAt: true,
      clienteId: true,
      consultorId: true,
      cliente: { select: { nome: true } },
      fazenda: { select: { nome: true } },
      consultor: { select: { nome: true } },
      fotos: { select: { url: true, path: true }, orderBy: { ordem: "asc" }, take: 1 },
      _count: { select: { fotos: true } },
    },
    orderBy: { dataVisita: "desc" },
    take: 500,
  });

  return Promise.all(relatorios.map(async (r) => {
    const blocos = await assinarBlocosDeFotos(lerConteudo(r.conteudo, r.texto, await assinarArquivos(r.fotos)));
    const fotos = blocos.filter((b) => b.tipo === "foto");
    return {
      id: r.id,
      tipo: tipoEfetivoRelatorio(r.tipo, blocos),
      titulo: r.titulo,
      resumo: r.texto.slice(0, 180),
      status: r.status,
      dataVisita: r.dataVisita.toISOString(),
      atualizadoEm: r.updatedAt.toISOString(),
      clienteId: r.clienteId,
      clienteNome: r.cliente.nome,
      fazendaNome: r.fazenda?.nome ?? null,
      consultorNome: r.consultor.nome,
      capaUrl: fotoDeCapa(fotos)?.url ?? null,
      fotos: Math.max(r._count.fotos, fotos.length),
      podeEditar: ehAdmin(sessao) || r.consultorId === sessao.id,
    };
  }));
}

export async function obterRelatorio(sessao: Sessao, id: string) {
  await exigirAcessoRelatorio(sessao, id, "ver");
  const r = await prisma.relatorioVisita.findUniqueOrThrow({
    where: { id },
    include: {
      cliente: { select: { id: true, nome: true, latitude: true, longitude: true } },
      fazenda: { select: { id: true, nome: true, latitude: true, longitude: true } },
      consultor: { select: { nome: true } },
      safra: { select: { id: true, nome: true } },
      fotos: { orderBy: { ordem: "asc" } },
    },
  });

  const blocos = await assinarBlocosDeFotos(lerConteudo(r.conteudo, r.texto, await assinarArquivos(r.fotos)));
  return {
    id: r.id,
    tipo: tipoEfetivoRelatorio(r.tipo, blocos),
    titulo: r.titulo,
    texto: r.texto,
    status: r.status,
    dataVisita: r.dataVisita.toISOString(),
    atualizadoEm: r.updatedAt.toISOString(),
    cliente: { id: r.cliente.id, nome: r.cliente.nome },
    fazenda: r.fazenda ? { id: r.fazenda.id, nome: r.fazenda.nome } : null,
    consultorNome: r.consultor.nome,
    safra: r.safra,
    blocos,
    rastreamento: {
      finalidade: r.finalidade,
      horaChegada: r.horaChegada?.toISOString() ?? null,
      horaSaida: r.horaSaida?.toISOString() ?? null,
      kmChegada: r.kmChegada,
      kmSaida: r.kmSaida,
      ...coordenadasDoRelatorio(r),
    },
    podeEditar: true,
  };
}

// Blocos que chegam sem posição (criados no app, que não tem canvas) entram
// depois do último bloco posicionado, como o editor do web faz ao acrescentar.
// A ordem do documento é preservada.
function posicionarNovos(conteudo: unknown): unknown {
  if (!Array.isArray(conteudo)) return conteudo;
  const temPosicao = (b: unknown) => (b as { x?: unknown } | null)?.x !== undefined;
  const novosBrutos = conteudo.filter((b) => !temPosicao(b));
  if (novosBrutos.length === 0 || novosBrutos.length === conteudo.length) return conteudo;

  const existentes = conteudoSchema.parse(conteudo.filter(temPosicao));
  const novos = conteudoSchema.parse(novosBrutos).map(({ pagina, x, y, w, h, ...resto }) => {
    void pagina;
    void x;
    void y;
    void w;
    void h;
    return resto as SemGeometria<Bloco>;
  });
  const posicionados = new Map(
    acrescentarBlocos(existentes, novos).map((b) => [b.id, b] as const)
  );
  return conteudo.map((b) => posicionados.get((b as { id: string }).id) ?? b);
}

const edicaoSchema = z.object({
  titulo: z.string().nullish(),
  tipo: z.enum(["VISITA", "TECNICO"]).optional(),
  categoria: z.enum(["COMERCIAL", "TECNICA", "POS_VENDA", "RELACIONAMENTO"]).optional(),
  clienteId: z.string().min(1).optional(),
  mostrarLocalizacao: z.boolean().optional(),
  mostrarHorarios: z.boolean().optional(),
  semCapa: z.boolean().optional(),
  orientacao: z.enum(["PAISAGEM", "RETRATO"]).optional(),
  escalaLogoPrincipal: z.number().min(0.5).max(2.5).optional(),
  logoPrincipalTexto: z.string().max(200).nullish(),
  escalaLogoPrincipalPaginas: z.number().min(0.5).max(2.5).optional(),
  escalaLogoParceiro: z.number().min(0.5).max(2.5).optional(),
  escalaLogoParceiroPaginas: z.number().min(0.5).max(2.5).optional(),
  // undefined = não mexe; null = tira a fazenda.
  fazendaId: z.string().nullish(),
  dataVisita: z.string().nullish(),
  versaoEsperada: z.string().datetime().optional(),
  // Durante o autosave, preserva a referência e o objeto para que desfazer
  // não restaure uma URL morta. O salvamento manual faz a limpeza definitiva.
  adiarLimpezaFotos: z.boolean().optional(),
  // Apenas o clique consciente em Salvar entra no histórico. O autosave é
  // proteção contra perda de trabalho, não uma nova revisão do documento.
  criarVersao: z.boolean().optional(),
  conteudo: conteudoSchema,
});

export async function atualizarRelatorio(
  sessao: Sessao,
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
    versaoEsperada?: string;
    adiarLimpezaFotos?: boolean;
    criarVersao?: boolean;
    conteudo: unknown;
  },
  opcoes: { permitirSemVersao?: boolean } = {},
) {
  await exigirAcessoRelatorio(sessao, id, "editar");

  const validado = edicaoSchema.parse({ ...dados, conteudo: posicionarNovos(dados.conteudo) });
  const original = await prisma.relatorioVisita.findUniqueOrThrow({
    where: { id },
    select: {
      clienteId: true,
      dataVisita: true,
      conteudo: true,
      updatedAt: true,
      fotos: { select: { id: true, path: true } },
    },
  });
  if (!validado.versaoEsperada && !opcoes.permitirSemVersao) {
    throw new Error("Informe a versão esperada do relatório.");
  }
  if (original.updatedAt.toISOString() !== validado.versaoEsperada) {
    if (validado.versaoEsperada) {
      throw new Error("CONFLITO_EDICAO: este relatório foi alterado em outra aba. Recarregue a página antes de continuar.");
    }
  }
  // O editor de data altera somente o dia. Preserva o horário original em vez
  // de transformar a visita em meia-noite UTC.
  const horaOriginal = original.dataVisita.toLocaleTimeString("en-GB", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const data = validado.dataVisita
    ? new Date(/^\d{4}-\d{2}-\d{2}$/.test(validado.dataVisita)
      ? `${validado.dataVisita}T${horaOriginal}-03:00`
      : validado.dataVisita)
    : undefined;
  if (data && Number.isNaN(data.getTime())) {
    throw new Error("Data da visita inválida.");
  }

  const clienteId = validado.clienteId ?? original.clienteId;
  if (validado.clienteId) {
    const clienteExiste = await prisma.cliente.count({ where: { id: validado.clienteId } });
    if (!clienteExiste) throw new Error("Cliente não encontrado.");
  }

  let fazendaId: string | null | undefined;
  if (validado.fazendaId !== undefined) {
    fazendaId = await validarFazendaDoCliente(validado.fazendaId, clienteId);
  } else if (validado.clienteId && validado.clienteId !== original.clienteId) {
    fazendaId = null;
  }

  const fotosDoConteudo = validado.conteudo.filter(
    (bloco): bloco is Extract<Bloco, { tipo: "foto" }> => bloco.tipo === "foto" && Boolean(bloco.path)
  );
  const caminhosNovos = new Set(fotosDoConteudo.map((foto) => foto.path!));
  const conteudoAnterior = conteudoSchema.safeParse(original.conteudo);
  const caminhosAnteriores = new Set([
    ...original.fotos.map((foto) => foto.path),
    ...(conteudoAnterior.success
      ? conteudoAnterior.data
          .filter((b): b is Extract<Bloco, { tipo: "foto" }> => b.tipo === "foto" && Boolean(b.path))
          .map((b) => b.path!)
      : []),
  ]);
  const caminhosRemovidos = [...caminhosAnteriores].filter((path) => !caminhosNovos.has(path));
  const fotosExistentes = new Map(original.fotos.map((foto) => [foto.path, foto] as const));
  const safraId = data ? await safraIdDaVisita(data) : undefined;

  const atualizadoEm = await prisma.$transaction(async (tx) => {
    const alteracoes = {
      clienteId,
      fazendaId,
      tipo: validado.tipo,
      categoria: validado.categoria,
      mostrarLocalizacao: validado.mostrarLocalizacao,
      mostrarHorarios: validado.mostrarHorarios,
      semCapa: validado.semCapa,
      orientacao: validado.orientacao,
      escalaLogoPrincipal: validado.escalaLogoPrincipal,
      logoPrincipalTexto: validado.logoPrincipalTexto === undefined ? undefined : validado.logoPrincipalTexto?.trim() || null,
      escalaLogoPrincipalPaginas: validado.escalaLogoPrincipalPaginas,
      escalaLogoParceiro: validado.escalaLogoParceiro,
      escalaLogoParceiroPaginas: validado.escalaLogoParceiroPaginas,
      titulo: validado.titulo?.trim() || null,
      dataVisita: data,
      ...(safraId ? { safraId } : {}),
      conteudo: validado.conteudo,
      texto: textoDosBlocos(validado.conteudo) || "(sem relato)",
    };
    if (validado.versaoEsperada) {
      const resultado = await tx.relatorioVisita.updateMany({
        where: { id, updatedAt: new Date(validado.versaoEsperada) },
        data: alteracoes,
      });
      if (resultado.count !== 1) throw new Error("CONFLITO_EDICAO: este relatório foi alterado em outra aba. Recarregue a página antes de continuar.");
    } else {
      await tx.relatorioVisita.update({ where: { id }, data: alteracoes });
    }
    if (!validado.adiarLimpezaFotos && caminhosRemovidos.length > 0) {
      await tx.fotoVisita.deleteMany({ where: { relatorioId: id, path: { in: caminhosRemovidos } } });
    }
    if (validado.criarVersao) {
      const ultima = await tx.relatorioVisitaVersao.aggregate({
        where: { relatorioId: id },
        _max: { numero: true },
      });
      await tx.relatorioVisitaVersao.create({
        data: {
          relatorioId: id,
          numero: (ultima._max.numero ?? 0) + 1,
          titulo: alteracoes.titulo,
          texto: alteracoes.texto,
          conteudo: alteracoes.conteudo,
        },
      });
    }
    for (const [ordem, foto] of fotosDoConteudo.entries()) {
      const existente = fotosExistentes.get(foto.path!);
      if (existente) {
        await tx.fotoVisita.update({
          where: { id: existente.id },
          data: { ordem, legenda: foto.legenda, url: foto.url },
        });
      } else {
        await tx.fotoVisita.create({
          data: { relatorioId: id, ordem, legenda: foto.legenda, url: foto.url, path: foto.path! },
        });
      }
    }
    return (await tx.relatorioVisita.findUniqueOrThrow({ where: { id }, select: { updatedAt: true } })).updatedAt;
  });

  if (!validado.adiarLimpezaFotos) {
    await Promise.all(caminhosRemovidos.map((path) => excluirFotoVisita(path).catch(() => {})));
  }
  return atualizadoEm.toISOString();
}

export async function excluirRelatorio(sessao: Sessao, id: string) {
  await exigirAcessoRelatorio(sessao, id, "excluir");
  await excluirRelatorioVisitaPorId(id);
}

// Upload avulso de foto a partir do editor: devolve url/path para virar bloco.
// Não cria FotoVisita — dentro do documento a foto é um bloco, não um anexo.
export async function enviarFotoRelatorio(sessao: Sessao, id: string, arquivo: unknown) {
  await exigirAcessoRelatorio(sessao, id, "editar");

  if (!(arquivo instanceof File) || arquivo.size === 0) {
    throw new Error("Selecione uma imagem.");
  }
  const buffer = Buffer.from(await arquivo.arrayBuffer());
  const imagem = validarImagem(buffer);

  const enviado = await enviarBufferFotoVisita(
    buffer,
    imagem.contentType,
    arquivo.name,
    id
  );
  return { url: await criarUrlAssinada(enviado.path), path: enviado.path };
}

// Anexa (ou troca) a logo do parceiro que aparece à direita do relatório. Grava
// na hora: não passa pelo autosave do documento. A anterior sai do storage.
export async function definirLogoParceiro(sessao: Sessao, id: string, arquivo: unknown) {
  await exigirAcessoRelatorio(sessao, id, "editar");
  if (!(arquivo instanceof File) || arquivo.size === 0) throw new Error("Selecione uma imagem.");
  const buffer = Buffer.from(await arquivo.arrayBuffer());
  const imagem = validarImagem(buffer);
  const anterior = await prisma.relatorioVisita.findUniqueOrThrow({ where: { id }, select: { logoParceiroPath: true } });
  const enviado = await enviarBufferLogoParceiro(buffer, imagem.contentType, arquivo.name, id);
  await prisma.relatorioVisita.update({ where: { id }, data: { logoParceiroPath: enviado.path, logoParceiroRotulo: "Em parceria com" } });
  await apagarLogoPropria(anterior.logoParceiroPath);
  return { url: await criarUrlAssinada(enviado.path) };
}

// Só a logo enviada no próprio relatório sai do storage; a da biblioteca
// (logos-relatorio/...) é compartilhada com outros relatórios.
async function apagarLogoPropria(path: string | null) {
  if (path?.startsWith("logos-parceiro/")) await excluirArquivo(path).catch(() => {});
}

// Logo da esquerda (capa e cabeçalho): uma da biblioteca ou, com null, volta
// pra logo da empresa.
export async function escolherLogoPrincipal(sessao: Sessao, id: string, logoId: string | null) {
  await exigirAcessoRelatorio(sessao, id, "editar");
  const logo = logoId ? await prisma.logoRelatorio.findFirstOrThrow({ where: { id: logoId } }) : null;
  await prisma.relatorioVisita.update({ where: { id }, data: { logoPrincipalPath: logo?.path ?? null } });
  return { url: logo ? await criarUrlAssinada(logo.path) : null };
}

// Usa uma logo da biblioteca (Configurações > Logos de relatórios).
export async function escolherLogoDaBiblioteca(sessao: Sessao, id: string, logoId: string) {
  await exigirAcessoRelatorio(sessao, id, "editar");
  const logo = await prisma.logoRelatorio.findFirstOrThrow({ where: { id: logoId } });
  const anterior = await prisma.relatorioVisita.findUniqueOrThrow({ where: { id }, select: { logoParceiroPath: true } });
  await prisma.relatorioVisita.update({
    where: { id },
    data: { logoParceiroPath: logo.path, logoParceiroRotulo: "Em parceria com" },
  });
  if (anterior.logoParceiroPath !== logo.path) await apagarLogoPropria(anterior.logoParceiroPath);
  // A logo da direita sempre sai com "Em parceria com".
  return { url: await criarUrlAssinada(logo.path), rotulo: "Em parceria com" };
}

export async function removerLogoParceiro(sessao: Sessao, id: string) {
  await exigirAcessoRelatorio(sessao, id, "editar");
  const atual = await prisma.relatorioVisita.findUniqueOrThrow({ where: { id }, select: { logoParceiroPath: true } });
  await prisma.relatorioVisita.update({ where: { id }, data: { logoParceiroPath: null, logoParceiroRotulo: null } });
  await apagarLogoPropria(atual.logoParceiroPath);
}

export async function gerarPdfDoRelatorio(sessao: Sessao, id: string) {
  await exigirAcessoRelatorio(sessao, id, "ver");
  const relatorio = await prisma.relatorioVisita.findUniqueOrThrow({
    where: { id },
    include: {
      cliente: { select: { nome: true, latitude: true, longitude: true } },
      fazenda: { select: { nome: true, latitude: true, longitude: true } },
      consultor: { select: { nome: true } },
      safra: { select: { nome: true } },
      fotos: { orderBy: { ordem: "asc" } },
    },
  });

  // PDF impresso da própria página web (idêntico à tela). O gerador interno só
  // entra se o Chromium do servidor falhar.
  const bytes = await pdfIdenticoAPagina(id, async () => {
    const blocos = await assinarBlocosDeFotos(lerConteudo(relatorio.conteudo, relatorio.texto, await assinarArquivos(relatorio.fotos)));
    return gerarPdfRelatorioVisita({
      tipo: tipoEfetivoRelatorio(relatorio.tipo, blocos),
      clienteNome: relatorio.cliente.nome,
      fazendaNome: relatorio.fazenda?.nome ?? null,
      consultorNome: relatorio.consultor.nome,
      titulo: relatorio.titulo,
      dataVisita: relatorio.dataVisita,
      safraNome: relatorio.safra.nome,
      blocos,
      logoParceiroUrl: await urlLogoParceiro(relatorio.logoParceiroPath),
      mostrarLocalizacao: relatorio.mostrarLocalizacao,
      mostrarHorarios: relatorio.mostrarHorarios,
      semCapa: relatorio.semCapa,
      orientacao: orientacaoDe(relatorio.orientacao),
      escalaLogoPrincipal: relatorio.escalaLogoPrincipal,
      logoPrincipalTexto: relatorio.logoPrincipalTexto,
      escalaLogoPrincipalPaginas: relatorio.escalaLogoPrincipalPaginas,
      escalaLogoParceiro: relatorio.escalaLogoParceiro,
      escalaLogoParceiroPaginas: relatorio.escalaLogoParceiroPaginas,
      logoParceiroRotulo: relatorio.logoParceiroRotulo,
      logoPrincipalUrl: await urlLogoParceiro(relatorio.logoPrincipalPath),
      rastreamento: {
        finalidade: relatorio.finalidade,
        horaChegada: relatorio.horaChegada,
        horaSaida: relatorio.horaSaida,
        kmChegada: relatorio.kmChegada,
        kmSaida: relatorio.kmSaida,
        ...coordenadasDoRelatorio(relatorio),
      },
    });
  });

  const nomeArquivo = `relatorio-${relatorio.cliente.nome.replace(/[^a-zA-Z0-9]+/g, "-")}.pdf`;
  return { bytes, nomeArquivo };
}

// Relatório geral do trabalho: os PDFs de cada visita em ordem de data num
// arquivo só, com a capa do primeiro e as seguintes sem capa (capítulos).
export async function gerarPdfDoTrabalho(sessao: Sessao, trabalhoId: string) {
  const trabalho = await prisma.trabalho.findUnique({
    where: { id: trabalhoId },
    select: {
      nome: true,
      relatorios: {
        where: { status: { not: "AGENDADA" }, ...(ehAdmin(sessao) ? {} : { consultorId: sessao.id }) },
        orderBy: { dataVisita: "asc" },
        select: { id: true, semCapa: true },
      },
    },
  });
  if (!trabalho) throw new ErroNaoEncontrado("Trabalho não encontrado.");
  if (trabalho.relatorios.length === 0) throw new ErroNaoEncontrado("Trabalho sem relatórios.");

  const { PDFDocument } = await import("pdf-lib");
  const final = await PDFDocument.create();
  for (const [i, r] of trabalho.relatorios.entries()) {
    const { bytes } = await gerarPdfDoRelatorio(sessao, r.id);
    const doc = await PDFDocument.load(bytes);
    const indices = doc.getPageIndices().filter((p) => i === 0 || r.semCapa || p > 0);
    for (const pagina of await final.copyPages(doc, indices)) final.addPage(pagina);
  }
  const nomeArquivo = `trabalho-${trabalho.nome.replace(/[^a-zA-Z0-9]+/g, "-")}.pdf`;
  return { bytes: await final.save(), nomeArquivo };
}
