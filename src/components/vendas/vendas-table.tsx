"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  Download,
  Upload,
  Plus,
  Copy,
  Trash2,
  Pencil,
  Check,
  X,
  FileText,
} from "lucide-react";
import { useRouter } from "next/navigation";
import {
  atualizarVenda,
  criarVenda,
  duplicarVendas,
  excluirVenda,
  excluirVendas,
  transferirConsultorVendas,
  transferirSafraVendas,
  transferirStatusVendas,
  type VendaInput,
} from "@/app/actions/vendas";
import {
  STATUS_CORES,
  STATUS_LABELS,
  STATUS_ORDEM,
  STATUS_EDITAVEL_MANUAL,
  CULTURAS,
  fmtBRL,
  fmtData,
  fmtNum,
  type Status,
} from "@/lib/format";
import dynamic from "next/dynamic";
import { ComboBox, type ComboBoxOpcao } from "@/components/ui/combo-box";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { baixarCSV } from "@/lib/csv";
import type {
  ClienteOpcao,
  ConsultorOpcao,
  ProdutoOpcao,
  SafraOpcao,
  VendaLinha,
} from "@/components/vendas/tipos";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Paginacao, usePaginacao } from "@/components/ui/paginacao";
import { FiltroColunaExcel } from "@/components/ui/filtro-coluna-excel";
import { MenuAcoes } from "@/components/ui/menu-acoes";
import { OrcamentoWizard } from "@/components/propostas/orcamento-wizard";
import { PrecosProduto } from "@/components/produtos/precos-produto";
import { LimitesDePreco } from "@/components/ui/limites-de-preco";
import { PreviaPdfModal } from "@/components/ui/previa-pdf-modal";
import { precoDeVendaDoProduto, type CondicaoPagamentoTipo } from "@/lib/margem";
import type { PropostaLinha, VendaOpcaoProposta } from "@/components/propostas/tipos";
import { carregarPropostaParaEdicao, visualizarPdfProposta } from "@/app/actions/propostas";
import { DateInput } from "@/components/ui/date-input";

// Só baixa o modal (e a lib xlsx, ~400 KB) quando o usuário clica em importar.
const ImportarModal = dynamic(() =>
  import("@/components/vendas/importar-modal").then((m) => m.ImportarModal)
);

const inputCls =
  "rounded-lg border border-surface-border bg-zinc-800 px-3 py-1.5 text-sm text-white outline-none focus:border-accent";

// Popup ao passar o mouse no status, com o orcamento/pedido que gerou essa
// venda — mesmo padrao de NomeProdutoComCusto abaixo (position:fixed, o
// container da tabela corta overflow absolute/relative).
function BadgeStatus({
  status,
  documentoOrigem,
}: {
  status: Status;
  documentoOrigem?: VendaLinha["documentoOrigem"];
}) {
  const [aberto, setAberto] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const spanRef = useRef<HTMLSpanElement>(null);

  if (!documentoOrigem) {
    return <Badge color={STATUS_CORES[status]}>{STATUS_LABELS[status]}</Badge>;
  }

  function aoEntrar() {
    const r = spanRef.current?.getBoundingClientRect();
    if (r) setPos({ top: r.bottom + 4, left: r.left });
    setAberto(true);
  }

  return (
    <span ref={spanRef} className="inline-block" onMouseEnter={aoEntrar} onMouseLeave={() => setAberto(false)}>
      <Badge color={STATUS_CORES[status]}>{STATUS_LABELS[status]}</Badge>
      {aberto && (
        <span
          style={{ top: pos.top, left: pos.left }}
          className="pointer-events-none fixed z-[1400] block w-max min-w-40 rounded-lg border border-surface-border bg-zinc-800 px-3 py-2 text-xs normal-case text-zinc-200 shadow-xl"
        >
          <span className="font-semibold text-white">{documentoOrigem.numero}</span>
          <br />
          {documentoOrigem.clienteNome}
        </span>
      )}
    </span>
  );
}

// Popup ao passar o mouse no nome do produto, com o custo cadastrado (a
// vista/a prazo) — sempre aparece, com "—" quando o produto nao tem custo
// cadastrado. Usa position:fixed com coordenadas calculadas do elemento: o
// container da tabela tem overflow-x-auto, que corta qualquer overflow
// posicionado com position:absolute/relative dentro dele (inclusive no eixo
// vertical) — mesmo problema corrigido no FiltroColunaExcel.
function NomeProdutoComCusto({
  nome,
  produto,
}: {
  nome: string;
  produto: ProdutoOpcao | undefined;
}) {
  const [aberto, setAberto] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const spanRef = useRef<HTMLSpanElement>(null);

  function aoEntrar() {
    const r = spanRef.current?.getBoundingClientRect();
    if (r) setPos({ top: r.bottom + 4, left: r.left });
    setAberto(true);
  }

  return (
    <span
      ref={spanRef}
      className="block truncate"
      onMouseEnter={aoEntrar}
      onMouseLeave={() => setAberto(false)}
    >
      {nome}
      {aberto && (
        <span
          style={{ top: pos.top, left: pos.left }}
          className="pointer-events-none fixed z-[1400] block w-max min-w-40 rounded-lg border border-surface-border bg-zinc-800 px-3 py-2 text-xs normal-case shadow-xl"
        >
          <PrecosProduto avista={produto?.custoAvista} aprazo={produto?.custoAprazo} />
        </span>
      )}
    </span>
  );
}

// Total (volume x valor unitario) calculado ao vivo a partir dos campos de texto.
function totalDaLinha(volume: string, valorUnitario: string): number | null {
  const v = parseFloat(volume.replace(",", "."));
  const u = parseFloat(valorUnitario.replace(",", "."));
  return Number.isFinite(v) && Number.isFinite(u) && v > 0 && u >= 0 ? v * u : null;
}

type LinhaForm = {
  clienteId: string;
  fornecedorId: string;
  produtoId: string;
  consultorId: string;
  cultura: string;
  volume: string;
  condicaoPagamentoTipo: CondicaoPagamentoTipo;
  valorUnitario: string;
  status: Status;
  dataFechamento: string;
  previsaoEntrega: string;
};

const LINHA_NOVA_VAZIA: LinhaForm = {
  clienteId: "",
  fornecedorId: "",
  produtoId: "",
  consultorId: "",
  cultura: "",
  volume: "",
  condicaoPagamentoTipo: "AVISTA",
  valorUnitario: "",
  status: "PROSPECCAO",
  dataFechamento: "",
  previsaoEntrega: "",
};

export function VendasTable({
  vendas,
  clientes,
  produtos,
  consultores,
  ehAdmin,
  safras,
}: {
  vendas: VendaLinha[];
  clientes: ClienteOpcao[];
  produtos: ProdutoOpcao[];
  consultores: ConsultorOpcao[];
  ehAdmin: boolean;
  safras: SafraOpcao[];
}) {
  const [busca, setBusca] = useState("");
  // Filtros estilo Excel no header de cada coluna — vazio (Set sem itens) = todos.
  const [filtroStatusIds, setFiltroStatusIds] = useState<Set<string>>(new Set());
  const [filtroFornecedorIds, setFiltroFornecedorIds] = useState<Set<string>>(new Set());
  const [filtroConsultorIds, setFiltroConsultorIds] = useState<Set<string>>(new Set());
  const [filtroClienteIds, setFiltroClienteIds] = useState<Set<string>>(new Set());
  const [filtroProdutoIds, setFiltroProdutoIds] = useState<Set<string>>(new Set());
  const [filtroCulturaIds, setFiltroCulturaIds] = useState<Set<string>>(new Set());
  const [importando, setImportando] = useState(false);
  const [pendente, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const router = useRouter();
  const { confirmar } = useConfirm();

  // Cada venda selecionada vira um item do orcamento, ligado a ela. Abre o
  // wizard de orcamento ali mesmo em Vendas (sem navegar) ja no passo de
  // revisao — a venda so muda pra Negociacao quando o usuario de fato
  // confirmar "Gerar orcamento"/"Fechar negocio" dentro do wizard, nunca so
  // por selecionar/clicar aqui.
  const [abrindoOrcamento, setAbrindoOrcamento] = useState<VendaOpcaoProposta[] | null>(null);
  const [editandoDocumento, setEditandoDocumento] = useState<PropostaLinha | null>(null);

  function gerarPedido(ids: string[]) {
    setErro(null);
    const vendasEscolhidas = vendas.filter((v) => ids.includes(v.id));
    if (vendasEscolhidas.length === 0) return;
    if (new Set(vendasEscolhidas.map((v) => v.clienteId)).size > 1) {
      setErro("Selecione vendas de um único cliente.");
      return;
    }
    if (new Set(vendasEscolhidas.map((v) => v.consultorId)).size > 1) {
      setErro("Selecione vendas de um único consultor.");
      return;
    }
    setAbrindoOrcamento(
      vendasEscolhidas.map((v) => ({
        id: v.id,
        clienteId: v.clienteId,
        consultorId: v.consultorId,
        produtoId: v.produtoId,
        produtoNome: v.produtoNome,
        fornecedorNome: v.fornecedorNome,
        cultura: v.cultura,
        volume: v.volume,
        condicaoPagamentoTipo: v.condicaoPagamentoTipo,
        valorUnitario: v.valorUnitario,
        valorTotal: v.valorTotal,
      }))
    );
  }

  // Abre o mesmo editor das telas de Pedidos/Orcamentos, aqui na lista de vendas.
  function abrirEdicaoDocumento(id: string) {
    setErro(null);
    startTransition(async () => {
      const resultado = await carregarPropostaParaEdicao(id);
      if (!resultado.ok) {
        setErro(resultado.erro);
        return;
      }
      setEditandoDocumento(resultado.proposta);
    });
  }

  // Mesmo download da tela de Pedidos: abre o PDF numa nova aba.
  const [previaPdf, setPreviaPdf] = useState<{ url: string; titulo: string; nomeArquivo: string } | null>(null);
  function fecharPreviaPdf() {
    if (previaPdf) URL.revokeObjectURL(previaPdf.url);
    setPreviaPdf(null);
  }

  // Mostra o PDF do documento dentro do site (sem abrir outra aba).
  function baixarPdfDocumento(id: string, titulo: string) {
    setErro(null);
    startTransition(async () => {
      try {
        const resposta = await fetch(`/propostas/${id}/pdf`);
        if (!resposta.ok) {
          setErro((await resposta.text()) || "Não foi possível gerar o PDF.");
          return;
        }
        const url = URL.createObjectURL(await resposta.blob());
        setPreviaPdf((atual) => {
          if (atual) URL.revokeObjectURL(atual.url);
          return { url, titulo, nomeArquivo: `${titulo.toLowerCase().replace(/\s+/g, "-")}.pdf` };
        });
      } catch {
        setErro("Não foi possível gerar o PDF.");
      }
    });
  }

  // Venda finalizada sem pedido (veio de importacao): monta o PDF so pra
  // consulta a partir dos dados da propria venda, sem criar nada.
  function verPedidoDaVenda(v: VendaLinha) {
    setErro(null);
    startTransition(async () => {
      const resultado = await visualizarPdfProposta(
        {
          clienteId: v.clienteId,
          consultorId: v.consultorId,
          dataFaturamento: v.dataFechamento?.slice(0, 10) ?? null,
          previsaoEntrega: v.previsaoEntrega?.slice(0, 10) ?? null,
          condicaoPagamento: v.condicaoPagamentoTipo === "AVISTA" ? "À vista" : null,
          condicaoPagamentoTipo: v.condicaoPagamentoTipo,
          observacoes: v.observacoes,
          itens: [
            {
              produtoId: v.produtoId,
              vendaId: v.id,
              cultura: v.cultura,
              volume: v.volume,
              condicaoPagamentoTipo: v.condicaoPagamentoTipo,
              valorUnitario: v.valorUnitario,
            },
          ],
        },
        "PROPOSTA",
        null
      );
      if (!resultado.ok) {
        setErro(resultado.erro);
        return;
      }
      const bytes = Uint8Array.from(atob(resultado.base64), (c) => c.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
      const titulo = `Pedido — ${v.clienteNome}`;
      setPreviaPdf((atual) => {
        if (atual) URL.revokeObjectURL(atual.url);
        return { url, titulo, nomeArquivo: "pedido.pdf" };
      });
    });
  }

  function aoFecharEdicaoDocumento() {
    setEditandoDocumento(null);
    router.refresh();
  }

  function aoFecharOrcamento() {
    setAbrindoOrcamento(null);
    setSelecionadas(new Set());
    router.refresh();
  }

  const [linhaEditando, setLinhaEditando] = useState<string | null>(null);
  const [rascunho, setRascunho] = useState<LinhaForm | null>(null);
  const [selecionadas, setSelecionadas] = useState<Set<string>>(new Set());
  const [criandoLinha, setCriandoLinha] = useState(false);
  const [linhaNova, setLinhaNova] = useState<LinhaForm>(LINHA_NOVA_VAZIA);

  useEffect(() => {
    if (!criandoLinha) return;
    document
      .getElementById("linha-nova-venda")
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
    document.getElementById("linha-nova-cliente")?.querySelector("input")?.focus();
  }, [criandoLinha]);
  const [acaoMassa, setAcaoMassa] = useState<
    "" | "safra" | "consultor" | "status"
  >("");
  const [valorAcaoMassa, setValorAcaoMassa] = useState("");

  // Lista completa de consultores cadastrados (nao so quem ja tem venda
  // lancada nesta safra) — senao o filtro perde quem ainda nao vendeu nela.
  // Filtra por id pelo mesmo motivo do fornecedor acima.
  const opcoesConsultoresFiltro: ComboBoxOpcao[] = useMemo(
    () =>
      [...consultores]
        .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))
        .map((c) => ({ id: c.id, label: c.nome })),
    [consultores]
  );

  const produtosPorFornecedor = useMemo(() => {
    const grupos = new Map<string, ProdutoOpcao[]>();
    for (const p of produtos) {
      const lista = grupos.get(p.fornecedorNome) ?? [];
      lista.push(p);
      grupos.set(p.fornecedorNome, lista);
    }
    return [...grupos.entries()];
  }, [produtos]);

  const produtosPorId = useMemo(() => new Map(produtos.map((p) => [p.id, p])), [produtos]);

  const opcoesClientes: ComboBoxOpcao[] = useMemo(
    () => clientes.map((c) => ({ id: c.id, label: c.nome.toUpperCase() })),
    [clientes]
  );
  const opcoesFiltroCliente = useMemo(
    () => [...opcoesClientes].sort((a, b) => a.label.localeCompare(b.label, "pt-BR")),
    [opcoesClientes]
  );
  const opcoesProdutos: ComboBoxOpcao[] = useMemo(
    () =>
      [...produtosPorFornecedor]
        .sort(([a], [b]) => a.localeCompare(b))
        .flatMap(([fornecedor, lista]) =>
          lista.map((p) => ({
            id: p.id,
            label: p.nome.toUpperCase(),
            grupo: fornecedor.toUpperCase(),
          }))
        ),
    [produtosPorFornecedor]
  );

  const fornecedoresLista = useMemo(() => {
    const mapa = new Map<string, string>();
    for (const p of produtos) mapa.set(p.fornecedorId, p.fornecedorNome);
    return [...mapa.entries()]
      .map(([id, nome]) => ({ id, nome }))
      .sort((a, b) => a.nome.localeCompare(b.nome));
  }, [produtos]);

  const opcoesFornecedores: ComboBoxOpcao[] = useMemo(
    () =>
      fornecedoresLista.map((f) => ({ id: f.id, label: f.nome.toUpperCase() })),
    [fornecedoresLista]
  );

  function produtosDoFornecedor(fornecedorId: string): ComboBoxOpcao[] {
    return produtos
      .filter((p) => p.fornecedorId === fornecedorId)
      .map((p) => ({ id: p.id, label: p.nome.toUpperCase() }));
  }

  function fornecedorIdDoProduto(produtoId: string): string {
    return produtos.find((p) => p.id === produtoId)?.fornecedorId ?? "";
  }

  const opcoesCultura: ComboBoxOpcao[] = useMemo(
    () => [
      { id: "", label: "Sem cultura" },
      ...CULTURAS.map((c) => ({ id: c, label: c })),
    ],
    []
  );
  // Editar uma venda existente nao mexe em status: e' so leitura (BadgeStatus
  // mais abaixo), avanca sozinho pelos fluxos automaticos (fechar negocio,
  // conferencia final, Financeiro). Criar venda nova continua com todas as
  // opcoes (opcoesStatusCriacao): pode nascer ja num estagio avancado, por
  // exemplo importando historico.
  const opcoesStatusCriacao: ComboBoxOpcao[] = useMemo(
    () => STATUS_ORDEM.map((s) => ({ id: s, label: STATUS_LABELS[s] })),
    []
  );
  const opcoesConsultores: ComboBoxOpcao[] = useMemo(
    () => consultores.map((c) => ({ id: c.id, label: c.nome.toUpperCase() })),
    [consultores]
  );

  const filtradas = useMemo(() => {
    const termo = busca.toLowerCase();
    return vendas.filter((v) => {
      if (
        termo &&
        !v.clienteNome.toLowerCase().includes(termo) &&
        !v.produtoNome.toLowerCase().includes(termo) &&
        !(v.cultura ?? "").toLowerCase().includes(termo)
      )
        return false;
      if (filtroStatusIds.size > 0 && !filtroStatusIds.has(v.status)) return false;
      if (filtroFornecedorIds.size > 0 && !filtroFornecedorIds.has(v.fornecedorId)) return false;
      if (filtroConsultorIds.size > 0 && !filtroConsultorIds.has(v.consultorId)) return false;
      if (filtroClienteIds.size > 0 && !filtroClienteIds.has(v.clienteId)) return false;
      if (filtroProdutoIds.size > 0 && !filtroProdutoIds.has(v.produtoId)) return false;
      if (filtroCulturaIds.size > 0 && !filtroCulturaIds.has(v.cultura ?? "")) return false;
      return true;
    });
  }, [
    vendas,
    busca,
    filtroStatusIds,
    filtroFornecedorIds,
    filtroConsultorIds,
    filtroClienteIds,
    filtroProdutoIds,
    filtroCulturaIds,
  ]);

  const paginacao = usePaginacao(
    filtradas,
    [
      busca,
      [...filtroStatusIds].join(","),
      [...filtroFornecedorIds].join(","),
      [...filtroConsultorIds].join(","),
      [...filtroClienteIds].join(","),
      [...filtroProdutoIds].join(","),
      [...filtroCulturaIds].join(","),
    ].join("|")
  );

  const totalFiltrado = useMemo(
    () => filtradas.reduce((soma, v) => soma + v.valorTotal, 0),
    [filtradas]
  );

  function exportar() {
    baixarCSV(
      "vendas-rede-agro.csv",
      [
        "Consultor",
        "Cliente",
        "Fornecedor",
        "Produto",
        "Cultura",
        "Volume",
        "Valor unitário",
        "Total",
        "Status",
        "Data fechamento",
        "Previsão de entrega",
        "Observações",
      ],
      filtradas.map((v) => [
        v.consultorNome,
        v.clienteNome,
        v.fornecedorNome,
        v.produtoNome,
        v.cultura ?? "",
        v.volume != null ? String(v.volume).replace(".", ",") : "",
        v.valorUnitario != null
          ? String(v.valorUnitario).replace(".", ",")
          : "",
        String(v.valorTotal).replace(".", ","),
        STATUS_LABELS[v.status],
        fmtData(v.dataFechamento) === "—" ? "" : fmtData(v.dataFechamento),
        fmtData(v.previsaoEntrega) === "—" ? "" : fmtData(v.previsaoEntrega),
        v.observacoes ?? "",
      ])
    );
  }

  async function excluir(venda: VendaLinha) {
    const finalizada = venda.status === "EM_CARTEIRA" || venda.status === "FATURADO";
    const mensagem = ehAdmin && !finalizada
      ? `Excluir a venda de ${venda.produtoNome} para ${venda.clienteNome}?`
      : `Cancelar a venda de ${venda.produtoNome} para ${venda.clienteNome}?`;
    if (!(await confirmar({ mensagem, confirmarLabel: ehAdmin && !finalizada ? "Excluir venda" : "Cancelar venda", variante: "perigo" }))) return;
    setErro(null);
    startTransition(async () => {
      const resultado = await excluirVenda(venda.id);
      if (!resultado.ok) setErro(resultado.erro);
    });
  }

  function iniciarEdicao(venda: VendaLinha) {
    setErro(null);
    setLinhaEditando(venda.id);
    setRascunho({
      clienteId: venda.clienteId,
      fornecedorId: fornecedorIdDoProduto(venda.produtoId),
      produtoId: venda.produtoId,
      consultorId: venda.consultorId,
      cultura: venda.cultura ?? "",
      volume: venda.volume != null ? String(venda.volume).replace(".", ",") : "",
      condicaoPagamentoTipo: venda.condicaoPagamentoTipo,
      valorUnitario:
        venda.valorUnitario != null
          ? String(venda.valorUnitario).replace(".", ",")
          : "",
      status: venda.status,
      dataFechamento: venda.dataFechamento?.slice(0, 10) ?? "",
      previsaoEntrega: venda.previsaoEntrega?.slice(0, 10) ?? "",
    });
  }

  function cancelarEdicao() {
    setLinhaEditando(null);
    setRascunho(null);
  }

  function atualizarRascunho(patch: Partial<LinhaForm>) {
    setRascunho((atual) => (atual ? { ...atual, ...patch } : atual));
  }

  function salvarEdicao(venda: VendaLinha) {
    if (!rascunho) return;
    setErro(null);
    const input: VendaInput = {
      clienteId: rascunho.clienteId,
      produtoId: rascunho.produtoId,
      consultorId: rascunho.consultorId || undefined,
      cultura: rascunho.cultura || null,
      volume: rascunho.volume
        ? parseFloat(rascunho.volume.replace(",", "."))
        : null,
      condicaoPagamentoTipo: rascunho.condicaoPagamentoTipo,
      valorUnitario: rascunho.valorUnitario
        ? parseFloat(rascunho.valorUnitario.replace(",", "."))
        : null,
      status: rascunho.status,
      dataFechamento: rascunho.dataFechamento || null,
      previsaoEntrega: rascunho.previsaoEntrega || null,
      observacoes: venda.observacoes,
    };
    startTransition(async () => {
      const resultado = await atualizarVenda(venda.id, input);
      if (!resultado.ok) setErro(resultado.erro);
      else {
        setLinhaEditando(null);
        setRascunho(null);
      }
    });
  }

  function alternarSelecao(id: string) {
    setSelecionadas((atual) => {
      const novo = new Set(atual);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  }

  function alternarSelecaoTodas() {
    setSelecionadas((atual) =>
      atual.size === filtradas.length
        ? new Set()
        : new Set(filtradas.map((v) => v.id))
    );
  }

  function executarAcaoMassa() {
    const ids = [...selecionadas];
    if (ids.length === 0) return;
    setErro(null);
    startTransition(async () => {
      let resultado;
      if (acaoMassa === "safra") {
        if (!valorAcaoMassa) return;
        resultado = await transferirSafraVendas(ids, valorAcaoMassa);
      } else if (acaoMassa === "consultor") {
        if (!valorAcaoMassa) return;
        resultado = await transferirConsultorVendas(ids, valorAcaoMassa);
      } else if (acaoMassa === "status") {
        if (!valorAcaoMassa) return;
        resultado = await transferirStatusVendas(ids, valorAcaoMassa as Status);
      } else {
        return;
      }
      if (!resultado.ok) setErro(resultado.erro);
      else {
        setSelecionadas(new Set());
        setAcaoMassa("");
        setValorAcaoMassa("");
      }
    });
  }

  function duplicar() {
    const ids = [...selecionadas];
    if (ids.length === 0) return;
    setErro(null);
    startTransition(async () => {
      const resultado = await duplicarVendas(ids);
      if (!resultado.ok) setErro(resultado.erro);
      else setSelecionadas(new Set());
    });
  }

  async function excluirSelecionadas() {
    const ids = [...selecionadas];
    if (ids.length === 0) return;
    const temFinalizada = vendas.some((v) => ids.includes(v.id) && (v.status === "EM_CARTEIRA" || v.status === "FATURADO"));
    const mensagem = ehAdmin && !temFinalizada
      ? `Excluir ${ids.length} ${ids.length === 1 ? "venda selecionada" : "vendas selecionadas"}? Esta ação não pode ser desfeita.`
      : `Cancelar ${ids.length} ${ids.length === 1 ? "venda selecionada" : "vendas selecionadas"}?`;
    if (!(await confirmar({ mensagem, confirmarLabel: ehAdmin && !temFinalizada ? "Excluir vendas" : "Cancelar vendas", variante: "perigo" }))) return;
    setErro(null);
    startTransition(async () => {
      const resultado = await excluirVendas(ids);
      if (!resultado.ok) setErro(resultado.erro);
      else setSelecionadas(new Set());
    });
  }

  function atualizarLinhaNova(patch: Partial<LinhaForm>) {
    setLinhaNova((atual) => ({ ...atual, ...patch }));
  }

  // So preenche o campo — nao salva sozinho. Cliente/produto escolhidos no
  // ComboBox usam isso tambem (nao mais tentarCriarLinhaNova), senao a linha
  // salva cedo demais (so com cliente+produto) e some da posicao de "nova
  // linha" antes do usuario terminar de preencher volume/valor.
  function confirmarLinhaNova() {
    if (!linhaNova.clienteId || !linhaNova.produtoId) {
      setErro("Selecione cliente e produto antes de salvar.");
      return;
    }
    setErro(null);
    startTransition(async () => {
      const input: VendaInput = {
        clienteId: linhaNova.clienteId,
        produtoId: linhaNova.produtoId,
        consultorId: linhaNova.consultorId || undefined,
        cultura: linhaNova.cultura || null,
        volume: linhaNova.volume ? parseFloat(linhaNova.volume.replace(",", ".")) : null,
        condicaoPagamentoTipo: linhaNova.condicaoPagamentoTipo,
        valorUnitario: linhaNova.valorUnitario
          ? parseFloat(linhaNova.valorUnitario.replace(",", "."))
          : null,
        status: linhaNova.status,
        dataFechamento: linhaNova.dataFechamento || null,
        previsaoEntrega: linhaNova.previsaoEntrega || null,
        observacoes: null,
      };
      const resultado = await criarVenda(input);
      if (!resultado.ok) setErro(resultado.erro);
      else {
        setLinhaNova(LINHA_NOVA_VAZIA);
        setCriandoLinha(false);
      }
    });
  }

  const colspan = (ehAdmin ? 12 : 11) + 2;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Plano de vendas</h1>
          <p className="text-sm text-muted">
            {fmtNum(filtradas.length)} lançamentos — total{" "}
            <span className="font-semibold text-accent">
              {fmtBRL(totalFiltrado)}
            </span>
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={exportar}>
            <Download size={14} /> Exportar CSV
          </Button>
          <Button variant="secondary" onClick={() => setImportando(true)}>
            <Upload size={14} /> Importar Excel
          </Button>
          <Button variant="primary" onClick={() => setCriandoLinha(true)}>
            <Plus size={14} /> Nova venda
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <input
          type="text"
          placeholder="Buscar cliente, produto ou cultura..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className={`${inputCls} w-72`}
        />
      </div>

      {selecionadas.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-accent/40 bg-accent/10 px-3 py-2">
          <span className="text-sm font-medium text-accent">
            {selecionadas.size} {selecionadas.size === 1 ? "venda selecionada" : "vendas selecionadas"}
          </span>
          <Button variant="secondary" size="sm" onClick={duplicar} disabled={pendente}>
            <Copy size={13} /> Duplicar
          </Button>
          <select
            value={acaoMassa}
            onChange={(e) => {
              setAcaoMassa(e.target.value as typeof acaoMassa);
              setValorAcaoMassa("");
            }}
            className={inputCls}
          >
            <option value="">Transferir para...</option>
            <option value="safra">Safra</option>
            {ehAdmin && <option value="consultor">Consultor</option>}
            <option value="status">Status</option>
          </select>
          {acaoMassa === "safra" && (
            <select
              value={valorAcaoMassa}
              onChange={(e) => setValorAcaoMassa(e.target.value)}
              className={inputCls}
            >
              <option value="">Selecione</option>
              {safras.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nome}
                </option>
              ))}
            </select>
          )}
          {acaoMassa === "consultor" && (
            <ComboBox
              opcoes={opcoesConsultores}
              valor={valorAcaoMassa}
              placeholder="Selecione"
              onSelecionar={setValorAcaoMassa}
            />
          )}
          {acaoMassa === "status" && (
            <select
              value={valorAcaoMassa}
              onChange={(e) => setValorAcaoMassa(e.target.value)}
              className={inputCls}
            >
              <option value="">Selecione</option>
              {STATUS_EDITAVEL_MANUAL.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          )}
          {acaoMassa && (
            <Button
              variant="primary"
              size="sm"
              onClick={executarAcaoMassa}
              disabled={pendente || !valorAcaoMassa}
            >
              Aplicar
            </Button>
          )}
          <Button
            variant="secondary"
            size="sm"
            onClick={() => gerarPedido([...selecionadas])}
            disabled={pendente}
          >
            <FileText size={13} /> Gerar orçamento
          </Button>
          <Button variant="danger" size="sm" onClick={excluirSelecionadas} disabled={pendente}>
            <Trash2 size={13} /> {ehAdmin ? "Excluir selecionadas" : "Cancelar selecionadas"}
          </Button>
          <button
            onClick={() => setSelecionadas(new Set())}
            className="ml-auto text-sm text-secondary hover:text-white"
          >
            Limpar seleção
          </button>
        </div>
      )}

      {erro && (
        <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-red-400">
          {erro}
        </p>
      )}

      <div className="tabela-fixa overflow-x-auto rounded-xl border border-surface-border">
        <table className="w-full min-w-[980px] table-fixed text-sm">
          <thead>
            <tr className="border-b border-surface-border bg-zinc-900 text-left text-xs font-medium text-muted">
              <th className="w-[3%] px-3 py-2.5">
                <input
                  type="checkbox"
                  aria-label="Selecionar todas as vendas dos filtros atuais"
                  checked={
                    filtradas.length > 0 &&
                    selecionadas.size === filtradas.length
                  }
                  onChange={alternarSelecaoTodas}
                />
              </th>
              {ehAdmin && (
                <th className="w-[9%] px-3 py-2.5">
                  Consultor
                  <FiltroColunaExcel
                    rotulo="consultor"
                    opcoes={opcoesConsultoresFiltro}
                    selecionados={filtroConsultorIds}
                    onMudar={setFiltroConsultorIds}
                  />
                </th>
              )}
              <th className="w-[16%] px-3 py-2.5">
                Cliente
                <FiltroColunaExcel
                  rotulo="cliente"
                  opcoes={opcoesFiltroCliente}
                  selecionados={filtroClienteIds}
                  onMudar={setFiltroClienteIds}
                />
              </th>
              <th className="w-[9%] px-3 py-2.5">
                Fornecedor
                <FiltroColunaExcel
                  rotulo="fornecedor"
                  opcoes={opcoesFornecedores}
                  selecionados={filtroFornecedorIds}
                  onMudar={setFiltroFornecedorIds}
                />
              </th>
              <th className="w-[11%] px-3 py-2.5">
                Produto
                <FiltroColunaExcel
                  rotulo="produto"
                  opcoes={opcoesProdutos}
                  selecionados={filtroProdutoIds}
                  onMudar={setFiltroProdutoIds}
                />
              </th>
              <th className="w-[7%] px-3 py-2.5">
                Cultura
                <FiltroColunaExcel
                  rotulo="cultura"
                  opcoes={opcoesCultura}
                  selecionados={filtroCulturaIds}
                  onMudar={setFiltroCulturaIds}
                />
              </th>
              <th className="w-[6%] px-3 py-2.5 text-right">Volume</th>
              <th className="w-[6%] px-3 py-2.5">Pagamento</th>
              <th className="w-[7%] px-3 py-2.5 text-right">Valor unitário</th>
              <th className="w-[8%] px-3 py-2.5 text-right">Total</th>
              <th className="w-[9%] px-3 py-2.5">
                Status
                <FiltroColunaExcel
                  rotulo="status"
                  opcoes={opcoesStatusCriacao}
                  selecionados={filtroStatusIds}
                  onMudar={setFiltroStatusIds}
                />
              </th>
              <th className="w-[8%] px-3 py-2.5">Fechamento</th>
              <th className="w-[8%] px-3 py-2.5">Entrega</th>
              <th className="w-[6%] px-3 py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {criandoLinha && (
            <tr id="linha-nova-venda" className="border-b border-surface-border bg-zinc-900/40">
              <td className="px-3 py-2 text-subtle">+</td>
              {ehAdmin && (
                <td className="px-3 py-2">
                  <ComboBox
                    key={`consultor-${linhaNova.consultorId}`}
                    opcoes={opcoesConsultores}
                    valor={linhaNova.consultorId}
                    placeholder="Eu mesmo"
                    onSelecionar={(consultorId) =>
                      atualizarLinhaNova({ consultorId })
                    }
                  />
                </td>
              )}
              <td className="px-3 py-2" id="linha-nova-cliente">
                <ComboBox
                  key={`cliente-${linhaNova.clienteId}`}
                  opcoes={opcoesClientes}
                  valor={linhaNova.clienteId}
                  placeholder="Digite o cliente..."
                  onSelecionar={(clienteId) =>
                    atualizarLinhaNova({ clienteId })
                  }
                />
              </td>
              <td className="px-3 py-2">
                <ComboBox
                  key={`fornecedor-${linhaNova.fornecedorId}`}
                  opcoes={opcoesFornecedores}
                  valor={linhaNova.fornecedorId}
                  placeholder="Digite o fornecedor..."
                  onSelecionar={(fornecedorId) =>
                    atualizarLinhaNova({ fornecedorId, produtoId: "" })
                  }
                />
              </td>
              <td className="px-3 py-2">
                <ComboBox
                  key={`produto-${linhaNova.produtoId}-${linhaNova.fornecedorId}`}
                  opcoes={
                    linhaNova.fornecedorId
                      ? produtosDoFornecedor(linhaNova.fornecedorId)
                      : opcoesProdutos
                  }
                  valor={linhaNova.produtoId}
                  placeholder="Digite o produto..."
                  onSelecionar={(produtoId) => {
                    const produto = produtosPorId.get(produtoId);
                    // Preco de venda de referencia (tabela) ja tem a margem
                    // do gestor embutida — pre-preenche o Valor com ele
                    // direto.
                    const preco = produto
                      ? precoDeVendaDoProduto(produto, linhaNova.condicaoPagamentoTipo)
                      : null;
                    atualizarLinhaNova({
                      produtoId,
                      fornecedorId: fornecedorIdDoProduto(produtoId),
                      // So preenche se o vendedor ainda nao digitou nada —
                      // nao sobrescreve edicao ja feita (mesmo criterio do
                      // wizard de orcamento).
                      valorUnitario:
                        !linhaNova.valorUnitario && preco != null
                          ? preco.toFixed(2)
                          : linhaNova.valorUnitario,
                    });
                  }}
                />
              </td>
              <td className="px-3 py-2">
                <ComboBox
                  key={`cultura-${linhaNova.cultura}`}
                  opcoes={opcoesCultura}
                  valor={linhaNova.cultura}
                  placeholder="Sem cultura"
                  onSelecionar={(cultura) => atualizarLinhaNova({ cultura })}
                />
              </td>
              <td className="px-3 py-2">
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="0"
                  className="w-full rounded border border-accent bg-zinc-800 px-1.5 py-1 text-right text-sm text-white outline-none"
                  value={linhaNova.volume}
                  onChange={(e) =>
                    atualizarLinhaNova({ volume: e.target.value })
                  }
                />
              </td>
              <td className="px-3 py-2">
                <select
                  className="w-full rounded border border-accent bg-zinc-800 px-1.5 py-1 text-sm text-white outline-none"
                  value={linhaNova.condicaoPagamentoTipo}
                  onChange={(e) => {
                    const condicaoPagamentoTipo = e.target.value as CondicaoPagamentoTipo;
                    const produto = produtosPorId.get(linhaNova.produtoId);
                    const preco = produto ? precoDeVendaDoProduto(produto, condicaoPagamentoTipo) : null;
                    atualizarLinhaNova({
                      condicaoPagamentoTipo,
                      // Troca de condicao sempre reflete o preco de venda de
                      // referencia correspondente, mesmo que o valor atual
                      // tenha sido editado — e' a mesma referencia mudando de base.
                      valorUnitario: preco != null ? String(preco) : linhaNova.valorUnitario,
                    });
                  }}
                >
                  <option value="AVISTA">À vista</option>
                  <option value="APRAZO">A prazo</option>
                </select>
              </td>
              <td className="px-3 py-2">
                <LimitesDePreco
                  produto={produtosPorId.get(linhaNova.produtoId)}
                  condicao={linhaNova.condicaoPagamentoTipo}
                >
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder="0,00"
                    className="w-full rounded border border-accent bg-zinc-800 px-1.5 py-1 text-right text-sm text-white outline-none"
                    value={linhaNova.valorUnitario}
                    onChange={(e) =>
                      atualizarLinhaNova({ valorUnitario: e.target.value })
                    }
                  />
                </LimitesDePreco>
              </td>
              <td className="px-3 py-2 text-right font-semibold text-white">
                {(() => {
                  const total = totalDaLinha(linhaNova.volume, linhaNova.valorUnitario);
                  return total != null ? fmtBRL(total) : <span className="text-subtle">—</span>;
                })()}
              </td>
              <td className="px-3 py-2">
                <ComboBox
                  key={`status-${linhaNova.status}`}
                  opcoes={opcoesStatusCriacao}
                  valor={linhaNova.status}
                  onSelecionar={(status) =>
                    atualizarLinhaNova({ status: status as Status })
                  }
                />
              </td>
              <td className="px-3 py-2">
                <DateInput
                  className="w-full rounded border border-accent bg-zinc-800 px-1.5 py-1 text-sm text-white outline-none"
                  value={linhaNova.dataFechamento}
                  onChange={(e) =>
                    atualizarLinhaNova({ dataFechamento: e.target.value })
                  }
                />
              </td>
              <td className="px-3 py-2">
                <DateInput
                  className="w-full rounded border border-accent bg-zinc-800 px-1.5 py-1 text-sm text-white outline-none"
                  value={linhaNova.previsaoEntrega}
                  onChange={(e) =>
                    atualizarLinhaNova({ previsaoEntrega: e.target.value })
                  }
                />
              </td>
              <td className="px-3 py-2">
                <div className="flex items-center gap-1">
                  <button
                    onClick={confirmarLinhaNova}
                    disabled={pendente}
                    title="Salvar"
                    className="rounded p-1 text-secondary hover:bg-zinc-800 hover:text-accent disabled:opacity-50"
                  >
                    <Check size={16} />
                  </button>
                  <button
                    onClick={() => {
                      setCriandoLinha(false);
                      setLinhaNova(LINHA_NOVA_VAZIA);
                    }}
                    title="Cancelar"
                    className="rounded p-1 text-secondary hover:bg-zinc-800 hover:text-red-400"
                  >
                    <X size={16} />
                  </button>
                </div>
              </td>
            </tr>
            )}

            {paginacao.itens.map((v) => {
              const editando = linhaEditando === v.id;
              const outraLinhaEditando =
                linhaEditando !== null && linhaEditando !== v.id;

              return (
                <tr
                  key={v.id}
                  className={`border-b border-surface-border/50 transition hover:bg-zinc-900/60 ${
                    selecionadas.has(v.id) ? "bg-accent/5" : ""
                  } ${editando ? "bg-zinc-900/60" : ""}`}
                >
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      aria-label={`Selecionar venda de ${v.produtoNome} para ${v.clienteNome}`}
                      checked={selecionadas.has(v.id)}
                      onChange={() => alternarSelecao(v.id)}
                    />
                  </td>
                  {ehAdmin && (
                    <td className="px-3 py-2 text-secondary">
                      {editando && rascunho ? (
                        <ComboBox
                          key={v.id + "consultor-edit"}
                          opcoes={opcoesConsultores}
                          valor={rascunho.consultorId}
                          onSelecionar={(consultorId) =>
                            atualizarRascunho({ consultorId })
                          }
                        />
                      ) : (
                        <span className="block truncate">
                          {v.consultorNome.toUpperCase()}
                        </span>
                      )}
                    </td>
                  )}
                  <td className="px-3 py-2 font-medium text-white">
                    {editando && rascunho ? (
                      <ComboBox
                        key={v.id + "cliente-edit"}
                        autoFoco
                        opcoes={opcoesClientes}
                        valor={rascunho.clienteId}
                        onSelecionar={(clienteId) =>
                          atualizarRascunho({ clienteId })
                        }
                      />
                    ) : (
                      <span className="block truncate">
                        {v.clienteNome.toUpperCase()}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-secondary">
                    {editando && rascunho ? (
                      <ComboBox
                        key={v.id + "fornecedor-edit"}
                        opcoes={opcoesFornecedores}
                        valor={rascunho.fornecedorId}
                        onSelecionar={(fornecedorId) =>
                          atualizarRascunho({ fornecedorId, produtoId: "" })
                        }
                      />
                    ) : (
                      <span className="block truncate">
                        {v.fornecedorNome.toUpperCase()}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-zinc-300">
                    {editando && rascunho ? (
                      <ComboBox
                        key={v.id + "produto-edit"}
                        opcoes={
                          rascunho.fornecedorId
                            ? produtosDoFornecedor(rascunho.fornecedorId)
                            : opcoesProdutos
                        }
                        valor={rascunho.produtoId}
                        onSelecionar={(produtoId) =>
                          atualizarRascunho({
                            produtoId,
                            fornecedorId: fornecedorIdDoProduto(produtoId),
                          })
                        }
                      />
                    ) : (
                      <NomeProdutoComCusto
                        nome={v.produtoNome.toUpperCase()}
                        produto={produtosPorId.get(v.produtoId)}
                      />
                    )}
                  </td>
                  <td className="px-3 py-2 text-zinc-300">
                    {editando && rascunho ? (
                      <ComboBox
                        key={v.id + "cultura-edit"}
                        opcoes={opcoesCultura}
                        valor={rascunho.cultura}
                        onSelecionar={(cultura) =>
                          atualizarRascunho({ cultura })
                        }
                      />
                    ) : (
                      <span className="block truncate">{v.cultura ?? "—"}</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right text-zinc-300">
                    {editando && rascunho ? (
                      <input
                        type="text"
                        inputMode="decimal"
                        className="w-full rounded border border-accent bg-zinc-800 px-1.5 py-1 text-right text-sm text-white outline-none"
                        value={rascunho.volume}
                        onChange={(e) =>
                          atualizarRascunho({ volume: e.target.value })
                        }
                      />
                    ) : (
                      <span className="block truncate">
                        {v.volume != null ? fmtNum(v.volume) : "—"}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {editando && rascunho ? (
                      <select
                        className="w-full rounded border border-accent bg-zinc-800 px-1.5 py-1 text-sm text-white outline-none"
                        value={rascunho.condicaoPagamentoTipo}
                        onChange={(e) =>
                          atualizarRascunho({ condicaoPagamentoTipo: e.target.value as CondicaoPagamentoTipo })
                        }
                      >
                        <option value="AVISTA">À vista</option>
                        <option value="APRAZO">A prazo</option>
                      </select>
                    ) : (
                      <span className="text-xs text-secondary">
                        {v.condicaoPagamentoTipo === "APRAZO" ? "A prazo" : "À vista"}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right text-zinc-300">
                    <LimitesDePreco
                      produto={produtosPorId.get(editando && rascunho ? rascunho.produtoId : v.produtoId)}
                      condicao={editando && rascunho ? rascunho.condicaoPagamentoTipo : v.condicaoPagamentoTipo === "APRAZO" ? "APRAZO" : "AVISTA"}
                    >
                      {editando && rascunho ? (
                        <input
                          type="text"
                          inputMode="decimal"
                          className="w-full rounded border border-accent bg-zinc-800 px-1.5 py-1 text-right text-sm text-white outline-none"
                          value={rascunho.valorUnitario}
                          onChange={(e) =>
                            atualizarRascunho({ valorUnitario: e.target.value })
                          }
                        />
                      ) : (
                        <span className="block truncate">
                          {v.valorUnitario != null ? fmtBRL(v.valorUnitario) : "—"}
                        </span>
                      )}
                    </LimitesDePreco>
                  </td>
                  <td className="px-3 py-2 text-right font-semibold text-white">
                    {editando && rascunho
                      ? fmtBRL(totalDaLinha(rascunho.volume, rascunho.valorUnitario) ?? v.valorTotal)
                      : fmtBRL(v.valorTotal)}
                  </td>
                  <td className="px-3 py-2">
                    {/* Status nao e editavel numa venda ja existente: avanca
                        sozinho pelos fluxos automaticos (fechar negocio,
                        conferencia final, Financeiro emitindo NF+boleto) —
                        ver STATUS_EDITAVEL_MANUAL. */}
                    <BadgeStatus status={v.status} documentoOrigem={v.documentoOrigem} />
                  </td>
                  <td className="px-3 py-2 text-secondary">
                    {editando && rascunho ? (
                      <DateInput
                        className="w-full rounded border border-accent bg-zinc-800 px-1.5 py-1 text-sm text-white outline-none"
                        value={rascunho.dataFechamento}
                        onChange={(e) =>
                          atualizarRascunho({ dataFechamento: e.target.value })
                        }
                      />
                    ) : (
                      <span className="block truncate">
                        {fmtData(v.dataFechamento)}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-secondary">
                    {editando && rascunho ? (
                      <DateInput
                        className="w-full rounded border border-accent bg-zinc-800 px-1.5 py-1 text-sm text-white outline-none"
                        value={rascunho.previsaoEntrega}
                        onChange={(e) =>
                          atualizarRascunho({ previsaoEntrega: e.target.value })
                        }
                      />
                    ) : (
                      <span className="block truncate">
                        {fmtData(v.previsaoEntrega)}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {editando ? (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => salvarEdicao(v)}
                          disabled={pendente}
                          title="Salvar"
                          className="rounded p-1 text-accent hover:bg-zinc-800"
                        >
                          <Check size={16} />
                        </button>
                        <button
                          onClick={cancelarEdicao}
                          disabled={pendente}
                          title="Cancelar"
                          className="rounded p-1 text-secondary hover:bg-zinc-800 hover:text-red-400"
                        >
                          <X size={16} />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-end">
                        <MenuAcoes
                          desabilitado={pendente || outraLinhaEditando}
                          acoes={[
                            // Em carteira/Faturado ja passaram da conferencia final:
                            // nao editam nem geram novo orcamento.
                            ...(v.status === "EM_CARTEIRA" || v.status === "FATURADO"
                              ? v.documentoOrigem
                                ? [
                                    // Pedido assinado (D4Sign) quando existe; senao o PDF gerado.
                                    v.documentoOrigem.pdfAssinadoUrl
                                      ? {
                                          rotulo: "Ver pedido assinado",
                                          icone: <FileText size={14} />,
                                          aoClicar: () =>
                                            window.open(v.documentoOrigem!.pdfAssinadoUrl!, "_blank", "noopener,noreferrer"),
                                        }
                                      : {
                                          rotulo: v.documentoOrigem.tipo === "PROPOSTA" ? "Ver pedido" : "Ver orçamento",
                                          icone: <FileText size={14} />,
                                          aoClicar: () => baixarPdfDocumento(v.documentoOrigem!.id, `${v.documentoOrigem!.tipo === "PROPOSTA" ? "Pedido" : "Orçamento"} ${v.documentoOrigem!.numero}`),
                                        },
                                  ]
                                : [
                                    {
                                      rotulo: "Ver pedido",
                                      icone: <FileText size={14} />,
                                      aoClicar: () => verPedidoDaVenda(v),
                                    },
                                  ]
                              : v.documentoOrigem
                              ? [
                                  // Venda ja virou documento: edita o proprio documento (modal
                                  // aqui mesmo) e baixa o PDF dele, em vez de gerar outro.
                                  {
                                    rotulo:
                                      v.documentoOrigem.tipo === "PROPOSTA" ? "Editar pedido" : "Editar orçamento",
                                    icone: <Pencil size={14} />,
                                    aoClicar: () => abrirEdicaoDocumento(v.documentoOrigem!.id),
                                  },
                                  {
                                    rotulo:
                                      v.documentoOrigem.tipo === "PROPOSTA" ? "Gerar pedido" : "Baixar orçamento",
                                    icone: <FileText size={14} />,
                                    aoClicar: () => baixarPdfDocumento(v.documentoOrigem!.id, `${v.documentoOrigem!.tipo === "PROPOSTA" ? "Pedido" : "Orçamento"} ${v.documentoOrigem!.numero}`),
                                  },
                                ]
                              : [
                                  {
                                    rotulo: "Editar",
                                    icone: <Pencil size={14} />,
                                    aoClicar: () => iniciarEdicao(v),
                                  },
                                  {
                                    rotulo: "Gerar orçamento",
                                    icone: <FileText size={14} />,
                                    // Linha marcada: leva todas as marcadas juntas.
                                    aoClicar: () =>
                                      gerarPedido(selecionadas.has(v.id) ? [...selecionadas] : [v.id]),
                                  },
                                ]),
                            {
                              rotulo: ehAdmin && v.status !== "EM_CARTEIRA" && v.status !== "FATURADO" ? "Excluir" : "Cancelar",
                              icone: <Trash2 size={14} />,
                              aoClicar: () => excluir(v),
                              perigosa: true,
                            },
                          ]}
                        />
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
            {filtradas.length === 0 && (
              <tr>
                <td
                  colSpan={colspan}
                  className="px-3 py-8 text-center text-muted"
                ><p className="sticky left-3 max-w-[calc(100vw-4rem)] whitespace-normal md:max-w-[calc(100vw-20rem)]">{vendas.length === 0 ? 'Nenhuma venda nesta safra. Use "Nova venda" para começar ou "Importar Excel" para trazer uma planilha.' : "Nenhuma venda corresponde aos filtros. Altere a busca ou os filtros."}</p></td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Paginacao {...paginacao} />

      {importando && (
        <ImportarModal
          aoFechar={() => setImportando(false)}
          ehAdmin={ehAdmin}
          consultores={consultores}
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

      {editandoDocumento && (
        <OrcamentoWizard
          proposta={editandoDocumento}
          tipoProposta={editandoDocumento.tipo}
          clientes={clientes}
          produtos={produtos.map((p) => ({
            id: p.id,
            nome: p.nome,
            fornecedorNome: p.fornecedorNome,
            ingredienteAtivo: p.ingredienteAtivo,
            embalagem: p.embalagem,
            recomendacao: p.recomendacao,
            custoAvista: p.custoAvista,
            custoAprazo: p.custoAprazo,
            custoCompra: p.custoCompra,
          }))}
          consultores={consultores}
          vendasAbertas={[]}
          ehAdmin={ehAdmin}
          aoFechar={aoFecharEdicaoDocumento}
        />
      )}

      {abrindoOrcamento && (
        <OrcamentoWizard
          vendasIniciais={abrindoOrcamento}
          clientes={clientes}
          produtos={produtos.map((p) => ({
            id: p.id,
            nome: p.nome,
            fornecedorNome: p.fornecedorNome,
            ingredienteAtivo: p.ingredienteAtivo,
            embalagem: p.embalagem,
            recomendacao: p.recomendacao,
            custoAvista: p.custoAvista,
            custoAprazo: p.custoAprazo,
            custoCompra: p.custoCompra,
          }))}
          consultores={consultores}
          vendasAbertas={[]}
          ehAdmin={ehAdmin}
          aoFechar={aoFecharOrcamento}
        />
      )}
    </div>
  );
}
