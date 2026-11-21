// Emissão de nota fiscal e boleto avulsos por um provedor externo (Siagri,
// Focus NFe, banco...). Hoje só o registro manual funciona: o Financeiro
// emite por fora e digita/anexa os dados. Para ligar um provedor de verdade,
// implemente as funções dele aqui e defina FISCAL_PROVEDOR / BOLETO_PROVEDOR
// no ambiente (ex.: "SIAGRI"); as telas e o banco já estão prontos.

export type ItemNota = {
  descricao: string;
  ncm?: string;
  unidade: string;
  quantidade: number;
  valorUnitario: number;
};

export type DadosNotaAvulsa = {
  id: string;
  naturezaOperacao: string;
  cfop: string | null;
  itens: ItemNota[];
  valorTotal: number;
  observacoes: string | null;
  cliente: {
    nome: string;
    razaoSocial: string | null;
    documento: string | null;
    inscricaoEstadual: string | null;
    endereco: string | null;
    cidade: string | null;
    uf: string | null;
    cep: string | null;
    email: string | null;
  };
};

// PROCESSANDO = provedor aceitou e confirma depois (webhook/consulta).
export type ResultadoNota =
  | { status: "EMITIDA"; numero: string; serie?: string; chaveAcesso?: string; pdfUrl?: string; xmlUrl?: string; referencia?: string }
  | { status: "PROCESSANDO"; referencia: string }
  | { status: "ERRO"; mensagem: string };

export type DadosBoletoAvulso = {
  id: string;
  valor: number;
  vencimento: Date;
  descricao: string;
  pagador: { nome: string; documento: string | null; endereco: string | null; cidade: string | null; uf: string | null; cep: string | null };
};

export type ResultadoBoleto =
  | { status: "EMITIDO"; linhaDigitavel: string; pdfUrl?: string; referencia?: string }
  | { status: "ERRO"; mensagem: string };

export type ProvedorFiscal = {
  id: string;
  nome: string;
  emitirNota?: (dados: DadosNotaAvulsa) => Promise<ResultadoNota>;
  cancelarNota?: (referencia: string, justificativa: string) => Promise<void>;
  emitirBoleto?: (dados: DadosBoletoAvulso) => Promise<ResultadoBoleto>;
};

const aguardandoIntegracao = (nome: string) => async (): Promise<never> => {
  throw new Error(`Integração com ${nome} ainda não configurada. Registre a nota/boleto manualmente por enquanto.`);
};

// Pendente: API da Siagri (ERP que a Rede Agro já usa) + certificado A1.
const SIAGRI: ProvedorFiscal = {
  id: "SIAGRI",
  nome: "Siagri",
  emitirNota: aguardandoIntegracao("Siagri"),
  cancelarNota: aguardandoIntegracao("Siagri"),
  emitirBoleto: aguardandoIntegracao("Siagri"),
};

const PROVEDORES: Record<string, ProvedorFiscal> = { SIAGRI };

function provedorDoAmbiente(variavel: string): ProvedorFiscal | null {
  const id = process.env[variavel]?.trim().toUpperCase();
  return id ? PROVEDORES[id] ?? null : null;
}

// Nulo = só registro manual (botão "Emitir pelo provedor" não aparece).
export function provedorNota(): ProvedorFiscal | null {
  const p = provedorDoAmbiente("FISCAL_PROVEDOR");
  return p?.emitirNota ? p : null;
}

export function provedorBoleto(): ProvedorFiscal | null {
  const p = provedorDoAmbiente("BOLETO_PROVEDOR");
  return p?.emitirBoleto ? p : null;
}
