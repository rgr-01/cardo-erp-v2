"use client";

import { useState, useTransition } from "react";
import { Barcode, CheckCircle2, Plus, RotateCcw, Send, Trash2 } from "lucide-react";
import {
  baixarTitulo,
  cancelarTitulo,
  criarTitulos,
  emitirBoletoTituloPeloProvedor,
  reabrirTitulo,
  registrarBoletoTitulo,
} from "@/app/actions/financeiro-avulso";
import { fmtBRL, fmtData } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ComboBox, type ComboBoxOpcao } from "@/components/ui/combo-box";
import { DateInput } from "@/components/ui/date-input";
import { Input } from "@/components/ui/input";
import { MenuAcoes } from "@/components/ui/menu-acoes";
import { Modal } from "@/components/ui/modal";
import { useConfirm } from "@/components/ui/confirm-dialog";

export type TituloLinha = {
  id: string;
  status: "ABERTO" | "PAGO" | "CANCELADO";
  descricao: string;
  pessoa: string; // cliente ou favorecido
  categoria: string | null;
  documento: string | null;
  valor: number;
  vencimento: string; // yyyy-mm-dd
  dataPagamento: string | null;
  parcela: number;
  totalParcelas: number;
  linhaDigitavel: string | null;
  boletoPdfUrl: string | null;
  notaNumero: string | null;
};

const labelCls = "mb-1 block text-xs font-medium text-secondary";

function paraNumero(texto: string): number {
  const n = Number(texto.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function FormTitulo({
  tipo,
  clientes,
  hoje,
  aoFechar,
}: {
  tipo: "RECEBER" | "PAGAR";
  clientes: ComboBoxOpcao[];
  hoje: string;
  aoFechar: () => void;
}) {
  const [clienteId, setClienteId] = useState("");
  const [favorecido, setFavorecido] = useState("");
  const [descricao, setDescricao] = useState("");
  const [categoria, setCategoria] = useState("");
  const [documento, setDocumento] = useState("");
  const [valor, setValor] = useState("");
  const [parcelas, setParcelas] = useState("1");
  const [vencimento, setVencimento] = useState(hoje);
  const [intervalo, setIntervalo] = useState("30");
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();

  function salvar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    startTransition(async () => {
      const r = await criarTitulos({
        tipo,
        descricao,
        clienteId: clienteId || undefined,
        favorecido: favorecido || undefined,
        categoria: categoria || undefined,
        documento: documento || undefined,
        valorTotal: paraNumero(valor),
        parcelas: { quantidade: Math.max(1, parseInt(parcelas) || 1), primeiroVencimento: vencimento, intervaloDias: Math.max(1, parseInt(intervalo) || 30) },
      });
      if (r.ok) aoFechar();
      else setErro(r.erro);
    });
  }

  const receber = tipo === "RECEBER";
  return (
    <Modal open onClose={aoFechar} title={receber ? "Nova conta a receber" : "Nova conta a pagar"} maxWidth="max-w-xl">
      <form onSubmit={salvar} className="space-y-3">
        <div>
          <label className={labelCls}>Descrição *</label>
          <Input value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder={receber ? "Ex.: Venda de sementes" : "Ex.: Aluguel do escritório"} required />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={labelCls}>Cliente cadastrado</label>
            <ComboBox opcoes={clientes} valor={clienteId} onSelecionar={setClienteId} placeholder="Buscar cliente..." />
          </div>
          <div>
            <label className={labelCls}>{receber ? "Ou pagador sem cadastro" : "Ou fornecedor / favorecido"}</label>
            <Input value={favorecido} onChange={(e) => setFavorecido(e.target.value)} />
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={labelCls}>Categoria</label>
            <Input value={categoria} onChange={(e) => setCategoria(e.target.value)} placeholder={receber ? "Ex.: Serviços" : "Ex.: Impostos"} />
          </div>
          <div>
            <label className={labelCls}>Documento</label>
            <Input value={documento} onChange={(e) => setDocumento(e.target.value)} placeholder="NF, contrato, recibo..." />
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-4">
          <div className="sm:col-span-2">
            <label className={labelCls}>Valor total (R$) *</label>
            <Input value={valor} onChange={(e) => setValor(e.target.value)} inputMode="decimal" placeholder="0,00" required />
          </div>
          <div>
            <label className={labelCls}>Parcelas</label>
            <Input value={parcelas} onChange={(e) => setParcelas(e.target.value)} inputMode="numeric" />
          </div>
          <div>
            <label className={labelCls}>A cada (dias)</label>
            <Input value={intervalo} onChange={(e) => setIntervalo(e.target.value)} inputMode="numeric" />
          </div>
        </div>
        <div>
          <label className={labelCls}>{Number(parcelas) > 1 ? "1º vencimento *" : "Vencimento *"}</label>
          <DateInput value={vencimento} onChange={(e) => setVencimento(e.target.value)} required />
        </div>
        {erro && <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-red-400">{erro}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={aoFechar}>Cancelar</Button>
          <Button type="submit" variant="primary" disabled={pendente}>{pendente ? "Salvando..." : "Lançar"}</Button>
        </div>
      </form>
    </Modal>
  );
}

function FormBoleto({ titulo, aoFechar }: { titulo: TituloLinha; aoFechar: () => void }) {
  const [linha, setLinha] = useState(titulo.linhaDigitavel ?? "");
  const [pdf, setPdf] = useState(titulo.boletoPdfUrl ?? "");
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();

  function salvar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    startTransition(async () => {
      const r = await registrarBoletoTitulo(titulo.id, { linhaDigitavel: linha, boletoPdfUrl: pdf });
      if (r.ok) aoFechar();
      else setErro(r.erro);
    });
  }

  return (
    <Modal open onClose={aoFechar} title={`Boleto - ${titulo.descricao}`}>
      <form onSubmit={salvar} className="space-y-3">
        <p className="text-xs text-muted">Boleto emitido no banco ou em outro sistema. Guarde aqui para enviar ao cliente.</p>
        <div>
          <label className={labelCls}>Linha digitável</label>
          <Input value={linha} onChange={(e) => setLinha(e.target.value)} />
        </div>
        <div>
          <label className={labelCls}>Link do PDF</label>
          <Input value={pdf} onChange={(e) => setPdf(e.target.value)} placeholder="https://..." />
        </div>
        {erro && <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-red-400">{erro}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={aoFechar}>Cancelar</Button>
          <Button type="submit" variant="primary" disabled={pendente}>{pendente ? "Salvando..." : "Salvar boleto"}</Button>
        </div>
      </form>
    </Modal>
  );
}

// Contas lançadas à mão no Financeiro (sem pedido/despesa), a receber ou a pagar.
export function TitulosAvulsosPainel({
  tipo,
  titulos,
  clientes,
  hoje,
  provedorBoleto,
}: {
  tipo: "RECEBER" | "PAGAR";
  titulos: TituloLinha[];
  clientes: ComboBoxOpcao[];
  hoje: string;
  provedorBoleto: string | null;
}) {
  const [novo, setNovo] = useState(false);
  const [boletoDe, setBoletoDe] = useState<TituloLinha | null>(null);
  const [mostrarPagos, setMostrarPagos] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();
  const { confirmar } = useConfirm();
  const receber = tipo === "RECEBER";

  const abertos = titulos.filter((t) => t.status === "ABERTO");
  const lista = mostrarPagos ? titulos : abertos;
  const totalAberto = abertos.reduce((s, t) => s + t.valor, 0);
  const totalVencido = abertos.filter((t) => t.vencimento < hoje).reduce((s, t) => s + t.valor, 0);

  function rodar(acao: () => Promise<{ ok: true } | { ok: false; erro: string }>) {
    setErro(null);
    startTransition(async () => {
      const r = await acao();
      if (!r.ok) setErro(r.erro);
    });
  }

  async function baixar(t: TituloLinha) {
    const ok = await confirmar({ mensagem: `Registrar ${receber ? "o recebimento" : "o pagamento"} de "${t.descricao}" (${fmtBRL(t.valor)}) com a data de hoje?`, confirmarLabel: receber ? "Registrar recebimento" : "Registrar pagamento" });
    if (ok) rodar(() => baixarTitulo(t.id));
  }

  async function cancelar(t: TituloLinha) {
    const ok = await confirmar({ mensagem: `Cancelar a conta "${t.descricao}" (${fmtBRL(t.valor)})?`, confirmarLabel: "Cancelar conta", variante: "perigo" });
    if (ok) rodar(() => cancelarTitulo(t.id));
  }

  return (
    <Card title={receber ? "Contas a receber avulsas" : "Contas a pagar avulsas"}>
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-muted">
            {fmtBRL(totalAberto)} em aberto · <span className={totalVencido > 0 ? "text-red-400" : ""}>{fmtBRL(totalVencido)} vencido</span>
          </p>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 text-xs text-secondary">
              <input type="checkbox" checked={mostrarPagos} onChange={(e) => setMostrarPagos(e.target.checked)} />
              Mostrar {receber ? "recebidos" : "pagos"}
            </label>
            <Button size="sm" variant="primary" onClick={() => setNovo(true)}>
              <Plus size={13} /> {receber ? "Nova conta a receber" : "Nova conta a pagar"}
            </Button>
          </div>
        </div>

        {erro && <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-red-400">{erro}</p>}

        <div className="tabela-fixa overflow-x-auto rounded-xl border border-surface-border">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-surface-border bg-zinc-900 text-left text-xs font-medium text-muted">
                <th className="px-3 py-2.5">Vencimento</th>
                <th className="px-3 py-2.5">Descrição</th>
                <th className="px-3 py-2.5">{receber ? "Cliente" : "Favorecido"}</th>
                <th className="px-3 py-2.5">Situação</th>
                <th className="px-3 py-2.5 text-right">Valor</th>
                <th className="px-3 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {lista.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-sm text-muted"><p className="sticky left-3 max-w-[calc(100vw-4rem)] whitespace-normal md:max-w-[calc(100vw-20rem)]">{titulos.length === 0 ? `Nenhuma conta lançada. Use "${receber ? "Nova conta a receber" : "Nova conta a pagar"}" para começar.` : `Nenhuma conta em aberto. Marque "Mostrar ${receber ? "recebidos" : "pagos"}" para consultar os demais registros.`}</p></td>
                </tr>
              )}
              {lista.map((t) => {
                const vencido = t.status === "ABERTO" && t.vencimento < hoje;
                return (
                  <tr key={t.id} className="border-b border-surface-border/50 last:border-0">
                    <td className={`px-3 py-2 ${vencido ? "text-red-400" : "text-zinc-300"}`}>{fmtData(t.vencimento)}</td>
                    <td className="px-3 py-2 text-white">
                      {t.descricao}
                      {t.totalParcelas > 1 && <span className="ml-1.5 text-xs text-muted">{t.parcela}/{t.totalParcelas}</span>}
                      {(t.categoria || t.documento || t.notaNumero) && (
                        <p className="text-xs text-muted">{[t.categoria, t.documento, t.notaNumero && `NF ${t.notaNumero}`].filter(Boolean).join(" · ")}</p>
                      )}
                    </td>
                    <td className="px-3 py-2 text-secondary">{t.pessoa}</td>
                    <td className="px-3 py-2">
                      {t.status === "PAGO" ? (
                        <Badge variant="success">{receber ? "Recebido" : "Pago"} {t.dataPagamento && fmtData(t.dataPagamento)}</Badge>
                      ) : vencido ? (
                        <Badge variant="danger">Vencido</Badge>
                      ) : (
                        <Badge variant="neutral">Em aberto</Badge>
                      )}
                      {t.linhaDigitavel || t.boletoPdfUrl ? <Badge variant="info" className="ml-1">Boleto</Badge> : null}
                    </td>
                    <td className="px-3 py-2 text-right font-medium text-white">{fmtBRL(t.valor)}</td>
                    <td className="px-3 py-2 text-right">
                      <MenuAcoes
                        desabilitado={pendente}
                        acoes={[
                          ...(t.status === "ABERTO"
                            ? [{ rotulo: receber ? "Marcar recebido" : "Marcar pago", icone: <CheckCircle2 size={14} />, aoClicar: () => baixar(t) }]
                            : [{ rotulo: "Reabrir", icone: <RotateCcw size={14} />, aoClicar: () => rodar(() => reabrirTitulo(t.id)) }]),
                          ...(receber && t.status === "ABERTO"
                            ? [
                                { rotulo: t.linhaDigitavel || t.boletoPdfUrl ? "Editar boleto" : "Registrar boleto", icone: <Barcode size={14} />, aoClicar: () => setBoletoDe(t) },
                                ...(provedorBoleto && !t.linhaDigitavel
                                  ? [{ rotulo: `Emitir boleto (${provedorBoleto})`, icone: <Send size={14} />, aoClicar: () => rodar(() => emitirBoletoTituloPeloProvedor(t.id)) }]
                                  : []),
                              ]
                            : []),
                          ...(t.boletoPdfUrl
                            ? [{ rotulo: "Abrir PDF do boleto", icone: <Barcode size={14} />, aoClicar: () => window.open(t.boletoPdfUrl!, "_blank") }]
                            : []),
                          { rotulo: "Cancelar", icone: <Trash2 size={14} />, perigosa: true, aoClicar: () => cancelar(t) },
                        ]}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {novo && <FormTitulo tipo={tipo} clientes={clientes} hoje={hoje} aoFechar={() => setNovo(false)} />}
      {boletoDe && <FormBoleto titulo={boletoDe} aoFechar={() => setBoletoDe(null)} />}
    </Card>
  );
}
