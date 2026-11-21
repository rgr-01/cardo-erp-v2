import Link from "next/link";
import { BriefcaseBusiness, CircleDollarSign, Users, Wallet, type LucideIcon } from "lucide-react";
import { STATUS_CORES, STATUS_ORDEM, fmtBRL, fmtBRLCompacto, fmtData, fmtNum, fmtPct, type Status } from "@/lib/format";
import type { AtencaoDashboard, DadosDashboard, DestaquesDashboard } from "@/lib/dashboard";
import { Card } from "@/components/ui/card";
import { Kpi } from "@/components/ui/kpi";
import { DonutCultura, RankingBarras, TITULO_CARD } from "@/components/dashboard/painel";
import { CATEGORIAS_VISITA, corDaCategoria } from "@/lib/visitas-categoria";
import { MaioresClientes } from "@/components/dashboard/maiores-clientes";
import { DistribuicaoVendas, EvolucaoFaturamento, ProgressoMeta } from "@/components/dashboard/graficos-painel";

function Indicador({ rotulo, valor, detalhe, icon: Icon }: { rotulo: string; valor: string; detalhe: string; icon: LucideIcon }) {
  return <Kpi rotulo={rotulo} valor={valor} detalhe={detalhe} icone={Icon} />;
}

function CartaoAtencao({
  cor,
  titulo,
  valor,
  unidade,
  detalhe,
  acao,
  href,
  ok,
}: {
  cor: string;
  titulo: string;
  valor: string;
  unidade: string;
  detalhe: string;
  acao: string;
  href: string;
  ok?: boolean;
}) {
  return (
    <Link
      href={href}
      className="pendencia-row grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-2 py-3.5 transition-colors duration-150 hover:bg-zinc-950/50"
    >
      <span className="min-w-0 break-words">
        <span className="block text-sm font-medium" style={{ color: ok ? "var(--text-secondary)" : cor }}>{titulo}</span>
        <span title={detalhe} className="mt-1 line-clamp-2 text-xs text-muted">{detalhe}</span>
      </span>
      <span className="text-right text-lg font-semibold tabular-nums text-white">
        {valor} <span className="block text-xs font-normal text-muted">{unidade}</span>
      </span>
      <span className="col-span-2 text-xs font-semibold text-accent">{acao} →</span>
    </Link>
  );
}

function CartaoLista({
  titulo,
  href,
  acao,
  vazio,
  exportavel,
  children,
}: {
  titulo: string;
  href: string;
  acao: string;
  vazio?: string;
  exportavel: boolean;
  children?: React.ReactNode;
}) {
  return (
    <Card exportavel={exportavel} title={titulo} titleClassName={TITULO_CARD} className="flex flex-col">
      <div className="flex-1">{vazio ? <p className="py-3 text-sm text-muted">{vazio}</p> : children}</div>
      <Link href={href} className="mt-4 inline-block self-start text-xs font-semibold text-accent">
        {acao} →
      </Link>
    </Card>
  );
}

function diasAtras(iso: string): string {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const dia = new Date(iso);
  dia.setHours(0, 0, 0, 0);
  const d = Math.round((hoje.getTime() - dia.getTime()) / 86_400_000);
  return d <= 0 ? "hoje" : d === 1 ? "ontem" : `há ${d} d`;
}

function corDominante(c: Partial<Record<Status, number>>): string {
  const [status] = STATUS_ORDEM.map((s) => [s, c[s] ?? 0] as const).sort((a, b) => b[1] - a[1])[0];
  return STATUS_CORES[status];
}

// Indicadores, evolução e clientes em destaque, análises laterais e operação.
// Aparece na tela e, em tema claro e fora da vista, é a imagem do PDF gerencial.
export function ResumoDashboard({
  dados,
  atencao,
  mostrarRanking,
  destaques,
  exportavel = false,
  financeiro = true,
}: {
  dados: DadosDashboard;
  atencao: AtencaoDashboard;
  mostrarRanking: boolean;
  destaques: DestaquesDashboard;
  exportavel?: boolean;
  // Sem o Financeiro (só admin acessa) o cartão de faturamento leva aos pedidos.
  financeiro?: boolean;
}) {
  const pctMeta = dados.meta > 0 ? dados.faturado / dados.meta : 0;
  const docsMargem = atencao.margemBaixa.documentos;
  const clientes = dados.porCliente
    .map((l) => {
      const { cliente, ...valores } = l;
      const total = STATUS_ORDEM.filter((s) => s !== "CANCELADO").reduce((acc, s) => acc + (valores[s] ?? 0), 0);
      return { cliente, total, cor: corDominante(valores) };
    })
    .filter((c) => c.total > 0)
    .sort((a, b) => b.total - a.total);

  return (
    <div className="@container flex min-w-0 flex-col gap-4">
      <div className="grid min-w-0 grid-cols-2 gap-3 @4xl:grid-cols-4 @4xl:gap-4">
        <Indicador rotulo="Pipeline de vendas" valor={fmtBRLCompacto(dados.totalPipeline)} detalhe={`${fmtNum(dados.qtdVendas)} registros na safra`} icon={BriefcaseBusiness} />
        <Indicador rotulo="Faturado" valor={fmtBRLCompacto(dados.faturado)} detalhe={dados.meta > 0 ? `${fmtPct(pctMeta)} da meta da safra` : "Meta da safra não definida"} icon={CircleDollarSign} />
        <Indicador rotulo="Em carteira" valor={fmtBRLCompacto(atencao.emCarteira)} detalhe="Pedidos em carteira para faturar" icon={Wallet} />
        <Indicador rotulo="Clientes ativos" valor={fmtNum(dados.clientesAtivos)} detalhe={`${fmtNum(dados.fornecedoresAtivos)} fornecedores na safra`} icon={Users} />
      </div>

      <div className="grid items-start gap-4 @4xl:grid-cols-[minmax(0,1fr)_minmax(280px,0.48fr)]">
        <div className="flex min-w-0 flex-col gap-4">
          <Card exportavel={exportavel} titleClassName={TITULO_CARD} title="Evolução do faturamento">
            <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2"><p className="text-3xl font-semibold tracking-tight tabular-nums">{fmtBRLCompacto(dados.faturado)}</p><span className="text-[11px] text-muted">Faturamento mensal · R$</span></div>
            <EvolucaoFaturamento data={dados.evolucao} />
            <div className="mt-4 grid grid-cols-2 gap-3 border-t border-surface-border pt-4 @2xl:grid-cols-3">
              <div><p className="text-[11px] text-muted">Pipeline em aberto</p><p className="mt-1 text-sm font-semibold">{fmtBRLCompacto(dados.emAndamento)}</p></div>
              <div><p className="text-[11px] text-muted">Ticket médio</p><p className="mt-1 text-sm font-semibold">{fmtBRLCompacto(dados.ticketMedio)}</p></div>
              <div><p className="text-[11px] text-muted">Média por cliente</p><p className="mt-1 text-sm font-semibold">{fmtBRLCompacto(dados.mediaPorClienteAtivo)}</p></div>
            </div>
          </Card>
          <MaioresClientes clientes={clientes} exportavel={exportavel} />
        </div>
        <div className="grid min-w-0 gap-4 @2xl:grid-cols-2 @4xl:grid-cols-1">
          <Card exportavel={exportavel} titleClassName={TITULO_CARD} title="Vendas por etapa"><DistribuicaoVendas data={dados.porStatus} /></Card>
          <Card exportavel={exportavel} titleClassName={TITULO_CARD} title="Meta da safra"><ProgressoMeta meta={dados.meta} faturado={dados.faturado} aberto={dados.emAndamento} /></Card>
          <Card exportavel={exportavel} titleClassName={TITULO_CARD} title="Pipeline por cultura" className="@2xl:col-span-2 @4xl:col-span-1"><DonutCultura data={dados.porCultura} /></Card>
        </div>
      </div>

      <div className={mostrarRanking ? "grid items-start gap-4 @3xl:grid-cols-2" : "grid gap-4"}>
        {mostrarRanking && <Card exportavel={exportavel} titleClassName={TITULO_CARD} title="Desempenho dos consultores"><RankingBarras data={dados.ranking} /></Card>}
        <Card exportavel={exportavel} titleClassName={TITULO_CARD} title="Pendências da safra">
        <div className="divide-y divide-surface-border [&>a:first-child]:pt-0 [&>a:last-child]:pb-0">
          <CartaoAtencao
            cor="var(--info-ink)"
            titulo="Negócio fechado · aguardando conferência"
            valor={fmtNum(atencao.conferencia.qtd)}
            unidade={atencao.conferencia.qtd === 1 ? "item" : "itens"}
            detalhe={
              atencao.conferencia.qtd > 0
                ? `${fmtBRL(atencao.conferencia.total)} esperando o administrativo`
                : "Nada esperando conferência"
            }
            acao="Conferir agora"
            href="/propostas"
            ok={atencao.conferencia.qtd === 0}
          />
          <CartaoAtencao
            cor="var(--danger-ink)"
            titulo="Margem abaixo de 27%"
            valor={fmtNum(atencao.margemBaixa.qtd)}
            unidade={atencao.margemBaixa.qtd === 1 ? "documento" : "documentos"}
            detalhe={
              docsMargem.length > 0
                ? `${docsMargem.slice(0, 3).join(", ")}${docsMargem.length > 3 ? ` e mais ${docsMargem.length - 3}` : ""}`
                : "Nenhum pedido aguardando aprovação de margem"
            }
            acao="Ver aprovações"
            href="/propostas/aprovacao-margem"
            ok={atencao.margemBaixa.qtd === 0}
          />
          <CartaoAtencao
            cor="var(--notice-ink)"
            titulo="Clientes sem visita há 30+ dias"
            valor={fmtNum(atencao.semVisita.maisDe30)}
            unidade="clientes"
            detalhe={`+ ${fmtNum(atencao.semVisita.nunca)} nunca visitados`}
            acao="Abrir no mapa"
            href="/localizacao"
            ok={atencao.semVisita.maisDe30 + atencao.semVisita.nunca === 0}
          />
          <CartaoAtencao
            cor="var(--warning-ink)"
            titulo={dados.faturado > 0 ? "Faturamento da safra" : "Sem faturamento registrado"}
            valor={fmtBRLCompacto(dados.faturado)}
            unidade="faturado"
            detalhe={
              atencao.emCarteira > 0
                ? `${fmtBRLCompacto(atencao.emCarteira)} já em carteira para faturar`
                : "Nada em carteira para faturar"
            }
            acao={financeiro ? "Ver faturamento" : "Ver pedidos"}
            href={financeiro ? "/financeiro/faturamento" : "/propostas"}
            ok={dados.faturado > 0 && atencao.emCarteira === 0}
          />
        </div>
        </Card>
      </div>

      <div className="grid items-stretch gap-6 @2xl:grid-cols-2">
        <CartaoLista
          exportavel={exportavel}
          titulo="Últimas visitas · 15 dias"
          href="/relatorios/visitas"
          acao="Ver visitas"
          vazio={destaques.ultimasVisitas.length === 0 ? "Nenhuma visita nos últimos 15 dias." : undefined}
        >
          <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[11px] text-secondary">
            <span>
              <b className="text-base text-white">{fmtNum(destaques.totalVisitas15d)}</b>{" "}
              {destaques.totalVisitas15d === 1 ? "visita" : "visitas"}
            </span>
            {CATEGORIAS_VISITA.filter((c) => destaques.visitasPorCategoria[c.id] > 0).map((c) => (
              <span key={c.id}>
                <span style={{ color: c.cor }}>●</span> {c.rotulo} {destaques.visitasPorCategoria[c.id]}
              </span>
            ))}
          </div>
          <ul className="flex flex-col gap-2.5">
            {destaques.ultimasVisitas.map((v) => (
              <li key={v.id}>
                <Link
                  href={`/relatorios/visitas/${v.id}`}
                  className="flex items-center gap-3 text-xs hover:brightness-125"
                >
                  <span className="h-8 w-1 shrink-0 rounded" style={{ background: corDaCategoria(v.categoria) }} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-zinc-200">{v.cliente}</span>
                    <span className="block truncate text-[11px] text-muted">{v.consultor}</span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block font-semibold text-white">{diasAtras(v.data)}</span>
                    <span className="block text-[11px] text-muted">{fmtData(v.data).slice(0, 5)}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </CartaoLista>

        <CartaoLista
          exportavel={exportavel}
          titulo="Últimos negócios fechados"
          href="/vendas"
          acao="Ver vendas"
          vazio={destaques.ultimosFechamentos.length === 0 ? "Nenhum negócio fechado ainda." : undefined}
        >
          <ul className="flex flex-col gap-2.5">
            {destaques.ultimosFechamentos.map((v) => (
              <li key={v.id} className="flex items-center gap-3 text-xs">
                <span className="h-8 w-1 shrink-0 rounded" style={{ background: STATUS_CORES[v.status] }} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-zinc-200">{v.cliente}</span>
                  <span className="block truncate text-[11px] text-muted">
                    {v.produto} · {fmtData(v.data)}
                  </span>
                </span>
                <b className="shrink-0 text-white">{fmtBRLCompacto(v.valor)}</b>
              </li>
            ))}
          </ul>
        </CartaoLista>
      </div>
    </div>
  );
}
