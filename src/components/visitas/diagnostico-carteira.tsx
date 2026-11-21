"use client";

import { useMemo } from "react";
import { CalendarCheck, CalendarX2, Clock3, Users } from "lucide-react";
import { Kpi } from "@/components/ui/kpi";
import { ESTILO_PAINEL } from "@/components/ui/padroes-painel";
import type { ClienteRecencia, VisitaResumo } from "@/lib/visitas-calendario";
import {
  QUADRANTES,
  classificarBcg,
  clientesParaPriorizar,
  coberturaPorRegiao,
  faixasDeRecencia,
  kpisDoMes,
  matrizDeFrequencia,
  sugestoes,
  type Quadrante,
} from "@/lib/visitas-metricas";

const COR_QUADRANTE: Record<Quadrante, string> = {
  ESTRELA: "bg-accent/15 text-accent",
  INTERROGACAO: "bg-amber-500/15 text-amber-300",
  VACA_LEITEIRA: "bg-sky-500/15 text-sky-300",
  ABACAXI: "bg-zinc-700/60 text-zinc-300",
};

const NOME_QUADRANTE = Object.fromEntries(QUADRANTES.map((q) => [q.id, q.nome])) as Record<Quadrante, string>;

const cartao = ESTILO_PAINEL;

function fmtDecimal(n: number) {
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

function Vazio({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-lg border border-dashed border-surface-border p-4 text-center text-xs text-muted">
      {children}
    </p>
  );
}

export function DiagnosticoCarteira({
  clientes,
  visitas,
  aoAgendar,
}: {
  clientes: ClienteRecencia[];
  visitas: VisitaResumo[];
  aoAgendar: (clienteId?: string) => void;
}) {
  const hoje = useMemo(() => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }), []);

  const dados = useMemo(() => {
    const { quadrante, semDados } = classificarBcg(clientes);
    const prioridades = clientesParaPriorizar(clientes, quadrante);
    const { regioes, semCidade } = coberturaPorRegiao(clientes);
    return {
      quadrante,
      semDados,
      prioridades,
      regioes,
      semCidade,
      kpis: kpisDoMes(clientes, visitas, quadrante, hoje),
      faixas: faixasDeRecencia(clientes),
      matriz: matrizDeFrequencia(clientes, quadrante),
      dicas: sugestoes(clientes, prioridades, regioes),
    };
  }, [clientes, visitas, hoje]);

  const { kpis, faixas, prioridades, regioes, matriz } = dados;
  const maxFaixa = Math.max(1, ...faixas.map((f) => f.n));
  const pctSem30 = kpis.totalClientes ? Math.round((kpis.semVisita30 / kpis.totalClientes) * 100) : 0;
  const pctVisitados = kpis.totalClientes ? Math.round((kpis.clientesVisitados / kpis.totalClientes) * 100) : 0;
  const matrizComDados = matriz.some((m) => m.clientes > 0);

  const indicadores = [
    {
      rotulo: "Visitas realizadas no mês",
      valor: kpis.realizadas,
      unidade: kpis.agendadas ? `+ ${kpis.agendadas} agendadas` : "",
      sub: `mês anterior: ${kpis.mesAnterior} visitas`,
    },
    {
      rotulo: "Clientes visitados no mês",
      valor: kpis.clientesVisitados,
      unidade: `de ${kpis.totalClientes}`,
      sub: `${pctVisitados}% da carteira`,
    },
    {
      rotulo: "Sem visita há mais de 30 dias",
      valor: kpis.semVisita30,
      unidade: "clientes",
      sub: `${pctSem30}% da carteira${kpis.estrelasSemVisita30 ? ` · ${kpis.estrelasSemVisita30} são Estrelas` : ""}`,
      alerta: kpis.semVisita30 > 0,
    },
    {
      rotulo: "Não visitados na safra",
      valor: kpis.semVisitaNaSafra,
      unidade: "clientes",
      sub: "nenhuma visita nesta safra",
      alerta: kpis.semVisitaNaSafra > 0,
    },
  ];

  return (
    <section className="mt-8 space-y-4">
      <div>
        <h2 className="text-base font-bold text-white">Diagnóstico da carteira</h2>
        <p className="text-sm text-secondary">
          Para decidir quem visitar e como agrupar as próximas agendas.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {indicadores.map((k, i) => (
          <Kpi key={k.rotulo} rotulo={k.rotulo} valor={k.valor.toLocaleString("pt-BR")} unidade={k.unidade} detalhe={k.sub} alerta={k.alerta} icone={[CalendarCheck, Users, Clock3, CalendarX2][i]} />
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <div className={cartao}>
          <h3 className="text-sm font-semibold text-white">Tempo desde a última visita</h3>
          <p className="mb-4 text-xs text-muted">Clientes da carteira por faixa de dias sem visita</p>
          {kpis.totalClientes === 0 ? <p className="py-4 text-sm text-muted">Nenhum cliente na carteira para analisar o tempo sem visita.</p> : <>
          <div className="grid h-44 grid-cols-6 items-end gap-3 border-b border-surface-border">
            {faixas.map((f) => (
              <div key={f.rotulo} className="flex flex-col items-center gap-1">
                <span className="text-xs font-bold text-white">{f.n}</span>
                <div
                  className="w-full rounded-t-md"
                  style={{ height: `${Math.max(2, Math.round((f.n / maxFaixa) * 120))}px`, backgroundColor: f.cor }}
                />
              </div>
            ))}
          </div>
          <div className="mt-2 grid grid-cols-6 gap-3 text-center text-[11px] leading-tight text-muted">
            {faixas.map((f) => (
              <span key={f.rotulo}>{f.rotulo}</span>
            ))}
          </div>
          </>}
          <p className="mt-4 rounded-lg bg-zinc-800/60 px-3 py-2 text-sm text-zinc-300">
            {kpis.semVisita30} {kpis.semVisita30 === 1 ? "cliente" : "clientes"} ({pctSem30}% da carteira) estão há mais
            de 30 dias sem visita; {kpis.semVisitaNaSafra} ainda não {kpis.semVisitaNaSafra === 1 ? "foi visitado" : "foram visitados"} na
            safra.
          </p>
        </div>

        <div className={cartao}>
          <h3 className="text-sm font-semibold text-white">Clientes para priorizar</h3>
          <p className="mb-3 text-xs text-muted">Quadrante BCG do cliente × dias sem visita</p>
          {prioridades.length === 0 ? (
            <Vazio>Não há clientes com última visita registrada há mais de 30 dias.</Vazio>
          ) : (
            <ul>
              {prioridades.slice(0, 7).map(({ cliente: c, quadrante }) => {
                const largura = c.dias === null ? 100 : Math.min(100, Math.round((c.dias / 120) * 100));
                return (
                  <li
                    key={c.id}
                    className="grid grid-cols-[96px_minmax(0,1fr)_90px_64px] items-center gap-3 border-t border-surface-border/60 py-2 text-sm first:border-0"
                  >
                    {quadrante ? (
                      <span className={`w-fit rounded-full px-2 py-0.5 text-[11px] font-semibold ${COR_QUADRANTE[quadrante]}`}>
                        {NOME_QUADRANTE[quadrante]}
                      </span>
                    ) : (
                      <span className="text-[11px] text-subtle">sem BCG</span>
                    )}
                    <span className="truncate font-medium text-white" title={c.nome}>
                      {c.nome}
                    </span>
                    <div className="h-2 overflow-hidden rounded bg-zinc-800">
                      <div
                        className={`h-2 ${c.dias === null || c.dias > 60 ? "bg-red-500" : "bg-amber-500"}`}
                        style={{ width: `${largura}%` }}
                      />
                    </div>
                    <span
                      className={`text-right text-xs font-semibold ${c.dias === null || c.dias > 60 ? "text-red-400" : "text-amber-400"}`}
                    >
                      {c.dias === null ? "sem visita" : `${c.dias} dias`}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
          {prioridades.length > 7 && (
            <p className="mt-2 text-xs text-muted">
              + {prioridades.length - 7} clientes na lista de &quot;Tempo sem visita&quot; ao lado do calendário.
            </p>
          )}
        </div>

        <div className={cartao}>
          <h3 className="text-sm font-semibold text-white">Cobertura por região · mês atual</h3>
          <p className="mb-3 text-xs text-muted">Clientes visitados no mês ÷ clientes da carteira (cidade das fazendas do cliente)</p>
          {regioes.length === 0 ? (
            <Vazio>
              Não há cidades cadastradas para agrupar os clientes por região. Informe a cidade no cadastro do cliente ou de suas fazendas.
            </Vazio>
          ) : (
            <>
              <ul className="space-y-3">
                {regioes.slice(0, 8).map((r) => (
                  <li key={r.nome} className="grid grid-cols-[130px_minmax(0,1fr)_44px] items-center gap-3 text-sm">
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-white">{r.nome}</span>
                      <span className="block text-[11px] text-muted">
                        {r.visitados} de {r.clientes} clientes · {r.visitas} visitas
                      </span>
                    </span>
                    <div className="h-3 overflow-hidden rounded bg-zinc-800">
                      <div className={`h-3 ${r.pct >= 60 ? "bg-accent" : "bg-amber-500"}`} style={{ width: `${r.pct}%` }} />
                    </div>
                    <span className={`text-right font-bold ${r.pct >= 60 ? "text-accent" : "text-amber-400"}`}>{r.pct}%</span>
                  </li>
                ))}
              </ul>
              <div className="mt-3 flex gap-4 text-[11px] text-muted">
                <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-accent" />60% ou mais</span>
                <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-amber-500" />abaixo de 60%</span>
                {dados.semCidade > 0 && <span className="ml-auto">{dados.semCidade} clientes sem cidade</span>}
              </div>
            </>
          )}
        </div>

        <div className={cartao}>
          <h3 className="text-sm font-semibold text-white">Frequência de visitas · matriz BCG da carteira</h3>
          <p className="mb-3 text-xs text-muted">Visitas por cliente no mês × frequência ideal de cada quadrante</p>
          {!matrizComDados ? (
            <Vazio>
              A matriz usa a área de plantio e o faturamento da safra de cada cliente. {dados.semDados} clientes ainda
              estão sem área de plantio cadastrada.
            </Vazio>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2">
                {matriz.map((m) => {
                  const q = QUADRANTES.find((x) => x.id === m.quadrante)!;
                  const noIdeal = Math.abs(m.desvio) <= 10;
                  const escala = 2.5;
                  return (
                    <div key={m.quadrante} className="rounded-lg border border-surface-border bg-zinc-800/40 p-3">
                      <div className="flex items-baseline justify-between">
                        <span className="text-sm font-bold text-white">{q.nome}</span>
                        <span className="text-xs text-secondary">{m.clientes} clientes</span>
                      </div>
                      <p className="mb-2 text-[11px] text-muted">{q.descricao}</p>
                      <div className="relative h-3 rounded bg-zinc-900">
                        <div
                          className={`h-3 rounded ${noIdeal ? "bg-accent" : "bg-amber-500"}`}
                          style={{ width: `${Math.min(100, (m.real / escala) * 100)}%` }}
                        />
                        <div
                          className="absolute -top-0.5 h-4 w-0.5 bg-white"
                          style={{ left: `${Math.min(100, (m.ideal / escala) * 100)}%` }}
                          title="Frequência ideal"
                        />
                      </div>
                      <div className="mt-1.5 flex items-baseline justify-between text-xs">
                        <span>
                          <b className="text-white">{fmtDecimal(m.real)}</b>{" "}
                          <span className="text-muted">/ ideal {fmtDecimal(m.ideal)} por mês</span>
                        </span>
                        <span className={`font-semibold ${noIdeal ? "text-accent" : "text-amber-400"}`}>
                          {m.clientes === 0 ? "—" : noIdeal ? "no ideal" : `${m.desvio > 0 ? "+" : "−"}${Math.abs(m.desvio)}%`}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
              <p className="mt-3 text-[11px] text-muted">
                Potencial = área de plantio; participação = faturamento da safra por hectare. Cortes pela mediana da
                carteira.{dados.semDados > 0 ? ` ${dados.semDados} clientes sem área ficam fora.` : ""}
              </p>
            </>
          )}
        </div>
      </div>

      {dados.dicas.length > 0 && (
        <div className="rounded-xl border-2 border-accent/50 bg-zinc-900 p-4 sm:p-5">
          <h3 className="mb-3 text-sm font-semibold text-white">Sugestões para as próximas agendas</h3>
          <div className="grid gap-3 md:grid-cols-3">
            {dados.dicas.map((d) => (
              <div key={d.tag + d.titulo} className="flex flex-col gap-1.5 rounded-lg bg-zinc-800/50 p-3">
                <span className="text-[11px] font-semibold tracking-wide text-accent">{d.tag}</span>
                <p className="text-sm font-semibold text-white">{d.titulo}</p>
                <p className="text-xs leading-relaxed text-secondary">{d.texto}</p>
                {d.cta && (
                  <button
                    onClick={() => aoAgendar(d.clienteId)}
                    className="mt-auto w-fit pt-1 text-xs font-semibold text-accent underline-offset-2 hover:underline"
                  >
                    {d.cta}
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
