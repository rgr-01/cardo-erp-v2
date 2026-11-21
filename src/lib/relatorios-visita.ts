import { prisma } from "@/lib/prisma";
import { exigirVagaDeRelatorio } from "@/lib/limites-empresa";
import { safraIdDaVisita } from "@/lib/safra-da-visita";
import { validarFazendaDoCliente } from "@/lib/servicos/fazendas";
import { assinarUrlArmazenada, enviarBufferFotoVisita, excluirFotoVisita, storageConfigurado } from "@/lib/storage";
import { combinadosPendentes } from "@/lib/combinados";
import { Prisma } from "@/generated/prisma/client";
import {
  acrescentarBlocos,
  blocosDaEstrutura,
  conteudoSchema,
  lerConteudo,
  novoId,
  textoDosBlocos,
  type Bloco,
  type BlocoFoto,
  type BlocoGrafico,
  type AnotacaoFoto,
  type EstruturaRelatorio,
  type SemGeometria,
} from "@/lib/relatorio-conteudo";

const MAX_FOTOS = 8;
// Relatório técnico montado pelo WhatsApp costuma ter mais fotos que o
// formulário web (uma por ponto do talhão/tratamento).
const MAX_FOTOS_WHATSAPP = 20;
const TAMANHO_MAX_BYTES = 8 * 1024 * 1024; // 8MB por foto

export type FotoEntrada = {
  buffer: Buffer;
  contentType: string;
  nomeOriginal: string;
};

export type TipoRelatorio = "VISITA" | "TECNICO";

export async function salvarRelatorioVisita(opts: {
  clienteId: string;
  consultorId: string;
  safraId: string;
  fazendaId?: string | null;
  tipo?: TipoRelatorio;
  categoria?: string | null;
  // AGENDADA = visita marcada para o futuro, ainda sem relato.
  status?: "FECHADA" | "AGENDADA";
  trabalhoId?: string | null;
  titulo?: string | null;
  texto: string;
  estrutura?: EstruturaRelatorio;
  dataVisita?: Date;
  // Localização enviada pelo consultor na visita (WhatsApp). Sem ela, o PDF
  // usa a da fazenda/cliente (ver coordenadasDoRelatorio).
  latitude?: number | null;
  longitude?: number | null;
  fotos?: FotoEntrada[];
  // Documento montado no editor web. As URLs temporárias dos blocos de foto
  // são substituídas pelas URLs definitivas após o upload, na mesma ordem.
  conteudo?: Bloco[];
  mostrarLocalizacao?: boolean;
  mostrarHorarios?: boolean;
  semCapa?: boolean;
  orientacao?: "PAISAGEM" | "RETRATO";
  escalaLogoPrincipal?: number;
  logoPrincipalTexto?: string | null;
  escalaLogoPrincipalPaginas?: number;
  escalaLogoParceiro?: number;
  escalaLogoParceiroPaginas?: number;
}) {
  await exigirVagaDeRelatorio();
  const fotos = opts.fotos ?? [];
  const fazendaId = await validarFazendaDoCliente(opts.fazendaId, opts.clienteId);

  if (fotos.length > MAX_FOTOS) {
    throw new Error(`Máximo de ${MAX_FOTOS} fotos por relatório.`);
  }
  for (const foto of fotos) {
    if (foto.buffer.byteLength > TAMANHO_MAX_BYTES) {
      throw new Error(`A foto "${foto.nomeOriginal}" excede 8MB.`);
    }
  }
  if (fotos.length > 0 && !storageConfigurado()) {
    throw new Error("Storage de fotos ainda não configurado.");
  }
  const fotosDoConteudo = opts.conteudo?.filter((bloco) => bloco.tipo === "foto") ?? [];
  if (opts.conteudo && fotosDoConteudo.length !== fotos.length) {
    throw new Error("As fotos do documento não correspondem aos arquivos enviados.");
  }

  const blocosEstruturados = opts.estrutura ? blocosDaEstrutura(opts.estrutura) : null;
  const dataVisita = opts.dataVisita ?? new Date();
  const relatorio = await prisma.relatorioVisita.create({
    data: {
      clienteId: opts.clienteId,
      fazendaId,
      consultorId: opts.consultorId,
      // A safra sai do ano da visita; `opts.safraId` é só o que o chamador tinha à mão.
      safraId: await safraIdDaVisita(dataVisita),
      tipo: opts.tipo ?? "VISITA",
      categoria: opts.categoria || null,
      mostrarLocalizacao: opts.mostrarLocalizacao ?? true,
      mostrarHorarios: opts.mostrarHorarios ?? true,
      semCapa: opts.semCapa ?? false,
      orientacao: opts.orientacao ?? "PAISAGEM",
      escalaLogoPrincipal: opts.escalaLogoPrincipal ?? 1,
      logoPrincipalTexto: opts.logoPrincipalTexto ?? null,
      escalaLogoPrincipalPaginas: opts.escalaLogoPrincipalPaginas ?? 1,
      escalaLogoParceiro: opts.escalaLogoParceiro ?? 1,
      escalaLogoParceiroPaginas: opts.escalaLogoParceiroPaginas ?? 1,
      status: opts.status ?? "FECHADA",
      trabalhoId: opts.trabalhoId || null,
      titulo: opts.titulo || null,
      texto: opts.conteudo
        ? textoDosBlocos(opts.conteudo) || opts.texto
        : blocosEstruturados
          ? textoDosBlocos(blocosEstruturados)
          : opts.texto,
      conteudo: blocosEstruturados
        ? (blocosEstruturados as unknown as Prisma.InputJsonValue)
        : opts.conteudo && fotos.length === 0
          ? (opts.conteudo as unknown as Prisma.InputJsonValue)
          : undefined,
      dataVisita,
      latitude: opts.latitude ?? null,
      longitude: opts.longitude ?? null,
    },
  });
  // Criado dentro de um trabalho ("Gerar relatório aqui"): capa do trabalho.
  if (relatorio.trabalhoId) await aplicarCapaDoTrabalho([relatorio.id], relatorio.trabalhoId);

  if (fotos.length > 0) {
    const enviadas = await Promise.all(
      fotos.map((f) =>
        enviarBufferFotoVisita(f.buffer, f.contentType, f.nomeOriginal, relatorio.id)
      )
    );
    const conteudoFinal = opts.conteudo?.map((bloco) => {
      if (bloco.tipo !== "foto") return bloco;
      const indice = fotosDoConteudo.findIndex((foto) => foto.id === bloco.id);
      const enviada = enviadas[indice];
      return { ...bloco, url: enviada.url, path: enviada.path };
    });
    await prisma.$transaction([
      prisma.fotoVisita.createMany({
        data: enviadas.map((f, i) => ({
          relatorioId: relatorio.id,
          url: f.url,
          path: f.path,
          legenda: fotosDoConteudo[i]?.legenda ?? null,
          ordem: i,
        })),
      }),
      ...(conteudoFinal
        ? [prisma.relatorioVisita.update({
            where: { id: relatorio.id },
            data: {
              conteudo: conteudoFinal as unknown as Prisma.InputJsonValue,
              texto: textoDosBlocos(conteudoFinal) || opts.texto,
            },
          })]
        : []),
    ]);
  }

  return relatorio;
}

export async function buscarVisitaAbertaPorConsultor(consultorId: string) {
  return prisma.relatorioVisita.findFirst({
    where: { consultorId, status: "ABERTA" },
    include: { cliente: { select: { nome: true } } },
    orderBy: { horaChegada: "desc" },
  });
}

export async function abrirVisita(opts: {
  clienteId: string;
  fazendaId?: string | null;
  consultorId: string;
  safraId: string;
  tipo?: TipoRelatorio;
  categoria?: string | null;
  finalidade: string;
  kmChegada: number;
  // Check-in mandado sem internet: a hora em que o consultor enviou.
  horaChegada?: Date;
  latitude?: number | null;
  longitude?: number | null;
}) {
  const horaChegada = opts.horaChegada ?? new Date();
  const fazendaId = await validarFazendaDoCliente(opts.fazendaId, opts.clienteId);
  return prisma.relatorioVisita.create({
    data: {
      clienteId: opts.clienteId,
      fazendaId,
      consultorId: opts.consultorId,
      safraId: await safraIdDaVisita(horaChegada),
      tipo: opts.tipo ?? "VISITA",
      categoria: opts.categoria || null,
      titulo: opts.finalidade,
      texto: opts.finalidade,
      finalidade: opts.finalidade,
      kmChegada: opts.kmChegada,
      horaChegada,
      dataVisita: horaChegada,
      latitude: opts.latitude ?? null,
      longitude: opts.longitude ?? null,
      status: "ABERTA",
    },
  });
}

export async function fecharVisita(
  id: string,
  opts: { kmSaida: number; texto?: string; horaSaida?: Date }
) {
  return prisma.relatorioVisita.update({
    where: { id },
    data: {
      kmSaida: opts.kmSaida,
      horaSaida: opts.horaSaida ?? new Date(),
      status: "FECHADA",
      ...(opts.texto ? { texto: opts.texto } : {}),
    },
  });
}

// Coordenadas que aparecem no relatório: as do check-in/localização enviada
// na visita; sem elas (visita de rotina em que só se falou o cliente), as da
// fazenda e, por fim, as do cadastro do cliente.
export function coordenadasDoRelatorio(r: {
  latitude: number | null;
  longitude: number | null;
  fazenda?: { latitude: number | null; longitude: number | null } | null;
  cliente: { latitude: number | null; longitude: number | null };
}): { latitude: number | null; longitude: number | null } {
  const fontes = [r, r.fazenda, r.cliente];
  for (const f of fontes) {
    if (f && f.latitude != null && f.longitude != null) {
      return { latitude: f.latitude, longitude: f.longitude };
    }
  }
  return { latitude: null, longitude: null };
}

export function formatarDuracao(inicio: Date, fim: Date): string {
  const minutos = Math.max(0, Math.round((fim.getTime() - inicio.getTime()) / 60000));
  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;
  if (horas === 0) return `${resto}min`;
  return `${horas}h${resto > 0 ? ` ${resto}min` : ""}`;
}

// Relatório que já passou pelo editor web tem `conteudo` (blocos) e é dele
// que o PDF sai — mudanças vindas do WhatsApp precisam entrar nos blocos, não
// só no `texto`, senão somem do PDF.
function blocosSalvos(conteudo: unknown): Bloco[] | null {
  if (conteudo == null) return null;
  const parsed = conteudoSchema.safeParse(conteudo);
  return parsed.success && parsed.data.length > 0 ? parsed.data : null;
}

export async function complementarRelatorio(
  id: string,
  opts: { texto: string; modo: "acrescentar" | "substituir"; estrutura?: EstruturaRelatorio }
) {
  const relatorio = await prisma.relatorioVisita.findUnique({
    where: { id },
    select: {
      texto: true, finalidade: true, conteudo: true,
      fotos: { select: { url: true, path: true, legenda: true }, orderBy: { ordem: "asc" } },
    },
  });
  if (!relatorio) throw new Error("Relatório não encontrado.");

  const novoTexto = opts.texto.trim();
  // Visita aberta por check-in nasce com a finalidade como texto provisório:
  // o primeiro relato de verdade substitui em vez de ir colado nela.
  const soPlaceholder =
    !relatorio.texto.trim() ||
    relatorio.texto.trim() === (relatorio.finalidade ?? "").trim();
  const modo = soPlaceholder ? "substituir" : opts.modo;

  const blocos = blocosSalvos(relatorio.conteudo);
  if (blocos) {
    let atualizados: Bloco[];
    if (opts.estrutura) {
      const novos = blocosDaEstrutura(opts.estrutura);
      atualizados = modo === "acrescentar"
        ? [...blocos, ...novos]
        : [...novos, ...blocos.filter((b) => b.tipo !== "texto")];
    } else if (modo === "acrescentar") {
      atualizados = acrescentarBlocos(blocos, [{ id: novoId(), tipo: "texto", texto: novoTexto }]);
    } else {
      const primeiroTexto = blocos.findIndex((b) => b.tipo === "texto");
      if (primeiroTexto === -1) {
        atualizados = acrescentarBlocos(blocos, [{ id: novoId(), tipo: "texto", texto: novoTexto }]);
      } else {
        atualizados = blocos
          .filter((b, i) => b.tipo !== "texto" || i === primeiroTexto)
          .map((b) => (b.tipo === "texto" ? { ...b, texto: novoTexto } : b));
      }
    }
    return prisma.relatorioVisita.update({
      where: { id },
      data: {
        conteudo: atualizados as unknown as Prisma.InputJsonValue,
        texto: textoDosBlocos(atualizados) || novoTexto,
      },
    });
  }

  return prisma.relatorioVisita.update({
    where: { id },
    data: {
      texto: modo === "acrescentar" ? `${relatorio.texto.trim()}\n\n${novoTexto}` : novoTexto,
      ...(opts.estrutura && modo === "substituir"
        ? {
            conteudo: acrescentarBlocos(
              blocosDaEstrutura(opts.estrutura),
              relatorio.fotos.map((foto) => ({
                id: novoId(), tipo: "foto" as const, url: foto.url,
                path: foto.path, legenda: foto.legenda,
              }))
            ) as unknown as Prisma.InputJsonValue,
          }
        : {}),
    },
  });
}

// Devolve, na mesma ordem de `fotos`, o id da FotoVisita criada (ou null se
// aquela foto foi descartada).
export async function anexarFotosRelatorio(
  id: string,
  fotos: (FotoEntrada & { legenda?: string | null })[]
): Promise<(string | null)[]> {
  if (fotos.length === 0) return [];
  if (!storageConfigurado()) throw new Error("Storage de fotos ainda não configurado.");

  const relatorio = await prisma.relatorioVisita.findUnique({
    where: { id },
    select: { conteudo: true, _count: { select: { fotos: true } } },
  });
  if (!relatorio) throw new Error("Relatório não encontrado.");
  if (relatorio._count.fotos + fotos.length > MAX_FOTOS_WHATSAPP) {
    throw new Error(
      `O relatório já tem ${relatorio._count.fotos} foto(s); o limite é ${MAX_FOTOS_WHATSAPP}.`
    );
  }

  const ids: (string | null)[] = [];
  const enviadas = [];
  for (const foto of fotos) {
    if (foto.buffer.byteLength > TAMANHO_MAX_BYTES) {
      ids.push(null);
      continue;
    }
    const enviada = await enviarBufferFotoVisita(
      foto.buffer,
      foto.contentType,
      foto.nomeOriginal,
      id
    );
    const criada = await prisma.fotoVisita.create({
      data: {
        relatorioId: id,
        url: enviada.url,
        path: enviada.path,
        legenda: foto.legenda ?? null,
        ordem: relatorio._count.fotos + enviadas.length,
      },
      select: { id: true },
    });
    ids.push(criada.id);
    enviadas.push({ ...enviada, legenda: foto.legenda ?? null });
  }
  if (enviadas.length === 0) return ids;

  const blocos = blocosSalvos(relatorio.conteudo);
  if (blocos) {
    const atualizados = acrescentarBlocos(
      blocos,
      enviadas.map((f) => ({
        id: novoId(),
        tipo: "foto" as const,
        url: f.url,
        path: f.path,
        legenda: f.legenda,
      }))
    );
    const primeiroEncaminhamento = atualizados.findIndex(
      (b) => b.tipo === "texto" && b.secao === "encaminhamentos"
    );
    if (primeiroEncaminhamento >= 0) {
      const fotosNovas = atualizados.splice(blocos.length);
      atualizados.splice(primeiroEncaminhamento, 0, ...fotosNovas);
    }
    await prisma.relatorioVisita.update({
      where: { id },
      data: { conteudo: atualizados as unknown as Prisma.InputJsonValue },
    });
  }

  return ids;
}

// Troca a legenda de uma foto já anexada — na tabela e no bloco do editor,
// que é de onde o PDF sai quando o relatório tem `conteudo`.
export async function atualizarLegendaFoto(fotoVisitaId: string, legenda: string) {
  const foto = await prisma.fotoVisita.update({
    where: { id: fotoVisitaId },
    data: { legenda },
    select: { url: true, relatorioId: true },
  });

  const relatorio = await prisma.relatorioVisita.findUnique({
    where: { id: foto.relatorioId },
    select: { conteudo: true },
  });
  const blocos = blocosSalvos(relatorio?.conteudo);
  if (blocos?.some((b) => b.tipo === "foto" && b.url === foto.url)) {
    const atualizados = blocos.map((b) =>
      b.tipo === "foto" && b.url === foto.url ? { ...b, legenda } : b
    );
    await prisma.relatorioVisita.update({
      where: { id: foto.relatorioId },
      data: { conteudo: atualizados as unknown as Prisma.InputJsonValue },
    });
  }
}

export async function excluirRelatorioVisitaPorId(id: string) {
  const relatorio = await prisma.relatorioVisita.findUnique({
    where: { id },
    include: { fotos: true },
  });
  if (!relatorio) throw new Error("Relatório não encontrado.");

  await prisma.relatorioVisita.delete({ where: { id } });

  if (storageConfigurado()) {
    await Promise.all(
      relatorio.fotos.map((f) => excluirFotoVisita(f.path).catch(() => {}))
    );
  }

  return relatorio;
}

// Gráfico montado pelo bot do WhatsApp. Entra no documento de blocos (o
// mesmo do editor web), antes dos encaminhamentos — como as fotos —, e sai
// no PDF. Relatório que ainda não tinha `conteudo` ganha o documento a partir
// do texto e das fotos, sem perder nada.
export async function adicionarGraficoRelatorio(
  id: string,
  grafico: Omit<SemGeometria<BlocoGrafico>, "id" | "tipo">
) {
  const relatorio = await prisma.relatorioVisita.findUnique({
    where: { id },
    select: {
      texto: true,
      conteudo: true,
      fotos: { select: { url: true, path: true, legenda: true }, orderBy: { ordem: "asc" } },
    },
  });
  if (!relatorio) throw new Error("Relatório não encontrado.");

  const blocos = lerConteudo(relatorio.conteudo, relatorio.texto, relatorio.fotos);
  const atualizados = acrescentarBlocos(blocos, [{ id: novoId(), tipo: "grafico", ...grafico }]);
  const primeiroEncaminhamento = atualizados.findIndex(
    (b) => b.tipo === "texto" && b.secao === "encaminhamentos"
  );
  if (primeiroEncaminhamento >= 0) {
    const novo = atualizados.splice(blocos.length);
    atualizados.splice(primeiroEncaminhamento, 0, ...novo);
  }

  await prisma.relatorioVisita.update({
    where: { id },
    data: { conteudo: atualizados as unknown as Prisma.InputJsonValue },
  });
}

// Fotos do relatório na ordem em que aparecem (a "foto 2" do consultor é a
// segunda que ele vê no PDF), já como blocos — com enquadramento e marcações.
export async function fotosDoRelatorio(id: string): Promise<BlocoFoto[]> {
  const relatorio = await prisma.relatorioVisita.findUnique({
    where: { id },
    select: {
      texto: true,
      conteudo: true,
      fotos: { select: { url: true, path: true, legenda: true }, orderBy: { ordem: "asc" } },
    },
  });
  if (!relatorio) throw new Error("Relatório não encontrado.");
  return lerConteudo(relatorio.conteudo, relatorio.texto, relatorio.fotos).filter(
    (b): b is BlocoFoto => b.tipo === "foto"
  );
}

// Grava as marcações da foto na posição `indice` (0 = primeira, na ordem de
// fotosDoRelatorio). Pela posição e não pelo id: em relatório antigo, sem blocos
// salvos, lerConteudo monta ids novos a cada leitura. Esse relatório passa a ter
// os blocos gravados, como em adicionarGraficoRelatorio.
export async function salvarAnotacoesFoto(id: string, indice: number, anotacoes: AnotacaoFoto[]) {
  const relatorio = await prisma.relatorioVisita.findUnique({
    where: { id },
    select: {
      texto: true,
      conteudo: true,
      fotos: { select: { url: true, path: true, legenda: true }, orderBy: { ordem: "asc" } },
    },
  });
  if (!relatorio) throw new Error("Relatório não encontrado.");
  const blocos = lerConteudo(relatorio.conteudo, relatorio.texto, relatorio.fotos);
  const alvo = blocos.filter((b) => b.tipo === "foto")[indice];
  if (!alvo) throw new Error("Foto não encontrada no relatório.");
  const atualizados = blocos.map((b) => (b === alvo ? { ...b, anotacoes } : b));
  await prisma.relatorioVisita.update({
    where: { id },
    data: { conteudo: atualizados as unknown as Prisma.InputJsonValue },
  });
}

// Itens do relatório numerados como o consultor vê na página (1 = primeiro
// bloco), em uma linha cada — pra IA saber o que foi circulado na prévia e
// pro bot editar o item certo (editarItemRelatorio usa a mesma numeração).
export async function itensDoRelatorio(id: string): Promise<{ numero: number; tipo: string; resumo: string }[]> {
  const relatorio = await prisma.relatorioVisita.findUnique({
    where: { id },
    select: {
      texto: true,
      conteudo: true,
      fotos: { select: { url: true, path: true, legenda: true }, orderBy: { ordem: "asc" } },
    },
  });
  if (!relatorio) throw new Error("Relatório não encontrado.");
  const curto = (t: string | null | undefined) => (t ?? "").replace(/\s+/g, " ").trim().slice(0, 220);
  return lerConteudo(relatorio.conteudo, relatorio.texto, relatorio.fotos).map((b, i) => {
    const numero = i + 1;
    switch (b.tipo) {
      case "texto":
        return { numero, tipo: b.secao ? `texto (${b.secao})` : "texto", resumo: curto(b.texto) };
      case "grafico":
        return {
          numero, tipo: `gráfico ${b.formato}`,
          resumo: `${b.titulo} — séries: ${b.series.join(", ")}; ${b.linhas.map((l) => `${l.rotulo}: ${l.valores.join("/")}`).join("; ")}`.slice(0, 300),
        };
      case "foto":
        return { numero, tipo: "foto", resumo: curto(b.legenda) || "(sem legenda)" };
      case "tabela":
        return { numero, tipo: "tabela", resumo: `${b.titulo} — ${b.cabecalhos.join(" | ")}` };
      case "destaque":
        return { numero, tipo: `destaque ${b.variante}`, resumo: curto(`${b.titulo ?? ""} ${b.texto}`) };
      case "indicadores":
        return { numero, tipo: "indicadores", resumo: b.itens.map((it) => `${it.rotulo}: ${it.valor}`).join("; ") };
      default:
        return { numero, tipo: b.tipo, resumo: "" };
    }
  });
}

export type MudancaItem =
  | { acao: "texto"; texto: string }
  | { acao: "titulo"; titulo: string }
  | { acao: "grafico"; grafico: Pick<BlocoGrafico, "titulo" | "formato" | "series" | "linhas" | "unidade" | "eixoX" | "eixoY" | "cores"> }
  | { acao: "tamanho"; largura: "terco" | "metade" | "inteira"; proporcao?: BlocoFoto["proporcao"]; anotacoes?: AnotacaoFoto[]; focoY?: number }
  | { acao: "remover" };

// Muda um item pela numeração de itensDoRelatorio. Texto novo descarta a
// formatação por trecho (trechos), que apontava pro texto antigo.
export async function editarItemRelatorio(id: string, numero: number, mudanca: MudancaItem): Promise<Bloco> {
  const relatorio = await prisma.relatorioVisita.findUnique({
    where: { id },
    select: {
      texto: true,
      conteudo: true,
      fotos: { select: { id: true, url: true, path: true, legenda: true }, orderBy: { ordem: "asc" } },
    },
  });
  if (!relatorio) throw new Error("Relatório não encontrado.");
  const blocos = lerConteudo(relatorio.conteudo, relatorio.texto, relatorio.fotos);
  const alvo = blocos[numero - 1];
  if (!alvo) throw new Error(`O relatório tem ${blocos.length} itens; não existe o item ${numero}.`);

  let novo: Bloco | null = alvo;
  if (mudanca.acao === "remover") {
    novo = null;
  } else if (mudanca.acao === "texto") {
    if (alvo.tipo === "texto") novo = { ...alvo, texto: mudanca.texto, trechos: undefined };
    else if (alvo.tipo === "destaque") novo = { ...alvo, texto: mudanca.texto };
    else if (alvo.tipo === "foto") novo = { ...alvo, legenda: mudanca.texto };
    else throw new Error(`O item ${numero} é ${alvo.tipo}, não tem texto pra trocar.`);
  } else if (mudanca.acao === "titulo") {
    if (alvo.tipo === "grafico" || alvo.tipo === "tabela") novo = { ...alvo, titulo: mudanca.titulo };
    else if (alvo.tipo === "texto" || alvo.tipo === "destaque" || alvo.tipo === "foto") novo = { ...alvo, titulo: mudanca.titulo };
    else throw new Error(`O item ${numero} não tem título.`);
  } else if (mudanca.acao === "tamanho") {
    if (alvo.tipo === "foto") {
      novo = {
        ...alvo,
        largura: mudanca.largura,
        ...(mudanca.proporcao ? { proporcao: mudanca.proporcao } : {}),
        ...(mudanca.anotacoes ? { anotacoes: mudanca.anotacoes } : {}),
        ...(mudanca.focoY != null ? { focoY: mudanca.focoY } : {}),
      };
    } else if (alvo.tipo === "grafico" || alvo.tipo === "tabela") novo = { ...alvo, largura: mudanca.largura };
    else throw new Error(`O item ${numero} é ${alvo.tipo}: tamanho só muda em foto, gráfico ou tabela.`);
  } else if (mudanca.acao === "grafico") {
    if (alvo.tipo !== "grafico") throw new Error(`O item ${numero} não é gráfico.`);
    novo = { ...alvo, ...mudanca.grafico };
  }

  // Foto tirada da página continua guardada (FotoVisita e arquivo): o
  // desfazer do bot traz de volta, e o editor do site limpa ao salvar.
  const atualizados = novo ? blocos.map((b) => (b === alvo ? novo : b)) : blocos.filter((b) => b !== alvo);
  await prisma.relatorioVisita.update({
    where: { id },
    data: {
      conteudo: atualizados as unknown as Prisma.InputJsonValue,
      texto: textoDosBlocos(atualizados),
    },
  });
  return novo ?? alvo;
}

// Mesma regra da web (atualizarStatusEditorialRelatorio): aprovação final só
// pelo gestor; o consultor que dá o ok manda pra revisão.
export async function aprovarRelatorio(id: string, gestor: boolean): Promise<"APROVADO" | "EM_REVISAO"> {
  const status = gestor ? "APROVADO" : "EM_REVISAO";
  await prisma.relatorioVisita.update({
    where: { id },
    data: { statusDocumento: status, aprovadoEm: gestor ? new Date() : null },
  });
  return status;
}

// Capa do relatório pelo bot. "sem_foto": capa continua, sem foto (todas as
// fotos com capa: false — ver fotoDeCapa); "foto": a foto `numero` (1 = primeira)
// vira a da capa; "sem_capa"/"com_capa": tira ou volta a página de capa inteira.
export async function ajustarCapaRelatorio(
  id: string,
  acao: "sem_foto" | "foto" | "sem_capa" | "com_capa",
  numero?: number
) {
  if (acao === "sem_capa" || acao === "com_capa") {
    await prisma.relatorioVisita.update({ where: { id }, data: { semCapa: acao === "sem_capa" } });
    return;
  }
  const relatorio = await prisma.relatorioVisita.findUnique({
    where: { id },
    select: {
      texto: true,
      conteudo: true,
      fotos: { select: { url: true, path: true, legenda: true }, orderBy: { ordem: "asc" } },
    },
  });
  if (!relatorio) throw new Error("Relatório não encontrado.");
  const blocos = lerConteudo(relatorio.conteudo, relatorio.texto, relatorio.fotos);
  const fotos = blocos.filter((b) => b.tipo === "foto");
  if (fotos.length === 0) throw new Error("O relatório não tem foto.");
  const escolhida = acao === "foto" ? fotos[(numero ?? 1) - 1] : null;
  if (acao === "foto" && !escolhida) throw new Error(`O relatório tem ${fotos.length} foto(s); não existe a foto ${numero}.`);
  const atualizados = blocos.map((b) => (b.tipo === "foto" ? { ...b, capa: b === escolhida } : b));
  await prisma.relatorioVisita.update({
    where: { id },
    data: {
      conteudo: atualizados as unknown as Prisma.InputJsonValue,
      ...(acao === "foto" ? { semCapa: false } : {}),
    },
  });
}

// ---------------------------------------------------------------------------
// Desfazer do bot: antes de cada mudança feita pelo WhatsApp, o estado atual
// vira uma versão com origem BOT; "volta como estava" restaura a mais recente
// e a apaga (assim um segundo "desfaz" volta mais um passo).

export async function guardarVersaoBot(id: string) {
  const atual = await prisma.relatorioVisita.findUnique({
    where: { id },
    select: { titulo: true, texto: true, conteudo: true },
  });
  if (!atual) return;
  const ultima = await prisma.relatorioVisitaVersao.aggregate({ where: { relatorioId: id }, _max: { numero: true } });
  await prisma.relatorioVisitaVersao.create({
    data: {
      relatorioId: id,
      numero: (ultima._max.numero ?? 0) + 1,
      titulo: atual.titulo,
      texto: atual.texto,
      conteudo: atual.conteudo ?? Prisma.JsonNull,
      origem: "BOT",
    },
  });
}

export async function desfazerUltimaMudancaBot(id: string): Promise<{ desfeito: boolean; restantes: number }> {
  const versao = await prisma.relatorioVisitaVersao.findFirst({
    where: { relatorioId: id, origem: "BOT" },
    orderBy: { numero: "desc" },
    select: { id: true, titulo: true, texto: true, conteudo: true },
  });
  if (!versao) return { desfeito: false, restantes: 0 };
  await prisma.$transaction([
    prisma.relatorioVisita.update({
      where: { id },
      data: { titulo: versao.titulo, texto: versao.texto, conteudo: versao.conteudo ?? Prisma.JsonNull },
    }),
    prisma.relatorioVisitaVersao.delete({ where: { id: versao.id } }),
  ]);
  const restantes = await prisma.relatorioVisitaVersao.count({ where: { relatorioId: id, origem: "BOT" } });
  return { desfeito: true, restantes };
}

// ---------------------------------------------------------------------------
// Contexto do cliente pro bot escrever com continuidade: últimas visitas
// (com o que foi relatado), combinados pendentes, trabalhos da safra e vendas
// em aberto.

export async function contextoDoCliente(clienteId: string, opcoes: { fazendaId?: string | null; excetoRelatorioId?: string } = {}) {
  const [cliente, trabalhos, visitas, combinados, vendas] = await Promise.all([
    prisma.cliente.findUnique({
      where: { id: clienteId },
      select: {
        nome: true, cidade: true, uf: true,
        fazendas: { select: { id: true, nome: true } },
      },
    }),
    // Trabalhos abertos do cliente + os sem cliente (áreas demonstrativas e
    // ensaios gerais da equipe), senão o bot não acha onde vincular.
    prisma.trabalho.findMany({
      where: { status: { not: "CONCLUIDO" }, OR: [{ clientes: { some: { id: clienteId } } }, { clientes: { none: {} } }] },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true, nome: true, tipo: true, status: true, produto: true, fornecedor: true, cultura: true, dataPrevista: true,
        _count: { select: { relatorios: true } },
      },
      take: 10,
    }),
    prisma.relatorioVisita.findMany({
      where: {
        clienteId,
        ...(opcoes.fazendaId ? { OR: [{ fazendaId: opcoes.fazendaId }, { fazendaId: null }] } : {}),
        ...(opcoes.excetoRelatorioId ? { id: { not: opcoes.excetoRelatorioId } } : {}),
      },
      orderBy: { dataVisita: "desc" },
      take: 5,
      select: {
        id: true, dataVisita: true, tipo: true, categoria: true, titulo: true, texto: true,
        consultor: { select: { nome: true } }, fazenda: { select: { nome: true } },
        _count: { select: { fotos: true } },
      },
    }),
    combinadosPendentes({ clienteId }),
    prisma.venda.findMany({
      where: { clienteId, status: { in: ["PROSPECCAO", "NEGOCIACAO", "FECHADO"] } },
      select: { status: true, volume: true, cultura: true, produto: { select: { nome: true } } },
      orderBy: { updatedAt: "desc" },
      take: 5,
    }),
  ]);
  if (!cliente) throw new Error("Cliente não encontrado.");
  const dia = (d: Date) => d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
  return {
    cliente: cliente.nome,
    local: [cliente.cidade, cliente.uf].filter(Boolean).join("/") || null,
    ultimas_visitas: visitas.map((v) => ({
      relatorio_id: v.id,
      data: dia(v.dataVisita),
      dias_atras: Math.round((Date.now() - v.dataVisita.getTime()) / 86_400_000),
      tipo: v.tipo === "TECNICO" ? "técnico" : "visita",
      categoria: v.categoria,
      titulo: v.titulo,
      fazenda: v.fazenda?.nome ?? null,
      consultor: v.consultor.nome,
      fotos: v._count.fotos,
      relato: v.texto.replace(/\s+/g, " ").slice(0, 600),
    })),
    combinados_pendentes: combinados.map((c) => ({
      combinado_id: c.id,
      texto: c.texto,
      data_prevista: c.dataPrevista ? dia(c.dataPrevista) : null,
      atrasado: Boolean(c.dataPrevista && c.dataPrevista.getTime() < Date.now() - 86_400_000),
    })),
    trabalhos_da_safra: trabalhos.map(({ _count, ...t }) => ({ ...t, relatorios: _count.relatorios, dataPrevista: t.dataPrevista ? dia(t.dataPrevista) : null })),
    vendas_em_aberto: vendas.map((v) => ({ produto: v.produto.nome, status: v.status, volume: v.volume, cultura: v.cultura })),
  };
}

// Copia fotos de um relatório anterior pro atual (comparativo antes/depois):
// baixa do storage e anexa como fotos novas, com a data na legenda.
export async function copiarFotosDeOutroRelatorio(destinoId: string, origemId: string, numeros: number[] | null) {
  const origem = await prisma.relatorioVisita.findUnique({
    where: { id: origemId },
    select: { dataVisita: true, fotos: { select: { url: true, path: true, legenda: true }, orderBy: { ordem: "asc" } } },
  });
  if (!origem) throw new Error("Relatório anterior não encontrado.");
  const escolhidas = numeros?.length ? numeros.map((n) => origem.fotos[n - 1]).filter(Boolean) : origem.fotos.slice(0, 4);
  if (escolhidas.length === 0) throw new Error("O relatório anterior não tem essas fotos.");
  const data = origem.dataVisita.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
  const entradas = [];
  for (const [i, foto] of escolhidas.entries()) {
    const resposta = await fetch(await assinarUrlArmazenada(foto));
    if (!resposta.ok) continue;
    entradas.push({
      buffer: Buffer.from(await resposta.arrayBuffer()),
      contentType: resposta.headers.get("content-type") || "image/jpeg",
      nomeOriginal: `anterior-${i}.jpg`,
      legenda: `Visita anterior (${data})${foto.legenda ? ` — ${foto.legenda}` : ""}`,
    });
  }
  if (entradas.length === 0) throw new Error("Não consegui baixar as fotos da visita anterior.");
  const ids = await anexarFotosRelatorio(destinoId, entradas);
  return { copiadas: ids.filter(Boolean).length, data };
}

// Capa de relatório de TRABALHO (ensaio, área demonstrativa…): em vez do
// cliente, mostra as visitas técnicas do trabalho a esse cliente, com as datas.
export async function visitasDoTrabalho(relatorio: { trabalhoId: string | null; clienteId: string }): Promise<string[] | undefined> {
  if (!relatorio.trabalhoId) return undefined;
  const visitas = await prisma.relatorioVisita.findMany({
    where: { trabalhoId: relatorio.trabalhoId, clienteId: relatorio.clienteId },
    orderBy: { dataVisita: "asc" },
    select: { dataVisita: true },
  });
  return [...new Set(visitas.map((v) => v.dataVisita.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })))];
}

// Capa padrão de relatório de TRABALHO (vale no site e no bot), só no que o
// relatório ainda não tem: copia logo/texto do programa e o parceiro do
// relatório mais recente do mesmo trabalho; no primeiro do trabalho, usa a
// logo de PROGRAMA da biblioteca (ex.: "DTR - Difusão de Tecnologia" →
// "PROGRAMA / Difusão de Tecnologia").
export async function aplicarCapaDoTrabalho(ids: string[], trabalhoId: string) {
  const modelo = await prisma.relatorioVisita.findFirst({
    where: { trabalhoId, id: { notIn: ids }, OR: [{ logoPrincipalPath: { not: null } }, { logoParceiroPath: { not: null } }] },
    orderBy: { updatedAt: "desc" },
    select: {
      logoPrincipalPath: true, logoPrincipalTexto: true, escalaLogoPrincipal: true,
      logoParceiroPath: true, logoParceiroRotulo: true, escalaLogoParceiro: true,
    },
  });
  const programa = modelo?.logoPrincipalPath
    ? null
    : await prisma.logoRelatorio.findFirst({ where: { tipo: "PROGRAMA" }, orderBy: { createdAt: "asc" }, select: { nome: true, path: true } });
  const principal = modelo?.logoPrincipalPath
    ? { logoPrincipalPath: modelo.logoPrincipalPath, logoPrincipalTexto: modelo.logoPrincipalTexto, escalaLogoPrincipal: modelo.escalaLogoPrincipal }
    : programa
      // Logo do programa grande na capa (1,9×), com o texto ao lado.
      ? { logoPrincipalPath: programa.path, logoPrincipalTexto: `PROGRAMA\n${programa.nome.split(/\s+[-–—]\s+/)[1] ?? programa.nome}`, escalaLogoPrincipal: 1.9 }
      : null;
  const parceiro = modelo?.logoParceiroPath
    ? { logoParceiroPath: modelo.logoParceiroPath, logoParceiroRotulo: modelo.logoParceiroRotulo, escalaLogoParceiro: modelo.escalaLogoParceiro }
    : null;

  const atuais = await prisma.relatorioVisita.findMany({
    where: { id: { in: ids } },
    select: { id: true, logoPrincipalPath: true, logoParceiroPath: true },
  });
  for (const atual of atuais) {
    await prisma.relatorioVisita.update({
      where: { id: atual.id },
      data: {
        tipo: "TECNICO",
        ...(principal && !atual.logoPrincipalPath ? principal : {}),
        ...(parceiro && !atual.logoParceiroPath ? parceiro : {}),
      },
    });
  }
  return { tem_programa: Boolean(principal), tem_parceiro: Boolean(parceiro) || atuais.every((a) => a.logoParceiroPath) };
}

// Liga um relatório (do bot) a um trabalho, com a capa padrão do trabalho.
export async function vincularTrabalho(id: string, trabalhoId: string) {
  const relatorio = await prisma.relatorioVisita.update({ where: { id }, data: { trabalhoId }, select: { clienteId: true } });
  // O cliente passa a fazer parte do trabalho: as próximas visitas já
  // aparecem nele e entram na sequência do mesmo trabalho.
  if (relatorio.clienteId) {
    await prisma.trabalho.update({ where: { id: trabalhoId }, data: { clientes: { connect: { id: relatorio.clienteId } } } });
  }
  return aplicarCapaDoTrabalho([id], trabalhoId);
}
