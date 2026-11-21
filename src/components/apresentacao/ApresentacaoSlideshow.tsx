"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Play, Pause, ArrowLeft } from "lucide-react";
import type { DadosDashboard } from "@/lib/dashboard";
import { fmtBRL, fmtNum, fmtPct } from "@/lib/format";
import { Logo } from "@/components/logo";
import {
  GraficoMeta,
  GraficoPizza,
  GraficoFunil,
  GraficoEvolucao,
  GraficoClientes,
  GraficoRanking,
} from "@/components/dashboard/charts";

const DURACAO = 20; // segundos por slide

// ─── Slides individuais ────────────────────────────────────────────────────

function KpiGrande({
  rotulo,
  valor,
  detalhe,
  destaque = false,
}: {
  rotulo: string;
  valor: string;
  detalhe?: string;
  destaque?: boolean;
}) {
  return (
    <div className="rounded-xl border border-surface-border bg-zinc-900 px-6 py-8  flex flex-col justify-center">
      <p className="flex items-center gap-2 text-xs font-mediumst text-muted">
        <span
          className={`inline-block h-2 w-2 rounded-full ${destaque ? "bg-accent shadow-[0_0_6px_var(--accent-glow)]" : "bg-zinc-700"}`}
        />
        {rotulo}
      </p>
      <p
        className={`mt-2 text-3xl font-bold ${destaque ? "text-accent" : "text-white"}`}
      >
        {valor}
      </p>
      {detalhe && <p className="mt-1 text-sm text-muted">{detalhe}</p>}
    </div>
  );
}

function CardSlide({
  titulo,
  children,
  className = "",
}: {
  titulo: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-xl border border-surface-border bg-zinc-900 p-5  flex flex-col ${className}`}
    >
      <h3 className="mb-3 text-center text-sm font-semibold text-zinc-300">
        {titulo}
      </h3>
      <div className="flex-1 [&>div]:!h-full">{children}</div>
    </div>
  );
}

function SlideKPIs({ dados }: { dados: DadosDashboard }) {
  const pctMeta = dados.meta > 0 ? dados.faturado / dados.meta : 0;
  return (
    <div className="h-full flex flex-col justify-center gap-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiGrande
          rotulo="Pipeline Total"
          valor={fmtBRL(dados.totalPipeline)}
          detalhe={`${fmtNum(dados.qtdVendas)} lançamentos`}
        />
        <KpiGrande
          rotulo="Faturado"
          valor={fmtBRL(dados.faturado)}
          detalhe={dados.meta > 0 ? `${fmtPct(pctMeta)} da meta` : "Sem meta cadastrada"}
          destaque
        />
        <KpiGrande
          rotulo="Carteira"
          valor={`${fmtNum(dados.clientesAtivos)} clientes`}
          detalhe={`${fmtNum(dados.fornecedoresAtivos)} fornecedores ativos`}
        />
        <KpiGrande
          rotulo="Média por Cliente"
          valor={fmtBRL(dados.mediaPorClienteAtivo)}
          detalhe={`Ticket médio ${fmtBRL(dados.ticketMedio)}`}
        />
      </div>
      {dados.meta > 0 && (
        <div className="text-center">
          <p className="text-6xl font-bold text-accent">{fmtPct(pctMeta)}</p>
          <p className="mt-2 text-muted">
            da meta de <span className="text-zinc-300">{fmtBRL(dados.meta)}</span> atingida
          </p>
        </div>
      )}
    </div>
  );
}

function SlideMeta({ dados }: { dados: DadosDashboard }) {
  return (
    <div className="h-full grid grid-cols-2 gap-4">
      <CardSlide titulo={`Meta da safra${dados.meta > 0 ? ` — ${fmtBRL(dados.meta)}` : ""}`}>
        <GraficoMeta
          meta={dados.meta}
          faturado={dados.faturado}
          emAndamento={dados.emAndamento}
        />
      </CardSlide>
      <CardSlide titulo="Cenário comercial por status">
        <GraficoPizza
          modo="status"
          data={dados.porStatus.map((s) => ({
            name: s.label,
            value: s.total,
            status: s.status,
          }))}
        />
      </CardSlide>
    </div>
  );
}

function SlideCenario({ dados }: { dados: DadosDashboard }) {
  return (
    <div className="h-full grid grid-cols-2 gap-4">
      <CardSlide titulo="Cenário comercial por cultura">
        <GraficoPizza
          modo="cultura"
          data={dados.porCultura.map((c) => ({
            name: c.cultura,
            value: c.total,
          }))}
        />
      </CardSlide>
      <CardSlide titulo="Funil de vendas">
        <GraficoFunil data={dados.porStatus} />
      </CardSlide>
    </div>
  );
}

function SlideEvolucao({ dados }: { dados: DadosDashboard }) {
  return (
    <div className="h-full">
      <CardSlide titulo="Evolução do faturamento" className="h-full">
        <GraficoEvolucao data={dados.evolucao} />
      </CardSlide>
    </div>
  );
}

function SlideClientes({ dados }: { dados: DadosDashboard }) {
  return (
    <div className="h-full">
      <CardSlide titulo="Cenário comercial por cliente" className="h-full">
        <GraficoClientes data={dados.porCliente} />
      </CardSlide>
    </div>
  );
}

function SlideRanking({ dados }: { dados: DadosDashboard }) {
  return (
    <div className="h-full">
      <CardSlide titulo="Ranking de consultores" className="h-full">
        <GraficoRanking data={dados.ranking} />
      </CardSlide>
    </div>
  );
}

// ─── Estrutura dos slides ──────────────────────────────────────────────────

type Slide = { titulo: string; componente: React.ReactNode };

function buildSlides(dados: DadosDashboard, isAdmin: boolean): Slide[] {
  const slides: Slide[] = [
    { titulo: "Visão geral", componente: <SlideKPIs dados={dados} /> },
    { titulo: "Meta da Safra", componente: <SlideMeta dados={dados} /> },
    { titulo: "Cenário Comercial", componente: <SlideCenario dados={dados} /> },
    { titulo: "Evolução do Faturamento", componente: <SlideEvolucao dados={dados} /> },
    { titulo: "Por Cliente", componente: <SlideClientes dados={dados} /> },
  ];
  if (isAdmin && dados.ranking.length > 1) {
    slides.push({ titulo: "Ranking de Consultores", componente: <SlideRanking dados={dados} /> });
  }
  return slides;
}

// ─── Componente principal ─────────────────────────────────────────────────

export function ApresentacaoSlideshow({
  dados,
  isAdmin,
}: {
  dados: DadosDashboard;
  isAdmin: boolean;
}) {
  const slides = buildSlides(dados, isAdmin);
  const total = slides.length;

  const [slideAtual, setSlideAtual] = useState(0);
  const [pausado, setPausado] = useState(false);
  const [progresso, setProgresso] = useState(0);
  const [horaAtual, setHoraAtual] = useState("");

  const irPara = useCallback(
    (idx: number) => {
      setSlideAtual(((idx % total) + total) % total);
    },
    [total]
  );

  const proximo = useCallback(() => irPara(slideAtual + 1), [irPara, slideAtual]);
  const anterior = useCallback(() => irPara(slideAtual - 1), [irPara, slideAtual]);

  // Auto-advance — reinicia quando o slide muda ou quando pausa/retoma.
  // O progresso volta a 0 na limpeza abaixo (e já começa em 0 na montagem).
  useEffect(() => {
    if (pausado) return;
    let tick = 0;
    const totalTicks = DURACAO * 10;
    const id = setInterval(() => {
      tick++;
      setProgresso((tick / totalTicks) * 100);
      if (tick >= totalTicks) {
        setSlideAtual((s) => (s + 1) % total);
      }
    }, 100);
    return () => {
      clearInterval(id);
      setProgresso(0);
    };
  }, [slideAtual, pausado, total]);

  // Relógio
  useEffect(() => {
    const atualizar = () =>
      setHoraAtual(
        new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
      );
    atualizar();
    const id = setInterval(atualizar, 1000);
    return () => clearInterval(id);
  }, []);

  // Teclado
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") proximo();
      else if (e.key === "ArrowLeft") anterior();
      else if (e.key === " ") {
        e.preventDefault();
        setPausado((p) => !p);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [proximo, anterior]);

  const slide = slides[slideAtual];

  return (
    <div className="flex h-screen flex-col bg-zinc-950 text-white select-none overflow-hidden">
      {/* Header */}
      <header className="flex shrink-0 items-center justify-between border-b border-surface-border px-8 py-3">
        <div className="flex items-center gap-3">
          <Logo className="h-6 w-auto" />
          <span className="text-zinc-700">|</span>
          <span className="text-sm text-secondary">{slide.titulo}</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="tabular-nums text-sm text-muted">{horaAtual}</span>
          <Link
            href="/dashboard"
            className="flex items-center gap-1 rounded-lg border border-surface-border px-3 py-1 text-xs text-secondary transition hover:border-zinc-500 hover:text-zinc-200"
          >
            <ArrowLeft size={12} /> Sair
          </Link>
        </div>
      </header>

      {/* Conteúdo do slide */}
      <main className="min-h-0 flex-1 px-8 py-5">{slide.componente}</main>

      {/* Footer com controles */}
      <footer className="shrink-0 px-8 pb-5 flex flex-col gap-2">
        {/* Barra de progresso */}
        <div className="h-0.5 overflow-hidden rounded-full bg-zinc-800">
          <div
            className="h-full bg-accent"
            style={{ width: `${progresso}%`, transition: "width 0.1s linear" }}
          />
        </div>
        {/* Controles */}
        <div className="flex items-center justify-between">
          <button
            onClick={anterior}
            className="rounded-lg px-3 py-1.5 text-muted transition hover:bg-zinc-800 hover:text-white"
            aria-label="Slide anterior"
          >
            <ChevronLeft size={18} />
          </button>

          <div className="flex items-center gap-4">
            {/* Dots de navegação */}
            <div className="flex items-center gap-1.5">
              {slides.map((_, i) => (
                <button
                  key={i}
                  onClick={() => irPara(i)}
                  aria-label={`Ir para slide ${i + 1}`}
                  className={`h-1.5 rounded-full transition-colors ${
                    i === slideAtual
                      ? "w-6 bg-accent"
                      : "w-1.5 bg-zinc-700 hover:bg-zinc-500"
                  }`}
                />
              ))}
            </div>

            <button
              onClick={() => setPausado((p) => !p)}
              className="flex items-center gap-1 text-xs text-muted transition hover:text-zinc-300"
            >
              {pausado ? <Play size={12} /> : <Pause size={12} />}
              {pausado ? "Retomar" : "Pausar"}
            </button>

            <span className="tabular-nums text-xs text-subtle">
              {slideAtual + 1} / {total}
            </span>
          </div>

          <button
            onClick={proximo}
            className="rounded-lg px-3 py-1.5 text-muted transition hover:bg-zinc-800 hover:text-white"
            aria-label="Próximo slide"
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </footer>
    </div>
  );
}
