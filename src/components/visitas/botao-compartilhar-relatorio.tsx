"use client";

import { useState } from "react";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Link2, Share2, X } from "lucide-react";
import { alterarCompartilhamentoRelatorio } from "@/app/actions/relatorios-visita";

export function BotaoCompartilharRelatorio({ relatorioId, ativoInicial }: { relatorioId: string; ativoInicial: boolean }) {
  const [ativo, setAtivo] = useState(ativoInicial);
  const { confirmar } = useConfirm();
  const [carregando, setCarregando] = useState(false);
  const [mensagem, setMensagem] = useState<string | null>(null);
  async function compartilhar() {
    setCarregando(true); setMensagem(null);
    const resultado = await alterarCompartilhamentoRelatorio(relatorioId, true);
    setCarregando(false);
    if (!resultado.ok || !resultado.token) { setMensagem(resultado.ok ? "Não foi possível gerar o link." : resultado.erro); return; }
    const url = `${window.location.origin}/compartilhar/${resultado.token}`;
    try { await navigator.clipboard.writeText(url); setMensagem("Link copiado."); } catch { setMensagem("Link criado. Copie pela barra do navegador."); window.open(url, "_blank", "noopener,noreferrer"); }
    setAtivo(true);
  }
  async function revogar() {
    if (!(await confirmar({ mensagem: "Revogar o link? Quem o tiver não conseguirá mais abrir o relatório.", confirmarLabel: "Revogar link", variante: "perigo" }))) return;
    setCarregando(true); setMensagem(null);
    const resultado = await alterarCompartilhamentoRelatorio(relatorioId, false);
    setCarregando(false);
    if (!resultado.ok) { setMensagem(resultado.erro); return; }
    setAtivo(false); setMensagem("Link revogado.");
  }
  return <div className="relative"><div className="flex gap-2"><button type="button" disabled={carregando} onClick={compartilhar} className="inline-flex items-center gap-2 rounded-lg border border-surface-border px-4 py-2 text-sm font-medium text-zinc-300 hover:bg-zinc-800"><Share2 size={16} /> {ativo ? "Copiar link" : "Compartilhar"}</button>{ativo && <button type="button" disabled={carregando} onClick={revogar} title="Revogar link" className="rounded-lg border border-red-500/30 px-2 text-red-300 hover:bg-red-500/10"><X size={16} /></button>}</div>{mensagem && <p className="absolute right-0 top-full mt-1 w-48 text-right text-[11px] text-secondary"><Link2 className="mr-1 inline" size={12} />{mensagem}</p>}</div>;
}
