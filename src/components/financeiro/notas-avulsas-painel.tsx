"use client";

import { useState, useTransition } from "react";
import { Ban, FileCheck2, FileText, Plus, Send, Trash2 } from "lucide-react";
import {
  cancelarNotaAvulsa,
  criarNotaAvulsa,
  emitirNotaAvulsaPeloProvedor,
  registrarNotaAvulsaManual,
} from "@/app/actions/financeiro-avulso";
import { fmtBRL, fmtData } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ComboBox, type ComboBoxOpcao } from "@/components/ui/combo-box";
import { DateInput } from "@/components/ui/date-input";
import { Input } from "@/components/ui/input";
import { MenuAcoes } from "@/components/ui/menu-acoes";
import { Modal } from "@/components/ui/modal";
import { useConfirm } from "@/components/ui/confirm-dialog";

export type NotaAvulsaLinha = {
  id: string;
  clienteNome: string;
  naturezaOperacao: string;
  valorTotal: number;
  status: "PENDENTE" | "PROCESSANDO" | "EMITIDA" | "ERRO" | "CANCELADA";
  numero: string | null;
  serie: string | null;
  dataEmissao: string | null;
  pdfUrl: string | null;
  xmlUrl: string | null;
  provedor: string;
  mensagemErro: string | null;
  qtdParcelas: number;
  criadaEm: string;
};

const labelCls = "mb-1 block text-xs font-medium text-secondary";

const STATUS: Record<NotaAvulsaLinha["status"], { rotulo: string; variant: "neutral" | "success" | "warning" | "danger" | "info" }> = {
  PENDENTE: { rotulo: "Não emitida", variant: "warning" },
  PROCESSANDO: { rotulo: "Processando", variant: "info" },
  EMITIDA: { rotulo: "Emitida", variant: "success" },
  ERRO: { rotulo: "Erro", variant: "danger" },
  CANCELADA: { rotulo: "Cancelada", variant: "neutral" },
};

function paraNumero(texto: string): number {
  const n = Number(texto.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

type ItemForm = { descricao: string; ncm: string; unidade: string; quantidade: string; valorUnitario: string };
const itemVazio = (): ItemForm => ({ descricao: "", ncm: "", unidade: "UN", quantidade: "1", valorUnitario: "" });

function FormNota({ clientes, hoje, aoFechar }: { clientes: ComboBoxOpcao[]; hoje: string; aoFechar: () => void }) {
  const [clienteId, setClienteId] = useState("");
  const [natureza, setNatureza] = useState("Venda de mercadoria");
  const [cfop, setCfop] = useState("");
  const [itens, setItens] = useState<ItemForm[]>([itemVazio()]);
  const [observacoes, setObservacoes] = useState("");
  const [gerarParcelas, setGerarParcelas] = useState(true);
  const [parcelas, setParcelas] = useState("1");
  const [vencimento, setVencimento] = useState(hoje);
  const [intervalo, setIntervalo] = useState("30");
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();

  const total = itens.reduce((s, i) => s + paraNumero(i.quantidade) * paraNumero(i.valorUnitario), 0);

  function mudarItem(idx: number, campo: keyof ItemForm, valor: string) {
    setItens((lista) => lista.map((it, i) => (i === idx ? { ...it, [campo]: valor } : it)));
  }

  function salvar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    startTransition(async () => {
      const r = await criarNotaAvulsa({
        clienteId,
        naturezaOperacao: natureza,
        cfop: cfop || undefined,
        observacoes: observacoes || undefined,
        itens: itens.map((i) => ({
          descricao: i.descricao,
          ncm: i.ncm || undefined,
          unidade: i.unidade || "UN",
          quantidade: paraNumero(i.quantidade),
          valorUnitario: paraNumero(i.valorUnitario),
        })),
        parcelas: gerarParcelas
          ? { quantidade: Math.max(1, parseInt(parcelas) || 1), primeiroVencimento: vencimento, intervaloDias: Math.max(1, parseInt(intervalo) || 30) }
          : null,
      });
      if (r.ok) aoFechar();
      else setErro(r.erro);
    });
  }

  return (
    <Modal open onClose={aoFechar} title="Nova nota fiscal avulsa" maxWidth="max-w-3xl">
      <form onSubmit={salvar} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="sm:col-span-3">
            <label className={labelCls}>Cliente (destinatário) *</label>
            <ComboBox opcoes={clientes} valor={clienteId} onSelecionar={setClienteId} placeholder="Buscar cliente..." />
          </div>
          <div className="sm:col-span-2">
            <label className={labelCls}>Natureza da operação *</label>
            <Input value={natureza} onChange={(e) => setNatureza(e.target.value)} required />
          </div>
          <div>
            <label className={labelCls}>CFOP</label>
            <Input value={cfop} onChange={(e) => setCfop(e.target.value)} placeholder="Ex.: 5102" />
          </div>
        </div>

        <div className="space-y-2">
          <p className={labelCls}>Itens *</p>
          {itens.map((it, idx) => (
            <div key={idx} className="grid grid-cols-12 gap-2">
              <Input className="col-span-12 sm:col-span-5" placeholder="Descrição" value={it.descricao} onChange={(e) => mudarItem(idx, "descricao", e.target.value)} required />
              <Input className="col-span-4 sm:col-span-2" placeholder="NCM" value={it.ncm} onChange={(e) => mudarItem(idx, "ncm", e.target.value)} />
              <Input className="col-span-2 sm:col-span-1" placeholder="Un" value={it.unidade} onChange={(e) => mudarItem(idx, "unidade", e.target.value)} />
              <Input className="col-span-2 sm:col-span-1" placeholder="Qtd" inputMode="decimal" value={it.quantidade} onChange={(e) => mudarItem(idx, "quantidade", e.target.value)} />
              <Input className="col-span-3 sm:col-span-2" placeholder="Valor un." inputMode="decimal" value={it.valorUnitario} onChange={(e) => mudarItem(idx, "valorUnitario", e.target.value)} />
              <button type="button" aria-label="Remover item" disabled={itens.length === 1} onClick={() => setItens((l) => l.filter((_, i) => i !== idx))} className="col-span-1 flex items-center justify-center text-muted hover:text-red-400 disabled:opacity-30">
                <Trash2 size={14} />
              </button>
            </div>
          ))}
          <div className="flex items-center justify-between">
            <Button type="button" size="sm" variant="secondary" onClick={() => setItens((l) => [...l, itemVazio()])}>
              <Plus size={13} /> Item
            </Button>
            <p className="text-sm text-zinc-300">Total: <span className="font-semibold text-white">{fmtBRL(total)}</span></p>
          </div>
        </div>

        <div className="space-y-2 rounded-xl border border-surface-border p-3">
          <label className="flex items-center gap-2 text-sm text-zinc-300">
            <input type="checkbox" checked={gerarParcelas} onChange={(e) => setGerarParcelas(e.target.checked)} />
            Lançar em Contas a receber
          </label>
          {gerarParcelas && (
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label className={labelCls}>Parcelas</label>
                <Input value={parcelas} onChange={(e) => setParcelas(e.target.value)} inputMode="numeric" />
              </div>
              <div>
                <label className={labelCls}>1º vencimento</label>
                <DateInput value={vencimento} onChange={(e) => setVencimento(e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>A cada (dias)</label>
                <Input value={intervalo} onChange={(e) => setIntervalo(e.target.value)} inputMode="numeric" />
              </div>
            </div>
          )}
        </div>

        <div>
          <label className={labelCls}>Observações (informações complementares)</label>
          <Input value={observacoes} onChange={(e) => setObservacoes(e.target.value)} />
        </div>

        {erro && <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-red-400">{erro}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={aoFechar}>Cancelar</Button>
          <Button type="submit" variant="primary" disabled={pendente}>{pendente ? "Salvando..." : "Salvar nota"}</Button>
        </div>
      </form>
    </Modal>
  );
}

function FormRegistro({ nota, hoje, aoFechar }: { nota: NotaAvulsaLinha; hoje: string; aoFechar: () => void }) {
  const [numero, setNumero] = useState(nota.numero ?? "");
  const [serie, setSerie] = useState(nota.serie ?? "");
  const [chave, setChave] = useState("");
  const [data, setData] = useState(nota.dataEmissao?.slice(0, 10) ?? hoje);
  const [pdf, setPdf] = useState(nota.pdfUrl ?? "");
  const [xml, setXml] = useState(nota.xmlUrl ?? "");
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();

  function salvar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    startTransition(async () => {
      const r = await registrarNotaAvulsaManual(nota.id, { numero, serie, chaveAcesso: chave, dataEmissao: data, pdfUrl: pdf, xmlUrl: xml });
      if (r.ok) aoFechar();
      else setErro(r.erro);
    });
  }

  return (
    <Modal open onClose={aoFechar} title={`Registrar nota emitida - ${nota.clienteNome}`}>
      <form onSubmit={salvar} className="space-y-3">
        <p className="text-xs text-muted">Nota emitida por fora (contador, portal da SEFAZ, outro sistema). Digite os dados para guardar aqui.</p>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="sm:col-span-2">
            <label className={labelCls}>Número *</label>
            <Input value={numero} onChange={(e) => setNumero(e.target.value)} required />
          </div>
          <div>
            <label className={labelCls}>Série</label>
            <Input value={serie} onChange={(e) => setSerie(e.target.value)} />
          </div>
        </div>
        <div>
          <label className={labelCls}>Chave de acesso</label>
          <Input value={chave} onChange={(e) => setChave(e.target.value)} placeholder="44 dígitos" />
        </div>
        <div>
          <label className={labelCls}>Data de emissão</label>
          <DateInput value={data} onChange={(e) => setData(e.target.value)} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={labelCls}>Link do PDF (DANFE)</label>
            <Input value={pdf} onChange={(e) => setPdf(e.target.value)} placeholder="https://..." />
          </div>
          <div>
            <label className={labelCls}>Link do XML</label>
            <Input value={xml} onChange={(e) => setXml(e.target.value)} placeholder="https://..." />
          </div>
        </div>
        {erro && <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-red-400">{erro}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={aoFechar}>Cancelar</Button>
          <Button type="submit" variant="primary" disabled={pendente}>{pendente ? "Salvando..." : "Registrar"}</Button>
        </div>
      </form>
    </Modal>
  );
}

// Notas fiscais sem pedido: cria o rascunho, depois registra (emitida por fora)
// ou emite pelo provedor configurado (Siagri...).
export function NotasAvulsasPainel({
  notas,
  clientes,
  hoje,
  provedorNota,
}: {
  notas: NotaAvulsaLinha[];
  clientes: ComboBoxOpcao[];
  hoje: string;
  provedorNota: string | null;
}) {
  const [nova, setNova] = useState(false);
  const [registrando, setRegistrando] = useState<NotaAvulsaLinha | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();
  const { confirmar, perguntar } = useConfirm();

  function rodar(acao: () => Promise<{ ok: true } | { ok: false; erro: string }>) {
    setErro(null);
    startTransition(async () => {
      const r = await acao();
      if (!r.ok) setErro(r.erro);
    });
  }

  async function cancelar(n: NotaAvulsaLinha) {
    if (n.provedor !== "MANUAL" && n.status === "EMITIDA") {
      const motivo = await perguntar({ titulo: "Cancelar nota", mensagem: "Justificativa (mínimo 15 caracteres), enviada à SEFAZ:", confirmarLabel: "Cancelar nota" });
      if (motivo !== null) rodar(() => cancelarNotaAvulsa(n.id, motivo));
      return;
    }
    const ok = await confirmar({
      mensagem: `Cancelar a nota de ${n.clienteNome} (${fmtBRL(n.valorTotal)})? As parcelas em aberto dela também são canceladas.${n.status === "EMITIDA" ? " Lembre de cancelar também onde ela foi emitida." : ""}`,
      confirmarLabel: "Cancelar nota fiscal",
      variante: "perigo",
    });
    if (ok) rodar(() => cancelarNotaAvulsa(n.id));
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-white">Notas avulsas</h1>
          <p className="text-xs text-muted">
            Notas fiscais sem pedido. {provedorNota ? `Emissão pelo ${provedorNota} ou registro manual.` : "Emita a nota no seu emissor fiscal e registre os dados aqui."}
          </p>
        </div>
        <Button variant="primary" onClick={() => setNova(true)}>
          <Plus size={14} /> Nova nota avulsa
        </Button>
      </header>

      {erro && <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-red-400">{erro}</p>}

      <div className="tabela-fixa overflow-x-auto rounded-xl border border-surface-border">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b border-surface-border bg-zinc-900 text-left text-xs font-medium text-muted">
              <th className="px-3 py-2.5">Criada</th>
              <th className="px-3 py-2.5">Cliente</th>
              <th className="px-3 py-2.5">Natureza</th>
              <th className="px-3 py-2.5">Nota</th>
              <th className="px-3 py-2.5">Situação</th>
              <th className="px-3 py-2.5 text-right">Valor</th>
              <th className="px-3 py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {notas.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-sm text-muted"><p className="sticky left-3 max-w-[calc(100vw-4rem)] whitespace-normal md:max-w-[calc(100vw-20rem)]">Nenhuma nota avulsa registrada. Use &quot;Nova nota avulsa&quot; para registrar uma nota sem pedido.</p></td>
              </tr>
            )}
            {notas.map((n) => {
              const aberta = n.status === "PENDENTE" || n.status === "ERRO";
              return (
                <tr key={n.id} className="border-b border-surface-border/50 last:border-0">
                  <td className="px-3 py-2 text-secondary">{fmtData(n.criadaEm)}</td>
                  <td className="px-3 py-2 text-white">
                    {n.clienteNome}
                    {n.qtdParcelas > 0 && <p className="text-xs text-muted">{n.qtdParcelas} {n.qtdParcelas === 1 ? "parcela a receber" : "parcelas a receber"}</p>}
                  </td>
                  <td className="px-3 py-2 text-secondary">{n.naturezaOperacao}</td>
                  <td className="px-3 py-2 text-zinc-300">
                    {n.numero ? `${n.numero}${n.serie ? `/${n.serie}` : ""}` : "-"}
                    {n.dataEmissao && <p className="text-xs text-muted">{fmtData(n.dataEmissao)}</p>}
                  </td>
                  <td className="px-3 py-2">
                    <Badge variant={STATUS[n.status].variant}>{STATUS[n.status].rotulo}</Badge>
                    {n.mensagemErro && <p className="mt-1 max-w-[220px] text-xs text-red-400">{n.mensagemErro}</p>}
                  </td>
                  <td className="px-3 py-2 text-right font-medium text-white">{fmtBRL(n.valorTotal)}</td>
                  <td className="px-3 py-2 text-right">
                    <MenuAcoes
                      desabilitado={pendente}
                      acoes={[
                        ...(aberta && provedorNota
                          ? [{ rotulo: `Emitir pelo ${provedorNota}`, icone: <Send size={14} />, aoClicar: () => rodar(() => emitirNotaAvulsaPeloProvedor(n.id)) }]
                          : []),
                        ...(n.status !== "CANCELADA" && n.status !== "PROCESSANDO"
                          ? [{ rotulo: n.status === "EMITIDA" ? "Editar dados da nota" : "Registrar nota emitida", icone: <FileCheck2 size={14} />, aoClicar: () => setRegistrando(n) }]
                          : []),
                        ...(n.pdfUrl ? [{ rotulo: "Abrir PDF", icone: <FileText size={14} />, aoClicar: () => window.open(n.pdfUrl!, "_blank") }] : []),
                        ...(n.xmlUrl ? [{ rotulo: "Abrir XML", icone: <FileText size={14} />, aoClicar: () => window.open(n.xmlUrl!, "_blank") }] : []),
                        ...(n.status !== "CANCELADA" ? [{ rotulo: "Cancelar nota", icone: <Ban size={14} />, perigosa: true, aoClicar: () => cancelar(n) }] : []),
                      ]}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {nova && <FormNota clientes={clientes} hoje={hoje} aoFechar={() => setNova(false)} />}
      {registrando && <FormRegistro nota={registrando} hoje={hoje} aoFechar={() => setRegistrando(null)} />}
    </div>
  );
}
