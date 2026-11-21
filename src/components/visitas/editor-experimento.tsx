"use client";

import { useState } from "react";
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  ArrowDownToLine,
  ArrowUpToLine,
  Bold,
  ChevronLeft,
  ChevronRight,
  Copy,
  FilePlus2,
  Grid3X3,
  ImagePlus,
  Italic,
  List,
  LockKeyhole,
  Maximize2,
  Minus,
  MoreHorizontal,
  Move,
  Redo2,
  Ruler,
  Save,
  Sparkles,
  Table2,
  Type,
  Underline,
  Undo2,
  WandSparkles,
} from "lucide-react";

type Modo = "padrao" | "ajuste" | "avancado";

const MODOS: { id: Modo; nome: string; resumo: string; detalhe: string }[] = [
  {
    id: "padrao",
    nome: "Padrão automático",
    resumo: "Rápido e seguro",
    detalhe: "O sistema organiza os blocos, as margens e as quebras de página automaticamente.",
  },
  {
    id: "ajuste",
    nome: "Ajuste guiado",
    resumo: "Liberdade com grade",
    detalhe: "Você move e redimensiona itens dentro de áreas seguras; o restante se reorganiza.",
  },
  {
    id: "avancado",
    nome: "Avançado",
    resumo: "Controle pontual",
    detalhe: "Para exceções: posição, tamanho, camadas e alinhamento preciso, sempre com guias de impressão.",
  },
];

function ToolButton({ label, children, active = false }: { label: string; children: React.ReactNode; active?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={`grid h-7 w-7 place-items-center rounded text-zinc-300 transition hover:bg-white/10 hover:text-white ${active ? "bg-marca-verde/20 text-marca-verde" : ""}`}
    >
      {children}
    </button>
  );
}

function FotoCampo({ className = "" }: { className?: string }) {
  return (
    <div className={`relative overflow-hidden bg-[#79a739] ${className}`}>
      <div className="absolute inset-0 bg-[linear-gradient(150deg,rgba(7,50,45,.32),transparent_45%,rgba(15,76,39,.3))]" />
      <div className="absolute -bottom-6 -left-3 h-24 w-40 rotate-[-12deg] rounded-[100%] bg-[#4f852d]" />
      <div className="absolute bottom-2 left-12 h-24 w-28 rotate-[23deg] rounded-[100%] bg-[#b4cf54]" />
      <div className="absolute -right-4 top-8 h-28 w-32 rotate-[-26deg] rounded-[100%] bg-[#2f6a33]" />
      <div className="absolute left-[41%] top-[-12%] h-28 w-14 rotate-[31deg] rounded-[100%] bg-[#d6e87c]/80" />
    </div>
  );
}

function Miniatura({ selecionada, pagina, modo, aoSelecionar }: { selecionada?: boolean; pagina: number; modo: Modo; aoSelecionar: () => void }) {
  return (
    <button
      type="button"
      aria-label={`Página ${pagina}`}
      onClick={aoSelecionar}
      className={`relative aspect-[210/297] w-full overflow-hidden rounded-sm border bg-white text-left shadow-sm transition ${selecionada ? "border-marca-verde ring-2 ring-marca-verde/35" : "border-white/10 hover:border-zinc-500"}`}
    >
      {pagina === 1 ? (
        <>
          <div className="mx-2 mt-2 h-1 w-10 bg-[#2d7359]" />
          <div className="mx-2 mt-3 h-px bg-zinc-200" />
          <div className="mx-2 mt-3 h-1.5 w-16 bg-[#19323b]" />
          <div className="mx-2 mt-2 h-1 w-11 bg-zinc-300" />
          <div className="mx-2 mt-2 h-5 rounded-sm bg-[#e7f0ea]" />
          <div className="mx-2 mt-2 grid grid-cols-2 gap-1">
            <FotoCampo className="aspect-[4/3]" />
            <FotoCampo className="aspect-[4/3] brightness-110" />
          </div>
        </>
      ) : (
        <>
          <div className="mx-2 mt-3 h-1 w-10 bg-[#2d7359]" />
          <div className="mx-2 mt-2 h-1.5 w-14 bg-[#19323b]" />
          <div className="mx-2 mt-2 space-y-1"><div className="h-px bg-zinc-300" /><div className="h-px w-4/5 bg-zinc-300" /><div className="h-px w-3/5 bg-zinc-300" /></div>
          {pagina === 3 && <div className="mx-2 mt-3 h-10 rounded-sm border border-[#b9daca] bg-[#edf7f0]" />}
        </>
      )}
      {modo === "avancado" && pagina === 1 && <div className="absolute left-[45%] top-[46%] h-[27%] w-[45%] border border-dashed border-marca-verde" />}
      <span className="absolute bottom-1 right-1 rounded bg-[#19323b]/80 px-1 text-[7px] text-white">{pagina}</span>
    </button>
  );
}

export function EditorExperimento() {
  const [modo, setModo] = useState<Modo>("padrao");
  const [selecionado, setSelecionado] = useState<"foto" | "texto" | "pagina">("foto");
  const [zoom, setZoom] = useState(75);
  const [pagina, setPagina] = useState(1);
  const configuracao = MODOS.find((item) => item.id === modo)!;
  const livre = modo !== "padrao";
  const avancado = modo === "avancado";

  return (
    <section className="tema-fixo mx-auto max-w-[1500px]">
      <div className="mb-4 rounded-xl border border-marca-verde/25 bg-marca-verde/10 px-4 py-3 text-sm text-zinc-200">
        <span className="font-semibold text-marca-verde">Prévia de conceito.</span> Nada nesta tela é salvo ou altera relatórios existentes. Se aprovado, ela vira a referência visual e de interação do editor definitivo.
      </div>

      <div className="overflow-hidden rounded-2xl border border-surface-border bg-[#0b1519] shadow-2xl shadow-black/25">
        <header className="flex flex-wrap items-center gap-3 border-b border-white/10 px-4 py-3">
          <div className="mr-auto flex items-center gap-2 text-sm font-bold text-white"><FilePlus2 size={16} className="text-marca-verde" /> Relatório de Visita — Editor</div>
          <div className="flex items-center gap-1">
            <ToolButton label="Desfazer"><Undo2 size={15} /></ToolButton>
            <ToolButton label="Refazer"><Redo2 size={15} /></ToolButton>
            <ToolButton label="Salvar"><Save size={15} /></ToolButton>
            <button type="button" className="ml-1 rounded-md bg-marca-verde px-2.5 py-1.5 text-xs font-bold text-[#19323b]">PDF</button>
          </div>
        </header>

        <div className="border-b border-white/10 bg-[#101e24] px-4 pt-2">
          <div className="flex gap-1 overflow-x-auto">
            {MODOS.map((item) => (
              <button key={item.id} type="button" onClick={() => setModo(item.id)} className={`whitespace-nowrap rounded-t-md px-4 py-2 text-xs font-semibold transition ${modo === item.id ? "bg-[#223b46] text-marca-verde" : "text-secondary hover:bg-white/5 hover:text-white"}`}>
                {item.nome}
              </button>
            ))}
            <span className="ml-auto hidden items-center gap-1 px-3 text-[11px] text-secondary md:flex"><Sparkles size={13} className="text-marca-verde" /> {configuracao.resumo}</span>
          </div>
          <div className="flex min-h-11 items-center gap-1 rounded-t-md bg-[#223b46] px-2">
            <ToolButton label="Negrito"><Bold size={15} /></ToolButton><ToolButton label="Itálico"><Italic size={15} /></ToolButton><ToolButton label="Sublinhado"><Underline size={15} /></ToolButton>
            <span className="mx-1 h-5 border-l border-white/10" />
            <ToolButton label="Lista"><List size={15} /></ToolButton><ToolButton label="Alinhar à esquerda"><AlignLeft size={15} /></ToolButton><ToolButton label="Centralizar"><AlignCenter size={15} /></ToolButton><ToolButton label="Alinhar à direita"><AlignRight size={15} /></ToolButton>
            <span className="mx-1 h-5 border-l border-white/10" />
            <ToolButton label="Inserir foto"><ImagePlus size={15} /></ToolButton><ToolButton label="Inserir tabela"><Table2 size={15} /></ToolButton><ToolButton label="Inserir gráfico"><Grid3X3 size={15} /></ToolButton>
            {livre && <><span className="mx-1 h-5 border-l border-white/10" /><ToolButton label="Mover objeto" active><Move size={15} /></ToolButton><ToolButton label="Organizar automaticamente"><WandSparkles size={15} /></ToolButton></>}
          </div>
        </div>

        <div className="grid min-h-[680px] grid-cols-[112px_minmax(0,1fr)] bg-[#13242c] lg:grid-cols-[138px_minmax(0,1fr)_230px]">
          <aside className="border-r border-white/10 p-3">
            <div className="mb-2 flex items-center justify-between"><span className="text-xs font-semibold text-white">Páginas</span><button type="button" aria-label="Adicionar página" className="rounded p-1 text-marca-verde hover:bg-white/10"><FilePlus2 size={14} /></button></div>
            <div className="space-y-3"><Miniatura pagina={1} modo={modo} selecionada={pagina === 1} aoSelecionar={() => setPagina(1)} /><Miniatura pagina={2} modo={modo} selecionada={pagina === 2} aoSelecionar={() => setPagina(2)} /><Miniatura pagina={3} modo={modo} selecionada={pagina === 3} aoSelecionar={() => setPagina(3)} /></div>
          </aside>

          <main className="relative flex min-w-0 items-start justify-center overflow-auto bg-[radial-gradient(circle_at_50%_0,rgba(0,220,77,.07),transparent_34%)] p-4 md:p-7">
            <article className={`relative aspect-[210/297] w-full max-w-[620px] shrink-0 overflow-hidden bg-white px-[7%] py-[6%] text-[#19323b] shadow-[0_18px_35px_rgba(0,0,0,.32)] ${avancado ? "bg-[linear-gradient(rgba(0,220,77,.075)_1px,transparent_1px),linear-gradient(90deg,rgba(0,220,77,.075)_1px,transparent_1px)] bg-[size:18px_18px]" : ""}`}>
              {avancado && <><div className="pointer-events-none absolute bottom-0 left-[7%] top-0 border-l border-dashed border-marca-verde/40" /><div className="pointer-events-none absolute bottom-0 right-[7%] top-0 border-r border-dashed border-marca-verde/40" /></>}
              <div className="relative flex items-center justify-between border-b border-[#cbd5d7] pb-5 text-[9px] font-medium tracking-wide"><span className="font-bold text-[#287452]">REDE AGRO</span><span className="text-muted">RELATÓRIO TÉCNICO</span></div>
              <div className="relative pt-6">
                <button type="button" onClick={() => setSelecionado("texto")} className={`block w-full rounded p-1 text-left ${selecionado === "texto" ? "outline outline-2 outline-marca-verde/65" : "hover:outline hover:outline-1 hover:outline-marca-verde/45"}`}>
                  <h1 className="text-[clamp(13px,2vw,21px)] font-bold leading-tight">Acompanhamento de campo</h1>
                  <p className="mt-2 text-[clamp(7px,1vw,10px)] text-[#52717a]">Cliente · Fazenda Santa Helena · Safra 2026/27</p>
                </button>
                <button type="button" onClick={() => setSelecionado("texto")} className={`mt-4 block w-full rounded bg-[#eaf3ed] p-3 text-left ${selecionado === "texto" ? "outline outline-2 outline-marca-verde/65" : "hover:outline hover:outline-1 hover:outline-marca-verde/45"}`}>
                  <p className="text-[clamp(8px,1.1vw,11px)] font-semibold">Observações técnicas</p>
                  <p className="mt-1 text-[clamp(7px,1vw,10px)] leading-relaxed text-[#34525d]">Texto editável organizado em seções, com formatação e paginação automáticas.</p>
                </button>
                <div className={`relative mt-4 grid grid-cols-2 gap-3 ${avancado ? "pl-5" : ""}`}>
                  <button type="button" onClick={() => setSelecionado("foto")} className={`relative overflow-hidden rounded-sm text-left ${selecionado === "foto" ? "outline outline-2 outline-marca-verde outline-offset-2" : "hover:outline hover:outline-1 hover:outline-marca-verde"}`}><FotoCampo className="aspect-[4/3]" />{selecionado === "foto" && livre && <span className="absolute left-1 top-1 rounded bg-[#19323b]/90 p-1 text-white"><Move size={11} /></span>}</button>
                  <button type="button" onClick={() => setSelecionado("foto")} className={`overflow-hidden rounded-sm text-left ${selecionado === "foto" ? "outline outline-2 outline-marca-verde outline-offset-2" : "hover:outline hover:outline-1 hover:outline-marca-verde"}`}><FotoCampo className="aspect-[4/3] brightness-110" /></button>
                </div>
                <p className="mt-2 text-[clamp(7px,1vw,10px)] text-[#52717a]">Figura 1 — Registros de campo com legendas independentes.</p>
                {modo === "padrao" && <div className="mt-5 rounded border border-dashed border-[#a4b9b0] bg-[#f6fbf8] p-2 text-center text-[9px] text-[#52717a]"><WandSparkles className="mr-1 inline text-[#287452]" size={12} /> O próximo bloco será posicionado automaticamente</div>}
                {modo === "ajuste" && <div className="mt-5 flex items-center gap-2 rounded border border-marca-verde/35 bg-marca-verde/10 p-2 text-[9px] text-[#34525d]"><Move size={13} className="text-[#287452]" /> Arraste a seleção entre as guias. Os outros blocos se ajustam para preservar o layout.</div>}
                {modo === "avancado" && <div className="mt-5 rounded border border-dashed border-marca-verde/65 bg-white/80 p-2 text-[9px] text-[#34525d]"><Ruler className="mr-1 inline text-[#287452]" size={12} /> Área livre: use guias, alinhamento e camadas. A margem de impressão continua protegida.</div>}
              </div>
            </article>
          </main>

          <aside className="hidden border-l border-white/10 bg-[#1e3742] p-4 lg:block">
            <div className="flex items-center justify-between"><h2 className="text-xs font-bold text-white">{selecionado === "pagina" ? "Página" : "Propriedades"}</h2><MoreHorizontal size={16} className="text-secondary" /></div>
            <p className="mt-2 text-[11px] leading-relaxed text-secondary">{configuracao.detalhe}</p>
            <div className="my-4 border-t border-white/10" />
            {selecionado === "foto" ? <>
              <label className="block text-[10px] font-semibold uppercase tracking-wide text-secondary">Largura</label><select className="mt-1 w-full rounded bg-[#294954] px-2 py-1.5 text-xs text-white outline-none"><option>{modo === "padrao" ? "Metade da linha" : "42% da página"}</option></select>
              <label className="mt-4 block text-[10px] font-semibold uppercase tracking-wide text-secondary">Legenda</label><button type="button" className="mt-1 w-full rounded bg-[#294954] px-2 py-1.5 text-left text-xs text-zinc-200">Editar…</button>
              {livre && <><label className="mt-4 block text-[10px] font-semibold uppercase tracking-wide text-secondary">Posição</label><div className="mt-1 grid grid-cols-2 gap-2"><span className="rounded bg-[#294954] px-2 py-1.5 text-xs text-zinc-200">X&nbsp; 42 mm</span><span className="rounded bg-[#294954] px-2 py-1.5 text-xs text-zinc-200">Y&nbsp; 96 mm</span></div></>}
              {avancado && <><label className="mt-4 block text-[10px] font-semibold uppercase tracking-wide text-secondary">Camada</label><div className="mt-1 flex gap-1"><ToolButton label="Trazer para frente"><ArrowUpToLine size={14} /></ToolButton><ToolButton label="Enviar para trás"><ArrowDownToLine size={14} /></ToolButton><ToolButton label="Duplicar"><Copy size={14} /></ToolButton></div></>}
            </> : <>
              <label className="block text-[10px] font-semibold uppercase tracking-wide text-secondary">Alinhamento</label><div className="mt-1 flex gap-1"><ToolButton label="Esquerda"><AlignLeft size={14} /></ToolButton><ToolButton label="Centro"><AlignCenter size={14} /></ToolButton><ToolButton label="Justificar"><AlignJustify size={14} /></ToolButton><ToolButton label="Direita"><AlignRight size={14} /></ToolButton></div>
              <label className="mt-4 block text-[10px] font-semibold uppercase tracking-wide text-secondary">Estilo</label><button type="button" className="mt-1 flex w-full items-center gap-2 rounded bg-[#294954] px-2 py-1.5 text-left text-xs text-zinc-200"><Type size={14} /> Texto de observação</button>
            </>}
            <div className="mt-6 rounded-lg border border-marca-verde/20 bg-[#19323b] p-3 text-[11px] leading-relaxed text-zinc-300"><LockKeyhole size={13} className="mr-1 inline text-marca-verde" /> {modo === "padrao" ? "Margens e paginação protegidas." : "Ajustes mantêm a área segura de impressão."}</div>
          </aside>
        </div>

        <footer className="flex items-center justify-center gap-3 border-t border-white/10 bg-[#101e24] px-4 py-2 text-xs text-secondary"><button type="button" onClick={() => setZoom((z) => Math.max(50, z - 5))}><Minus size={14} /></button><span>{zoom}% · Página {pagina} de 3</span><button type="button" onClick={() => setZoom((z) => Math.min(125, z + 5))}><Maximize2 size={14} /></button><span className="mx-2 hidden h-4 border-l border-white/10 sm:block" /><button type="button" onClick={() => setPagina((p) => Math.max(1, p - 1))}><ChevronLeft size={14} /></button><button type="button" onClick={() => setPagina((p) => Math.min(3, p + 1))}><ChevronRight size={14} /></button></footer>
      </div>
    </section>
  );
}
