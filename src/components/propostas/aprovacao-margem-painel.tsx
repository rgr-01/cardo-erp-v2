"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, Check, Eye, FileSignature, FileText, X } from "lucide-react";
import {
  aprovarMargem,
  recusarMargem,
  aprovarConferenciaFinal,
  recusarConferenciaFinal,
} from "@/app/actions/propostas";
import { fmtBRL, fmtData, fmtNum } from "@/lib/format";
import { SimuladorMargem, type ItemSimulador } from "@/components/propostas/simulador-margem";
import { Button } from "@/components/ui/button";
import { MenuAcoes } from "@/components/ui/menu-acoes";
import { Modal } from "@/components/ui/modal";
import type { StatusAssinatura } from "@/components/propostas/tipos";

export type PedidoAguardando = {
  id: string;
  codigo: string;
  clienteNome: string;
  consultorNome: string;
  safraNome: string;
  validade: string | null;
  total: number;
  margemPct: number | null;
  itens: ItemSimulador[];
};

export type PedidoAguardandoConferencia = {
  id: string;
  codigo: string;
  clienteNome: string;
  consultorNome: string;
  total: number;
  statusAssinatura: StatusAssinatura;
  pdfAssinadoUrl: string | null;
};

const STATUS_ASSINATURA_LABEL: Record<StatusAssinatura, string> = {
  NAO_ENVIADA: "Não enviado pra assinatura",
  AGUARDANDO_ASSINATURA: "Aguardando assinatura",
  ASSINADA: "Assinado",
  RECUSADA: "Assinatura recusada",
};

function pct(valor: number | null): string {
  return valor == null ? "—" : `${(valor * 100).toFixed(1)}%`;
}

function ConferenciaFinalPainel({ pedidos }: { pedidos: PedidoAguardandoConferencia[] }) {
  const [erro, setErro] = useState<string | null>(null);
  const [recusandoId, setRecusandoId] = useState<string | null>(null);
  const [motivoRecusa, setMotivoRecusa] = useState("");
  const [pendente, startTransition] = useTransition();

  function aprovar(id: string) {
    setErro(null);
    startTransition(async () => {
      const resultado = await aprovarConferenciaFinal(id);
      if (!resultado.ok) setErro(resultado.erro);
    });
  }

  function verContrato(p: PedidoAguardandoConferencia) {
    if (p.pdfAssinadoUrl) {
      window.open(p.pdfAssinadoUrl, "_blank", "noopener,noreferrer");
      return;
    }
    setErro(null);
    startTransition(async () => {
      try {
        const resposta = await fetch(`/propostas/${p.id}/pdf`);
        if (!resposta.ok) {
          setErro((await resposta.text()) || "Não foi possível gerar o PDF.");
          return;
        }
        const blob = await resposta.blob();
        const url = URL.createObjectURL(blob);
        window.open(url, "_blank");
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
      } catch {
        setErro("Não foi possível gerar o PDF.");
      }
    });
  }

  function recusar(id: string) {
    if (!motivoRecusa.trim()) {
      setErro("Informe o motivo da recusa.");
      return;
    }
    setErro(null);
    startTransition(async () => {
      const resultado = await recusarConferenciaFinal(id, motivoRecusa);
      if (!resultado.ok) setErro(resultado.erro);
      else {
        setRecusandoId(null);
        setMotivoRecusa("");
      }
    });
  }

  return (
    <div className="space-y-2">
      <div>
        <h2 className="text-lg font-bold text-white">Aprovação do financeiro</h2>
        <p className="text-sm text-muted">
          {fmtNum(pedidos.length)}{" "}
          {pedidos.length === 1 ? "pedido fechado aguardando" : "pedidos fechados aguardando"}{" "}
          aprovação do financeiro antes de entrar em carteira e poder solicitar faturamento
        </p>
      </div>

      {erro && <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-red-400">{erro}</p>}

      {pedidos.length === 0 ? (
        <div className="rounded-xl border border-surface-border px-3 py-10 text-center text-sm text-muted">
          Nenhum pedido aguardando aprovação do financeiro.
        </div>
      ) : (
        <div className="divide-y divide-surface-border rounded-xl border border-surface-border">
          {pedidos.map((p) => (
            <div key={p.id} className="px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white">{p.codigo}</p>
                  <p className="truncate text-xs text-secondary">
                    {p.clienteNome} · {p.consultorNome}
                  </p>
                  <p className="flex items-center gap-1 text-xs text-muted">
                    <FileSignature size={12} /> {STATUS_ASSINATURA_LABEL[p.statusAssinatura]}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <p className="text-sm font-semibold text-accent">{fmtBRL(p.total)}</p>
                  <Button
                    variant="primary"
                    disabled={pendente || p.statusAssinatura !== "ASSINADA"}
                    title={
                      p.statusAssinatura !== "ASSINADA"
                        ? "Só é possível aprovar depois que o cliente assinar o contrato."
                        : undefined
                    }
                    onClick={() => aprovar(p.id)}
                  >
                    <Check size={14} /> Aprovar
                  </Button>
                  <MenuAcoes
                    rotuloBotao={`Ações de ${p.codigo}`}
                    desabilitado={pendente}
                    acoes={[
                      {
                        rotulo: "Ver contrato",
                        icone: <FileText size={14} />,
                        aoClicar: () => verContrato(p),
                      },
                      {
                        rotulo: "Recusar",
                        icone: <X size={14} />,
                        perigosa: true,
                        aoClicar: () => {
                          setErro(null);
                          setMotivoRecusa("");
                          setRecusandoId(p.id);
                        },
                      },
                    ]}
                  />
                </div>
              </div>

              {recusandoId === p.id && (
                <div className="mt-3 rounded-xl border border-surface-border bg-zinc-950/60 p-4">
                  <label className="mb-1 block text-xs font-medium text-secondary">
                    Motivo da recusa
                  </label>
                  <textarea
                    autoFocus
                    value={motivoRecusa}
                    onChange={(e) => setMotivoRecusa(e.target.value)}
                    className="w-full rounded-lg border border-surface-border bg-zinc-800 px-3 py-2 text-sm text-white outline-none focus:border-accent"
                    rows={3}
                    placeholder="Ex.: contrato com clausula divergente do combinado."
                  />
                  <div className="mt-3 flex justify-end gap-2">
                    <button
                      onClick={() => {
                        setRecusandoId(null);
                        setMotivoRecusa("");
                      }}
                      className="rounded-lg border border-danger/40 bg-danger/10 px-4 py-2 text-sm font-semibold text-danger-ink hover:bg-danger/20"
                    >
                      Cancelar
                    </button>
                    <Button variant="danger" disabled={pendente} onClick={() => recusar(p.id)}>
                      Confirmar recusa
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Aviso de que o card é clicável, no espaço vazio entre cliente e margem —
// só aparece no hover (group-hover), sem popup flutuante.
function CardPedidoMargem({
  pedido,
  aoClicar,
}: {
  pedido: PedidoAguardando;
  aoClicar: () => void;
}) {
  return (
    <button
      onClick={aoClicar}
      className="group flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-zinc-900/60"
    >
      <div className="min-w-0">
        <p className="text-sm font-semibold text-white">{pedido.codigo}</p>
        <p className="truncate text-xs text-secondary">
          {pedido.clienteNome} · {pedido.consultorNome}
        </p>
      </div>
      <span className="hidden items-center gap-1.5 whitespace-nowrap rounded-lg border border-surface-border bg-zinc-800 px-3 py-1.5 text-xs font-semibold text-white opacity-0 transition group-hover:flex group-hover:opacity-100 md:flex">
        <Eye size={12} /> Clique para visualizar
      </span>
      <div className="flex shrink-0 items-center gap-3">
        <span className="flex items-center gap-1 text-xs font-semibold text-red-400">
          <AlertTriangle size={12} /> {pct(pedido.margemPct)}
        </span>
        <p className="text-sm font-semibold text-accent">{fmtBRL(pedido.total)}</p>
      </div>
    </button>
  );
}

function AprovacaoMargemPainelLista({ pedidos }: { pedidos: PedidoAguardando[] }) {
  const [selecionadoId, setSelecionadoId] = useState<string | null>(null);
  const [motivoRecusa, setMotivoRecusa] = useState("");
  const [recusando, setRecusando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();

  const selecionado = pedidos.find((o) => o.id === selecionadoId) ?? null;

  function fechar() {
    setSelecionadoId(null);
    setRecusando(false);
    setMotivoRecusa("");
    setErro(null);
  }

  function aprovar(id: string) {
    setErro(null);
    startTransition(async () => {
      const resultado = await aprovarMargem(id);
      if (!resultado.ok) setErro(resultado.erro);
      else fechar();
    });
  }

  function recusar(id: string) {
    if (!motivoRecusa.trim()) {
      setErro("Informe o motivo da recusa.");
      return;
    }
    setErro(null);
    startTransition(async () => {
      const resultado = await recusarMargem(id, motivoRecusa);
      if (!resultado.ok) setErro(resultado.erro);
      else fechar();
    });
  }

  return (
    <div className="space-y-2">
      <div>
        <h2 className="text-lg font-bold text-white">Aprovação de margem</h2>
        <p className="text-sm text-muted">
          {fmtNum(pedidos.length)}{" "}
          {pedidos.length === 1 ? "pedido aguardando" : "pedidos aguardando"} aprovação
          (margem abaixo de 27%)
        </p>
      </div>

      {pedidos.length === 0 ? (
        <div className="rounded-xl border border-surface-border px-3 py-10 text-center text-sm text-muted">
          Nenhum pedido aguardando aprovação de margem.
        </div>
      ) : (
        <div className="divide-y divide-surface-border rounded-xl border border-surface-border">
          {pedidos.map((o) => (
            <CardPedidoMargem
              key={o.id}
              pedido={o}
              aoClicar={() => {
                setSelecionadoId(o.id);
                setRecusando(false);
                setMotivoRecusa("");
                setErro(null);
              }}
            />
          ))}
        </div>
      )}

      <Modal open={Boolean(selecionado)} onClose={fechar} title={selecionado?.codigo} maxWidth="max-w-6xl">
        {selecionado && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm text-secondary">
                  {selecionado.clienteNome} · {selecionado.consultorNome} · {selecionado.safraNome}
                </p>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <p className="text-xs text-muted">Validade</p>
                  <p className="text-sm font-semibold text-white">{fmtData(selecionado.validade)}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted">Total</p>
                  <p className="text-sm font-semibold text-accent">{fmtBRL(selecionado.total)}</p>
                </div>
              </div>
            </div>

            <SimuladorMargem itens={selecionado.itens} margemMedia={selecionado.margemPct} />

            {erro && <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-red-400">{erro}</p>}

            {recusando ? (
              <div className="rounded-xl border border-surface-border bg-zinc-950/60 p-4">
                <label className="mb-1 block text-xs font-medium text-secondary">
                  Motivo da recusa
                </label>
                <textarea
                  autoFocus
                  value={motivoRecusa}
                  onChange={(e) => setMotivoRecusa(e.target.value)}
                  className="w-full rounded-lg border border-surface-border bg-zinc-800 px-3 py-2 text-sm text-white outline-none focus:border-accent"
                  rows={3}
                  placeholder="Ex.: margem muito abaixo do aceitavel para este cliente."
                />
                <div className="mt-3 flex justify-end gap-2">
                  <button
                    onClick={() => {
                      setRecusando(false);
                      setMotivoRecusa("");
                    }}
                    className="rounded-lg border border-danger/40 bg-danger/10 px-4 py-2 text-sm font-semibold text-danger-ink hover:bg-danger/20"
                  >
                    Cancelar
                  </button>
                  <Button variant="danger" disabled={pendente} onClick={() => recusar(selecionado.id)}>
                    Confirmar recusa
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex justify-end gap-2">
                <Button
                  variant="danger"
                  disabled={pendente}
                  onClick={() => {
                    setErro(null);
                    setMotivoRecusa("");
                    setRecusando(true);
                  }}
                >
                  <X size={14} /> Recusar
                </Button>
                <Button variant="primary" disabled={pendente} onClick={() => aprovar(selecionado.id)}>
                  <Check size={14} /> Aprovar mesmo assim
                </Button>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}

export function AprovacaoMargemPainel({
  pedidos,
  aguardandoConferencia = [],
}: {
  pedidos: PedidoAguardando[];
  aguardandoConferencia?: PedidoAguardandoConferencia[];
}) {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white">Aprovações</h1>
        <p className="text-sm text-muted">Margem e aprovação do financeiro em pedidos fechados</p>
      </div>

      <div className="grid gap-8 xl:grid-cols-2">
        <ConferenciaFinalPainel pedidos={aguardandoConferencia} />
        <AprovacaoMargemPainelLista pedidos={pedidos} />
      </div>
    </div>
  );
}
