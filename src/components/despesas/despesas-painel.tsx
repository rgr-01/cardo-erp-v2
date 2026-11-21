"use client";
import { DialogFrame } from "@/components/ui/dialog-frame";
import { ChartColumn, CircleDollarSign, Receipt, Wallet, type LucideIcon } from "lucide-react";
import { Kpi } from "@/components/ui/kpi";
import { ESTILO_PAINEL } from "@/components/ui/padroes-painel";

import { useMarcaEmpresa } from "@/components/marca-empresa";
import Link from "next/link";
import { Fragment, useEffect, useMemo, useState, useTransition } from "react";
import clsx from "clsx";
import { baixarDespesa, excluirDespesa } from "@/app/actions/despesas";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { FormDespesa } from "@/components/despesas/despesas-form";
import { GraficoMensal, type BarraMes } from "@/components/despesas/despesas-grafico-mensal";
import { fmtBRL } from "@/lib/format";
import { gerarPdfPlanoDespesas } from "@/lib/despesas-plano-pdf";
import { MESES_NOME, chaveMes, fracaoDoMes, mesesDaSafra } from "@/lib/despesas-contas";

export type FotoLinha = { id: string; url: string };

export type ContaPlano = {
  id: string;
  codigo: string;
  nome: string;
  ativo: boolean;
  orcamento: number;
};

export type GrupoPlano = { id: string; nome: string; contas: ContaPlano[] };

export type DespesaLinha = {
  id: string;
  contaId: string | null;
  valor: number;
  data: string;
  estabelecimento: string | null;
  descricao: string | null;
  documento: string | null;
  vencimento: string | null;
  situacao: "PAGO" | "A_PAGAR";
  filial: string | null;
  origemOcr: boolean;
  clienteNome: string | null;
  consultorNome: string;
  consultorId: string;
  fotos: FotoLinha[];
};

export type ClienteOpcao = { id: string; nome: string };

const CORES_GRUPO = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#4caf50", "#9085e9", "#e0b43a"];
const POR_PAGINA = 20;
const SEM_FILIAL = "Sem filial";

const selectCls =
  "rounded-lg border border-surface-border bg-zinc-800 px-3 py-1.5 text-sm text-white outline-none focus:border-accent";
const campoRotuloCls = "flex flex-col gap-1 text-[11px] uppercase tracking-wide text-muted";
const btnSm =
  "rounded-lg border border-surface-border px-2.5 py-1 text-xs text-zinc-200 hover:bg-zinc-800 disabled:opacity-50";

type Situacao = "Pago" | "A pagar" | "Vencido";

const brl0 = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const pct = (v: number, d = 1) =>
  (v > 0 ? "+" : "") + v.toLocaleString("pt-BR", { maximumFractionDigits: d }) + "%";

function partes(iso: string) {
  const d = new Date(iso);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth(), d: d.getUTCDate() };
}

const fmtData = (iso: string) =>
  new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });

function PilulaVariacao({ real, orc }: { real: number; orc: number | null }) {
  if (!orc) return null;
  const v = (real / orc - 1) * 100;
  return (
    <span
      className={clsx(
        "whitespace-nowrap rounded-full px-1.5 py-0.5 font-mono text-[11px]",
        v > 10 ? "bg-red-500/15 text-red-400" : v > 0 ? "bg-amber-500/15 text-amber-400" : "bg-emerald-500/15 text-emerald-400"
      )}
    >
      {pct(v)}
    </span>
  );
}

function CardKpi({
  rotulo,
  icone,
  valor,
  children,
}: {
  rotulo: string;
  icone: LucideIcon;
  valor: string;
  children?: React.ReactNode;
}) {
  return (
    <Kpi rotulo={rotulo} valor={valor} icone={icone}>{children}</Kpi>
  );
}

// Visualização do comprovante dentro do próprio site (em vez de abrir outra aba).
function VisualizadorFotos({ urls, inicio, aoFechar }: { urls: string[]; inicio: number; aoFechar: () => void }) {
  const [indice, setIndice] = useState(inicio);
  const total = urls.length;
  useEffect(() => {
    function tecla(e: KeyboardEvent) {
      if (e.key === "Escape") aoFechar();
      else if (e.key === "ArrowLeft") setIndice((i) => (i - 1 + total) % total);
      else if (e.key === "ArrowRight") setIndice((i) => (i + 1) % total);
    }
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [aoFechar, total]);
  return (
    <DialogFrame onClose={aoFechar} label={"Comprovante da despesa"} className="fixed inset-0 z-[100] flex flex-col bg-black/90 p-3 sm:p-6">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3 text-sm text-zinc-300" onClick={(e) => e.stopPropagation()}>
        <span>{total > 1 ? `Comprovante ${indice + 1} de ${total}` : "Comprovante"}</span>
        <div className="flex gap-2">
          <a href={urls[indice]} target="_blank" rel="noreferrer" className="rounded-lg border border-white/15 px-3 py-1.5 text-xs hover:bg-white/10">Abrir em nova aba</a>
          <button type="button" onClick={aoFechar} className="rounded-lg border border-white/15 px-3 py-1.5 text-xs hover:bg-white/10">Fechar</button>
        </div>
      </div>
      <div className="relative mx-auto flex min-h-0 w-full max-w-5xl flex-1 items-center justify-center py-3">
        {/* eslint-disable-next-line @next/next/no-img-element -- fotos vêm do storage externo (Supabase) */}
        <img src={urls[indice]} alt="Comprovante da despesa" className="max-h-full max-w-full rounded-lg object-contain" onClick={(e) => e.stopPropagation()} />
        {total > 1 && (
          <>
            <button type="button" aria-label="Anterior" onClick={(e) => { e.stopPropagation(); setIndice((i) => (i - 1 + total) % total); }} className="absolute left-0 rounded-full bg-black/60 px-3 py-2 text-xl text-white hover:bg-black/80">‹</button>
            <button type="button" aria-label="Próxima" onClick={(e) => { e.stopPropagation(); setIndice((i) => (i + 1) % total); }} className="absolute right-0 rounded-full bg-black/60 px-3 py-2 text-xl text-white hover:bg-black/80">›</button>
          </>
        )}
      </div>
    </DialogFrame>
  );
}

export function DespesasPainel({
  clientes,
  despesas,
  grupos,
  usuarioId,
  ehAdmin,
  storageConfigurado,
  safraNome,
  hoje,
}: {
  clientes: ClienteOpcao[];
  despesas: DespesaLinha[];
  grupos: GrupoPlano[];
  usuarioId: string;
  ehAdmin: boolean;
  storageConfigurado: boolean;
  safraNome: string;
  hoje: string;
}) {
  const { confirmar } = useConfirm();
  const marca = useMarcaEmpresa();
  const [pendente, startTransition] = useTransition();
  const [modalAberto, setModalAberto] = useState(false);
  const [fotosAbertas, setFotosAbertas] = useState<{ urls: string[]; inicio: number } | null>(null);
  const [editando, setEditando] = useState<DespesaLinha | null>(null);
  const [removidas, setRemovidas] = useState<Set<string>>(new Set());

  const h = useMemo(() => {
    const [y, m, d] = hoje.split("-").map(Number);
    return { y, m: m - 1, d };
  }, [hoje]);
  const meses = useMemo(() => mesesDaSafra(safraNome, h), [safraNome, h]);
  const futuro = (y: number, m: number) => chaveMes(y, m) > chaveMes(h.y, h.m);
  const ehAtual = (y: number, m: number) => y === h.y && m === h.m;
  const mesesComDados = meses.filter((x) => !futuro(x.y, x.m));

  const [mesSel, setMesSel] = useState(() => {
    const ult = mesesComDados[mesesComDados.length - 1] ?? meses[0];
    const ant = mesesComDados[mesesComDados.length - 2];
    // Início de mês: o mês corrente ainda está quase vazio, mostra o anterior.
    const x = ult && ehAtual(ult.y, ult.m) && h.d < 10 && ant ? ant : ult;
    return `${x.y}-${x.m}`;
  });
  const [filial, setFilial] = useState("all");
  const [sy, sm] = mesSel.split("-").map(Number);

  // Filtros da lista de lançamentos
  const [periodo, setPeriodo] = useState<"mes" | "safra">("mes");
  const [filtroConta, setFiltroConta] = useState("all");
  const [filtroSituacao, setFiltroSituacao] = useState("all");
  const [busca, setBusca] = useState("");
  const [pagina, setPagina] = useState(0);
  const [abertos, setAbertos] = useState<Set<string>>(new Set());

  const temOrc = ehAdmin && filial === "all";

  const contas = useMemo(() => grupos.flatMap((g) => g.contas.map((c) => ({ ...c, grupoId: g.id }))), [grupos]);
  const contaPorId = useMemo(() => new Map(contas.map((c) => [c.id, c])), [contas]);
  const grupoDaConta = useMemo(() => new Map(grupos.flatMap((g) => g.contas.map((c) => [c.id, g]))), [grupos]);

  const todas = useMemo(() => despesas.filter((d) => !removidas.has(d.id)), [despesas, removidas]);
  const filiais = useMemo(
    () => [...new Set(todas.map((d) => d.filial).filter((f): f is string => Boolean(f)))].sort(),
    [todas]
  );
  const temSemFilial = todas.some((d) => !d.filial);
  const noFiltroFilial = (d: DespesaLinha) =>
    filial === "all" || (filial === SEM_FILIAL ? !d.filial : d.filial === filial);
  const deps = useMemo(
    () => todas.filter(noFiltroFilial),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- noFiltroFilial depende só de `filial`
    [todas, filial]
  );

  const situacaoDe = (d: DespesaLinha): Situacao =>
    d.situacao === "PAGO" ? "Pago" : d.vencimento && d.vencimento.slice(0, 10) < hoje ? "Vencido" : "A pagar";

  // realizado[mês][conta]
  const realizado = useMemo(() => {
    const mapa = new Map<number, Map<string, number>>();
    for (const d of deps) {
      if (!d.contaId) continue;
      const p = partes(d.data);
      const k = chaveMes(p.y, p.m);
      const m = mapa.get(k) ?? new Map<string, number>();
      m.set(d.contaId, (m.get(d.contaId) ?? 0) + d.valor);
      mapa.set(k, m);
    }
    return mapa;
  }, [deps]);
  const real = (contaId: string, y: number, m: number) => realizado.get(chaveMes(y, m))?.get(contaId) ?? 0;
  const orcEf = (contaId: string, y: number, m: number) =>
    (contaPorId.get(contaId)?.orcamento ?? 0) * fracaoDoMes(y, m, h);

  const acum = mesesComDados.filter((x) => chaveMes(x.y, x.m) <= chaveMes(sy, sm));
  const somaMes = (y: number, m: number) => contas.reduce((s, c) => s + real(c.id, y, m), 0);
  // Orçamento mensal consolidado (só contas ativas); igual em todos os meses da safra.
  const orcadoTotal = contas.filter((c) => c.ativo).reduce((s, c) => s + c.orcamento, 0);

  // ---------- KPIs ----------
  const rM = somaMes(sy, sm);
  const oMcheio = orcadoTotal;
  const oMprop = oMcheio * fracaoDoMes(sy, sm, h);
  const rA = acum.reduce((s, x) => s + somaMes(x.y, x.m), 0);
  const oA = acum.reduce((s, x) => s + orcadoTotal * fracaoDoMes(x.y, x.m, h), 0);
  const cons = oMcheio ? (rM / oMcheio) * 100 : 0;
  const consCor = cons > 100 ? "#ef4444" : cons > 90 ? "#e3a84e" : "#4cc38a";
  const pend = deps.filter((d) => d.situacao === "A_PAGAR");
  const vencidas = pend.filter((d) => situacaoDe(d) === "Vencido");
  const limite7 = new Date(Date.UTC(h.y, h.m, h.d + 7)).toISOString().slice(0, 10);
  const prox = pend.filter(
    (d) => situacaoDe(d) === "A pagar" && d.vencimento && d.vencimento.slice(0, 10) <= limite7
  );
  const maiorConta = contas
    .map((c) => ({ c, v: real(c.id, sy, sm) }))
    .sort((a, b) => b.v - a.v)[0];
  const qtdMes = deps.filter((d) => {
    const p = partes(d.data);
    return p.y === sy && p.m === sm;
  }).length;

  const alertas = temOrc
    ? contas
        .map((c) => {
          const r = real(c.id, sy, sm);
          const o = orcEf(c.id, sy, sm);
          return { c, r, d: r - o, p: o ? (r / o - 1) * 100 : 0 };
        })
        .filter((x) => x.p > 10 && x.d > 300)
        .sort((a, b) => b.d - a.d)
        .slice(0, 4)
    : [];

  // ---------- gráfico ----------
  const gruposCor = grupos.map((g, i) => ({ nome: g.nome, cor: CORES_GRUPO[i % CORES_GRUPO.length] }));
  const barras: BarraMes[] = meses.map((x) => {
    const porGrupo = grupos.map((g) => g.contas.reduce((s, c) => s + real(c.id, x.y, x.m), 0));
    return {
      ...x,
      futuro: futuro(x.y, x.m),
      atual: ehAtual(x.y, x.m),
      porGrupo,
      total: porGrupo.reduce((a, b) => a + b, 0),
      orcado: temOrc ? orcadoTotal : null,
    };
  });

  // ---------- plano de contas ----------
  const linhaConta = (c: ContaPlano) => ({
    r: real(c.id, sy, sm),
    o: orcEf(c.id, sy, sm),
    ra: acum.reduce((s, x) => s + real(c.id, x.y, x.m), 0),
    oa: acum.reduce((s, x) => s + orcEf(c.id, x.y, x.m), 0),
  });
  const somar = (ls: ReturnType<typeof linhaConta>[]) => ({
    r: ls.reduce((s, x) => s + x.r, 0),
    o: ls.reduce((s, x) => s + x.o, 0),
    ra: ls.reduce((s, x) => s + x.ra, 0),
    oa: ls.reduce((s, x) => s + x.oa, 0),
  });
  const plano = grupos.map((g) => {
    const cs = g.contas
      .map((c) => ({ c, ...linhaConta(c) }))
      .filter((x) => x.c.ativo || x.r || x.ra);
    return { g, cs, ...somar(cs) };
  });
  const totalPlano = somar(plano);
  const [gruposAbertos, setGruposAbertos] = useState<Set<string>>(new Set());
  const alternarGrupo = (id: string) =>
    setGruposAbertos((a) => {
      const n = new Set(a);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  function verConta(id: string) {
    setFiltroConta(id);
    setPeriodo("mes");
    setPagina(0);
    document.getElementById("lancamentos-despesas")?.scrollIntoView({ block: "start", behavior: "smooth" });
  }

  // ---------- lançamentos ----------
  const q = busca.trim().toLowerCase();
  const lista = deps
    .filter((d) => {
      const p = partes(d.data);
      if (periodo === "mes" && !(p.y === sy && p.m === sm)) return false;
      if (filtroConta !== "all") {
        if (filtroConta.startsWith("g:")) {
          if (grupoDaConta.get(d.contaId ?? "")?.id !== filtroConta.slice(2)) return false;
        } else if (d.contaId !== filtroConta) return false;
      }
      if (filtroSituacao !== "all" && situacaoDe(d) !== filtroSituacao) return false;
      if (q) {
        const texto = `${d.estabelecimento ?? ""} ${d.documento ?? ""} ${d.descricao ?? ""} ${d.consultorNome}`.toLowerCase();
        if (!texto.includes(q)) return false;
      }
      return true;
    })
    .sort((a, b) => b.data.localeCompare(a.data));
  const paginas = Math.max(1, Math.ceil(lista.length / POR_PAGINA));
  const pg = Math.min(pagina, paginas - 1);
  const visiveis = lista.slice(pg * POR_PAGINA, pg * POR_PAGINA + POR_PAGINA);
  const somaSit = (s: Situacao) => lista.filter((d) => situacaoDe(d) === s).reduce((a, d) => a + d.valor, 0);

  const podeEditar = (d: DespesaLinha) => ehAdmin || d.consultorId === usuarioId;

  async function excluir(d: DespesaLinha) {
    if (!(await confirmar({ mensagem: "Excluir esta despesa?", confirmarLabel: "Excluir despesa", variante: "perigo" }))) return;
    startTransition(async () => {
      const r = await excluirDespesa(d.id);
      if (r.ok) setRemovidas((a) => new Set(a).add(d.id));
    });
  }

  function baixar(d: DespesaLinha) {
    startTransition(async () => {
      await baixarDespesa(d.id);
    });
  }

  const [gerandoPdf, setGerandoPdf] = useState(false);
  async function gerarPdf() {
    setGerandoPdf(true);
    try {
      const bytes = await gerarPdfPlanoDespesas({
        nomeEmpresa: marca?.nome,
        subtitulo: `${MESES_NOME[sm]} de ${sy}${ehAtual(sy, sm) && temOrc ? " (até " + fmtData(hoje) + ", orçado proporcional)" : ""}   |   Acumulado da safra ${safraNome}   |   ${filial === "all" ? "Consolidado" : filial}   |   Gerado em ${fmtData(hoje)}`,
        grupos: plano.map((x) => ({
          nome: x.g.nome,
          r: x.r,
          o: x.o,
          ra: x.ra,
          oa: x.oa,
          contas: x.cs.map((z) => ({ codigo: z.c.codigo, nome: z.c.nome, r: z.r, o: z.o, ra: z.ra, oa: z.oa })),
        })),
        total: totalPlano,
        temOrc,
      });
      const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/pdf" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `despesas-administrativas-${sy}-${String(sm + 1).padStart(2, "0")}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setGerandoPdf(false);
    }
  }

  const limpar = () => {
    setFiltroConta("all");
    setFiltroSituacao("all");
    setBusca("");
    setPeriodo("mes");
    setPagina(0);
  };

  const tituloPeriodo = periodo === "mes" ? `${MESES_NOME[sm]} de ${sy}` : `Safra ${safraNome}`;
  const numCls = "font-mono tabular-nums";
  const th = "whitespace-nowrap border-b border-zinc-700 bg-zinc-800/70 px-2.5 py-2 text-left text-[11px] font-medium uppercase tracking-wide text-secondary";
  const td = "border-b border-surface-border/60 px-2.5 py-2 align-middle";
  const painel = `${ESTILO_PAINEL} flex flex-col gap-3`;

  const celulasPlano = (x: { r: number; o: number; ra: number; oa: number }) => (
    <>
      <td className={clsx(td, "text-right", numCls)}>{fmtBRL(x.r)}</td>
      <td className={clsx(td, "text-right text-muted", numCls)}>{temOrc ? fmtBRL(x.o) : "—"}</td>
      <td className={clsx(td, "text-right", numCls)}>
        {temOrc ? (
          <>
            {fmtBRL(x.r - x.o)} <PilulaVariacao real={x.r} orc={x.o} />
          </>
        ) : (
          "—"
        )}
      </td>
      <td className={clsx(td, "text-right", numCls)}>{fmtBRL(x.ra)}</td>
      <td className={clsx(td, "text-right text-muted", numCls)}>{temOrc ? fmtBRL(x.oa) : "—"}</td>
      <td className={clsx(td, "text-right")}>{temOrc ? <PilulaVariacao real={x.ra} orc={x.oa} /> : "—"}</td>
      <td className={clsx(td, "text-right", numCls)}>
        {totalPlano.r
          ? ((x.r / totalPlano.r) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + "%"
          : "—"}
      </td>
    </>
  );

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-white">
            Despesas{" "}
            <span className="rounded-md bg-accent/10 px-2 py-0.5 font-mono text-xs font-normal text-accent">
              safra {safraNome}
            </span>
          </h1>
          <p className="text-xs text-muted">
            {ehAdmin ? "Orçado x realizado por conta" : "Suas despesas por conta"} ·{" "}
            {new Date(hoje + "T12:00:00Z").toLocaleDateString("pt-BR", {
              weekday: "long",
              day: "numeric",
              month: "long",
              year: "numeric",
              timeZone: "UTC",
            })}
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className={campoRotuloCls}>
            Mês
            <select value={mesSel} onChange={(e) => { setMesSel(e.target.value); setPagina(0); }} className={selectCls}>
              {mesesComDados.map((x) => (
                <option key={`${x.y}-${x.m}`} value={`${x.y}-${x.m}`}>
                  {MESES_NOME[x.m][0].toUpperCase() + MESES_NOME[x.m].slice(1)}/{String(x.y).slice(2)}
                </option>
              ))}
            </select>
          </label>
          <label className={campoRotuloCls}>
            Filial
            <select value={filial} onChange={(e) => { setFilial(e.target.value); setPagina(0); }} className={selectCls}>
              <option value="all">Consolidado</option>
              {filiais.map((f) => (
                <option key={f}>{f}</option>
              ))}
              {temSemFilial && filiais.length > 0 && <option>{SEM_FILIAL}</option>}
            </select>
          </label>
          {ehAdmin && (
            <Link href="/despesas/orcamento" className={clsx(btnSm, "py-2 text-sm")}>
              Plano e orçamento
            </Link>
          )}
          <button onClick={gerarPdf} disabled={gerandoPdf} className={clsx(btnSm, "py-2 text-sm")}>
            {gerandoPdf ? "Gerando..." : "Relatório PDF"}
          </button>
          <button
            onClick={() => setModalAberto(true)}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground hover:brightness-110"
          >
            + Lançar despesa
          </button>
        </div>
      </header>

      {!storageConfigurado && (
        <p className="rounded-lg border border-amber-600/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-300">
          O envio de fotos ainda não está disponível. Você pode registrar despesas sem anexos. Para habilitar as fotos, fale com o administrador.
        </p>
      )}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <CardKpi
          rotulo={`Despesas de ${MESES_NOME[sm]}${ehAtual(sy, sm) ? " até hoje" : ""}`}
          icone={Receipt}
          valor={brl0(rM)}
        >
          {temOrc ? (
            <>
              <span>
                Orçado {brl0(oMcheio)} · {Math.round(cons)}% consumido
              </span>
              <PilulaVariacao real={rM} orc={oMprop} />
              <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-zinc-800" role="img" aria-label={`${Math.round(cons)}% do orçamento consumido`}>
                <i className="block h-full" style={{ width: `${Math.min(cons, 100)}%`, background: consCor }} />
              </div>
            </>
          ) : (
            <span>{qtdMes} lançamento{qtdMes === 1 ? "" : "s"} no mês</span>
          )}
        </CardKpi>
        <CardKpi rotulo={`Acumulado da safra ${safraNome}`} icone={ChartColumn} valor={brl0(rA)}>
          {temOrc && (
            <>
              <span>Orçado {brl0(oA)}</span>
              <PilulaVariacao real={rA} orc={oA} />
            </>
          )}
          <span>
            {acum.length} {acum.length === 1 ? "mês" : "meses"}
          </span>
        </CardKpi>
        <CardKpi rotulo="Contas a pagar" icone={Wallet} valor={brl0(pend.reduce((s, d) => s + d.valor, 0))}>
          {vencidas.length ? (
            <span className="rounded-full bg-red-500/15 px-2 py-0.5 font-mono text-[11px] text-red-400">
              {vencidas.length} vencida{vencidas.length === 1 ? "" : "s"} · {brl0(vencidas.reduce((s, d) => s + d.valor, 0))}
            </span>
          ) : (
            <span>Nenhuma vencida</span>
          )}
          <span>· {prox.length} vencem em 7 dias</span>
        </CardKpi>
        <CardKpi rotulo={`Maior conta de ${MESES_NOME[sm]}`} icone={CircleDollarSign} valor={maiorConta?.v ? brl0(maiorConta.v) : "—"}>
          <span className="truncate">{maiorConta?.v ? maiorConta.c.nome : "Sem lançamentos no mês"}</span>
        </CardKpi>
      </section>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        {alertas.length > 0 ? (
          <>
            <span className="mr-1 text-[11px] uppercase tracking-wide text-muted">
              Acima do orçamento em {MESES_NOME[sm]}
            </span>
            {alertas.map((a) => (
              <button
                key={a.c.id}
                onClick={() => verConta(a.c.id)}
                className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900 px-2.5 py-1 text-xs hover:border-red-500"
              >
                <span className="text-zinc-200">{a.c.nome}</span>
                <b className="font-mono font-medium text-red-400">{pct(a.p, 0)}</b>
                <span className={clsx("text-muted", numCls)}>+{brl0(a.d)}</span>
              </button>
            ))}
          </>
        ) : temOrc ? (
          <span className="text-[11px] uppercase tracking-wide text-muted">
            Nenhuma conta mais de 10% acima do orçamento em {MESES_NOME[sm]}
          </span>
        ) : null}
      </div>

      <section className={painel}>
        <div>
          <h2 className="text-sm font-semibold text-white">Despesas por mês</h2>
          <p className="text-xs text-muted">
            Safra {safraNome} · {filial === "all" ? "consolidado" : filial}
          </p>
        </div>
        <GraficoMensal
          barras={barras}
          grupos={gruposCor}
          selecionado={{ y: sy, m: sm }}
          aoSelecionar={(y, m) => { setMesSel(`${y}-${m}`); setPagina(0); }}
        />
        <p className="text-xs text-muted">
          Barras empilhadas por grupo de contas.{temOrc ? " A linha tracejada é o orçamento." : ""} Clique num mês para selecioná-lo.
        </p>
      </section>

      <section className={painel}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-white">Plano de contas</h2>
            <p className="text-xs text-muted">
              {MESES_NOME[sm]} de {sy}
              {ehAtual(sy, sm) && temOrc ? " até hoje, com orçado proporcional aos dias corridos," : ""} e acumulado da safra {safraNome} ·{" "}
              {filial === "all" ? "consolidado" : filial}
            </p>
          </div>
          <button
            className={btnSm}
            onClick={() => setGruposAbertos(gruposAbertos.size === grupos.length ? new Set() : new Set(grupos.map((g) => g.id)))}
          >
            {gruposAbertos.size === grupos.length ? "Recolher todos" : "Expandir todos"}
          </button>
        </div>
        <div className="tabela-fixa overflow-x-auto rounded-xl border border-surface-border">
          <table className="w-full min-w-[820px] border-collapse text-[13px]">
            <thead>
              <tr>
                <th className={th}>Conta</th>
                <th className={clsx(th, "text-right")}>Realizado mês</th>
                <th className={clsx(th, "text-right")}>Orçado mês</th>
                <th className={clsx(th, "text-right")}>Variação</th>
                <th className={clsx(th, "text-right")}>Acum. safra</th>
                <th className={clsx(th, "text-right")}>Orçado acum.</th>
                <th className={clsx(th, "text-right")}>Var. acum.</th>
                <th className={clsx(th, "text-right")}>% do total</th>
              </tr>
            </thead>
            <tbody>
              {plano.map((x, i) => {
                const aberto = gruposAbertos.has(x.g.id);
                return (
                  <Fragment key={x.g.id}>
                    <tr
                      tabIndex={0}
                      aria-expanded={aberto}
                      onClick={() => alternarGrupo(x.g.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          alternarGrupo(x.g.id);
                        }
                      }}
                      className="cursor-pointer bg-zinc-800/50 font-semibold hover:bg-zinc-800"
                    >
                      <td className={clsx(td, "whitespace-nowrap")}>
                        <span aria-hidden="true" className="mr-1.5 text-muted">{aberto ? "▾" : "▸"}</span>
                        <i className="mr-2 inline-block h-2.5 w-2.5 rounded-[3px]" style={{ background: CORES_GRUPO[i % CORES_GRUPO.length] }} />
                        {x.g.nome}
                      </td>
                      {celulasPlano(x)}
                    </tr>
                    {aberto &&
                      x.cs.map((z) => (
                        <tr
                          key={z.c.id}
                          tabIndex={0}
                          onClick={() => verConta(z.c.id)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              verConta(z.c.id);
                            }
                          }}
                          className="cursor-pointer hover:bg-zinc-800/60"
                        >
                          <td className={clsx(td, "pl-8")}>
                            <span className={clsx("mr-2 text-xs text-muted", numCls)}>{z.c.codigo}</span>
                            {z.c.nome}
                          </td>
                          {celulasPlano(z)}
                        </tr>
                      ))}
                  </Fragment>
                );
              })}
              <tr className="font-bold">
                <td className={clsx(td, "border-t border-zinc-600")}>Total das despesas</td>
                {celulasPlano(totalPlano)}
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted">
          Clique num grupo para abrir as contas, e numa conta para ver os lançamentos dela.
        </p>
      </section>

      <section id="lancamentos-despesas" className={clsx(painel, "scroll-mt-4")}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-white">Lançamentos</h2>
            <p className="text-xs text-muted">
              {tituloPeriodo} · {filial === "all" ? "todas as filiais" : filial}
            </p>
          </div>
          <div className="inline-flex overflow-hidden rounded-lg border border-surface-border text-xs" role="group" aria-label="Período">
            {([["mes", "Mês selecionado"], ["safra", "Safra"]] as const).map(([k, rotulo]) => (
              <button
                key={k}
                onClick={() => { setPeriodo(k); setPagina(0); }}
                className={clsx("px-3 py-1.5", periodo === k ? "bg-accent/10 font-semibold text-accent" : "text-zinc-300 hover:bg-zinc-800")}
              >
                {rotulo}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <label className={campoRotuloCls}>
            Conta
            <select value={filtroConta} onChange={(e) => { setFiltroConta(e.target.value); setPagina(0); }} className={clsx(selectCls, "max-w-64")}>
              <option value="all">Todas as contas</option>
              {grupos.map((g) => (
                <optgroup key={g.id} label={g.nome}>
                  <option value={`g:${g.id}`}>Todo o grupo {g.nome}</option>
                  {g.contas.map((c) => (
                    <option key={c.id} value={c.id}>{c.codigo} · {c.nome}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
          <label className={campoRotuloCls}>
            Situação
            <select value={filtroSituacao} onChange={(e) => { setFiltroSituacao(e.target.value); setPagina(0); }} className={selectCls}>
              <option value="all">Todas</option>
              <option>Pago</option>
              <option>A pagar</option>
              <option>Vencido</option>
            </select>
          </label>
          <label className={campoRotuloCls}>
            Buscar
            <input
              type="search"
              value={busca}
              onChange={(e) => { setBusca(e.target.value); setPagina(0); }}
              placeholder="Fornecedor, documento ou histórico"
              className={clsx(selectCls, "min-w-56")}
            />
          </label>
          <button className={btnSm} onClick={limpar}>Limpar filtros</button>
        </div>

        <div className="flex flex-wrap gap-x-5 gap-y-1 text-[13px] text-secondary">
          <div>Lançamentos <b className={clsx("font-medium text-white", numCls)}>{lista.length.toLocaleString("pt-BR")}</b></div>
          <div>Total <b className={clsx("font-medium text-white", numCls)}>{fmtBRL(lista.reduce((s, d) => s + d.valor, 0))}</b></div>
          <div>Pago <b className={clsx("font-medium text-white", numCls)}>{fmtBRL(somaSit("Pago"))}</b></div>
          <div>A pagar <b className={clsx("font-medium text-white", numCls)}>{fmtBRL(somaSit("A pagar"))}</b></div>
          <div>Vencido <b className={clsx("font-medium", numCls, somaSit("Vencido") ? "text-red-400" : "text-white")}>{fmtBRL(somaSit("Vencido"))}</b></div>
        </div>

        <div className="tabela-fixa overflow-x-auto rounded-xl border border-surface-border">
          <table className="w-full min-w-[980px] border-collapse text-[13px]">
            <thead>
              <tr>
                <th className={th}>Competência</th>
                <th className={th}>Conta</th>
                <th className={th}>Fornecedor</th>
                <th className={th}>Documento</th>
                <th className={th}>Histórico</th>
                <th className={th}>Filial</th>
                <th className={th}>Vencimento</th>
                <th className={clsx(th, "text-right")}>Valor</th>
                <th className={th}>Situação</th>
                <th className={th}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {visiveis.length === 0 ? (
                <tr>
                  <td colSpan={10} className="p-4 text-xs text-muted"><p className="sticky left-3 max-w-[calc(100vw-4rem)] whitespace-normal md:max-w-[calc(100vw-20rem)]">Nenhum lançamento com esses filtros. Altere o mês, a filial ou a situação. Para registrar uma despesa, use &quot;Lançar despesa&quot;.</p></td>
                </tr>
              ) : (
                visiveis.map((d) => {
                  const c = d.contaId ? contaPorId.get(d.contaId) : undefined;
                  const g = d.contaId ? grupoDaConta.get(d.contaId) : undefined;
                  const cor = g ? CORES_GRUPO[grupos.indexOf(g) % CORES_GRUPO.length] : "#67818a";
                  const sit = situacaoDe(d);
                  const aberta = abertos.has(d.id);
                  return (
                    <Fragment key={d.id}>
                      <tr className="hover:bg-zinc-800/40">
                        <td className={clsx(td, numCls)}>{fmtData(d.data)}</td>
                        <td className={td}>
                          <i className="mr-2 inline-block h-2.5 w-2.5 rounded-[3px]" style={{ background: cor }} />
                          {c?.nome ?? "Sem conta"}
                          {c && <div className={clsx("text-xs text-muted", numCls)}>{c.codigo}</div>}
                        </td>
                        <td className={td}>
                          {d.estabelecimento ?? "—"}
                          {ehAdmin && <div className="text-xs text-muted">{d.consultorNome}</div>}
                        </td>
                        <td className={clsx(td, numCls)}>{d.documento ?? "—"}</td>
                        <td className={td}>
                          {d.descricao ?? "—"}
                          {(d.clienteNome || d.origemOcr) && (
                            <div className="text-xs text-muted">
                              {d.clienteNome}
                              {d.clienteNome && d.origemOcr ? " · " : ""}
                              {d.origemOcr ? "IA" : ""}
                            </div>
                          )}
                        </td>
                        <td className={td}>{d.filial ?? "—"}</td>
                        <td className={clsx(td, numCls)}>{d.vencimento ? fmtData(d.vencimento) : "—"}</td>
                        <td className={clsx(td, "text-right", numCls)}>{fmtBRL(d.valor)}</td>
                        <td className={td}>
                          <span
                            className={clsx(
                              "whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium",
                              sit === "Pago" ? "bg-emerald-500/15 text-emerald-400" : sit === "Vencido" ? "bg-red-500/15 text-red-400" : "bg-amber-500/15 text-amber-400"
                            )}
                          >
                            {sit}
                          </span>
                        </td>
                        <td className={td}>
                          <div className="flex items-center gap-1">
                            {d.fotos.length > 0 && (
                              <button
                                className={btnSm}
                                aria-expanded={aberta}
                                onClick={() =>
                                  setAbertos((a) => {
                                    const n = new Set(a);
                                    if (n.has(d.id)) n.delete(d.id);
                                    else n.add(d.id);
                                    return n;
                                  })
                                }
                              >
                                Fotos ({d.fotos.length})
                              </button>
                            )}
                            {podeEditar(d) && d.situacao === "A_PAGAR" && (
                              <button className={btnSm} disabled={pendente} onClick={() => baixar(d)} title="Marcar como pago">
                                Baixar
                              </button>
                            )}
                            {podeEditar(d) && (
                              <>
                                <button className={clsx(btnSm, "text-accent")} onClick={() => setEditando(d)}>
                                  Editar
                                </button>
                                <button
                                  className="rounded-lg px-2 py-1 text-xs text-muted hover:bg-red-500/10 hover:text-red-400"
                                  disabled={pendente}
                                  onClick={() => excluir(d)}
                                >
                                  Excluir
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                      {aberta && (
                        <tr>
                          <td colSpan={10} className="bg-zinc-800/40 px-3 py-3">
                            <div className="flex flex-wrap gap-2">
                              {d.fotos.map((f, i) => (
                                <button key={f.id} type="button" onClick={() => setFotosAbertas({ urls: d.fotos.map((x) => x.url), inicio: i })} className="cursor-zoom-in">
                                  {/* eslint-disable-next-line @next/next/no-img-element -- fotos vêm do storage externo (Supabase), sem domínio fixo para next/image */}
                                  <img
                                    loading="lazy"
                                    decoding="async"
                                    src={f.url}
                                    alt="Comprovante da despesa"
                                    className="h-24 w-24 rounded-lg object-cover"
                                  />
                                </button>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs text-muted">
            {lista.length
              ? `Mostrando ${pg * POR_PAGINA + 1}–${Math.min(lista.length, pg * POR_PAGINA + POR_PAGINA)} de ${lista.length.toLocaleString("pt-BR")} · página ${pg + 1} de ${paginas}`
              : ""}
          </span>
          <div className="flex gap-2">
            <button className={btnSm} disabled={pg === 0} onClick={() => setPagina(pg - 1)}>Anterior</button>
            <button className={btnSm} disabled={pg >= paginas - 1} onClick={() => setPagina(pg + 1)}>Próxima</button>
          </div>
        </div>
      </section>

      {modalAberto && (
        <FormDespesa
          clientes={clientes}
          grupos={grupos}
          filiais={filiais}
          hoje={hoje}
          aoFechar={() => setModalAberto(false)}
        />
      )}
      {fotosAbertas && (
        <VisualizadorFotos urls={fotosAbertas.urls} inicio={fotosAbertas.inicio} aoFechar={() => setFotosAbertas(null)} />
      )}
      {editando && (
        <FormDespesa
          clientes={clientes}
          grupos={grupos}
          filiais={filiais}
          hoje={hoje}
          despesa={editando}
          aoFechar={() => setEditando(null)}
        />
      )}
    </div>
  );
}
