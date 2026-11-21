"use client";

import { Fragment, useState, useTransition } from "react";
import clsx from "clsx";
import { Wallet, CircleDollarSign, CalendarDays, CalendarClock, type LucideIcon } from "lucide-react";
import { Kpi } from "@/components/ui/kpi";
import { ESTILO_PAINEL } from "@/components/ui/padroes-painel";
import { solicitarFaturamento } from "@/app/actions/financeiro";
import { fmtBRL, fmtData } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AtualizarAssinaturas } from "@/components/propostas/atualizar-assinaturas";

const STATUS_LABELS = {
  NAO_ENVIADA: "Não enviado",
  AGUARDANDO_ASSINATURA: "Aguardando assinatura",
  ASSINADA: "Assinado",
  RECUSADA: "Recusado",
} as const;

const STATUS_CORES = {
  NAO_ENVIADA: "#a1a1aa",
  AGUARDANDO_ASSINATURA: "#eab308",
  ASSINADA: "#16a34a",
  RECUSADA: "#ef4444",
} as const;

export type ItemLinha = {
  id: string;
  produtoNome: string;
  volume: number | null;
  unidade: string | null;
  valorUnitario: number | null;
  total: number;
};

export type EmCarteiraLinha = {
  id: string;
  codigo: string;
  clienteNome: string;
  consultorNome: string;
  total: number;
  statusAssinatura: keyof typeof STATUS_LABELS;
  pdfAssinadoUrl: string | null;
  criadoEm: string;
  previsaoEntrega: string | null;
  condicaoPagamento: string | null;
  localEntrega: string | null;
  frete: string | null;
  autorizadoFaturarEm: string | null;
  vendaFaturada: boolean;
  itens: ItemLinha[];
};

export type FaturamentoResumo = {
  safra: number;
  notasSafra: number;
  carteiraAFaturar: number;
  mes: number;
  notasMes: number;
  mesAnterior: number;
  mesAnteriorRotulo: string; // AAAA-MM
  porDia: number[];
  dia: number;
  notasDia: number;
  semanaPassada: number;
};

type Filtro = "todos" | "atrasados" | "7d" | "assinatura";

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const numCls = "font-mono tabular-nums";
const th = "whitespace-nowrap px-3 py-2.5 text-left text-[11px] font-medium uppercase tracking-wide text-muted";
const td = "px-3 py-2.5 align-middle";
const campoRotuloCls = "flex flex-col gap-1 text-[11px] uppercase tracking-wide text-muted";
const inputCls =
  "rounded-lg border border-surface-border bg-zinc-800 px-3 py-1.5 text-sm text-white outline-none focus:border-accent";

const brl0 = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

function Delta({ atual, base }: { atual: number; base: number }) {
  if (!base) return null;
  const p = (atual / base - 1) * 100;
  return (
    <span
      className={clsx(
        "rounded-full px-1.5 py-0.5 font-mono text-[11px]",
        p >= 0 ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400"
      )}
    >
      {p >= 0 ? "+" : ""}
      {p.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%
    </span>
  );
}

function CardKpi({ rotulo, icone, valor, children }: { rotulo: string; icone: LucideIcon; valor: string; children: React.ReactNode }) {
  return (
    <Kpi rotulo={rotulo} valor={valor} icone={icone}><div className="w-full space-y-2">{children}</div></Kpi>
  );
}

export function EmCarteiraTable({
  propostas,
  safraNome,
  hoje,
  faturamento,
}: {
  propostas: EmCarteiraLinha[];
  safraNome: string;
  hoje: string;
  faturamento: FaturamentoResumo;
}) {
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [busca, setBusca] = useState("");
  const [aberto, setAberto] = useState<string | null>(null);

  function solicitarEmissao(id: string) {
    setErro(null);
    startTransition(async () => {
      const resultado = await solicitarFaturamento(id);
      if (!resultado.ok) setErro(resultado.erro);
    });
  }

  const limite7 = new Date(new Date(hoje + "T12:00:00Z").getTime() + 7 * 86400000).toISOString().slice(0, 10);
  const prev = (p: EmCarteiraLinha) => p.previsaoEntrega?.slice(0, 10) ?? null;
  const atrasado = (p: EmCarteiraLinha) => !p.vendaFaturada && !!prev(p) && prev(p)! < hoje;
  const em7dias = (p: EmCarteiraLinha) => !p.vendaFaturada && !!prev(p) && prev(p)! >= hoje && prev(p)! <= limite7;

  const abertos = propostas.filter((p) => !p.vendaFaturada);
  const q = busca.trim().toLowerCase();
  const lista = propostas
    .filter((p) => {
      if (filtro === "atrasados" && !atrasado(p)) return false;
      if (filtro === "7d" && !em7dias(p)) return false;
      if (filtro === "assinatura" && p.statusAssinatura !== "AGUARDANDO_ASSINATURA") return false;
      if (!q) return true;
      return `${p.codigo} ${p.clienteNome} ${p.consultorNome} ${p.itens.map((i) => i.produtoNome).join(" ")}`
        .toLowerCase()
        .includes(q);
    })
    // Quem entrega primeiro aparece primeiro; sem previsão vai para o fim.
    .sort((a, b) => (prev(a) ?? "9999").localeCompare(prev(b) ?? "9999"));

  const mes = Number(hoje.slice(5, 7));
  const [anoAnt, mesAnt] = faturamento.mesAnteriorRotulo.split("-").map(Number);
  const f = faturamento;
  const totalSafra = f.safra + f.carteiraAFaturar;
  const pctFaturado = totalSafra ? (f.safra / totalSafra) * 100 : 0;
  const maxDia = Math.max(...f.porDia, 1);
  const diaHoje = Number(hoje.slice(8));
  const diaSemana = new Date(hoje + "T12:00:00Z").toLocaleDateString("pt-BR", { weekday: "short", timeZone: "UTC" });

  const filtros: [Filtro, string][] = [
    ["todos", "Todos"],
    ["atrasados", "Atrasados"],
    ["7d", "Próximos 7 dias"],
    ["assinatura", "Aguardando assinatura"],
  ];

  return (
    <div className="space-y-4">
      <AtualizarAssinaturas
        pendentes={propostas
          .filter((p) => p.statusAssinatura === "AGUARDANDO_ASSINATURA" || (p.statusAssinatura === "ASSINADA" && !p.pdfAssinadoUrl))
          .map((p) => ({ id: p.id, status: p.statusAssinatura, temPdf: Boolean(p.pdfAssinadoUrl) }))}
      />

      <header>
        <h1 className="text-xl font-bold text-white">
          Em Carteira{" "}
          <span className="rounded-md bg-accent/10 px-2 py-0.5 font-mono text-xs font-normal text-accent">
            safra {safraNome}
          </span>
        </h1>
        <p className="text-xs text-muted">
          Pedidos fechados, faturamento e notas · {new Date(hoje + "T12:00:00Z").toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })}
        </p>
      </header>

      <section className="grid gap-3 lg:grid-cols-3">
        <CardKpi rotulo={`Faturamento total · safra ${safraNome}`} icone={CircleDollarSign} valor={brl0(f.safra)}>
          <span className="text-xs text-secondary">
            {f.notasSafra.toLocaleString("pt-BR")} nota{f.notasSafra === 1 ? "" : "s"} emitida{f.notasSafra === 1 ? "" : "s"}
          </span>
          <div className="mt-1 flex h-2 overflow-hidden rounded bg-zinc-800" role="img" aria-label={`${Math.round(pctFaturado)}% faturado`}>
            <i className="block h-full bg-emerald-400" style={{ width: `${pctFaturado}%` }} />
            <i className="block h-full bg-amber-500/55" style={{ width: `${100 - pctFaturado}%` }} />
          </div>
          <div className="flex flex-wrap gap-x-3 text-xs text-secondary">
            <span>
              <i className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
              Faturado {Math.round(pctFaturado)}%
            </span>
            <span>
              <i className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-amber-500/55" />
              Carteira a faturar {brl0(f.carteiraAFaturar)}
            </span>
          </div>
        </CardKpi>

        <CardKpi rotulo={`Faturamento do mês · ${MESES[mes - 1]}`} icone={CalendarDays} valor={brl0(f.mes)}>
          <span className="flex flex-wrap items-center gap-2 text-xs text-secondary">
            {f.notasMes} nota{f.notasMes === 1 ? "" : "s"} <Delta atual={f.mes} base={f.mesAnterior} />
            {f.mesAnterior > 0 && (
              <span>
                vs. {MESES[mesAnt - 1].slice(0, 3)}/{String(anoAnt).slice(2)}
              </span>
            )}
            {diaHoje > 0 && f.mes > 0 && (
              <span>
                · projeção {brl0((f.mes / diaHoje) * f.porDia.length)}
              </span>
            )}
          </span>
          <svg viewBox="0 0 300 34" preserveAspectRatio="none" className="mt-1.5 block h-8 w-full" aria-hidden="true">
            {f.porDia.map((v, i) => {
              const bw = 300 / f.porDia.length;
              const h = (v / maxDia) * 32;
              return (
                <rect
                  key={i}
                  x={i * bw + 1}
                  y={34 - h}
                  width={bw - 2}
                  height={h}
                  rx="1.5"
                  fill={i === diaHoje - 1 ? "#00dc4d" : "#34525d"}
                />
              );
            })}
            <line x1="0" x2="300" y1="33.5" y2="33.5" stroke="#24434e" />
          </svg>
        </CardKpi>

        <CardKpi rotulo={`Faturamento do dia · ${new Date(hoje + "T12:00:00Z").toLocaleDateString("pt-BR", { timeZone: "UTC" })}`} icone={CalendarClock} valor={brl0(f.dia)}>
          <span className="flex flex-wrap items-center gap-2 text-xs text-secondary">
            {f.notasDia} nota{f.notasDia === 1 ? "" : "s"} · ticket médio {brl0(f.notasDia ? f.dia / f.notasDia : 0)}{" "}
            <Delta atual={f.dia} base={f.semanaPassada} />
            {f.semanaPassada > 0 && <span>vs. {diaSemana.replace(".", "")} passada</span>}
          </span>
        </CardKpi>
      </section>

      <section className={`${ESTILO_PAINEL} flex flex-col gap-3`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-white">Carteira de pedidos</h2>
            <p className="text-xs text-muted">
              {propostas.length} {propostas.length === 1 ? "pedido fechado" : "pedidos fechados"} — aguardando ou já com assinatura do cliente · ordenada pela previsão de entrega
            </p>
          </div>
          <div className="inline-flex overflow-hidden rounded-lg border border-surface-border text-xs" role="group" aria-label="Previsão de entrega">
            {filtros.map(([k, rotulo]) => (
              <button
                key={k}
                onClick={() => setFiltro(k)}
                className={clsx("px-3 py-1.5", filtro === k ? "bg-accent/10 font-semibold text-accent" : "text-zinc-300 hover:bg-zinc-800")}
              >
                {rotulo}
              </button>
            ))}
          </div>
        </div>

        <label className={campoRotuloCls}>
          Buscar
          <input
            type="search"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Pedido, cliente ou produto"
            className={clsx(inputCls, "w-full max-w-xs")}
          />
        </label>

        <div className="flex flex-wrap gap-2 text-xs text-secondary">
          <span className="rounded-lg bg-zinc-800/70 px-2.5 py-1.5">
            Pedidos em aberto <b className={clsx("ml-1 text-sm text-white", numCls)}>{abertos.length}</b>
          </span>
          <span className="rounded-lg bg-zinc-800/70 px-2.5 py-1.5">
            A faturar <b className={clsx("ml-1 text-sm text-white", numCls)}>{brl0(f.carteiraAFaturar)}</b>
          </span>
          <span className="rounded-lg bg-zinc-800/70 px-2.5 py-1.5">
            <i className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-red-400" />
            Atrasados <b className={clsx("ml-1 text-sm text-white", numCls)}>{propostas.filter(atrasado).length}</b>
          </span>
          <span className="rounded-lg bg-zinc-800/70 px-2.5 py-1.5">
            <i className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-amber-400" />
            Próximos 7 dias <b className={clsx("ml-1 text-sm text-white", numCls)}>{propostas.filter(em7dias).length}</b>
          </span>
        </div>

        {erro && <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-red-400">{erro}</p>}

        <div className="tabela-fixa overflow-x-auto rounded-xl border border-surface-border">
          <table className="w-full min-w-[1000px] border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-zinc-700 bg-zinc-800/70">
                <th className={th}>Número</th>
                <th className={th}>Cliente</th>
                <th className={th}>Consultor</th>
                <th className={th}>Status</th>
                <th className={th}>Fechado em</th>
                <th className={th}>Previsão</th>
                <th className={clsx(th, "text-right")}>Itens</th>
                <th className={clsx(th, "text-right")}>Total</th>
                <th className={th}></th>
                <th className={th}>Faturamento</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((p) => {
                const op = aberto === p.id;
                const toggle = () => setAberto(op ? null : p.id);
                return (
                  <Fragment key={p.id}>
                    <tr
                      tabIndex={0}
                      aria-expanded={op}
                      onClick={toggle}
                      onKeyDown={(e) => {
                        if (e.target !== e.currentTarget) return;
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          toggle();
                        }
                      }}
                      className={clsx("cursor-pointer border-b border-surface-border/60 hover:bg-zinc-800/40", op && "bg-accent/5")}
                    >
                      <td className={clsx(td, "font-semibold text-white")}>{p.codigo}</td>
                      <td className={clsx(td, "max-w-64 text-zinc-300")}>
                        <div className="truncate">{p.clienteNome}</div>
                        {p.condicaoPagamento && <div className="truncate text-xs text-muted">{p.condicaoPagamento}</div>}
                      </td>
                      <td className={clsx(td, "text-secondary")}>{p.consultorNome}</td>
                      <td className={td}>
                        <Badge color={STATUS_CORES[p.statusAssinatura]}>{STATUS_LABELS[p.statusAssinatura]}</Badge>
                      </td>
                      <td className={clsx(td, "whitespace-nowrap text-secondary", numCls)}>{fmtData(p.criadoEm)}</td>
                      <td className={clsx(td, "whitespace-nowrap", numCls)}>
                        {!p.previsaoEntrega ? (
                          <span className="text-subtle">—</span>
                        ) : atrasado(p) ? (
                          <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-xs text-red-400">{fmtData(p.previsaoEntrega)}</span>
                        ) : em7dias(p) ? (
                          <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs text-amber-400">{fmtData(p.previsaoEntrega)}</span>
                        ) : (
                          <span className="text-zinc-300">{fmtData(p.previsaoEntrega)}</span>
                        )}
                      </td>
                      <td className={clsx(td, "text-right", numCls)}>{p.itens.length}</td>
                      <td className={clsx(td, "whitespace-nowrap text-right font-semibold text-white", numCls)}>{fmtBRL(p.total)}</td>
                      <td className={clsx(td, "text-right")} onClick={(e) => e.stopPropagation()}>
                        {p.statusAssinatura === "ASSINADA" && p.pdfAssinadoUrl && (
                          <a
                            href={p.pdfAssinadoUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="whitespace-nowrap text-xs text-accent hover:underline"
                          >
                            Ver documento
                          </a>
                        )}
                      </td>
                      <td className={td} onClick={(e) => e.stopPropagation()}>
                        {/* Após a conferência final, consultor solicita a emissão
                            do próprio pedido e admin solicita qualquer um. O pedido
                            passa a aparecer em Financeiro > Notas Fiscais/Boletos,
                            onde a emissão é feita pelo administrativo. */}
                        {p.statusAssinatura === "ASSINADA" &&
                          (p.vendaFaturada ? (
                            <Badge color="#00dc4d">Faturado</Badge>
                          ) : p.autorizadoFaturarEm ? (
                            <Badge color="#3b82f6">Emissão solicitada</Badge>
                          ) : (
                            <Button variant="primary" size="sm" disabled={pendente} onClick={() => solicitarEmissao(p.id)}>
                              <Wallet size={13} /> Solicitar faturamento
                            </Button>
                          ))}
                      </td>
                    </tr>
                    {op && (
                      <tr className="border-b border-surface-border/60 bg-zinc-800/40">
                        <td colSpan={10} className="px-4 py-3">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="text-muted">
                                <td>Produto</td>
                                <td className="text-right">Quantidade</td>
                                <td className="text-right">Preço unit.</td>
                                <td className="text-right">Subtotal</td>
                              </tr>
                            </thead>
                            <tbody>
                              {p.itens.map((i) => (
                                <tr key={i.id}>
                                  <td className="py-1 text-zinc-200">{i.produtoNome}</td>
                                  <td className={clsx("text-right", numCls)}>
                                    {i.volume != null ? `${i.volume.toLocaleString("pt-BR")} ${i.unidade ?? ""}` : "—"}
                                  </td>
                                  <td className={clsx("text-right", numCls)}>{i.valorUnitario != null ? fmtBRL(i.valorUnitario) : "—"}</td>
                                  <td className={clsx("text-right", numCls)}>{fmtBRL(i.total)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          <p className="mt-2 text-xs text-muted">
                            {[
                              p.condicaoPagamento && `Pagamento: ${p.condicaoPagamento}`,
                              p.localEntrega && `Entrega: ${p.localEntrega}`,
                              p.frete && `Frete: ${p.frete}`,
                            ]
                              .filter(Boolean)
                              .join(" · ") || "Sem condições de entrega informadas."}
                          </p>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
              {lista.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-3 py-8 text-center text-muted"><p className="sticky left-3 max-w-[calc(100vw-4rem)] whitespace-normal md:max-w-[calc(100vw-20rem)]">{propostas.length === 0 ? "Nenhum pedido em carteira nesta safra. Os pedidos entram aqui após a aprovação do financeiro." : "Nenhum pedido com esses filtros. Altere a busca ou o período."}</p></td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
