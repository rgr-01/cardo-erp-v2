import { describe, expect, it } from "vitest";
import { montarDados, montarItens, paraData, propostaSchema } from "@/lib/pedidos";

describe("montagem de orçamento e pedido", () => {
  const input = {
    clienteId: "cliente-1",
    validade: "2026-10-31",
    previsaoEntrega: "2026-11-15",
    localEntrega: "Fazenda Santa Maria - armazém principal",
    frete: "CIF - por conta da Rede Agro",
    condicaoPagamento: "30 dias",
    condicaoPagamentoTipo: "APRAZO" as const,
    desconto: 25,
    itens: [
      { produtoId: "produto-1", volume: 2, valorUnitario: 100, unidade: "L" },
      {
        produtoId: "produto-2",
        volume: 3,
        valorUnitario: 50,
        unidade: "kg",
        condicaoPagamentoTipo: "AVISTA" as const,
      },
    ],
  };

  it("calcula subtotal, desconto e total sem permitir valor negativo", () => {
    const dados = propostaSchema.parse(input);
    expect(montarDados(dados, "consultor-1", "safra-1")).toMatchObject({
      clienteId: "cliente-1",
      consultorId: "consultor-1",
      safraId: "safra-1",
      subtotal: 350,
      desconto: 25,
      total: 325,
      localEntrega: "Fazenda Santa Maria - armazém principal",
      frete: "CIF - por conta da Rede Agro",
      condicaoPagamentoTipo: "APRAZO",
    });
  });

  it("congela o custo do produto e mantém a ordem dos itens", () => {
    const dados = propostaSchema.parse(input);
    const itens = montarItens(
      dados,
      new Map([
        ["produto-1", { custoCompra: 60 }],
        ["produto-2", { custoCompra: null }],
      ])
    );

    expect(itens).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ produtoId: "produto-1", custoUnitario: 60, total: 200, ordem: 1 }),
        expect.objectContaining({ produtoId: "produto-2", custoUnitario: null, total: 150, ordem: 2 }),
      ])
    );
  });

  it("trata datas ausentes ou inválidas como nulas", () => {
    expect(paraData(null)).toBeNull();
    expect(paraData("data-inválida")).toBeNull();
    expect(paraData("2026-10-31")?.toISOString()).toContain("2026-10-31");
  });
});
