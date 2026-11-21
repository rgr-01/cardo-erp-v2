import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { assinarArquivos, assinarBlocosDeFotos, storageConfigurado } from "@/lib/storage";
import { fotoDeCapa, lerConteudo } from "@/lib/relatorio-conteudo";
import { VisitasPainel, type RelatorioLinha } from "@/components/visitas/visitas-painel";
import { carteiraDeVisitas } from "@/lib/visitas-calendario";
import { categoriaEfetiva } from "@/lib/visitas-categoria";
import { getSafraAtual } from "@/lib/safra-atual";

export const metadata = { title: "Relatórios de visita" };

const POR_PAGINA = 40;

type Params = {
  q?: string;
  cliente?: string;
  consultor?: string;
  categoria?: string;
  de?: string;
  ate?: string;
  ordem?: string;
  pagina?: string;
  resumo?: string;
};

const ehData = (v?: string) => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);
const inicioDoDia = (d: string) => new Date(`${d}T00:00:00-03:00`);
const fimDoDia = (d: string) => new Date(`${d}T23:59:59.999-03:00`);

export default async function VisitasPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const session = await auth();
  const ehAdmin = session!.user.role === "ADMIN";
  const usuarioId = session!.user.id;
  const safra = await getSafraAtual();
  const safraId = safra.id;

  const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  // ?resumo=yyyy-mm-dd (um dia) ou yyyy-mm (o mês inteiro); sem nada, o mês atual.
  const periodoResumo = ehData(params.resumo) || /^\d{4}-(0[1-9]|1[0-2])$/.test(params.resumo ?? "") ? params.resumo! : hoje.slice(0, 7);
  const mesInteiro = periodoResumo.length === 7;
  const inicioResumo = inicioDoDia(mesInteiro ? `${periodoResumo}-01` : periodoResumo);
  const fimResumo = mesInteiro
    ? new Date(new Date(`${periodoResumo}-01T00:00:00-03:00`).setUTCMonth(inicioResumo.getUTCMonth() + 1) - 1)
    : fimDoDia(periodoResumo);
  const pagina = Math.max(1, Number(params.pagina) || 1);

  // Consultor só enxerga as próprias visitas, qualquer que seja o filtro.
  const donoDaVisita: Prisma.RelatorioVisitaWhereInput = ehAdmin
    ? params.consultor
      ? // ?consultor=a,b: um ou mais consultores
        { consultorId: { in: params.consultor.split(",").filter(Boolean) } }
      : {}
    : { consultorId: usuarioId };

  const busca = params.q?.trim() || params.cliente?.trim();
  const where: Prisma.RelatorioVisitaWhereInput = {
    safraId,
    ...donoDaVisita,
    ...(params.categoria
      ? params.categoria === "TECNICA"
        ? { OR: [{ categoria: "TECNICA" }, { categoria: null, tipo: "TECNICO" }] }
        : params.categoria === "RELACIONAMENTO"
          ? { OR: [{ categoria: "RELACIONAMENTO" }, { categoria: null, tipo: { not: "TECNICO" } }] }
          : { categoria: params.categoria }
      : {}),
    ...(ehData(params.de) || ehData(params.ate)
      ? {
          dataVisita: {
            ...(ehData(params.de) ? { gte: inicioDoDia(params.de!) } : {}),
            ...(ehData(params.ate) ? { lte: fimDoDia(params.ate!) } : {}),
          },
        }
      : {}),
    ...(busca
      ? {
          AND: [
            {
              OR: [
                { cliente: { nome: { contains: busca, mode: "insensitive" } } },
                { fazenda: { nome: { contains: busca, mode: "insensitive" } } },
                { titulo: { contains: busca, mode: "insensitive" } },
                { texto: { contains: busca, mode: "insensitive" } },
              ],
            },
          ],
        }
      : {}),
  };

  const linhaInclude = {
    cliente: { select: { nome: true } },
    fazenda: { select: { nome: true } },
    consultor: { select: { nome: true } },
    fotos: { orderBy: { ordem: "asc" } },
  } satisfies Prisma.RelatorioVisitaInclude;

  const [clientes, consultores, relatorios, total, doResumo, carteira, trabalhos] = await Promise.all([
    prisma.cliente.findMany({
      select: {
        id: true,
        nome: true,
        fazendas: { select: { id: true, nome: true }, orderBy: { nome: "asc" } },
      },
      orderBy: { nome: "asc" },
    }),
    ehAdmin
      ? prisma.user.findMany({
          where: { ativo: true },
          select: { id: true, nome: true },
          orderBy: { nome: "asc" },
        })
      : Promise.resolve([]),
    prisma.relatorioVisita.findMany({
      where,
      include: linhaInclude,
      orderBy: { dataVisita: params.ordem === "antigas" ? "asc" : "desc" },
      take: POR_PAGINA,
      skip: (pagina - 1) * POR_PAGINA,
    }),
    prisma.relatorioVisita.count({ where }),
    // Resumo do dia: só quem gerencia a equipe, só visitas já realizadas.
    ehAdmin
      ? prisma.relatorioVisita.findMany({
          where: {
            safraId,
            status: { not: "AGENDADA" },
            OR: [
              { horaChegada: { gte: inicioResumo, lte: fimResumo } },
              { horaChegada: null, dataVisita: { gte: inicioResumo, lte: fimResumo } },
            ],
          },
          include: linhaInclude,
          orderBy: { dataVisita: "asc" },
          take: 2000,
        })
      : Promise.resolve([]),
    carteiraDeVisitas({ consultorId: ehAdmin ? undefined : usuarioId, safraId }),
    prisma.trabalho.findMany({
      where: { safraId, status: { not: "CONCLUIDO" } },
      select: { id: true, nome: true },
      orderBy: { nome: "asc" },
    }),
  ]);

  const linha = async (r: (typeof relatorios)[number]): Promise<RelatorioLinha> => {
    const anexos = await assinarArquivos(r.fotos);
    const blocos = await assinarBlocosDeFotos(lerConteudo(r.conteudo, r.texto, anexos));
    const fotosBloco = blocos.filter((b) => b.tipo === "foto");
    const capa = fotoDeCapa(fotosBloco);
    const fotosOrdenadas = capa ? [capa, ...fotosBloco.filter((foto) => foto.id !== capa.id)] : fotosBloco;
    return ({
    id: r.id,
    tipo: r.tipo === "TECNICO" || r.fotos.length > 0 ? "TECNICO" : "VISITA",
    categoria: categoriaEfetiva({ categoria: r.categoria, tipo: r.tipo }),
    agendada: r.status === "AGENDADA",
    titulo: r.titulo,
    texto: r.texto,
    dataVisita: r.dataVisita.toISOString(),
    clienteNome: r.cliente.nome,
    fazendaNome: r.fazenda?.nome ?? null,
    consultorNome: r.consultor.nome,
    consultorId: r.consultorId,
    fotos: fotosOrdenadas.map((f) => ({ id: f.id, url: f.url, legenda: f.legenda })),
    capaUrl: capa?.url ?? null,
    finalidade: r.finalidade,
    horaChegada: r.horaChegada ? r.horaChegada.toISOString() : null,
    horaSaida: r.horaSaida ? r.horaSaida.toISOString() : null,
    kmChegada: r.kmChegada,
    linkExterno: r.linkExterno,
    });
  };

  return (
    <VisitasPainel
      clientes={clientes}
      consultoresOpcoes={consultores}
      carteira={carteira}
      trabalhos={trabalhos}
      safra={safra}
      usuarioId={usuarioId}
      ehAdmin={ehAdmin}
      storageConfigurado={storageConfigurado()}
      relatorios={await Promise.all(relatorios.map(linha))}
      resumo={{
        periodo: periodoResumo,
        hoje,
        linhas: await Promise.all(doResumo.map(linha)),
      }}
      paginacao={{ pagina, porPagina: POR_PAGINA, total }}
      filtros={{
        q: params.q ?? params.cliente ?? "",
        consultor: params.consultor ?? "",
        categoria: params.categoria ?? "",
        de: params.de ?? "",
        ate: params.ate ?? "",
        ordem: params.ordem === "antigas" ? "antigas" : "recentes",
      }}
    />
  );
}
