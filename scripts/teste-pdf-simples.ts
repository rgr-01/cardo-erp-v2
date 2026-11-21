import { writeFileSync } from "fs";
import { gerarPdfPropostaSimples } from "../src/lib/pdf-simples";
import type { PropostaPdf } from "../src/lib/pdf";

const item = (
  produto: string,
  fornecedor: string,
  volume: string,
  unidade: string,
  valorUnitario: string,
  total: string
) => ({ produto, fornecedor, cultura: "", volume, unidade, valorUnitario, total });

const base: PropostaPdf = {
  numero: "3880",
  tipo: "PROPOSTA",
  status: "Aprovado",
  safra: "26/27",
  data: "19/09/2026",
  validade: "30/09/2026",
  previsaoEntrega: "30/05/2027",
  localEntrega: "Fazenda Acor I e II - Santa Rita de Cássia/BA",
  frete: "CIF",
  cliente: {
    nome: "CLAUDIOMIRO TREVISAN",
    razaoSocial: "CLAUDIOMIRO TREVISAN",
    documento: "414.183.100-00",
    inscricaoEstadual: "210644715",
    endereco: "Rodovia BA 351 km 20 + 30 km, Estrada de SN Sede",
    cidadeUfCep: "Santa Rita de Cássia/BA - CEP 47150-000",
    telefone: "(54) 99974-6101",
    email: "cliente@exemplo.com",
  },
  consultor: { nome: "IURE ANTONIO NERY DA CRUZ", email: "iure@redeagro.com" },
  itens: [
    item("LIMPO 1L", "Rede Agro", "5", "LT", "R$ 65,64", "R$ 328,20"),
    item("BRANDT SMART COBRE 20L", "Brandt", "800", "LT", "R$ 44,00", "R$ 35.200,00"),
    item("SCUDERO 10L", "Rede Agro", "960", "LT", "R$ 52,45", "R$ 50.352,00"),
    item("BRANDT BORO 10% 20L", "Brandt", "800", "LT", "R$ 22,43", "R$ 17.944,00"),
    item("GIGAMIX PLUS", "Rede Agro", "400", "KG", "R$ 52,60", "R$ 21.040,00"),
    item("DIRETO GL 10L", "Rede Agro", "200", "LT", "R$ 72,50", "R$ 14.500,00"),
    item("EXATO GL 10L", "Rede Agro", "80", "LT", "R$ 72,50", "R$ 5.800,00"),
    item("BRANDT SMART ZINCO 20L", "Brandt", "640", "LT", "R$ 24,00", "R$ 15.360,00"),
    item("RAIZEN EVOLUTION 5L", "Rede Agro", "520", "LT", "R$ 120,71", "R$ 62.769,20"),
    item("N-BATT-BRADY - INOCULANTE SOJA 4 X 5L 400DS", "Rede Agro", "40.000", "DS", "R$ 1,00", "R$ 40.000,00"),
    item("AZOBATT - INOCULANTE MILHO 4 X 5L 200DS", "Rede Agro", "1.200", "DS", "R$ 3,20", "R$ 3.840,00"),
    item("STINGRAY 20L", "Rede Agro", "240", "LT", "R$ 63,98", "R$ 15.355,20"),
  ],
  subtotal: "R$ 282.488,60",
  desconto: "R$ 0,00",
  total: "R$ 282.488,60",
  condicaoPagamento: "101 - Venda a prazo (Duplicata)",
  observacoes: "",
  termosCondicoes: "",
};

async function main() {
  const [pedido, orcamento] = await Promise.all([
    gerarPdfPropostaSimples(base),
    gerarPdfPropostaSimples({ ...base, tipo: "PEDIDO", numero: "ORC-00123" }),
  ]);
  const saida = process.argv[2] ?? ".";
  writeFileSync(`${saida}/exemplo-pedido.pdf`, pedido);
  writeFileSync(`${saida}/exemplo-orcamento.pdf`, orcamento);
  console.log("ok");
}

main();
