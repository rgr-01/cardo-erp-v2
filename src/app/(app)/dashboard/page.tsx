import Link from "next/link";
import { PlayCircle } from "lucide-react";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { modulosDoUsuario } from "@/lib/modulos-servidor";
import { prisma } from "@/lib/prisma";
import { getAtencaoDashboard, getDestaquesDashboard, getDashboardData } from "@/lib/dashboard";
import { getSafraAtualId } from "@/lib/safra-atual";
import { FiltroConsultor } from "@/components/dashboard/filtro-consultor";
import { DownloadRelatorioGerencial } from "@/components/dashboard/download-relatorio";
import { TEMA_CLARO } from "@/lib/tema-claro";
import { ResumoDashboard } from "@/components/dashboard/resumo";

export const metadata = { title: "Painel de vendas" };

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ consultor?: string }>;
}) {
  const session = await auth();
  const user = session!.user;
  // O dashboard é de vendas: empresa sem esse módulo começa pelas visitas.
  const modulos = await modulosDoUsuario(user.id);
  if (!modulos.includes("VENDAS")) {
    redirect(modulos.includes("VISITAS") ? "/relatorios/visitas"
      : modulos.includes("ERP") && user.role === "ADMIN" ? "/financeiro"
      : modulos.includes("CADASTROS") ? "/clientes"
      : modulos.includes("ESTOQUE") && user.role === "ADMIN" ? "/produtos"
      : modulos.includes("DESPESAS") ? "/despesas" : "/whatsapp");
  }
  const params = await searchParams;

  const ehAdmin = user.role === "ADMIN";
  const financeiro = ehAdmin && modulos.includes("ERP");
  // Admin pode filtrar por um ou mais consultores (?consultor=a,b); consultor vê só a si mesmo.
  const consultorIds = ehAdmin ? (params.consultor ?? "").split(",").filter(Boolean) : [user.id];
  const safraId = await getSafraAtualId();

  // Destaques não dependem dos dados gerais: vão juntos na primeira leva.
  const destaquesP = getDestaquesDashboard(safraId, consultorIds);
  destaquesP.catch(() => {}); // o erro aparece no await abaixo
  const [dados, consultores] = await Promise.all([
    getDashboardData(safraId, consultorIds),
    ehAdmin
      ? prisma.user.findMany({
          where: { role: "CONSULTOR", ativo: true },
          select: { id: true, nome: true },
          orderBy: { nome: "asc" },
        })
      : Promise.resolve([]),
  ]);
  const [atencao, destaques] = await Promise.all([getAtencaoDashboard(safraId, consultorIds, dados), destaquesP]);
  // Ranking só faz sentido para o admin vendo a equipe (ou mais de um consultor).
  const mostrarRanking = ehAdmin && consultorIds.length !== 1 && dados.ranking.length > 1;

  return (
    <div id="dashboard-captura" className="dashboard-compacto flex flex-col gap-5">
      <div className="page-heading flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white">Painel de vendas</h1>
          <p className="text-xs text-muted">
            {ehAdmin ? "Visão geral da equipe" : `Sua carteira, ${user.nome}`}
          </p>
        </div>
        <div data-sem-export="" className="flex min-w-0 flex-wrap items-center gap-2">
          {ehAdmin && <FiltroConsultor consultores={consultores} />}
          <DownloadRelatorioGerencial />
          <Link
            href="/apresentacao"
            className="flex items-center gap-1.5 rounded-lg border border-surface-border px-3 py-1.5 text-xs text-secondary transition hover:border-accent hover:text-accent"
          >
            <PlayCircle size={13} /> Apresentação
          </Link>
        </div>
      </div>

      <ResumoDashboard dados={dados} atencao={atencao} mostrarRanking={mostrarRanking} destaques={destaques} financeiro={financeiro} exportavel />

      {/* Cópia clara, fora da vista, que o botão "Relatório PDF" fotografa */}
      <div aria-hidden inert className="pointer-events-none fixed left-[-10000px] top-0">
        <div id="dashboard-resumo-claro" style={TEMA_CLARO} className="w-[1280px] space-y-3.5 p-4">
          <ResumoDashboard dados={dados} atencao={atencao} mostrarRanking={mostrarRanking} destaques={destaques} financeiro={financeiro} />
        </div>
      </div>
    </div>
  );
}
