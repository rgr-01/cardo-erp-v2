import type { StatusProposta, TipoProposta } from "@/lib/propostas";

export type StatusAssinatura =
  | "NAO_ENVIADA"
  | "AGUARDANDO_ASSINATURA"
  | "ASSINADA"
  | "RECUSADA";

export type StatusMargem =
  | "OK"
  | "AGUARDANDO_APROVACAO"
  | "APROVADA_GESTOR"
  | "RECUSADA_GESTOR"
  | "RECUSADA_CONFERENCIA";

export type ClienteOpcaoProposta = {
  id: string;
  nome: string;
  documento: string | null;
  razaoSocial: string | null;
  telefone: string | null;
  email: string | null;
  endereco: string | null;
  cidade: string | null;
  uf: string | null;
  cep: string | null;
};

export type ProdutoOpcaoProposta = {
  id: string;
  nome: string;
  fornecedorNome: string;
  ingredienteAtivo: string | null;
  embalagem: string | null;
  recomendacao: string | null;
  custoAvista: number | null;
  custoAprazo: number | null;
  custoCompra: number | null;
};

export type ConsultorOpcaoProposta = { id: string; nome: string };

export type VendaOpcaoProposta = {
  id: string;
  clienteId: string;
  consultorId: string;
  produtoId: string;
  produtoNome: string;
  fornecedorNome: string;
  cultura: string | null;
  volume: number | null;
  condicaoPagamentoTipo: "AVISTA" | "APRAZO";
  valorUnitario: number | null;
  valorTotal: number;
};

export type PropostaItemLinha = {
  id: string;
  produtoId: string;
  vendaId: string | null;
  produtoNome: string;
  fornecedorNome: string;
  ingredienteAtivo: string | null;
  embalagem: string | null;
  recomendacao: string | null;
  cultura: string | null;
  volume: number | null;
  unidade: string | null;
  condicaoPagamentoTipo: "AVISTA" | "APRAZO";
  valorUnitario: number | null;
  // Cotado a vista e a prazo: preco a prazo (valorUnitario e o a vista).
  valorUnitarioAprazo?: number | null;
  // Desconto em % so deste item (valorUnitario e o bruto; total ja e liquido).
  descontoPct: number;
  total: number;
  ordem: number;
};

export type OrigemProposta = "WEB" | "BOT";

export type PropostaLinha = {
  id: string;
  tipo: TipoProposta;
  origem: OrigemProposta;
  numero: number;
  clienteId: string;
  clienteNome: string;
  consultorId: string;
  consultorNome: string;
  status: StatusProposta;
  validade: string | null;
  // Pedido: data de faturamento (1ª parcela); orçamento usa a validade.
  dataFaturamento: string | null;
  previsaoEntrega: string | null;
  localEntrega: string | null;
  frete: string | null;
  condicaoPagamento: string | null;
  condicaoPagamentoTipo: "AVISTA" | "APRAZO";
  observacoes: string | null;
  termosCondicoes: string | null;
  subtotal: number;
  desconto: number;
  total: number;
  createdAt: string;
  itens: PropostaItemLinha[];
  statusAssinatura: StatusAssinatura;
  pdfAssinadoUrl: string | null;
  statusMargem: StatusMargem;
  margemMotivoRecusa: string | null;
  margemPct: number | null;
  // true quando o negocio ja fechou (venda em FECHADO) mas ainda falta a
  // conferencia final do administrativo antes de virar Em carteira de fato
  // (ver aprovarConferenciaFinal em lib/servicos/propostas.ts).
  aguardandoConferencia: boolean;
};
