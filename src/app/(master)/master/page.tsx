import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { semFiltroEmpresa } from "@/lib/empresa-contexto";
import { EMPRESA_CARDO_AI } from "@/lib/master";
import { NOMES_MODULO, normalizarModulos } from "@/lib/modulos";
import { fmtData, fmtNum } from "@/lib/format";
import { Kpi } from "@/components/ui/kpi";
import { Badge } from "@/components/ui/badge";

export const metadata = { title: "Visão geral — Cardo AI" };

const DIAS = 30;

type Contagem = { empresaId: string; _count: { _all: number } };
const mapa = (lista: Contagem[]) => new Map(lista.map((g) => [g.empresaId, g._count._all]));

// Início da janela de DIAS dias (fora do componente: a página é renderizada
// no servidor a cada acesso, então "agora" é o do pedido).
function inicioDaJanela(): Date {
  return new Date(Date.now() - DIAS * 24 * 60 * 60 * 1000);
}

// Uso de cada empresa cliente: equipe, carteira e movimento dos últimos 30 dias.
export default async function MasterVisaoGeralPage() {
  const desde = inicioDaJanela();
  const fora = { empresaId: { not: EMPRESA_CARDO_AI } };

  const [empresas, usuarios, clientes, visitas, propostas, ultimaVisita, ultimaProposta] = await semFiltroEmpresa(() =>
    Promise.all([
      prisma.empresa.findMany({ where: { id: { not: EMPRESA_CARDO_AI } }, orderBy: { createdAt: "asc" } }),
      prisma.user.groupBy({ by: ["empresaId"], where: { ...fora, ativo: true }, _count: { _all: true } }),
      prisma.cliente.groupBy({ by: ["empresaId"], where: fora, _count: { _all: true } }),
      prisma.relatorioVisita.groupBy({ by: ["empresaId"], where: { ...fora, createdAt: { gte: desde } }, _count: { _all: true } }),
      prisma.proposta.groupBy({ by: ["empresaId"], where: { ...fora, createdAt: { gte: desde } }, _count: { _all: true } }),
      prisma.relatorioVisita.groupBy({ by: ["empresaId"], where: fora, _max: { createdAt: true } }),
      prisma.proposta.groupBy({ by: ["empresaId"], where: fora, _max: { createdAt: true } }),
    ])
  );

  const porUsuarios = mapa(usuarios);
  const porClientes = mapa(clientes);
  const porVisitas = mapa(visitas);
  const porPropostas = mapa(propostas);
  const ultima = new Map<string, Date>();
  for (const g of [...ultimaVisita, ...ultimaProposta]) {
    const d = g._max.createdAt;
    if (d && (!ultima.has(g.empresaId) || d > ultima.get(g.empresaId)!)) ultima.set(g.empresaId, d);
  }

  const soma = (m: Map<string, number>) => [...m.values()].reduce((a, b) => a + b, 0);
  const ativas = empresas.filter((e) => e.ativo).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Visão geral</h1>
        <p className="text-sm text-muted">Empresas que usam o sistema e o movimento dos últimos {DIAS} dias</p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Kpi rotulo="Empresas ativas" valor={fmtNum(ativas)} detalhe={`${fmtNum(empresas.length)} cadastradas`} />
        <Kpi rotulo="Usuários ativos" valor={fmtNum(soma(porUsuarios))} />
        <Kpi rotulo="Clientes" valor={fmtNum(soma(porClientes))} detalhe="Somando todas as empresas" />
        <Kpi rotulo={`Visitas · ${DIAS} dias`} valor={fmtNum(soma(porVisitas))} />
        <Kpi rotulo={`Orçamentos · ${DIAS} dias`} valor={fmtNum(soma(porPropostas))} />
      </div>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-secondary">Empresas</h2>
          <Link href="/master/empresas" className="text-sm text-accent hover:underline">
            Gerenciar empresas →
          </Link>
        </div>
        <div className="overflow-x-auto rounded-xl border border-surface-border">
          <table className="w-full min-w-[860px] text-sm">
            <thead>
              <tr className="border-b border-surface-border bg-zinc-900 text-left text-xs uppercase tracking-wide text-muted">
                <th className="px-3 py-2.5">Empresa</th>
                <th className="px-3 py-2.5">Módulos</th>
                <th className="px-3 py-2.5 text-right">Usuários</th>
                <th className="px-3 py-2.5 text-right">Clientes</th>
                <th className="px-3 py-2.5 text-right">Visitas {DIAS}d</th>
                <th className="px-3 py-2.5 text-right">Orçam. {DIAS}d</th>
                <th className="px-3 py-2.5">Última atividade</th>
              </tr>
            </thead>
            <tbody>
              {empresas.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-muted">
                    Nenhuma empresa cadastrada ainda.
                  </td>
                </tr>
              )}
              {empresas.map((e) => (
                <tr key={e.id} className="border-b border-surface-border last:border-0">
                  <td className="px-3 py-2.5">
                    <p className="font-medium text-white">{e.nomeFantasia}</p>
                    {!e.ativo && <Badge variant="danger">Desativada</Badge>}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex flex-wrap gap-1">
                      {normalizarModulos(e.modulos).map((m) => (
                        <span key={m} className="rounded-md bg-accent/10 px-1.5 py-0.5 text-[11px] text-accent">
                          {NOMES_MODULO[m]}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-right text-zinc-300">{fmtNum(porUsuarios.get(e.id) ?? 0)}</td>
                  <td className="px-3 py-2.5 text-right text-zinc-300">{fmtNum(porClientes.get(e.id) ?? 0)}</td>
                  <td className="px-3 py-2.5 text-right text-zinc-300">{fmtNum(porVisitas.get(e.id) ?? 0)}</td>
                  <td className="px-3 py-2.5 text-right text-zinc-300">{fmtNum(porPropostas.get(e.id) ?? 0)}</td>
                  <td className="px-3 py-2.5 text-secondary">{ultima.has(e.id) ? fmtData(ultima.get(e.id)!) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
