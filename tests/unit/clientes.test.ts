import { describe, expect, it } from "vitest";
import { camposFaltantes, clienteCompleto } from "@/lib/clientes";

const clienteCompletoBase = {
  nome: "Fazenda Horizonte",
  documento: "12.345.678/0001-90",
  razaoSocial: null,
  email: "compras@horizonte.com.br",
  endereco: "Rodovia MT 000, km 10",
  cidade: "Sorriso",
  uf: "MT",
  cep: "78890-000",
};

describe("dados obrigatórios para assinatura", () => {
  it("aceita cliente com todos os dados necessários", () => {
    expect(clienteCompleto(clienteCompletoBase)).toBe(true);
    expect(camposFaltantes(clienteCompletoBase)).toEqual([]);
  });

  it("informa exatamente os dados que impedem a assinatura", () => {
    const incompleto = {
      ...clienteCompletoBase,
      documento: null,
      endereco: null,
      email: null,
    };

    expect(clienteCompleto(incompleto)).toBe(false);
    expect(camposFaltantes(incompleto)).toEqual(["CPF/CNPJ", "endereço", "e-mail"]);
  });
});
