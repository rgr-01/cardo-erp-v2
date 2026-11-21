import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getSafraAtualId } from "@/lib/safra-atual";
import { ClientesPainel } from "@/components/clientes/clientes-painel";

export async function ClientesConteudo({ modo }: { modo: "lista" | "mapa" }) {
  const session = await auth();
  const ehAdmin = session!.user.role === "ADMIN";
  const safraId = await getSafraAtualId();

  const [clientes, consultores, usuariosComCor, visitasPorCliente] = await Promise.all([
    prisma.cliente.findMany({
      // Consultor so' ve os proprios clientes (consultorId vinculado); admin
      // ve todos (ver lib/servicos/clientes.ts).
      where: ehAdmin ? {} : { consultorId: session!.user.id },
      include: {
        // Vendas e visitas contadas só na safra selecionada.
        _count: {
          select: {
            vendas: { where: { safraId } },
            relatoriosVisita: { where: { safraId, status: { not: "AGENDADA" } } },
            fazendas: true,
          },
        },
        consultor: { select: { id: true, nome: true } },
        fazendas: { select: { nome: true } },
      },
      orderBy: { nome: "asc" },
    }),
    prisma.user.findMany({
      where: { ativo: true },
      select: { id: true, nome: true },
      orderBy: { nome: "asc" },
    }),
    // Cor escolhida vale também para consultor inativo que ainda tem clientes
    // no mapa (ex.: saiu da equipe) — senão a escolha some ao recarregar.
    prisma.user.findMany({
      where: { corMapa: { not: null } },
      select: { id: true, corMapa: true },
    }),
    // Última visita de cada cliente numa agregação só, em vez de carregar
    // todas as visitas de todos os clientes pra aproveitar a primeira.
    prisma.relatorioVisita.groupBy({
      by: ["clienteId"],
      where: { safraId, status: { not: "AGENDADA" } },
      _max: { dataVisita: true },
    }),
  ]);

  const ultimaVisitaPorCliente = new Map(
    visitasPorCliente.map((v) => [v.clienteId, v._max.dataVisita])
  );

  return (
    <ClientesPainel
      modo={modo}
      ehAdmin={ehAdmin}
      consultores={consultores.map((c) => ({ id: c.id, nome: c.nome }))}
      coresEscolhidas={Object.fromEntries(usuariosComCor.map((c) => [c.id, c.corMapa!]))}
      clientes={clientes.map((c) => ({
        id: c.id,
        numero: c.numero,
        nome: c.nome,
        documento: c.documento,
        razaoSocial: c.razaoSocial,
        inscricaoEstadual: c.inscricaoEstadual,
        telefone: c.telefone,
        email: c.email,
        endereco: c.endereco,
        cidade: c.cidade,
        uf: c.uf,
        cep: c.cep,
        ctv: c.ctv,
        areaPlantio: c.areaPlantio,
        areaTotal: c.areaTotal,
        pctIrrigada: c.pctIrrigada,
        pctArroz: c.pctArroz,
        pctSoja: c.pctSoja,
        pctMilho: c.pctMilho,
        pctAlgodao: c.pctAlgodao,
        pctFeijao: c.pctFeijao,
        pctTrigo: c.pctTrigo,
        pctMilho2: c.pctMilho2,
        pctSorgo2: c.pctSorgo2,
        latitude: c.latitude,
        longitude: c.longitude,
        consultorId: c.consultorId,
        consultorNome: c.consultor?.nome ?? null,
        qtdVendas: c._count.vendas,
        qtdVisitas: c._count.relatoriosVisita,
        qtdFazendas: c._count.fazendas,
        fazendasNomes: c.fazendas.map((f) => f.nome),
        ultimaVisita: ultimaVisitaPorCliente.get(c.id)?.toISOString() ?? null,
      }))}
    />
  );
}
