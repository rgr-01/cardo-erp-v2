"use client";
import { DialogFrame } from "@/components/ui/dialog-frame";

import { useState, useTransition } from "react";
import { FileText, Send, X } from "lucide-react";
import { emitirNotaFiscal, emitirNotaFiscalFocusNfe, cancelarNotaFiscal } from "@/app/actions/financeiro";
import { fmtBRL, fmtData } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useConfirm } from "@/components/ui/confirm-dialog";

type StatusNotaFiscal = "PENDENTE" | "PROCESSANDO" | "EMITIDA" | "ERRO" | "CANCELADA";

export type PedidoNotaFiscal = {
  id: string;
  codigo: string;
  clienteNome: string;
  consultorNome: string;
  total: number;
  notaFiscal: {
    status: StatusNotaFiscal;
    numero: string | null;
    serie: string | null;
    chaveAcesso: string | null;
    valor: number | null;
    dataEmissao: string | null;
    pdfUrl: string | null;
    xmlUrl: string | null;
    observacoes: string | null;
    // Só existem quando a nota foi emitida via Focus NFe (nulo = registro
    // manual) — referencia decide se o cancelamento pede justificativa.
    referencia: string | null;
    mensagemErro: string | null;
  } | null;
};

const STATUS_LABEL: Record<StatusNotaFiscal, string> = {
  PENDENTE: "Pendente",
  PROCESSANDO: "Processando",
  EMITIDA: "Emitida",
  ERRO: "Erro",
  CANCELADA: "Cancelada",
};

const STATUS_COR: Record<StatusNotaFiscal, string> = {
  PENDENTE: "#eab308",
  PROCESSANDO: "#3b82f6",
  EMITIDA: "#16a34a",
  ERRO: "#ef4444",
  CANCELADA: "#71717a",
};

const inputCls =
  "w-full rounded-lg border border-surface-border bg-zinc-800 px-3 py-2 text-sm text-white outline-none focus:border-accent";
const labelCls = "mb-1 block text-xs font-medium text-secondary";

function EmitirNotaModal({
  pedido,
  aoFechar,
}: {
  pedido: PedidoNotaFiscal;
  aoFechar: () => void;
}) {
  const [numero, setNumero] = useState(pedido.notaFiscal?.numero ?? "");
  const [serie, setSerie] = useState(pedido.notaFiscal?.serie ?? "");
  const [chaveAcesso, setChaveAcesso] = useState(pedido.notaFiscal?.chaveAcesso ?? "");
  const [valor, setValor] = useState(String(pedido.notaFiscal?.valor ?? pedido.total));
  const [pdfUrl, setPdfUrl] = useState(pedido.notaFiscal?.pdfUrl ?? "");
  const [observacoes, setObservacoes] = useState(pedido.notaFiscal?.observacoes ?? "");
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();

  function salvar() {
    if (!numero.trim()) {
      setErro("Informe o número da nota fiscal.");
      return;
    }
    setErro(null);
    startTransition(async () => {
      const resultado = await emitirNotaFiscal(pedido.id, {
        numero,
        serie,
        chaveAcesso,
        valor,
        pdfUrl,
        observacoes,
      });
      if (!resultado.ok) setErro(resultado.erro);
      else aoFechar();
    });
  }

  return (
    <DialogFrame onClose={aoFechar} label={"Registrar nota fiscal"} className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 lg:pl-64">
      <div className="w-full max-w-lg rounded-xl border border-surface-border bg-zinc-900 p-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold text-white">Emitir nota fiscal — {pedido.codigo}</h2>
          <button aria-label="Fechar janela" onClick={aoFechar} className="rounded p-1 text-secondary hover:bg-zinc-800 hover:text-white">
            <X size={18} />
          </button>
        </div>
        <p className="mb-4 text-sm text-muted">
          Registro manual: use isto só se a NF-e já foi emitida por fora (ou pra corrigir um
          registro). Pra emitir pela Focus NFe direto daqui, use o botão &quot;Emitir via Focus
          NFe&quot; na lista. Assim que nota e boleto estiverem em dia, o pedido vira Faturado
          sozinho.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Número*</label>
            <input className={inputCls} value={numero} onChange={(e) => setNumero(e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Série</label>
            <input className={inputCls} value={serie} onChange={(e) => setSerie(e.target.value)} />
          </div>
          <div className="col-span-2">
            <label className={labelCls}>Chave de acesso</label>
            <input
              className={inputCls}
              value={chaveAcesso}
              onChange={(e) => setChaveAcesso(e.target.value)}
              placeholder="44 dígitos"
            />
          </div>
          <div>
            <label className={labelCls}>Valor (R$)</label>
            <input className={inputCls} value={valor} onChange={(e) => setValor(e.target.value)} />
          </div>
          <div className="col-span-2">
            <label className={labelCls}>Link do PDF (DANFE)</label>
            <input className={inputCls} value={pdfUrl} onChange={(e) => setPdfUrl(e.target.value)} />
          </div>
          <div className="col-span-2">
            <label className={labelCls}>Observações</label>
            <textarea
              className={inputCls}
              rows={2}
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
            />
          </div>
        </div>
        {erro && <p role="alert" className="mt-3 rounded-lg bg-danger/10 px-3 py-2 text-sm text-red-400">{erro}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={aoFechar}
            className="rounded-lg border border-surface-border px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
          >
            Cancelar
          </button>
          <Button variant="primary" disabled={pendente} onClick={salvar}>
            {pendente ? "Salvando..." : "Emitir"}
          </Button>
        </div>
      </div>
    </DialogFrame>
  );
}

function CancelarNotaFocusModal({
  pedido,
  aoFechar,
}: {
  pedido: PedidoNotaFiscal;
  aoFechar: () => void;
}) {
  const [justificativa, setJustificativa] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();

  function confirmar() {
    if (justificativa.trim().length < 15) {
      setErro("A justificativa precisa ter pelo menos 15 caracteres (exigência da SEFAZ).");
      return;
    }
    setErro(null);
    startTransition(async () => {
      const resultado = await cancelarNotaFiscal(pedido.id, justificativa.trim());
      if (!resultado.ok) setErro(resultado.erro);
      else aoFechar();
    });
  }

  return (
    <DialogFrame onClose={aoFechar} label={"Cancelar nota fiscal"} className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 lg:pl-64">
      <div className="w-full max-w-md rounded-xl border border-surface-border bg-zinc-900 p-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold text-white">Cancelar nota fiscal — {pedido.codigo}</h2>
          <button aria-label="Fechar janela" onClick={aoFechar} className="rounded p-1 text-secondary hover:bg-zinc-800 hover:text-white">
            <X size={18} />
          </button>
        </div>
        <p className="mb-3 text-sm text-muted">
          Esta nota foi emitida pela Focus NFe — o cancelamento é enviado direto pra SEFAZ e exige
          uma justificativa com pelo menos 15 caracteres.
        </p>
        <textarea
          autoFocus
          className="w-full rounded-lg border border-surface-border bg-zinc-800 px-3 py-2 text-sm text-white outline-none focus:border-accent"
          rows={3}
          placeholder="Motivo do cancelamento..."
          value={justificativa}
          onChange={(e) => setJustificativa(e.target.value)}
        />
        {erro && <p role="alert" className="mt-3 rounded-lg bg-danger/10 px-3 py-2 text-sm text-red-400">{erro}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={aoFechar}
            className="rounded-lg border border-surface-border px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
          >
            Voltar
          </button>
          <Button variant="danger" disabled={pendente} onClick={confirmar}>
            {pendente ? "Cancelando..." : "Cancelar nota"}
          </Button>
        </div>
      </div>
    </DialogFrame>
  );
}

export function NotasFiscaisPainel({ pedidos }: { pedidos: PedidoNotaFiscal[] }) {
  const [emitindoPara, setEmitindoPara] = useState<PedidoNotaFiscal | null>(null);
  const [cancelandoPara, setCancelandoPara] = useState<PedidoNotaFiscal | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();
  const { confirmar } = useConfirm();

  function emitirViaFocus(pedido: PedidoNotaFiscal) {
    startTransition(async () => {
      setErro(null);
      const resultado = await emitirNotaFiscalFocusNfe(pedido.id);
      if (!resultado.ok) setErro(resultado.erro);
    });
  }

  function cancelar(pedido: PedidoNotaFiscal) {
    // Nota emitida via Focus NFe precisa de justificativa pra SEFAZ — nota
    // manual não passou por lá, cancela direto com uma confirmação simples.
    if (pedido.notaFiscal?.referencia) {
      setCancelandoPara(pedido);
      return;
    }
    startTransition(async () => {
      const ok = await confirmar({
        mensagem: `Cancelar a nota fiscal de ${pedido.codigo}?`,
        confirmarLabel: "Cancelar nota fiscal",
        variante: "perigo",
      });
      if (!ok) return;
      setErro(null);
      const resultado = await cancelarNotaFiscal(pedido.id);
      if (!resultado.ok) setErro(resultado.erro);
    });
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-white">Notas fiscais</h1>
        <p className="text-xs text-muted">
          {pedidos.length} {pedidos.length === 1 ? "pedido com emissão solicitada" : "pedidos com emissão solicitada"}
        </p>
      </div>

      {erro && <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-red-400">{erro}</p>}

      <div className="tabela-fixa overflow-x-auto rounded-xl border border-surface-border">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b border-surface-border bg-zinc-900 text-left text-xs font-medium text-muted">
              <th className="px-3 py-2.5">Pedido</th>
              <th className="px-3 py-2.5">Cliente</th>
              <th className="px-3 py-2.5">Consultor</th>
              <th className="px-3 py-2.5 text-right">Total</th>
              <th className="px-3 py-2.5">NF</th>
              <th className="px-3 py-2.5">Status</th>
              <th className="px-3 py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {pedidos.map((p) => {
              const status = p.notaFiscal?.status ?? "PENDENTE";
              return (
                <tr key={p.id} className="border-b border-surface-border/50 hover:bg-zinc-900/60">
                  <td className="px-3 py-2 font-semibold text-white">{p.codigo}</td>
                  <td className="max-w-56 truncate px-3 py-2 text-zinc-300">{p.clienteNome}</td>
                  <td className="px-3 py-2 text-secondary">{p.consultorNome}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right font-semibold text-white">
                    {fmtBRL(p.total)}
                  </td>
                  <td className="px-3 py-2 text-secondary">
                    {p.notaFiscal?.numero
                      ? `${p.notaFiscal.numero}${p.notaFiscal.serie ? `/${p.notaFiscal.serie}` : ""}`
                      : "—"}
                    {p.notaFiscal?.dataEmissao && (
                      <span className="ml-1 text-xs text-subtle">
                        ({fmtData(p.notaFiscal.dataEmissao)})
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <Badge color={STATUS_COR[status]}>{STATUS_LABEL[status]}</Badge>
                    {status === "ERRO" && p.notaFiscal?.mensagemErro && (
                      <p className="mt-1 max-w-56 text-xs text-red-400" title={p.notaFiscal.mensagemErro}>
                        {p.notaFiscal.mensagemErro}
                      </p>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {p.notaFiscal?.pdfUrl && (
                        <a
                          href={p.notaFiscal.pdfUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-accent hover:underline"
                        >
                          DANFE
                        </a>
                      )}
                      {status !== "EMITIDA" && status !== "PROCESSANDO" && (
                        <button
                          onClick={() => emitirViaFocus(p)}
                          disabled={pendente}
                          title="Emitir automaticamente via Focus NFe"
                          className="flex items-center gap-1.5 rounded border border-accent/40 bg-accent/10 px-2 py-1 text-xs text-accent hover:bg-accent/20"
                        >
                          <Send size={13} /> {status === "ERRO" ? "Reemitir" : "Emitir via Focus NFe"}
                        </button>
                      )}
                      <button
                        onClick={() => setEmitindoPara(p)}
                        disabled={pendente || status === "PROCESSANDO"}
                        title="Preencher manualmente os dados de uma nota já emitida por fora"
                        className="flex items-center gap-1.5 rounded border border-surface-border px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-800"
                      >
                        <FileText size={13} /> {status === "EMITIDA" ? "Editar" : "Manual"}
                      </button>
                      {status === "EMITIDA" && (
                        <button
                          onClick={() => cancelar(p)}
                          disabled={pendente}
                          className="rounded border border-danger/40 bg-danger/10 px-2 py-1 text-xs text-danger-ink hover:bg-danger/20"
                        >
                          Cancelar
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {pedidos.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-muted"><p className="sticky left-3 max-w-[calc(100vw-4rem)] whitespace-normal md:max-w-[calc(100vw-20rem)]">Nenhum pedido com emissão solicitada. Solicite a emissão na carteira de pedidos para acompanhar a nota fiscal aqui.</p></td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {emitindoPara && (
        <EmitirNotaModal pedido={emitindoPara} aoFechar={() => setEmitindoPara(null)} />
      )}
      {cancelandoPara && (
        <CancelarNotaFocusModal pedido={cancelandoPara} aoFechar={() => setCancelandoPara(null)} />
      )}
    </div>
  );
}
