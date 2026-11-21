"use client";
import { DialogFrame } from "@/components/ui/dialog-frame";

import { useMemo, useState, useTransition } from "react";
import {
  alterarStatusProposta,
  aprovarPedido,
  excluirProposta,
  importarContratoAssinado,
} from "@/app/actions/propostas";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { OrcamentoWizard } from "./orcamento-wizard";
import { EnviarAssinaturaModal } from "./enviar-assinatura-modal";
import { ImportarContratoModal } from "./importar-contrato-modal";
import { fmtBRL, fmtData, fmtNum } from "@/lib/format";
import { FAIXA_CORES, faixaDaMargem } from "@/lib/margem";
import {
  STATUS_PROPOSTA_CORES,
  STATUS_PROPOSTA_LABELS,
  STATUS_PROPOSTA_ORDEM,
  numeroDocumento,
  numeroPedido,
  type AssinanteDoc,
  type StatusProposta,
  type TipoProposta,
} from "@/lib/propostas";
import type {
  ClienteOpcaoProposta,
  ConsultorOpcaoProposta,
  ProdutoOpcaoProposta,
  PropostaLinha,
  VendaOpcaoProposta,
} from "@/components/propostas/tipos";
import { Button } from "@/components/ui/button";
import { PreviaPdfModal } from "@/components/ui/previa-pdf-modal";
import { Badge } from "@/components/ui/badge";
import { MenuAcoes } from "@/components/ui/menu-acoes";
import { FiltroColunaExcel } from "@/components/ui/filtro-coluna-excel";
import { FileSignature, FileText, Pencil, Plus, ShieldAlert, Trash2, Upload, X } from "lucide-react";

export type OrcamentoOpcao = {
  id: string;
  numero: number;
  clienteNome: string;
  consultorNome: string;
  total: number;
};

const inputCls =
  "w-full rounded-lg border border-surface-border bg-zinc-800 px-3 py-2 text-sm text-white outline-none focus:border-accent";
const compactInputCls =
  "rounded-lg border border-surface-border bg-zinc-800 px-3 py-1.5 text-sm text-white outline-none focus:border-accent";

function BadgeStatus({ status }: { status: StatusProposta }) {
  return (
    <Badge color={STATUS_PROPOSTA_CORES[status]}>
      {STATUS_PROPOSTA_LABELS[status]}
    </Badge>
  );
}

function aguardandoGestor(proposta: PropostaLinha) {
  return proposta.tipo === "PROPOSTA" && proposta.statusMargem === "AGUARDANDO_APROVACAO";
}

// Gestor recusou a margem (nao chegou a ser fechado/enviado): volta pro
// consultor corrigir preco/produto e reenviar (ver recusarMargem em
// lib/servicos/propostas.ts). Bloqueia envio pra assinatura e importacao de
// contrato ate a correcao — nao da pra escapar da aprovacao de margem so
// enviando ou importando por fora.
function margemRecusada(proposta: PropostaLinha) {
  return proposta.tipo === "PROPOSTA" && proposta.statusMargem === "RECUSADA_GESTOR";
}

// Conferencia final recusada pelo administrativo (pos-assinatura): volta pro
// consultor corrigir, mesma logica de aguardandoGestor mas depois de fechado
// (ver recusarConferenciaFinal em lib/servicos/propostas.ts).
function recusadoNaConferencia(proposta: PropostaLinha) {
  return proposta.tipo === "PROPOSTA" && proposta.statusMargem === "RECUSADA_CONFERENCIA";
}

// Negocio fechado (venda em FECHADO) mas ainda sem a conferencia final do
// administrativo — so entao a venda vira EM_CARTEIRA de fato (ver
// aprovarConferenciaFinal em lib/servicos/propostas.ts). Prioriza mostrar
// "aguardando autorização"/"recusado" (margem) se valerem ao mesmo tempo, ja
// que aquelas travas vem antes na sequencia do fluxo.
function aguardandoConferencia(proposta: PropostaLinha) {
  return (
    proposta.aguardandoConferencia &&
    !aguardandoGestor(proposta) &&
    !margemRecusada(proposta) &&
    !recusadoNaConferencia(proposta)
  );
}


function SeletorOrcamentoModal({
  orcamentos,
  pendente,
  erro,
  aoEscolher,
  aoFechar,
}: {
  orcamentos: OrcamentoOpcao[];
  pendente: boolean;
  erro: string | null;
  aoEscolher: (id: string) => void;
  aoFechar: () => void;
}) {
  const [busca, setBusca] = useState("");

  const filtrados = useMemo(() => {
    const termo = busca.toLowerCase();
    if (!termo) return orcamentos;
    return orcamentos.filter(
      (o) =>
        o.clienteNome.toLowerCase().includes(termo) ||
        numeroPedido(o.numero).toLowerCase().includes(termo)
    );
  }, [busca, orcamentos]);

  return (
    <DialogFrame onClose={aoFechar} label={"Gerar pedido"} className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 lg:pl-64">
      <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-xl border border-surface-border bg-zinc-900 p-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold text-white">Gerar pedido</h2>
          <button aria-label="Fechar janela"
            onClick={aoFechar}
            className="rounded p-1 text-secondary hover:bg-zinc-800 hover:text-white"
          >
            <X size={18} />
          </button>
        </div>
        <p className="mb-3 text-sm text-muted">
          Selecione o orçamento que deseja transformar em pedido.
        </p>
        <input
          autoFocus
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar cliente ou número..."
          className={inputCls}
        />
        <div className="mt-3 space-y-2">
          {filtrados.length === 0 && (
            <p className="rounded-lg border border-surface-border px-3 py-6 text-center text-sm text-muted">
              Nenhum orçamento disponível. Crie um orçamento antes de gerar o pedido.
            </p>
          )}
          {filtrados.map((o) => (
            <button
              key={o.id}
              disabled={pendente}
              onClick={() => aoEscolher(o.id)}
              className="flex w-full items-center justify-between rounded-lg border border-surface-border px-3 py-2.5 text-left hover:border-accent hover:bg-accent/5 disabled:opacity-50"
            >
              <div>
                <p className="text-sm font-semibold text-white">
                  {numeroPedido(o.numero)} - {o.clienteNome}
                </p>
                <p className="text-xs text-muted">{o.consultorNome}</p>
              </div>
              <p className="text-sm font-semibold text-accent">{fmtBRL(o.total)}</p>
            </button>
          ))}
        </div>
        {erro && (
          <p role="alert" className="mt-3 rounded-lg bg-danger/10 px-3 py-2 text-sm text-red-400">
            {erro}
          </p>
        )}
      </div>
    </DialogFrame>
  );
}

export function PropostasTable({
  tipo,
  propostas,
  clientes,
  produtos,
  consultores,
  vendasAbertas,
  ehAdmin,
  financeiro = false,
  orcamentosDisponiveis = [],
}: {
  tipo: TipoProposta;
  propostas: PropostaLinha[];
  clientes: ClienteOpcaoProposta[];
  produtos: ProdutoOpcaoProposta[];
  consultores: ConsultorOpcaoProposta[];
  vendasAbertas: VendaOpcaoProposta[];
  ehAdmin: boolean;
  // Módulo Financeiro: assinatura em diante (enviar, importar contrato assinado).
  financeiro?: boolean;
  orcamentosDisponiveis?: OrcamentoOpcao[];
}) {
  const ehPedido = tipo === "PEDIDO";
  const [busca, setBusca] = useState("");
  const [filtroStatus, setFiltroStatus] = useState<Set<string>>(new Set());
  const [filtroConsultor, setFiltroConsultor] = useState<Set<string>>(new Set());
  const [filtroCliente, setFiltroCliente] = useState<Set<string>>(new Set());
  const [criando, setCriando] = useState(false);
  const [escolhendoOrcamento, setEscolhendoOrcamento] = useState(false);
  const [editando, setEditando] = useState<PropostaLinha | null>(null);
  const [enviandoAssinatura, setEnviandoAssinatura] = useState<PropostaLinha | null>(null);
  const [erroAssinatura, setErroAssinatura] = useState<string | null>(null);
  const [importandoContrato, setImportandoContrato] = useState<PropostaLinha | null>(null);
  const [erroImportarContrato, setErroImportarContrato] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  // Guarda o nome do cliente quando o erro atual e sobre cadastro incompleto
  // (mesma mensagem gerada em validarPropostaParaPdf), pra linkar direto pra
  // edicao dele em vez de so avisar em texto.
  const [clienteDoErro, setClienteDoErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();
  const { confirmar } = useConfirm();

  const opcoesConsultoresFiltro = useMemo(() => {
    const mapa = new Map(propostas.map((p) => [p.consultorId, p.consultorNome]));
    return [...mapa.entries()]
      .map(([id, nome]) => ({ id, label: nome }))
      .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
  }, [propostas]);

  const opcoesClientesFiltro = useMemo(() => {
    const mapa = new Map(propostas.map((p) => [p.clienteId, p.clienteNome]));
    return [...mapa.entries()]
      .map(([id, nome]) => ({ id, label: nome }))
      .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
  }, [propostas]);

  function statusExibidoDe(p: PropostaLinha) {
    if (aguardandoGestor(p)) return "AGUARDANDO_GESTOR";
    if (margemRecusada(p)) return "RECUSADO_MARGEM";
    if (recusadoNaConferencia(p)) return "RECUSADO_CONFERENCIA";
    if (aguardandoConferencia(p)) return "AGUARDANDO_CONFERENCIA";
    return p.status;
  }

  const opcoesStatusFiltro = useMemo(() => {
    const presentes = new Set(propostas.map(statusExibidoDe));
    return [
      ...STATUS_PROPOSTA_ORDEM.map((status) => ({ id: status, label: STATUS_PROPOSTA_LABELS[status] })),
      { id: "AGUARDANDO_GESTOR", label: "Aguardando autorização" },
      { id: "RECUSADO_MARGEM", label: "Recusado (margem)" },
      { id: "AGUARDANDO_CONFERENCIA", label: "Aguardando conferência" },
      { id: "RECUSADO_CONFERENCIA", label: "Recusado na conferência" },
    ].filter((opcao) =>
      presentes.has(
        opcao.id as
          | StatusProposta
          | "AGUARDANDO_GESTOR"
          | "RECUSADO_MARGEM"
          | "AGUARDANDO_CONFERENCIA"
          | "RECUSADO_CONFERENCIA"
      )
    );
  }, [propostas]);

  const filtradas = useMemo(() => {
    const termo = busca.toLowerCase();
    return propostas.filter((p) => {
      const statusExibido = statusExibidoDe(p);
      if (filtroStatus.size > 0 && !filtroStatus.has(statusExibido)) return false;
      if (filtroConsultor.size > 0 && !filtroConsultor.has(p.consultorId)) return false;
      if (filtroCliente.size > 0 && !filtroCliente.has(p.clienteId)) return false;
      if (
        termo &&
        !p.clienteNome.toLowerCase().includes(termo) &&
        !numeroDocumento(tipo, p.numero).toLowerCase().includes(termo)
      )
        return false;
      return true;
    });
  }, [busca, filtroStatus, filtroConsultor, filtroCliente, propostas, tipo]);

  const total = filtradas
    .filter((p) => p.status !== "CANCELADA" && p.status !== "RECUSADA")
    .reduce((soma, p) => soma + p.total, 0);

  // Fallback manual: o envio pro D4Sign ja acontece sozinho ao fechar
  // negocio/aprovar margem (ver enviarSeLiberado em lib/servicos/propostas.ts)
  // — este botao so aparece na UI quando esse envio automatico falhou. Abre
  // o modal pra revisar/adicionar e-mails (todos viram signatarios) antes
  // de mandar de fato.
  function enviarParaAssinatura(proposta: PropostaLinha) {
    setErroAssinatura(null);
    setEnviandoAssinatura(proposta);
  }

  // Fecha o modal na hora do clique — o envio pro D4Sign roda em segundo
  // plano e pode demorar (chamada externa); a tela não deve travar esperando
  // resposta. Falha aparece depois no aviso geral da tabela (`erro`), já que
  // o modal não estará mais na tela pra mostrá-la.
  function confirmarEnvioAssinatura(assinantes: AssinanteDoc[]) {
    if (!enviandoAssinatura) return;
    const proposta = enviandoAssinatura;
    setErroAssinatura(null);
    setEnviandoAssinatura(null);
    startTransition(async () => {
      const resultado = await alterarStatusProposta(proposta.id, "ENVIADA", [], assinantes);
      if (!resultado.ok) {
        setErro(`Falha ao enviar ${proposta.clienteNome} para assinatura: ${resultado.erro}`);
      }
    });
  }

  function importarContrato(proposta: PropostaLinha) {
    setErroImportarContrato(null);
    setImportandoContrato(proposta);
  }

  // Diferente de confirmarEnvioAssinatura, mantém o modal aberto até saber o
  // resultado — upload de arquivo, o usuário espera confirmação (sucesso ou
  // erro) antes de fechar, não roda "em segundo plano" como o envio ao D4Sign.
  function confirmarImportarContrato(arquivo: File) {
    if (!importandoContrato) return;
    const proposta = importandoContrato;
    setErroImportarContrato(null);
    startTransition(async () => {
      const formData = new FormData();
      formData.set("arquivo", arquivo);
      const resultado = await importarContratoAssinado(proposta.id, formData);
      if (!resultado.ok) {
        setErroImportarContrato(resultado.erro);
        return;
      }
      setImportandoContrato(null);
      if ("aviso" in resultado) setErro(resultado.aviso);
    });
  }

  // "Fechar negocio" a partir de um Orcamento ja existente (rascunho salvo):
  // promove o tipo pra PROPOSTA preservando a margem calculada na criacao.
  function promoverOrcamento(orcamentoId: string) {
    setErro(null);
    startTransition(async () => {
      const resultado = await aprovarPedido(orcamentoId);
      if (resultado.ok) setEscolhendoOrcamento(false);
      else setErro(resultado.erro);
    });
  }

  // Mesma promocao, mas direto da linha da tabela de Orcamentos — sem passar
  // pelo seletor (usado na tela de Pedidos) nem pelo wizard de edicao.
  async function fecharNegocioDaLinha(proposta: PropostaLinha) {
    if (
      !(await confirmar({
        mensagem: `Gerar um pedido a partir do orçamento ${numeroDocumento(tipo, proposta.numero)}?`,
        confirmarLabel: "Gerar pedido",
      }))
    )
      return;
    setErro(null);
    startTransition(async () => {
      const resultado = await aprovarPedido(proposta.id);
      if (!resultado.ok) setErro(resultado.erro);
    });
  }

  async function excluir(proposta: PropostaLinha) {
    // Consultor so cancela (numero e historico preservados); so ADMIN exclui
    // de fato — mesma regra de excluirVenda (ver excluirProposta no servico).
    // Pedido nunca e apagado (fica no historico como Cancelado).
    const mensagem =
      ehAdmin && tipo === "PEDIDO"
        ? `Excluir ${numeroDocumento(tipo, proposta.numero)}?`
        : `Cancelar ${numeroDocumento(tipo, proposta.numero)}?`;
    if (!(await confirmar({ mensagem, confirmarLabel: ehAdmin && tipo === "PEDIDO" ? "Excluir orçamento" : "Cancelar documento", variante: "perigo" }))) return;
    setErro(null);
    startTransition(async () => {
      const resultado = await excluirProposta(proposta.id);
      if (!resultado.ok) setErro(resultado.erro);
    });
  }

  const [previaPdf, setPreviaPdf] = useState<{ url: string; titulo: string; nomeArquivo: string } | null>(null);
  function fecharPreviaPdf() {
    if (previaPdf) URL.revokeObjectURL(previaPdf.url);
    setPreviaPdf(null);
  }

  // Mostra o PDF dentro do site (sem abrir outra aba).
  function baixarPdf(proposta: PropostaLinha) {
    setErro(null);
    setClienteDoErro(null);
    startTransition(async () => {
      try {
        const resposta = await fetch(`/propostas/${proposta.id}/pdf`);
        if (!resposta.ok) {
          const texto = await resposta.text();
          setErro(texto || "Não foi possível gerar o PDF.");
          if (texto?.includes("Complete CPF/CNPJ")) setClienteDoErro(proposta.clienteNome);
          return;
        }
        const blob = await resposta.blob();
        const url = URL.createObjectURL(blob);
        const codigo = numeroDocumento(proposta.tipo, proposta.numero);
        setPreviaPdf((atual) => {
          if (atual) URL.revokeObjectURL(atual.url);
          return { url, titulo: `${proposta.tipo === "PROPOSTA" ? "Pedido" : "Orçamento"} ${codigo}`, nomeArquivo: `${codigo}.pdf` };
        });
      } catch {
        setErro("Não foi possível gerar o PDF.");
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">
            {ehPedido ? "Orçamentos" : "Pedidos"}
          </h1>
          <p className="text-sm text-muted">
            {fmtNum(filtradas.length)} {ehPedido ? (filtradas.length === 1 ? "orçamento" : "orçamentos") : (filtradas.length === 1 ? "pedido" : "pedidos")} · total ativo{" "}
            <span className="font-semibold text-accent">{fmtBRL(total)}</span>
          </p>
        </div>
        <Button
          variant="primary"
          onClick={() => (ehPedido ? setCriando(true) : setEscolhendoOrcamento(true))}
        >
          <Plus size={14} /> {ehPedido ? "Novo orçamento" : "Gerar pedido"}
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar cliente ou numero..."
          className={`${compactInputCls} w-72`}
        />
      </div>

      {erro && (
        <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-red-400">
          {erro}{" "}
          {clienteDoErro && (
            <a
              href={`/clientes?busca=${encodeURIComponent(clienteDoErro)}`}
              className="underline hover:text-red-300"
            >
              Editar cadastro do cliente
            </a>
          )}
        </p>
      )}

      <div className="tabela-fixa overflow-x-auto rounded-xl border border-surface-border">
        <table className="w-full min-w-[820px] text-sm">
          <thead>
            <tr className="border-b border-surface-border bg-zinc-900 text-left text-xs font-medium text-muted">
              <th className="px-3 py-2.5">Número</th>
              <th className="px-3 py-2.5">
                Cliente
                <FiltroColunaExcel
                  rotulo="Cliente"
                  opcoes={opcoesClientesFiltro}
                  selecionados={filtroCliente}
                  onMudar={setFiltroCliente}
                />
              </th>
              {ehAdmin && (
                <th className="px-3 py-2.5">
                  Consultor
                  <FiltroColunaExcel
                    rotulo="Consultor"
                    opcoes={opcoesConsultoresFiltro}
                    selecionados={filtroConsultor}
                    onMudar={setFiltroConsultor}
                  />
                </th>
              )}
              <th className="px-3 py-2.5">
                Status
                <FiltroColunaExcel
                  rotulo="Status"
                  opcoes={opcoesStatusFiltro}
                  selecionados={filtroStatus}
                  onMudar={setFiltroStatus}
                />
              </th>
              {ehPedido && <th className="px-3 py-2.5">Origem</th>}
              <th className="px-3 py-2.5">{ehPedido ? "Entrega" : "Validade"}</th>
              <th className="px-3 py-2.5 text-right">Itens</th>
              <th className="px-3 py-2.5 text-right">Total</th>
              {!ehPedido && <th className="px-3 py-2.5 text-right">Margem</th>}
              <th className="px-3 py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {filtradas.map((p) => (
              <tr
                key={p.id}
                className="border-b border-surface-border/50 transition hover:bg-zinc-900/60"
              >
                <td className="px-3 py-2 font-semibold text-white">
                  {numeroDocumento(tipo, p.numero)}
                </td>
                <td className="max-w-64 truncate px-3 py-2 text-zinc-300">
                  {p.clienteNome}
                </td>
                {ehAdmin && (
                  <td className="px-3 py-2 text-secondary">{p.consultorNome}</td>
                )}
                <td className="px-3 py-2">
                  {aguardandoGestor(p) ? (
                    <Badge color="#eab308">Aguardando autorização</Badge>
                  ) : margemRecusada(p) ? (
                    <span className="inline-flex flex-col gap-0.5">
                      <Badge color="#ef4444">Recusado</Badge>
                      {p.margemMotivoRecusa && (
                        <span className="max-w-48 truncate text-xs text-muted" title={p.margemMotivoRecusa}>
                          {p.margemMotivoRecusa}
                        </span>
                      )}
                    </span>
                  ) : recusadoNaConferencia(p) ? (
                    <span className="inline-flex flex-col gap-0.5">
                      <Badge color="#ef4444">Recusado na conferência</Badge>
                      {p.margemMotivoRecusa && (
                        <span className="max-w-48 truncate text-xs text-muted" title={p.margemMotivoRecusa}>
                          {p.margemMotivoRecusa}
                        </span>
                      )}
                    </span>
                  ) : aguardandoConferencia(p) ? (
                    <Badge color="#a855f7">Aguardando conferência</Badge>
                  ) : (
                    <BadgeStatus status={p.status} />
                  )}
                </td>
                {ehPedido && (
                  <td className="px-3 py-2">
                    <Badge color={p.origem === "BOT" ? "#a855f7" : "#71717a"}>
                      {p.origem === "BOT" ? "Bot" : "Web"}
                    </Badge>
                  </td>
                )}
                <td className="px-3 py-2 text-secondary">
                  {fmtData(ehPedido ? p.previsaoEntrega : p.validade)}
                </td>
                <td className="px-3 py-2 text-right text-zinc-300">
                  {fmtNum(p.itens.length)}
                </td>
                <td className="px-3 py-2 text-right font-semibold text-white">
                  {fmtBRL(p.total)}
                </td>
                {!ehPedido && (
                  <td className="px-3 py-2 text-right">
                    {p.margemPct != null ? (
                      <Badge color={FAIXA_CORES[faixaDaMargem(p.margemPct)]}>
                        {(p.margemPct * 100).toFixed(1)}%
                      </Badge>
                    ) : (
                      <span className="text-xs text-muted">—</span>
                    )}
                  </td>
                )}
                <td className="px-3 py-2">
                  <div className="flex items-center justify-end gap-2">
                    {ehPedido && p.tipo === "PEDIDO" && (
                      <button
                        onClick={() => fecharNegocioDaLinha(p)}
                        disabled={pendente}
                        className="flex items-center gap-1.5 rounded border border-blue-500/40 bg-blue-500/10 px-2 py-1 text-xs text-blue-400 hover:bg-blue-500/20"
                      >
                        <FileSignature size={14} /> Gerar pedido
                      </button>
                    )}
                    {!ehPedido && p.statusMargem === "AGUARDANDO_APROVACAO" && (
                      <span
                        title="Este pedido fechou com margem abaixo de 27% e aguarda aprovação do gestor."
                        className="flex items-center gap-1.5 rounded border border-amber-400/40 bg-amber-400/10 px-2 py-1 text-xs text-amber-400"
                      >
                        <ShieldAlert size={14} /> Solicitar autorização do gestor
                      </span>
                    )}
                    {!ehPedido && margemRecusada(p) && (
                      <span
                        title="O gestor recusou a margem deste pedido. Edite e corrija o preço/produto antes de reenviar."
                        className="flex items-center gap-1.5 rounded border border-danger/40 bg-danger/10 px-2 py-1 text-xs text-danger-ink"
                      >
                        <ShieldAlert size={14} /> Corrija a margem
                      </span>
                    )}
                    {/* Envio pro D4Sign ja acontece sozinho ao liberar o pedido (ver
                        enviarSeLiberado em lib/servicos/propostas.ts) — este botao so
                        aparece quando isso falhou (NAO_ENVIADA apesar de ja liberado),
                        como fallback manual. Sempre clicavel — o aviso de cadastro
                        incompleto aparece dentro do modal, nao aqui (ver
                        EnviarAssinaturaModal). Nunca aparece com margem pendente/recusada
                        — nao da pra escapar da aprovacao do gestor enviando por fora. */}
                    {!ehPedido &&
                      financeiro &&
                      p.statusMargem !== "AGUARDANDO_APROVACAO" &&
                      !margemRecusada(p) &&
                      p.statusAssinatura === "NAO_ENVIADA" && (
                        <button
                          onClick={() => enviarParaAssinatura(p)}
                          disabled={pendente}
                          title="O envio automático falhou — tente novamente."
                          className="flex items-center gap-1.5 rounded border border-accent/40 bg-accent/10 px-2 py-1 text-xs text-accent hover:bg-accent/20"
                        >
                          <FileSignature size={14} /> Enviar para assinatura
                        </button>
                      )}
                    <MenuAcoes
                      desabilitado={pendente}
                      acoes={
                        ehPedido
                          ? [
                              {
                                rotulo: "Baixar PDF",
                                icone: <FileText size={14} />,
                                aoClicar: () => baixarPdf(p),
                              },
                              {
                                rotulo: "Editar",
                                icone: <Pencil size={14} />,
                                aoClicar: () => setEditando(p),
                              },
                              {
                                rotulo: ehAdmin ? "Excluir" : "Cancelar",
                                icone: <Trash2 size={14} />,
                                aoClicar: () => excluir(p),
                                perigosa: true,
                              },
                            ]
                          : [
                              // Aceita/Recusada sincronizam sozinhas com a assinatura do cliente
              // (D4Sign); nao ha troca manual de status — pedido so e cancelado.
                              ...(financeiro &&
                              p.statusAssinatura !== "ASSINADA" &&
                              p.statusMargem !== "AGUARDANDO_APROVACAO" &&
                              !margemRecusada(p)
                                ? [
                                    {
                                      rotulo: "Importar contrato assinado",
                                      icone: <Upload size={14} />,
                                      aoClicar: () => importarContrato(p),
                                    },
                                  ]
                                : []),
                              {
                                rotulo: "Baixar PDF",
                                icone: <FileText size={14} />,
                                aoClicar: () => baixarPdf(p),
                              },
                              {
                                rotulo: "Editar",
                                icone: <Pencil size={14} />,
                                aoClicar: () => setEditando(p),
                              },
                              {
                                rotulo: "Cancelar",
                                icone: <Trash2 size={14} />,
                                aoClicar: () => excluir(p),
                                desabilitada: p.status === "ACEITA" || p.status === "CANCELADA",
                                perigosa: true,
                              },
                            ]
                      }
                    />
                  </div>
                </td>
              </tr>
            ))}
            {filtradas.length === 0 && (
              <tr>
                <td
                  colSpan={(ehAdmin ? 8 : 7) + 1}
                  className="px-3 py-8 text-center text-muted"
                ><p className="sticky left-3 max-w-[calc(100vw-4rem)] whitespace-normal md:max-w-[calc(100vw-20rem)]">{propostas.length > 0 ? "Nenhum resultado com esses filtros. Altere a busca ou os filtros." : ehPedido ? 'Nenhum orçamento nesta safra. Use "Novo orçamento" para começar.' : 'Nenhum pedido nesta safra. Use "Gerar pedido" para selecionar um orçamento.'}</p></td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {criando && ehPedido && (
        <OrcamentoWizard
          clientes={clientes}
          produtos={produtos}
          consultores={consultores}
          vendasAbertas={vendasAbertas}
          ehAdmin={ehAdmin}
          aoFechar={() => setCriando(false)}
        />
      )}

      {previaPdf && (
        <PreviaPdfModal
          url={previaPdf.url}
          titulo={previaPdf.titulo}
          nomeArquivo={previaPdf.nomeArquivo}
          aoFechar={fecharPreviaPdf}
        />
      )}

      {editando && (
        <OrcamentoWizard
          proposta={editando}
          tipoProposta={editando.tipo}
          clientes={clientes}
          produtos={produtos}
          consultores={consultores}
          vendasAbertas={vendasAbertas}
          ehAdmin={ehAdmin}
          aoFechar={() => setEditando(null)}
        />
      )}

      {escolhendoOrcamento && (
        <SeletorOrcamentoModal
          orcamentos={orcamentosDisponiveis}
          pendente={pendente}
          erro={erro}
          aoEscolher={promoverOrcamento}
          aoFechar={() => setEscolhendoOrcamento(false)}
        />
      )}

      {enviandoAssinatura && (
        <EnviarAssinaturaModal
          propostaId={enviandoAssinatura.id}
          pendente={pendente}
          erro={erroAssinatura}
          aoConfirmar={confirmarEnvioAssinatura}
          aoFechar={() => setEnviandoAssinatura(null)}
        />
      )}

      {importandoContrato && (
        <ImportarContratoModal
          codigo={numeroDocumento(importandoContrato.tipo, importandoContrato.numero)}
          clienteNome={importandoContrato.clienteNome}
          pendente={pendente}
          erro={erroImportarContrato}
          aoConfirmar={confirmarImportarContrato}
          aoFechar={() => setImportandoContrato(null)}
        />
      )}
    </div>
  );
}
