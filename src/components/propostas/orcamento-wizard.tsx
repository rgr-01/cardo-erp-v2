"use client";
import { DialogFrame } from "@/components/ui/dialog-frame";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, Eye, Info, Plus, X } from "lucide-react";
import {
  criarPedido,
  fecharNegocio as fecharNegocioAction,
  atualizarProposta,
  visualizarPdfProposta,
} from "@/app/actions/propostas";
import type { PropostaInput } from "@/lib/pedidos";
import type { TipoProposta } from "@/lib/propostas";
import { fmtBRL, fmtPct } from "@/lib/format";
import {
  FAIXA_CORES,
  calcularMargem,
  custoDoProduto,
  faixaDaMargem,
  precoDeVendaDoProduto,
  margemPonderada,
} from "@/lib/margem";
import { Badge } from "@/components/ui/badge";
import { LimitesDePreco } from "@/components/ui/limites-de-preco";
import { PreviaPdfModal } from "@/components/ui/previa-pdf-modal";
import { totalBrutoItem, totalLiquidoItem, unitarioLiquido } from "@/lib/desconto";
import { parcelasDoPedido } from "@/lib/parcelas";
import { camposFaltantes, clienteCompleto as clienteCompletoBase } from "@/lib/clientes";
import { EditarCadastroClienteModal } from "@/components/propostas/editar-cadastro-cliente-modal";
import { SimuladorMargem, type ItemSimulador } from "@/components/propostas/simulador-margem";
import { ComboBox, type ComboBoxOpcao } from "@/components/ui/combo-box";
import type {
  ClienteOpcaoProposta,
  ConsultorOpcaoProposta,
  ProdutoOpcaoProposta,
  PropostaLinha,
  VendaOpcaoProposta,
} from "@/components/propostas/tipos";
import { UNIDADES_ITEM } from "@/lib/unidades";
import { DateInput } from "@/components/ui/date-input";
import { NumberInput } from "@/components/ui/number-input";

const inputCls =
  "w-full rounded-lg border border-surface-border bg-zinc-800 px-3 py-2 text-sm text-white outline-none focus:border-accent";
const labelCls = "mb-1 block text-xs font-medium text-secondary";

// Mesma regra de lib/clientes.ts: sem isso o PDF/envio pro D4Sign falha
// depois de fechar negocio, entao avisa aqui antes.
function clienteCompleto(cliente: ClienteOpcaoProposta | undefined): boolean {
  if (!cliente) return false;
  return clienteCompletoBase(cliente);
}

type CondicaoTipo = "AVISTA" | "APRAZO";

type ItemWizard = {
  chave: string;
  produtoId: string;
  vendaId: string | null;
  cultura: string;
  volume: string;
  unidade: string;
  valorUnitario: string;
  // Cotacao a vista e a prazo: valorUnitario = a vista, este = a prazo.
  valorUnitarioAprazo: string;
  // Desconto em % so deste item (texto do campo; vazio = 0).
  descontoPct: string;
  // null = usa o valor atual do cadastro do produto; string = sobrescreve so
  // pra este item, sem alterar o cadastro (ver PropostaItem no schema).
  ingredienteAtivo: string | null;
  embalagem: string | null;
  recomendacao: string | null;
  // So usado em item manual sem produtoId ainda: filtra as opcoes do
  // ComboBox de produto por fornecedor antes de escolher o produto em si.
  // Depois que produtoId e' escolhido, o fornecedor exibido vem do produto.
  fornecedorFiltro: string;
};

function itemDeVenda(venda: VendaOpcaoProposta): ItemWizard {
  return {
    chave: venda.id,
    produtoId: venda.produtoId,
    vendaId: venda.id,
    cultura: venda.cultura ?? "",
    volume: venda.volume?.toString() ?? "",
    unidade: "",
    valorUnitario: venda.valorUnitario?.toString() ?? "",
    valorUnitarioAprazo: "",
    descontoPct: "",
    ingredienteAtivo: null,
    embalagem: null,
    recomendacao: null,
    fornecedorFiltro: "",
  };
}

function itemManualVazio(): ItemWizard {
  return {
    chave: `manual-${Math.random().toString(36).slice(2)}`,
    produtoId: "",
    vendaId: null,
    cultura: "",
    volume: "",
    unidade: "",
    valorUnitario: "",
    valorUnitarioAprazo: "",
    descontoPct: "",
    ingredienteAtivo: null,
    embalagem: null,
    recomendacao: null,
    fornecedorFiltro: "",
  };
}

function num(valor: string): number | null {
  if (!valor) return null;
  const n = parseFloat(valor.replace(",", "."));
  return isNaN(n) ? null : n;
}

function itemDeExistente(item: PropostaLinha["itens"][number]): ItemWizard {
  return {
    chave: item.id,
    produtoId: item.produtoId,
    vendaId: item.vendaId,
    cultura: item.cultura ?? "",
    volume: item.volume?.toString() ?? "",
    unidade: item.unidade ?? "",
    valorUnitario: item.valorUnitario?.toString() ?? "",
    valorUnitarioAprazo: item.valorUnitarioAprazo?.toString() ?? "",
    descontoPct: item.descontoPct ? String(item.descontoPct) : "",
    ingredienteAtivo: item.ingredienteAtivo,
    embalagem: item.embalagem,
    recomendacao: item.recomendacao,
    fornecedorFiltro: "",
  };
}

export function OrcamentoWizard({
  clientes,
  produtos,
  consultores,
  vendasAbertas,
  ehAdmin,
  proposta = null,
  tipoProposta = "PEDIDO",
  vendasIniciais,
  aoFechar,
}: {
  clientes: ClienteOpcaoProposta[];
  produtos: ProdutoOpcaoProposta[];
  consultores: ConsultorOpcaoProposta[];
  vendasAbertas: VendaOpcaoProposta[];
  ehAdmin: boolean;
  // Presente = editando um documento existente (Orcamento ou Pedido) em vez
  // de criar um novo.
  proposta?: PropostaLinha | null;
  // Tipo do documento sendo editado — so importa quando proposta esta
  // presente: decide se ainda mostra "Fechar negocio" (Orcamento, PEDIDO)
  // ou so "Salvar" (ja e Pedido, PROPOSTA, negocio ja fechado).
  tipoProposta?: TipoProposta;
  // Vendas ja escolhidas na tela de Vendas (todas do mesmo cliente/consultor,
  // ver validacao antes de abrir): pula o passo 1 igual ao modo de edicao,
  // mas ainda cria um documento novo (nao tem proposta.id).
  vendasIniciais?: VendaOpcaoProposta[];
  aoFechar: () => void;
}) {
  const router = useRouter();
  const editando = proposta != null;
  // Pedido com margem abaixo do minimo continua tratado como Orcamento
  // (rascunho) aqui — titulo, PDF e acoes do wizard — ate o gestor aprovar,
  // mesmo ja tendo tipo PROPOSTA no banco. So aparece em /pedidos por isso
  // (ver aguardandoGestor em propostas-table.tsx, mesma regra).
  const aguardandoGestor = tipoProposta === "PROPOSTA" && proposta?.statusMargem === "AGUARDANDO_APROVACAO";
  const editandoPedidoFechado = editando && tipoProposta === "PROPOSTA" && !aguardandoGestor;
  const temVendasIniciais = !editando && Boolean(vendasIniciais?.length);
  // Editando (ou vindo de vendas ja escolhidas) pula direto pra revisao — os
  // itens ja existem, nao faz sentido escolher vendas de novo (passo 1 e so
  // pra montagem inicial).
  const [passo, setPasso] = useState(editando || temVendasIniciais ? 2 : 1);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();

  // Passo 1
  const [clienteId, setClienteId] = useState(
    proposta?.clienteId ?? vendasIniciais?.[0]?.clienteId ?? ""
  );
  const [consultorId, setConsultorId] = useState(
    proposta?.consultorId ?? vendasIniciais?.[0]?.consultorId ?? ""
  );
  const [condicaoPagamentoTipo, setCondicaoPagamentoTipo] = useState<CondicaoTipo>(
    proposta?.condicaoPagamentoTipo ?? vendasIniciais?.[0]?.condicaoPagamentoTipo ?? "AVISTA"
  );
  // Orcamento cotado a vista E a prazo (duas colunas de preco). Antes de
  // fechar negocio escolhe-se uma; o pedido sempre tem preco unico.
  const [cotacaoDupla, setCotacaoDupla] = useState(
    () => proposta?.itens.some((i) => i.valorUnitarioAprazo != null) ?? false
  );
  const [previsaoEntrega, setPrevisaoEntrega] = useState(
    proposta?.previsaoEntrega?.slice(0, 10) ?? ""
  );
  const [localEntrega, setLocalEntrega] = useState(proposta?.localEntrega ?? "");
  const [frete, setFrete] = useState(proposta?.frete ?? "");
  const [vendaIdsSelecionadas, setVendaIdsSelecionadas] = useState<Set<string>>(new Set());

  // Campos que so fazem sentido pro Pedido (tipo PROPOSTA) ja fechado —
  // documento final, herdados do PropostaForm que esse wizard substitui.
  const [validade, setValidade] = useState(proposta?.validade?.slice(0, 10) ?? "");
  // Só no pedido: a 1ª parcela sai nesta data e as demais seguem pelos dias da condição.
  const [dataFaturamento, setDataFaturamento] = useState(proposta?.dataFaturamento?.slice(0, 10) ?? "");
  // condicaoPagamento continua o texto livre gravado no banco (ex.: "30/60/90
  // dias"), mas agora e' gerado a partir de parcelas/intervalo em vez de
  // digitado — tenta reconstituir os dois campos a partir do texto existente
  // ao editar um documento antigo, senao usa valores padrao.
  const parcelasIniciais = proposta?.condicaoPagamento?.split("/").map((s) => s.trim()) ?? [];
  const [numeroParcelas, setNumeroParcelas] = useState(
    parcelasIniciais.length > 1 ? String(parcelasIniciais.length) : "3"
  );
  const [intervaloParcelas, setIntervaloParcelas] = useState(() => {
    if (parcelasIniciais.length > 1) {
      const primeiro = parseInt(parcelasIniciais[0], 10);
      if (!isNaN(primeiro)) return String(primeiro);
    }
    return "30";
  });
  const condicaoPagamento = useMemo(() => {
    if (condicaoPagamentoTipo === "AVISTA") return "À vista";
    const n = parseInt(numeroParcelas, 10);
    const intervalo = parseInt(intervaloParcelas, 10);
    if (!n || n < 1 || !intervalo || intervalo < 1) return "";
    return Array.from({ length: n }, (_, i) => (i + 1) * intervalo).join("/") + " dias";
  }, [condicaoPagamentoTipo, numeroParcelas, intervaloParcelas]);
  const [termosCondicoes, setTermosCondicoes] = useState(proposta?.termosCondicoes ?? "");

  // Passo 2 — um unico array editavel: comeca com um item por venda
  // selecionada no passo 1 (ou pelos itens existentes/vendasIniciais) e pode
  // ganhar itens manuais (viram venda nova).
  const [itens, setItens] = useState<ItemWizard[]>(() => {
    if (proposta) return proposta.itens.sort((a, b) => a.ordem - b.ordem).map(itemDeExistente);
    if (vendasIniciais?.length) return vendasIniciais.map(itemDeVenda);
    return [];
  });
  const [observacoes, setObservacoes] = useState(proposta?.observacoes ?? "");

  // So entra na lista quem tem pelo menos uma venda em aberto — escolher um
  // cliente sem vendas so levaria a uma tela vazia no passo seguinte.
  const clientesComVenda = useMemo(() => {
    const idsComVenda = new Set(
      vendasAbertas
        .filter((v) => !ehAdmin || !consultorId || v.consultorId === consultorId)
        .map((v) => v.clienteId)
    );
    return clientes.filter((c) => idsComVenda.has(c.id));
  }, [clientes, vendasAbertas, ehAdmin, consultorId]);

  const opcoesClientes: ComboBoxOpcao[] = useMemo(
    () => clientesComVenda.map((c) => ({ id: c.id, label: c.nome })),
    [clientesComVenda]
  );
  const opcoesConsultores: ComboBoxOpcao[] = useMemo(
    () => consultores.map((c) => ({ id: c.id, label: c.nome })),
    [consultores]
  );
  const opcoesProdutos: ComboBoxOpcao[] = useMemo(
    () =>
      [...produtos]
        .sort((a, b) => a.fornecedorNome.localeCompare(b.fornecedorNome))
        .map((p) => ({ id: p.id, label: p.nome, grupo: p.fornecedorNome })),
    [produtos]
  );

  // Fornecedor usa o proprio nome como id (nao ha fornecedorId em
  // ProdutoOpcaoProposta) — serve so pra filtrar produtos na tabela.
  const opcoesFornecedores: ComboBoxOpcao[] = useMemo(() => {
    const nomes = [...new Set(produtos.map((p) => p.fornecedorNome))].sort((a, b) =>
      a.localeCompare(b)
    );
    return nomes.map((nome) => ({ id: nome, label: nome }));
  }, [produtos]);

  function opcoesProdutosDoFornecedor(fornecedorNome: string): ComboBoxOpcao[] {
    if (!fornecedorNome) return opcoesProdutos;
    return opcoesProdutos.filter((o) => o.grupo === fornecedorNome);
  }

  const produtosPorId = useMemo(() => new Map(produtos.map((p) => [p.id, p])), [produtos]);
  // Dados do cliente já com o que foi completado aqui mesmo (janela de cadastro).
  const [ajustesCliente, setAjustesCliente] = useState<Record<string, Partial<ClienteOpcaoProposta>>>({});
  const [editandoCadastro, setEditandoCadastro] = useState(false);
  const clienteBase = clientes.find((c) => c.id === clienteId);
  const clienteAtual = clienteBase ? { ...clienteBase, ...ajustesCliente[clienteBase.id] } : undefined;
  const clienteIncompleto = Boolean(clienteId) && !clienteCompleto(clienteAtual);

  const vendasDoCliente = useMemo(
    () =>
      vendasAbertas.filter(
        (v) =>
          v.clienteId === clienteId &&
          (!ehAdmin || !consultorId || v.consultorId === consultorId)
      ),
    [clienteId, consultorId, ehAdmin, vendasAbertas]
  );

  // Poucos itens: linhas folgadas aproveitam o modal; muitos itens: volta ao compacto.
  const confortavel = itens.length <= 4;

  function atualizarItem(chave: string, patch: Partial<ItemWizard>) {
    setItens((atuais) =>
      atuais.map((item) => (item.chave === chave ? { ...item, ...patch } : item))
    );
  }

  const itensParaSimulador: ItemSimulador[] = itens.map((item) => {
    const produto = produtosPorId.get(item.produtoId);
    const custo = produto ? custoDoProduto(produto) : null;
    const volume = num(item.volume) ?? 0;
    const valorUnitario = num(item.valorUnitario) ?? 0;
    return {
      id: item.chave,
      produtoNome: produto?.nome ?? "—",
      fornecedorNome: produto?.fornecedorNome ?? "—",
      cultura: item.cultura || null,
      volume,
      valorUnitario,
      descontoPct: num(item.descontoPct) ?? 0,
      custoUnitario: custo,
      total: totalLiquidoItem(volume, valorUnitario, num(item.descontoPct)),
    };
  });

  const margemMedia = margemPonderada(
    itensParaSimulador.map((i) => ({
      precoVenda: unitarioLiquido(i.valorUnitario, i.descontoPct),
      volume: i.volume ?? 0,
      custo: i.custoUnitario,
    }))
  );

  // Subtotal bruto, desconto = soma dos descontos por item, total liquido.
  const subtotal = itensParaSimulador.reduce(
    (soma, i) => soma + totalBrutoItem(i.volume, i.valorUnitario),
    0
  );
  const total = itensParaSimulador.reduce((soma, i) => soma + i.total, 0);
  const descontoTotal = Math.max(0, subtotal - total);
  const totalAprazo = itens.reduce(
    (soma, i) => soma + totalLiquidoItem(num(i.volume), num(i.valorUnitarioAprazo), num(i.descontoPct)),
    0
  );

  // Deixa so um dos precos: "AVISTA" mantem valorUnitario, "APRAZO" passa o
  // preco a prazo pra ele. Em seguida o orcamento volta a ser de preco unico.
  function escolherPreco(condicao: CondicaoTipo) {
    setItens((atuais) =>
      atuais.map((i) => ({
        ...i,
        valorUnitario: condicao === "APRAZO" ? i.valorUnitarioAprazo : i.valorUnitario,
        valorUnitarioAprazo: "",
      }))
    );
    setCondicaoPagamentoTipo(condicao);
    setCotacaoDupla(false);
  }
  const parcelasPrevia = parcelasDoPedido({ condicao: condicaoPagamento, dataFaturamento, total });

  function avancarDoPasso1() {
    setErro(null);
    if (!clienteId) {
      setErro("Selecione um cliente.");
      return;
    }
    if (vendaIdsSelecionadas.size === 0) {
      setErro("Selecione ao menos uma venda em aberto do cliente.");
      return;
    }
    // Monta os itens editaveis do passo 2 a partir das vendas escolhidas,
    // preservando o que ja foi digitado se o usuario voltar e mudar a selecao.
    setItens((atuais) => {
      const existentesPorVenda = new Map(
        atuais.filter((i) => i.vendaId).map((i) => [i.vendaId as string, i])
      );
      const itensManuaisAtuais = atuais.filter((i) => !i.vendaId);
      const itensDeVenda = vendasDoCliente
        .filter((v) => vendaIdsSelecionadas.has(v.id))
        .map((v) => existentesPorVenda.get(v.id) ?? itemDeVenda(v));
      return [...itensDeVenda, ...itensManuaisAtuais];
    });
    setPasso(2);
  }

  function montarInput(): PropostaInput | null {
    setErro(null);
    if (itens.length === 0 || itens.some((item) => !item.produtoId)) {
      setErro("Todo item precisa de um produto selecionado.");
      return null;
    }
    // Validade, previsao/local de entrega e frete sao opcionais — nada disso
    // trava salvar nem enviar pra assinatura (o PDF sai "a combinar").
    if (!condicaoPagamento) {
      setErro("Informe uma condição de pagamento válida.");
      return null;
    }

    return {
      clienteId,
      consultorId: consultorId || undefined,
      validade: editandoPedidoFechado ? null : validade || null,
      dataFaturamento: editandoPedidoFechado ? dataFaturamento || null : null,
      previsaoEntrega: previsaoEntrega || null,
      localEntrega: localEntrega.trim() || null,
      frete: frete || null,
      condicaoPagamento,
      condicaoPagamentoTipo,
      observacoes: observacoes || null,
      termosCondicoes: termosCondicoes || null,
      desconto: 0,
      // ingredienteAtivo/embalagem/recomendacao gravam exatamente o que esta
      // visivel na tela (override editado ou o valor do cadastro do produto
      // usado como ponto de partida) — nunca null so porque o usuario nao
      // tocou no campo. Campo deixado vazio de proposito grava vazio mesmo,
      // pra sumir do PDF (ver PropostaItem: sem fallback pro cadastro la).
      itens: itens.map((item) => {
        const produto = produtosPorId.get(item.produtoId);
        return {
          produtoId: item.produtoId,
          vendaId: item.vendaId,
          cultura: item.cultura || null,
          volume: num(item.volume),
          unidade: item.unidade || null,
          // A vista/a prazo agora e do documento todo (Condicoes comerciais).
          // Na cotacao dupla o preco principal e o a vista.
          condicaoPagamentoTipo: cotacaoDupla ? "AVISTA" : condicaoPagamentoTipo,
          valorUnitario: num(item.valorUnitario),
          valorUnitarioAprazo: cotacaoDupla ? num(item.valorUnitarioAprazo) ?? 0 : null,
          descontoPct: num(item.descontoPct) ?? 0,
          ingredienteAtivo: item.ingredienteAtivo ?? produto?.ingredienteAtivo ?? null,
          // Sempre a do cadastro do produto (nao e editavel no pedido).
          embalagem: produto?.embalagem ?? null,
          recomendacao: item.recomendacao ?? produto?.recomendacao ?? null,
        };
      }),
    };
  }

  // "Gerar orcamento": salva como rascunho, o consultor volta depois e edita.
  // Vindo de vendas selecionadas (Plano de Vendas), leva o usuario direto pra
  // tela de Orcamentos onde o documento criado aparece.
  function salvar() {
    const input = montarInput();
    if (!input) return;
    startTransition(async () => {
      const resultado = editando
        ? await atualizarProposta(proposta.id, input)
        : await criarPedido(input);
      if (resultado.ok) {
        aoFechar();
        if (temVendasIniciais) router.push("/pedidos");
      } else setErro(resultado.erro);
    });
  }

  // "Fechar negocio": cadastra a venda de fato (vira Pedido). Com margem
  // abaixo de 27% fica bloqueado ate o gestor aprovar (ver aprovacao-margem).
  // Vindo de vendas selecionadas, leva pra tela de Pedidos.
  function fechar() {
    if (cotacaoDupla) {
      setErro("Escolha o preço que o cliente fechou (à vista ou a prazo) em Condições comerciais antes de fechar o negócio.");
      return;
    }
    const input = montarInput();
    if (!input) return;
    startTransition(async () => {
      const resultado = editando
        ? await atualizarProposta(proposta.id, input, true)
        : await fecharNegocioAction(input);
      if (resultado.ok) {
        aoFechar();
        if (temVendasIniciais) router.push("/propostas");
      } else setErro(resultado.erro);
    });
  }

  // "Visualizar": gera o PDF a partir do que esta no formulario agora, sem
  // salvar nada — mostra na mesma tela, num painel por cima do editor.
  const [visualizando, setVisualizando] = useState(false);
  const [previaUrl, setPreviaUrl] = useState<string | null>(null);
  function fecharPrevia() {
    if (previaUrl) URL.revokeObjectURL(previaUrl);
    setPreviaUrl(null);
  }
  function visualizar() {
    const input = montarInput();
    if (!input) return;
    const tipoDocumento: TipoProposta = editandoPedidoFechado ? "PROPOSTA" : "PEDIDO";
    setVisualizando(true);
    startTransition(async () => {
      const resultado = await visualizarPdfProposta(
        input,
        tipoDocumento,
        proposta?.numero ?? null
      );
      setVisualizando(false);
      if (!resultado.ok) {
        setErro(resultado.erro);
        return;
      }
      const bytes = Uint8Array.from(atob(resultado.base64), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: "application/pdf" });
      if (previaUrl) URL.revokeObjectURL(previaUrl);
      setPreviaUrl(URL.createObjectURL(blob));
    });
  }

  const nomesPassos = ["Cliente e vendas", "Revisão"];

  const tituloModal = editando
    ? `Editar ${editandoPedidoFechado ? "pedido" : "orçamento"}`
    : "Novo orçamento";

  return (
    <DialogFrame onClose={aoFechar} label={"Orçamento"} className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3 lg:pl-64">
      {/* ~80% da area disponivel (sidebar ate a borda direita), centralizado. */}
      <div className="relative flex h-[85vh] w-[95%] max-w-[1400px] flex-col overflow-hidden rounded-xl bg-zinc-900 shadow-2xl shadow-black/60 outline-none focus:outline-none">
        <div className="flex items-center justify-between gap-3 border-b border-surface-border px-6 py-4">
          <div>
            <h2 className="text-lg font-bold text-white">{tituloModal}</h2>
            {proposta?.statusMargem === "RECUSADA_CONFERENCIA" && (
              <p className="mt-1 max-w-md text-xs text-red-400">
                Recusado na conferência final
                {proposta.margemMotivoRecusa ? `: ${proposta.margemMotivoRecusa}` : "."} Corrija e
                reenvie para assinatura.
              </p>
            )}
            {!editando && !temVendasIniciais && (
              <div className="mt-2 flex items-center gap-2">
                {nomesPassos.map((nome, index) => {
                  const numeroPasso = index + 1;
                  const ativo = passo === numeroPasso;
                  const concluido = passo > numeroPasso;
                  return (
                    <div key={nome} className="flex items-center gap-2">
                      <div
                        className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
                          ativo
                            ? "bg-accent text-accent-foreground"
                            : concluido
                              ? "bg-accent/20 text-accent"
                              : "bg-zinc-800 text-muted"
                        }`}
                      >
                        {numeroPasso}. {nome}
                      </div>
                      {index < nomesPassos.length - 1 && (
                        <div className="h-px w-6 bg-surface-border" />
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          <div className="flex items-center gap-3">
            {passo === 2 && (
              <button
                type="button"
                disabled={pendente}
                onClick={visualizar}
                className="flex items-center gap-1.5 rounded-lg border border-surface-border px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
              >
                <Eye size={15} />{" "}
                {visualizando
                  ? "Gerando..."
                  : editandoPedidoFechado
                    ? "Visualizar pedido"
                    : "Visualizar orçamento"}
              </button>
            )}
            <button
              onClick={aoFechar}
              aria-label="Fechar"
              className="rounded p-1 text-secondary hover:bg-zinc-800 hover:text-white"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {passo === 1 && (
            <div className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <label className={labelCls}>Cliente *</label>
                  <ComboBox
                    autoFoco
                    opcoes={opcoesClientes}
                    valor={clienteId}
                    placeholder="Digite o cliente..."
                    onSelecionar={(id) => {
                      setClienteId(id);
                      setVendaIdsSelecionadas(new Set());
                      // Admin escolhendo cliente antes do consultor: preenche
                      // sozinho com o dono das vendas em aberto desse cliente,
                      // pra evitar montar um orcamento com vendedor errado
                      // (validarItensPedido bloqueia consultor divergente).
                      if (ehAdmin && !consultorId) {
                        const consultoresDoCliente = new Set(
                          vendasAbertas.filter((v) => v.clienteId === id).map((v) => v.consultorId)
                        );
                        if (consultoresDoCliente.size === 1) {
                          setConsultorId([...consultoresDoCliente][0]);
                        }
                      }
                    }}
                    className="w-full"
                  />
                  {clientesComVenda.length === 0 && (
                    <p className="mt-1 text-xs text-amber-400">
                      Nenhum cliente com venda em aberto. Cadastre uma venda antes de gerar o
                      orçamento.
                    </p>
                  )}
                </div>
                {ehAdmin && (
                  <div>
                    <label className={labelCls}>Consultor</label>
                    <ComboBox
                      opcoes={opcoesConsultores}
                      valor={consultorId}
                      placeholder="Eu mesmo"
                      onSelecionar={(id) => {
                        setConsultorId(id);
                        setClienteId("");
                        setVendaIdsSelecionadas(new Set());
                      }}
                      className="w-full"
                    />
                  </div>
                )}
                <div>
                  <label className={labelCls}>Previsão de entrega</label>
                  <DateInput
                    value={previsaoEntrega}
                    onChange={(e) => setPrevisaoEntrega(e.target.value)}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>Validade do orçamento</label>
                  <DateInput
                    value={validade}
                    onChange={(e) => setValidade(e.target.value)}
                    className={inputCls}
                  />
                </div>
                <div className="lg:col-span-2">
                  <label className={labelCls}>Local de entrega</label>
                  <input
                    value={localEntrega}
                    onChange={(e) => setLocalEntrega(e.target.value)}
                    className={inputCls}
                    placeholder="Ex.: Fazenda Santa Maria, armazém principal"
                  />
                </div>
                <div className="lg:col-span-2">
                  <label className={labelCls}>Frete</label>
                  <select value={frete} onChange={(e) => setFrete(e.target.value)} className={inputCls}>
                    <option value="">Não informado</option>
                    <option value="CIF - por conta do vendedor">CIF — por conta do vendedor</option>
                    <option value="FOB - por conta do cliente">FOB — por conta do cliente</option>
                    <option value="A combinar">A combinar</option>
                    {frete && ![
                      "CIF - por conta do vendedor",
                      "FOB - por conta do cliente",
                      "A combinar",
                    ].includes(frete) && <option value={frete}>{frete}</option>}
                  </select>
                </div>
              </div>

              {clienteId && (
                <div>
                  <p className="mb-2 text-sm text-secondary">
                    Selecione as vendas em aberto que vão virar itens deste orçamento. É
                    obrigatório escolher ao menos uma.
                  </p>
                  {vendasDoCliente.length === 0 ? (
                    <div className="rounded-lg border border-surface-border px-3 py-8 text-center text-sm text-muted">
                      Este cliente não tem vendas em aberto. Cadastre uma venda antes de gerar o
                      orçamento.
                    </div>
                  ) : (
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {vendasDoCliente.map((v) => {
                        const selecionada = vendaIdsSelecionadas.has(v.id);
                        return (
                          <button
                            key={v.id}
                            type="button"
                            onClick={() =>
                              setVendaIdsSelecionadas((atuais) => {
                                const novo = new Set(atuais);
                                if (novo.has(v.id)) novo.delete(v.id);
                                else novo.add(v.id);
                                return novo;
                              })
                            }
                            className={`flex items-center justify-between rounded-lg border px-3 py-2.5 text-left text-sm transition ${
                              selecionada
                                ? "border-accent bg-accent/10"
                                : "border-surface-border hover:bg-zinc-900/60"
                            }`}
                          >
                            <div>
                              <p className="font-medium text-white">
                                {v.fornecedorNome} / {v.produtoNome}
                              </p>
                              <p className="text-xs text-muted">{v.cultura ?? "Sem cultura"}</p>
                            </div>
                            <p className="font-semibold text-accent">{fmtBRL(v.valorTotal)}</p>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {passo === 2 && (
            <div className="flex min-h-full flex-col gap-5">
              <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-surface-border bg-zinc-950/60 px-4 py-3">
                <div>
                  <p className="text-xs font-medium text-muted">Cliente</p>
                  <p className="text-sm font-semibold text-white">{clienteAtual?.nome ?? "—"}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted">Vendedor</p>
                  <p className="text-sm font-semibold text-white">
                    {consultores.find((c) => c.id === consultorId)?.nome ?? "Eu mesmo"}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted">Previsão de entrega</p>
                  <DateInput
                    value={previsaoEntrega}
                    onChange={(e) => setPrevisaoEntrega(e.target.value)}
                    className="w-full rounded border-0 bg-transparent p-0 text-sm font-semibold text-white outline-none [color-scheme:dark]"
                  />
                </div>
                <div>
                  <p className="text-xs font-medium text-muted">Itens</p>
                  <p className="text-sm font-semibold text-white">{itens.length}</p>
                </div>
              </div>

              <div className="overflow-visible rounded-xl border border-surface-border">
                <table className="w-full table-fixed text-sm [&_td:not(:first-child)]:border-l [&_th:not(:first-child)]:border-l [&_td]:border-surface-border/40 [&_th]:border-surface-border/40">
                  <thead>
                    <tr className="border-b border-surface-border bg-zinc-950 text-left text-[11px] uppercase text-muted">
                      <th className="w-[7%] px-2 py-2">Fornecedor</th>
                      <th className="w-[12%] px-2 py-2">Produto</th>
                      <th className="w-[8%] px-2 py-2">Cultura</th>
                      <th className={`${cotacaoDupla ? "w-[8%]" : "w-[11%]"} px-2 py-2`}>Ingrediente ativo</th>
                      <th className={`${cotacaoDupla ? "w-[6%]" : "w-[8%]"} px-2 py-2`}>Embalagem</th>
                      <th className={`${cotacaoDupla ? "w-[7%]" : "w-[9%]"} px-2 py-2`}>Recomendação</th>
                      <th className="w-[6%] px-2 py-2 text-right">Volume</th>
                      <th className="w-[5%] px-2 py-2">Un.</th>
                      <th className="w-[7%] px-2 py-2 text-right">{cotacaoDupla ? "À vista" : "Valor"}</th>
                      {cotacaoDupla && <th className="w-[7%] px-2 py-2 text-right">A prazo</th>}
                      <th className="w-[5%] px-2 py-2 text-right">Desc. %</th>
                      <th className="w-[10%] px-2 py-2 text-right">Total</th>
                      <th className="w-[9%] px-2 py-2 text-right">Margem</th>
                      <th className="w-[3%] px-1 py-2"></th>
                    </tr>
                  </thead>
                  <tbody
                    className={
                      confortavel
                        ? "[&_td]:py-3.5 [&_input]:py-2 [&_input]:text-sm [&_select]:py-2 [&_select]:text-sm [&_td]:text-sm"
                        : ""
                    }
                  >
                    {itens.map((item) => {
                      const produto = produtosPorId.get(item.produtoId);
                      // Margem do item sobre o preco ja com o desconto do proprio item.
                      const custoItem = produto ? custoDoProduto(produto) : null;
                      const margemItem = calcularMargem(
                        unitarioLiquido(num(item.valorUnitario), num(item.descontoPct)),
                        custoItem
                      );
                      const faixaItem = margemItem != null ? faixaDaMargem(margemItem) : null;
                      return (
                      <tr key={item.chave} className="border-b border-surface-border/60">
                        <td className="px-2 py-1.5 text-xs text-secondary">
                          {item.vendaId ? (
                            <span className="line-clamp-2">{produto?.fornecedorNome ?? "—"}</span>
                          ) : (
                            <ComboBox
                              opcoes={opcoesFornecedores}
                              valor={produto?.fornecedorNome ?? item.fornecedorFiltro}
                              placeholder="Fornecedor..."
                              onSelecionar={(nome) =>
                                atualizarItem(item.chave, {
                                  fornecedorFiltro: nome,
                                  // Troca de fornecedor invalida o produto ja
                                  // escolhido se ele nao for mais desse fornecedor.
                                  produtoId:
                                    produto && produto.fornecedorNome !== nome ? "" : item.produtoId,
                                })
                              }
                            />
                          )}
                        </td>
                        <td className="px-2 py-1.5">
                          {item.vendaId ? (
                            <div>
                              <p className="text-zinc-300">{produto?.nome ?? "—"}</p>
                              <p className="text-xs text-muted">venda vinculada</p>
                            </div>
                          ) : (
                            <ComboBox
                              opcoes={opcoesProdutosDoFornecedor(item.fornecedorFiltro)}
                              valor={item.produtoId}
                              placeholder="Digite o produto..."
                              onSelecionar={(id) => {
                                const produtoEscolhido = produtosPorId.get(id);
                                // Preco de venda de referencia (tabela) ja tem a
                                // margem do gestor embutida — pre-preenche o
                                // Valor com ele direto, sem inflar por cima.
                                const preco = produtoEscolhido
                                  ? precoDeVendaDoProduto(produtoEscolhido, cotacaoDupla ? "AVISTA" : condicaoPagamentoTipo)
                                  : null;
                                const precoAprazo = cotacaoDupla && produtoEscolhido
                                  ? precoDeVendaDoProduto(produtoEscolhido, "APRAZO")
                                  : null;
                                atualizarItem(item.chave, {
                                  produtoId: id,
                                  // So preenche se o item ainda nao tem valor
                                  // digitado — nao sobrescreve edicao ja feita.
                                  valorUnitario:
                                    !item.valorUnitario && preco != null
                                      ? preco.toFixed(2)
                                      : item.valorUnitario,
                                  valorUnitarioAprazo:
                                    !item.valorUnitarioAprazo && precoAprazo != null
                                      ? precoAprazo.toFixed(2)
                                      : item.valorUnitarioAprazo,
                                });
                              }}
                            />
                          )}
                        
                        </td>
                        <td className="px-2 py-1.5">
                          <input
                            value={item.cultura}
                            onChange={(e) => atualizarItem(item.chave, { cultura: e.target.value })}
                            placeholder="Ex.: Soja"
                            className="w-full rounded-md border border-surface-border bg-zinc-800 px-1.5 py-1 text-xs text-white outline-none focus:border-accent"
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <input
                            value={item.ingredienteAtivo ?? produto?.ingredienteAtivo ?? ""}
                            onChange={(e) =>
                              atualizarItem(item.chave, { ingredienteAtivo: e.target.value })
                            }
                            placeholder="Não informado"
                            className="w-full rounded-md border border-surface-border bg-zinc-800 px-1.5 py-1 text-xs text-white outline-none focus:border-accent"
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          {/* Vem do cadastro do produto: aqui so visualiza, nao edita. */}
                          <span
                            className={`block truncate text-xs ${produto?.embalagem ? "text-zinc-200" : "text-muted"}`}
                            title="Definida no cadastro do produto"
                          >
                            {produto?.embalagem || "Não informado"}
                          </span>
                        </td>
                        <td className="px-2 py-1.5">
                          <input
                            value={item.recomendacao ?? produto?.recomendacao ?? ""}
                            onChange={(e) =>
                              atualizarItem(item.chave, { recomendacao: e.target.value })
                            }
                            placeholder="Não informado"
                            className="w-full rounded-md border border-surface-border bg-zinc-800 px-1.5 py-1 text-xs text-white outline-none focus:border-accent"
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <input
                            inputMode="decimal"
                            value={item.volume}
                            onChange={(e) => atualizarItem(item.chave, { volume: e.target.value })}
                            className="w-full rounded-md border border-surface-border bg-zinc-800 px-1.5 py-1 text-xs text-white outline-none focus:border-accent text-right"
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <select
                            value={item.unidade}
                            onChange={(e) =>
                              atualizarItem(item.chave, { unidade: e.target.value })
                            }
                            className="w-full rounded-md border border-surface-border bg-zinc-800 px-1.5 py-1 text-xs text-white outline-none focus:border-accent"
                          >
                            <option value="">—</option>
                            {/* Pedido antigo pode ter um valor fora da lista padrão (ex.: "L", "litro")
                                — mantém visível em vez de trocar sozinho por um valor diferente. */}
                            {item.unidade && !(UNIDADES_ITEM as readonly string[]).includes(item.unidade) && (
                              <option value={item.unidade}>{item.unidade}</option>
                            )}
                            {UNIDADES_ITEM.map((u) => (
                              <option key={u} value={u}>{u}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-2 py-1.5">
                          <LimitesDePreco produto={produto} condicao={cotacaoDupla ? "AVISTA" : condicaoPagamentoTipo}>
                            <input
                              inputMode="decimal"
                              value={item.valorUnitario}
                              onChange={(e) =>
                                atualizarItem(item.chave, { valorUnitario: e.target.value })
                              }
                              className="w-full rounded-md border border-surface-border bg-zinc-800 px-1.5 py-1 text-xs text-white outline-none focus:border-accent text-right"
                            />
                          </LimitesDePreco>
                        </td>
                        {cotacaoDupla && (
                          <td className="px-2 py-1.5">
                            <LimitesDePreco produto={produto} condicao="APRAZO">
                              <input
                                inputMode="decimal"
                                value={item.valorUnitarioAprazo}
                                onChange={(e) =>
                                  atualizarItem(item.chave, { valorUnitarioAprazo: e.target.value })
                                }
                                className="w-full rounded-md border border-surface-border bg-zinc-800 px-1.5 py-1 text-xs text-white outline-none focus:border-accent text-right"
                                aria-label="Valor a prazo"
                              />
                            </LimitesDePreco>
                          </td>
                        )}
                        <td className="px-2 py-1.5">
                          <input
                            inputMode="decimal"
                            placeholder="0"
                            value={item.descontoPct}
                            onChange={(e) =>
                              atualizarItem(item.chave, { descontoPct: e.target.value })
                            }
                            className="w-full rounded-md border border-surface-border bg-zinc-800 px-1.5 py-1 text-right text-xs text-white outline-none focus:border-accent"
                            aria-label="Desconto do item em porcentagem"
                          />
                        </td>
                        <td className="px-2 py-1.5 text-right font-semibold text-white">
                          {fmtBRL(totalLiquidoItem(num(item.volume), num(item.valorUnitario), num(item.descontoPct)))}
                          {cotacaoDupla && (
                            <span className="block text-[11px] font-normal text-secondary">
                              a prazo {fmtBRL(totalLiquidoItem(num(item.volume), num(item.valorUnitarioAprazo), num(item.descontoPct)))}
                            </span>
                          )}
                        </td>
                        <td className="px-2 py-1.5 text-right">
                          {faixaItem && margemItem != null ? (
                            <Badge color={FAIXA_CORES[faixaItem]} className="!px-3 !py-1 !text-base !font-bold">{`${(margemItem * 100).toFixed(1)}%`}</Badge>
                          ) : (
                            <span className="text-xs text-muted">sem custo</span>
                          )}
                        </td>
                        <td className="px-2 py-1.5 text-right">
                          <button
                            type="button"
                            onClick={() =>
                              setItens((atuais) => atuais.filter((i) => i.chave !== item.chave))
                            }
                            title="Remover item"
                            aria-label="Remover item"
                            className="inline-flex h-7 w-7 items-center justify-center rounded-full text-muted transition hover:bg-red-500/15 hover:text-red-400"
                          >
                            <X size={15} strokeWidth={2.25} />
                          </button>
                        </td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setItens((atuais) => [...atuais, itemManualVazio()])}
                  className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-accent-foreground transition hover:brightness-110"
                >
                  <Plus size={14} strokeWidth={2.5} /> Adicionar produto
                </button>
                <span className="group relative inline-flex">
                  <button
                    type="button"
                    aria-label="O que acontece ao adicionar um produto novo"
                    className="flex h-6 w-6 items-center justify-center rounded-full border border-surface-border text-secondary transition hover:border-accent hover:text-accent focus:border-accent focus:text-accent focus:outline-none"
                  >
                    <Info size={13} />
                  </button>
                  <span
                    role="tooltip"
                    className="pointer-events-none invisible absolute left-8 top-1/2 z-20 w-72 -translate-y-1/2 rounded-lg border border-surface-border bg-zinc-800 px-3 py-2 text-xs leading-relaxed text-zinc-200 opacity-0 shadow-xl transition group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100"
                  >
                    O produto adicionado aqui vira uma <b>venda nova</b> para este cliente ao salvar
                    {editandoPedidoFechado ? ", já como Negócio fechado" : ", em Negociação"} (aparece na
                    tela de Vendas). Se a venda já existir, escolha-a na seleção de vendas.
                  </span>
                </span>
              </div>

              <div className="grid flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-stretch">
              <div className="flex flex-col rounded-xl border border-surface-border p-4">
                <h3 className="mb-3 text-sm font-semibold text-white">Condições comerciais</h3>
                {cotacaoDupla && (
                  <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                    <span className="flex-1">
                      Cotado à vista e a prazo. Quando o cliente decidir, fique só com o preço fechado pra fazer o pedido:
                    </span>
                    <button
                      type="button"
                      onClick={() => escolherPreco("AVISTA")}
                      className="rounded-md border border-amber-400/50 px-2.5 py-1 font-semibold hover:bg-amber-500/20"
                    >
                      Ficar com à vista
                    </button>
                    <button
                      type="button"
                      onClick={() => escolherPreco("APRAZO")}
                      className="rounded-md border border-amber-400/50 px-2.5 py-1 font-semibold hover:bg-amber-500/20"
                    >
                      Ficar com a prazo
                    </button>
                  </div>
                )}
                <div className="grid flex-1 content-start gap-4 sm:grid-cols-2">
                  {/* Linha 1: pagamento, parcelas, intervalo e a data (faturamento no pedido, validade no orçamento). */}
                  <div className="grid gap-3 sm:col-span-2 sm:grid-cols-2 lg:grid-cols-4">
                    <div>
                      <label className={labelCls}>Condição de pagamento</label>
                      <select
                        value={cotacaoDupla ? "DUPLA" : condicaoPagamentoTipo}
                        onChange={(e) => {
                          if (e.target.value === "DUPLA") {
                            // As parcelas abaixo passam a descrever o "a prazo".
                            setCotacaoDupla(true);
                            setCondicaoPagamentoTipo("APRAZO");
                            setItens((atuais) =>
                              atuais.map((i) => {
                                const produto = produtosPorId.get(i.produtoId);
                                const preco = produto ? precoDeVendaDoProduto(produto, "APRAZO") : null;
                                return i.valorUnitarioAprazo || preco == null ? i : { ...i, valorUnitarioAprazo: preco.toFixed(2) };
                              })
                            );
                          } else if (cotacaoDupla) {
                            escolherPreco(e.target.value as CondicaoTipo);
                          } else {
                            setCondicaoPagamentoTipo(e.target.value as CondicaoTipo);
                          }
                        }}
                        className={inputCls}
                      >
                        <option value="AVISTA">À vista</option>
                        <option value="APRAZO">A prazo</option>
                        {(cotacaoDupla || !editandoPedidoFechado) && (
                          <option value="DUPLA">À vista e a prazo</option>
                        )}
                      </select>
                    </div>
                    {condicaoPagamentoTipo === "APRAZO" && (
                      <>
                        <div>
                          <label className={labelCls}>Nº de parcelas</label>
                          <NumberInput
                            min={1}
                            inputMode="numeric"
                            value={numeroParcelas}
                            onChange={(e) => setNumeroParcelas(e.target.value)}
                            className={inputCls}
                          />
                        </div>
                        <div>
                          <label className={labelCls}>Intervalo (dias)</label>
                          <NumberInput
                            min={1}
                            inputMode="numeric"
                            value={intervaloParcelas}
                            onChange={(e) => setIntervaloParcelas(e.target.value)}
                            className={inputCls}
                          />
                        </div>
                      </>
                    )}
                    {editandoPedidoFechado ? (
                      <div>
                        <label className={labelCls}>Data de vencimento</label>
                        <DateInput
                          value={dataFaturamento}
                          onChange={(e) => setDataFaturamento(e.target.value)}
                          className={inputCls}
                        />
                      </div>
                    ) : (
                      <div>
                        <label className={labelCls}>Validade do orçamento</label>
                        <DateInput
                          value={validade}
                          onChange={(e) => setValidade(e.target.value)}
                          className={inputCls}
                        />
                      </div>
                    )}
                    {condicaoPagamentoTipo === "APRAZO" && (
                      <p className="text-xs text-muted sm:col-span-2 lg:col-span-4">
                        Fica no documento como: <span className="text-zinc-300">{condicaoPagamento || "—"}</span>
                        {editandoPedidoFechado && " · a 1ª parcela vence nessa data."}
                      </p>
                    )}
                  </div>
                  <div>
                    <label className={labelCls}>Frete</label>
                    <select value={frete} onChange={(e) => setFrete(e.target.value)} className={inputCls}>
                      <option value="">Não informado</option>
                      <option value="CIF - por conta do vendedor">CIF — por conta do vendedor</option>
                      <option value="FOB - por conta do cliente">FOB — por conta do cliente</option>
                      <option value="A combinar">A combinar</option>
                      {frete && ![
                        "CIF - por conta do vendedor",
                        "FOB - por conta do cliente",
                        "A combinar",
                      ].includes(frete) && <option value={frete}>{frete}</option>}
                    </select>
                  </div>
                  {editandoPedidoFechado && parcelasPrevia.length > 0 && (
                    <div className="rounded-lg border border-surface-border bg-zinc-950/50 p-3 sm:col-span-2">
                      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
                        Parcelas a partir do faturamento
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {parcelasPrevia.map((parcela) => (
                          <div
                            key={parcela.numero}
                            className="rounded-md border border-surface-border bg-zinc-900 px-3 py-1.5 text-xs"
                          >
                            <span className="font-semibold text-accent">{parcela.numero}ª</span>{" "}
                            <span className="text-zinc-200">
                              {new Date(`${parcela.data}T00:00:00Z`).toLocaleDateString("pt-BR", { timeZone: "UTC" })}
                            </span>{" "}
                            <span className="text-secondary">· {fmtBRL(parcela.valor)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="sm:col-span-2">
                    <label className={labelCls}>Local de entrega</label>
                    <input
                      value={localEntrega}
                      onChange={(e) => setLocalEntrega(e.target.value)}
                      className={inputCls}
                      placeholder="Ex.: Fazenda Santa Maria, armazém principal"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className={labelCls}>Observações</label>
                    <input
                      value={observacoes}
                      onChange={(e) => setObservacoes(e.target.value)}
                      className={inputCls}
                    />
                  </div>
                  {editandoPedidoFechado && (
                    <div className="sm:col-span-2">
                      <label className={labelCls}>Termos e condições (complemento opcional)</label>
                      <textarea
                        value={termosCondicoes}
                        onChange={(e) => setTermosCondicoes(e.target.value)}
                        className={inputCls}
                        rows={confortavel ? 4 : 2}
                        placeholder="Ex.: em caso de atraso na entrega, o cliente poderá solicitar revisão das condições."
                      />
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-3">
                <SimuladorMargem itens={itensParaSimulador} margemMedia={margemMedia} somenteResumo />
                <div className="space-y-2 rounded-xl border border-surface-border bg-zinc-950/60 p-4 text-sm">
                  <div className="flex justify-between text-secondary">
                    <span>Subtotal</span>
                    <span className="text-white">{fmtBRL(subtotal)}</span>
                  </div>
                  <div className="flex justify-between text-secondary">
                    <span>
                      Desconto
                      {descontoTotal > 0 && subtotal > 0 && (
                        <span className="ml-1.5 rounded bg-accent/15 px-1.5 py-0.5 text-xs font-semibold text-accent">
                          {fmtPct(descontoTotal / subtotal)}
                        </span>
                      )}
                    </span>
                    <span className="text-white">{fmtBRL(descontoTotal)}</span>
                  </div>
                  <div className="flex items-baseline justify-between border-t border-surface-border pt-2">
                    <span className="text-zinc-300">{cotacaoDupla ? "Total à vista" : "Total"}</span>
                    <span className="text-xl font-bold text-accent">{fmtBRL(total)}</span>
                  </div>
                  {cotacaoDupla && (
                    <div className="flex items-baseline justify-between">
                      <span className="text-zinc-300">Total a prazo</span>
                      <span className="text-xl font-bold text-white">{fmtBRL(totalAprazo)}</span>
                    </div>
                  )}
                </div>
              </div>
              </div>

              {clienteIncompleto && clienteAtual && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setEditandoCadastro(true)}
                    className="rounded-lg border border-amber-500/50 bg-amber-500/10 px-3 py-1.5 text-sm font-semibold text-amber-300 transition hover:bg-amber-500/20"
                  >
                    Editar cadastro
                  </button>
                  <span className="group relative inline-flex">
                    <button
                      type="button"
                      aria-label="Por que o cadastro precisa ser completado"
                      className="flex h-6 w-6 items-center justify-center rounded-full border border-amber-500/50 text-amber-300 transition hover:bg-amber-500/15 focus:outline-none focus-visible:bg-amber-500/15"
                    >
                      <Info size={13} />
                    </button>
                    <span
                      role="tooltip"
                      className="pointer-events-none invisible absolute bottom-8 left-0 z-20 w-80 rounded-lg border border-surface-border bg-zinc-800 px-3 py-2 text-xs leading-relaxed text-zinc-200 opacity-0 shadow-xl transition group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100"
                    >
                      Cadastro incompleto: para enviar o pedido para assinatura faltam{" "}
                      <b className="text-amber-300">{camposFaltantes(clienteAtual).join(", ")}</b>. Clique em
                      “Editar cadastro” para preencher aqui mesmo.
                    </span>
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        {erro && (
          <p role="alert" className="mx-6 rounded-lg bg-danger/10 px-3 py-2 text-sm text-red-400">{erro}</p>
        )}

        <div className="flex items-center justify-between gap-3 border-t border-surface-border px-6 py-4">
          <button
            type="button"
            onClick={aoFechar}
            className="rounded-lg border border-danger/40 bg-danger/10 px-4 py-2 text-sm font-semibold text-danger-ink hover:bg-danger/20"
          >
            Cancelar
          </button>
          <div className="flex gap-2">
            {!editando && passo > 1 && (
              <button
                type="button"
                onClick={() => setPasso((p) => p - 1)}
                className="flex items-center gap-1.5 rounded-lg border border-surface-border px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
              >
                Voltar
              </button>
            )}
            {!editando && passo === 1 && (
              <button
                type="button"
                onClick={avancarDoPasso1}
                className="flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground hover:brightness-110"
              >
                Avançar <ChevronRight size={16} />
              </button>
            )}
            {passo === 2 &&
              (editandoPedidoFechado ? (
                // Editando um Pedido (ja PROPOSTA): negocio ja foi fechado
                // antes, so resta salvar as alteracoes.
                <button
                  type="button"
                  disabled={pendente}
                  onClick={salvar}
                  className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground hover:brightness-110 disabled:opacity-50"
                >
                  {pendente ? "Atualizando..." : "Atualizar"}
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    disabled={pendente}
                    onClick={salvar}
                    className="rounded-lg bg-emerald-400 px-4 py-2 text-sm font-semibold text-emerald-950 hover:brightness-110 disabled:opacity-50"
                  >
                    {pendente ? "Salvando..." : "Gerar orçamento"}
                  </button>
                  <button
                    type="button"
                    disabled={pendente}
                    onClick={fechar}
                    className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-50"
                  >
                    {pendente ? "Salvando..." : "Fechar negócio"}
                  </button>
                </>
              ))}
          </div>
        </div>

        {editandoCadastro && clienteAtual && (
          <EditarCadastroClienteModal
            cliente={clienteAtual}
            aoSalvar={(atualizado) =>
              setAjustesCliente((atual) => ({ ...atual, [clienteAtual.id]: { ...atual[clienteAtual.id], ...atualizado } }))
            }
            aoFechar={() => setEditandoCadastro(false)}
          />
        )}
      </div>

      {previaUrl && (
        <PreviaPdfModal
          url={previaUrl}
          titulo={editandoPedidoFechado ? "Prévia do pedido" : "Prévia do orçamento"}
          nomeArquivo={editandoPedidoFechado ? "pedido-previa.pdf" : "orcamento-previa.pdf"}
          rotuloVoltar="Voltar ao editor"
          aoFechar={fecharPrevia}
        />
      )}
    </DialogFrame>
  );
}
