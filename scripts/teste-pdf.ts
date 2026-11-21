import { writeFileSync } from "fs";
import { gerarPdfProposta } from "../src/lib/pdf";

async function main() {
  const pdf = await gerarPdfProposta({
    numero: "ORC-00001",
    tipo: "PEDIDO",
    status: "Rascunho",
    safra: "26/27",
    data: "28/09/2026",
    validade: "15/10/2026",
    previsaoEntrega: "11/11/2026",
    localEntrega: "Fazenda Wontroba 10 - armazém principal",
    frete: "CIF - por conta da Rede Agro",
    cliente: {
      nome: "WONTROBA 10",
      razaoSocial: "WONTROBA AGRONEGÓCIOS LTDA",
      documento: "12.345.678/0001-90",
      inscricaoEstadual: "Isento/não informada",
      endereco: "Rua Sorriso, 151 - Centro",
      cidadeUfCep: "Primavera do Leste/MT - CEP 78850-000",
      telefone: "(66) 99988-5961",
      email: "wontroba2010@gmail.com",
    },
    consultor: { nome: "Ricardo Consultor", email: "ricardo@redeagro.com" },
    itens: [
      {
        fornecedor: "AgBitech",
        produto: "Cartugen",
        cultura: "Soja",
        volume: "100",
        unidade: "L",
        valorUnitario: "R$ 50,00",
        total: "R$ 5.000,00",
      },
      {
        fornecedor: "Bayer Crop Science do Brasil",
        produto: "Fox Xpro Fungicida Sistêmico Premium",
        cultura: "Milho 2ª safra",
        volume: "1.250,5",
        unidade: "mL",
        valorUnitario: "R$ 187,90",
        total: "R$ 234.969,95",
      },
      {
        fornecedor: "Syngenta",
        produto: "Miravis Duo",
        cultura: "Algodão",
        volume: "80",
        unidade: "kg",
        valorUnitario: "R$ 312,00",
        total: "R$ 24.960,00",
      },
    ],
    subtotal: "R$ 264.929,95",
    desconto: "R$ 4.929,95",
    total: "R$ 260.000,00",
    condicaoPagamento: "30/60/90 dias após a entrega",
    observacoes: "Entrega sujeita à confirmação de crédito pelo departamento financeiro.",
    termosCondicoes:
      "Em caso de atraso na entrega superior a 15 dias, o cliente poderá solicitar revisão das condições comerciais.",
  });

  writeFileSync("scripts/teste-proposta.pdf", pdf);
  console.log("PDF gerado: scripts/teste-proposta.pdf");
}

main();
