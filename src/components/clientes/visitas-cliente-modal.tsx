"use client";
import { DialogFrame } from "@/components/ui/dialog-frame";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronDown, ExternalLink, FileText, Loader2, Plus, X } from "lucide-react";
import { visitasDoCliente, type VisitaDoCliente } from "@/app/actions/relatorios-visita";
import { corDaCategoria, rotuloDaCategoria } from "@/lib/visitas-categoria";
import { PreviaPdfModal } from "@/components/ui/previa-pdf-modal";

// Visitas do cliente abertas direto do pin no mapa: lista lida na hora do
// servidor, relato expande ali mesmo e o PDF abre por cima, sem sair do mapa.
export function VisitasClienteModal({
  cliente,
  aoFechar,
}: {
  cliente: { id: string; nome: string };
  aoFechar: () => void;
}) {
  const [visitas, setVisitas] = useState<VisitaDoCliente[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aberta, setAberta] = useState<string | null>(null);
  const [pdf, setPdf] = useState<{ url: string; titulo: string } | null>(null);
  const [gerandoPdf, setGerandoPdf] = useState<string | null>(null);

  useEffect(() => {
    let ativo = true;
    visitasDoCliente(cliente.id)
      .then((lista) => {
        if (!ativo) return;
        setVisitas(lista);
        setAberta(lista[0]?.id ?? null);
      })
      .catch(() => ativo && setErro("Não foi possível carregar as visitas. Feche esta janela e tente novamente."));
    return () => {
      ativo = false;
    };
  }, [cliente.id]);

  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => e.key === "Escape" && !pdf && aoFechar();
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [aoFechar, pdf]);

  async function verPdf(v: VisitaDoCliente) {
    setGerandoPdf(v.id);
    try {
      const resposta = await fetch(`/api/relatorios/visitas/${v.id}/pdf`);
      if (!resposta.ok) throw new Error();
      const url = URL.createObjectURL(await resposta.blob());
      setPdf({ url, titulo: `${cliente.nome} · ${new Date(v.data).toLocaleDateString("pt-BR")}` });
    } catch {
      setErro("Não foi possível gerar o PDF. Tente novamente.");
    } finally {
      setGerandoPdf(null);
    }
  }

  function fecharPdf() {
    if (pdf) URL.revokeObjectURL(pdf.url);
    setPdf(null);
  }

  return (
    <>
      <DialogFrame onClose={aoFechar} label={`Visitas de ${cliente.nome}`} className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 p-4 lg:pl-64">
        <div
          onClick={(e) => e.stopPropagation()}
          className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-surface-border bg-zinc-900 shadow-2xl shadow-black/40"
        >
          <div className="flex items-start justify-between gap-3 border-b border-surface-border px-5 py-4">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-500">Visitas</p>
              <h2 className="truncate text-base font-bold text-white">{cliente.nome}</h2>
              {visitas && (
                <p className="text-xs text-muted">
                  {visitas.length === 0 ? "Nenhuma visita registrada" : `${visitas.length} ${visitas.length === 1 ? "visita" : "visitas"}`}
                </p>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Link
                href="/relatorios/visitas/novo"
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-white hover:brightness-110"
              >
                <Plus size={14} /> Nova visita
              </Link>
              <button onClick={aoFechar} aria-label="Fechar" className="rounded-lg p-1.5 text-muted hover:bg-zinc-800 hover:text-white">
                <X size={18} />
              </button>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {erro && <p role="alert" className="mb-2 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">{erro}</p>}
            {!visitas && !erro && (
              <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted">
                <Loader2 size={16} className="animate-spin" /> Carregando visitas…
              </div>
            )}
            {visitas?.map((v) => {
              const expandida = aberta === v.id;
              const cor = corDaCategoria(v.categoria);
              return (
                <div key={v.id} className="mb-2 overflow-hidden rounded-xl border border-surface-border">
                  <button
                    type="button"
                    onClick={() => setAberta(expandida ? null : v.id)}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-zinc-800/60"
                  >
                    <div className="w-14 shrink-0 text-center">
                      <p className="text-lg font-bold leading-none text-white">{new Date(v.data).toLocaleDateString("pt-BR", { day: "2-digit" })}</p>
                      <p className="text-[11px] uppercase text-muted">
                        {new Date(v.data).toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }).replace(".", "")}
                      </p>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-white">{v.titulo || rotuloDaCategoria(v.categoria)}</p>
                      <p className="flex items-center gap-2 text-xs text-muted">
                        <span className="rounded-full px-1.5 py-px font-medium" style={{ backgroundColor: `${cor}26`, color: cor }}>
                          {rotuloDaCategoria(v.categoria)}
                        </span>
                        {v.consultor}
                        {v.status === "AGENDADA" && <span className="text-amber-500">· agendada</span>}
                      </p>
                    </div>
                    <ChevronDown size={16} className={`shrink-0 text-muted transition ${expandida ? "rotate-180" : ""}`} />
                  </button>
                  {expandida && (
                    <div className="border-t border-surface-border bg-zinc-950/40 px-4 py-3">
                      <p className="max-h-64 overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed text-zinc-300">
                        {v.texto.trim() || "Sem relato escrito."}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => verPdf(v)}
                          disabled={gerandoPdf === v.id}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-surface-border px-3 py-1.5 text-xs font-semibold text-zinc-300 hover:bg-zinc-800 disabled:opacity-60"
                        >
                          {gerandoPdf === v.id ? <Loader2 size={13} className="animate-spin" /> : <FileText size={13} />} Ver PDF
                        </button>
                        <Link
                          href={`/relatorios/visitas/${v.id}`}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-surface-border px-3 py-1.5 text-xs font-semibold text-zinc-300 hover:bg-zinc-800"
                        >
                          <ExternalLink size={13} /> Abrir relatório completo
                        </Link>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </DialogFrame>
      {pdf && (
        <div className="relative z-[1001]">
          <PreviaPdfModal url={pdf.url} titulo={pdf.titulo} aoFechar={fecharPdf} />
        </div>
      )}
    </>
  );
}
