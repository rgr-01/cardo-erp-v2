import type { Status } from "@/lib/format";

export type VendaLinha = {
  id: string;
  clienteId: string;
  clienteNome: string;
  produtoId: string;
  produtoNome: string;
  fornecedorId: string;
  fornecedorNome: string;
  consultorId: string;
  consultorNome: string;
  cultura: string | null;
  volume: number | null;
  condicaoPagamentoTipo: "AVISTA" | "APRAZO";
  valorUnitario: number | null;
  valorTotal: number;
  status: Status;
  dataFechamento: string | null;
  previsaoEntrega: string | null;
  observacoes: string | null;
  safraId: string;
  // Orcamento/Pedido que gerou (ou ja referenciou) essa venda — mostrado no
  // tooltip do status. null quando a venda nao tem nenhum vinculado ainda.
  // tipo PEDIDO = orcamento na tela (/pedidos); PROPOSTA = pedido (/propostas).
  documentoOrigem: { id: string; tipo: "PEDIDO" | "PROPOSTA"; numero: string; clienteNome: string; pdfAssinadoUrl: string | null } | null;
};

export type ClienteOpcao = {
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
export type ProdutoOpcao = {
  id: string;
  nome: string;
  fornecedorId: string;
  fornecedorNome: string;
  ingredienteAtivo: string | null;
  embalagem: string | null;
  recomendacao: string | null;
  custoAvista: number | null;
  custoAprazo: number | null;
  custoCompra: number | null;
};
export type ConsultorOpcao = { id: string; nome: string };
export type SafraOpcao = { id: string; nome: string };
