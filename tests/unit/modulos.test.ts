import { describe, expect, it } from "vitest";
import { moduloDaRota, modulosParaUsuario, normalizarModulos, podeAcessarRota } from "@/lib/modulos";

describe("separação dos módulos", () => {
  it("mantém Cadastros e Estoque independentes de Gestão comercial", () => {
    expect(normalizarModulos(["CADASTROS", "ESTOQUE", "invalido", "ESTOQUE"])).toEqual(["CADASTROS", "ESTOQUE"]);
    expect(modulosParaUsuario(["ESTOQUE"], [], "ADMIN")).toEqual(["ESTOQUE"]);
    expect(modulosParaUsuario(["VENDAS"], [], "CONSULTOR")).not.toContain("ESTOQUE");
  });
  it("mantém despesas vinculadas ao Financeiro e respeita os bloqueios", () => {
    expect(modulosParaUsuario(["ERP"], [], "ADMIN")).toEqual(["ERP", "DESPESAS"]);
    expect(modulosParaUsuario(["ERP"], ["DESPESAS"], "CONSULTOR")).toEqual(["ERP"]);
    expect(modulosParaUsuario(["CADASTROS", "ESTOQUE"], ["ESTOQUE"], "CONSULTOR")).toEqual(["CADASTROS"]);
  });
  it.each([
    ["/clientes", "CADASTROS"], ["/clientes/cliente-1", "CADASTROS"],
    ["/localizacao", "CADASTROS"],
    ["/fornecedores", "CADASTROS"], ["/produtos", "ESTOQUE"],
    ["/propostas", "VENDAS"], ["/em-carteira", "ERP"],
    ["/financeiro/faturamento", "ERP"], ["/despesas", "DESPESAS"],
    ["/relatorios/visitas", "VISITAS"], ["/relatorios/trabalhos", "VISITAS"],
  ])("associa %s ao módulo %s", (rota, modulo) => {
    expect(moduloDaRota(rota)).toBe(modulo);
  });
  it("não permite abrir produtos web só com Cadastros ou Gestão comercial", () => {
    expect(podeAcessarRota("/produtos", ["CADASTROS", "VENDAS"])).toBe(false);
    expect(podeAcessarRota("/produtos", ["ESTOQUE"])).toBe(true);
  });
  it("preserva o catálogo de leitura dos pedidos no app mobile", () => {
    expect(podeAcessarRota("/api/mobile/produtos", ["VENDAS"])).toBe(true);
    expect(podeAcessarRota("/api/mobile/produtos", ["ESTOQUE"])).toBe(true);
    expect(podeAcessarRota("/api/mobile/produtos", ["VISITAS"])).toBe(false);
  });
  it("não captura prefixos semelhantes", () => {
    expect(moduloDaRota("/produtos-outros")).toBeNull();
  });
});
