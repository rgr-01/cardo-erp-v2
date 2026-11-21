"use client";
import { DialogFrame } from "@/components/ui/dialog-frame";

import { useState, useTransition } from "react";
import { Receipt, X } from "lucide-react";
import { emitirBoleto, marcarBoletoPago, cancelarBoleto } from "@/app/actions/financeiro";
import { fmtBRL, fmtData } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { DateInput } from "@/components/ui/date-input";

type StatusBoleto = "PENDENTE" | "EMITIDO" | "PAGO" | "CANCELADO";

export type PedidoBoleto = {
  id: string;
  codigo: string;
  clienteNome: string;
  consultorNome: string;
  total: number;
  boleto: {
    status: StatusBoleto;
    numeroDocumento: string | null;
    valor: number | null;
    vencimento: string | null;
    dataPagamento: string | null;
    linhaDigitavel: string | null;
    pdfUrl: string | null;
    observacoes: string | null;
  } | null;
};

const STATUS_LABEL: Record<StatusBoleto, string> = {
  PENDENTE: "Pendente",
  EMITIDO: "Emitido",
  PAGO: "Pago",
  CANCELADO: "Cancelado",
};

const STATUS_COR: Record<StatusBoleto, string> = {
  PENDENTE: "#eab308",
  EMITIDO: "#3b82f6",
  PAGO: "#16a34a",
  CANCELADO: "#ef4444",
};

const inputCls =
  "w-full rounded-lg border border-surface-border bg-zinc-800 px-3 py-2 text-sm text-white outline-none focus:border-accent";
const labelCls = "mb-1 block text-xs font-medium text-secondary";

function EmitirBoletoModal({ pedido, aoFechar }: { pedido: PedidoBoleto; aoFechar: () => void }) {
  const [numeroDocumento, setNumeroDocumento] = useState(pedido.boleto?.numeroDocumento ?? "");
  const [valor, setValor] = useState(String(pedido.boleto?.valor ?? pedido.total));
  const [vencimento, setVencimento] = useState(pedido.boleto?.vencimento?.slice(0, 10) ?? "");
  const [linhaDigitavel, setLinhaDigitavel] = useState(pedido.boleto?.linhaDigitavel ?? "");
  const [pdfUrl, setPdfUrl] = useState(pedido.boleto?.pdfUrl ?? "");
  const [observacoes, setObservacoes] = useState(pedido.boleto?.observacoes ?? "");
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();

  function salvar() {
    setErro(null);
    startTransition(async () => {
      const resultado = await emitirBoleto(pedido.id, {
        numeroDocumento,
        valor,
        vencimento,
        linhaDigitavel,
        pdfUrl,
        observacoes,
      });
      if (!resultado.ok) setErro(resultado.erro);
      else aoFechar();
    });
  }

  return (
    <DialogFrame onClose={aoFechar} label={"Registrar boleto"} className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 lg:pl-64">
      <div className="w-full max-w-lg rounded-xl border border-surface-border bg-zinc-900 p-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold text-white">Emitir boleto — {pedido.codigo}</h2>
          <button aria-label="Fechar janela" onClick={aoFechar} className="rounded p-1 text-secondary hover:bg-zinc-800 hover:text-white">
            <X size={18} />
          </button>
        </div>
        <p className="mb-4 text-sm text-muted">
          Registro manual: preencha os dados do boleto já emitido por fora (banco/gateway ainda não
          integrado). Assim que nota e boleto estiverem em dia, o pedido vira Faturado sozinho.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Nº do documento</label>
            <input
              className={inputCls}
              value={numeroDocumento}
              onChange={(e) => setNumeroDocumento(e.target.value)}
            />
          </div>
          <div>
            <label className={labelCls}>Valor (R$)</label>
            <input className={inputCls} value={valor} onChange={(e) => setValor(e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Vencimento</label>
            <DateInput
              className={inputCls}
              value={vencimento}
              onChange={(e) => setVencimento(e.target.value)}
            />
          </div>
          <div>
            <label className={labelCls}>Linha digitável</label>
            <input
              className={inputCls}
              value={linhaDigitavel}
              onChange={(e) => setLinhaDigitavel(e.target.value)}
            />
          </div>
          <div className="col-span-2">
            <label className={labelCls}>Link do PDF do boleto</label>
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

export function BoletosPainel({ pedidos }: { pedidos: PedidoBoleto[] }) {
  const [emitindoPara, setEmitindoPara] = useState<PedidoBoleto | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();
  const { confirmar } = useConfirm();

  function marcarPago(pedido: PedidoBoleto) {
    startTransition(async () => {
      const ok = await confirmar({ mensagem: `Registrar o pagamento do boleto de ${pedido.codigo}?`, confirmarLabel: "Registrar pagamento" });
      if (!ok) return;
      setErro(null);
      const resultado = await marcarBoletoPago(pedido.id);
      if (!resultado.ok) setErro(resultado.erro);
    });
  }

  function cancelar(pedido: PedidoBoleto) {
    startTransition(async () => {
      const ok = await confirmar({
        mensagem: `Cancelar o boleto de ${pedido.codigo}?`,
        confirmarLabel: "Cancelar boleto",
        variante: "perigo",
      });
      if (!ok) return;
      setErro(null);
      const resultado = await cancelarBoleto(pedido.id);
      if (!resultado.ok) setErro(resultado.erro);
    });
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-white">Boletos</h1>
        <p className="text-xs text-muted">
          {pedidos.length} {pedidos.length === 1 ? "pedido com emissão solicitada" : "pedidos com emissão solicitada"}
        </p>
      </div>

      {erro && <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-red-400">{erro}</p>}

      <div className="tabela-fixa overflow-x-auto rounded-xl border border-surface-border">
        <table className="w-full min-w-[820px] text-sm">
          <thead>
            <tr className="border-b border-surface-border bg-zinc-900 text-left text-xs font-medium text-muted">
              <th className="px-3 py-2.5">Pedido</th>
              <th className="px-3 py-2.5">Cliente</th>
              <th className="px-3 py-2.5">Consultor</th>
              <th className="px-3 py-2.5 text-right">Total</th>
              <th className="px-3 py-2.5">Vencimento</th>
              <th className="px-3 py-2.5">Status</th>
              <th className="px-3 py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {pedidos.map((p) => {
              const status = p.boleto?.status ?? "PENDENTE";
              return (
                <tr key={p.id} className="border-b border-surface-border/50 hover:bg-zinc-900/60">
                  <td className="px-3 py-2 font-semibold text-white">{p.codigo}</td>
                  <td className="max-w-56 truncate px-3 py-2 text-zinc-300">{p.clienteNome}</td>
                  <td className="px-3 py-2 text-secondary">{p.consultorNome}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right font-semibold text-white">
                    {fmtBRL(p.total)}
                  </td>
                  <td className="px-3 py-2 text-secondary">{fmtData(p.boleto?.vencimento ?? null)}</td>
                  <td className="px-3 py-2">
                    <Badge color={STATUS_COR[status]}>{STATUS_LABEL[status]}</Badge>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {p.boleto?.pdfUrl && (
                        <a
                          href={p.boleto.pdfUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-accent hover:underline"
                        >
                          PDF
                        </a>
                      )}
                      <button
                        onClick={() => setEmitindoPara(p)}
                        disabled={pendente}
                        className="flex items-center gap-1.5 rounded border border-accent/40 bg-accent/10 px-2 py-1 text-xs text-accent hover:bg-accent/20"
                      >
                        <Receipt size={13} /> {status === "PENDENTE" ? "Emitir" : "Editar"}
                      </button>
                      {status === "EMITIDO" && (
                        <button
                          onClick={() => marcarPago(p)}
                          disabled={pendente}
                          className="rounded border border-success/40 bg-success/10 px-2 py-1 text-xs text-green-400 hover:bg-success/20"
                        >
                          Marcar pago
                        </button>
                      )}
                      {(status === "EMITIDO" || status === "PAGO") && (
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
                <td colSpan={7} className="px-3 py-8 text-center text-muted"><p className="sticky left-3 max-w-[calc(100vw-4rem)] whitespace-normal md:max-w-[calc(100vw-20rem)]">Nenhum pedido com emissão solicitada. Solicite a emissão na carteira de pedidos para acompanhar o boleto aqui.</p></td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {emitindoPara && (
        <EmitirBoletoModal pedido={emitindoPara} aoFechar={() => setEmitindoPara(null)} />
      )}
    </div>
  );
}
