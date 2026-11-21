import { describe, expect, it } from "vitest";
import { gruposDeNavegacao, grupoDaRota } from "@/lib/navegacao";
import { MODULOS } from "@/lib/modulos";

describe("navegação por área", () => {
  it("reúne carteira e despesas em Financeiro e mantém dashboard no comercial", () => {
    const grupos = gruposDeNavegacao("ADMIN", MODULOS);
    expect(grupos.map(g => g.id)).toEqual(["CADASTROS", "ESTOQUE", "VENDAS", "ERP", "VISITAS"]);
    expect(grupos.find(g => g.id === "ERP")?.links.map(l => l.href)).toEqual(expect.arrayContaining(["/em-carteira", "/despesas", "/financeiro/faturamento"]));
    expect(grupos.find(g => g.id === "VENDAS")?.links[0].href).toBe("/dashboard");
  });
  it("não oferece áreas administrativas para consultores", () => {
    const grupos = gruposDeNavegacao("CONSULTOR", MODULOS);
    const hrefs = grupos.flatMap(g => g.links.map(l => l.href));
    expect(grupos.some(g => g.id === "ESTOQUE")).toBe(false);
    expect(hrefs).not.toContain("/fornecedores");
    expect(hrefs).not.toContain("/financeiro/notas-fiscais");
    expect(hrefs).not.toContain("/propostas/aprovacao-margem");
  });
  it("mantém despesas como única função de Financeiro quando permitidas sozinhas", () => {
    const grupos = gruposDeNavegacao("CONSULTOR", ["DESPESAS"]);
    expect(grupos).toHaveLength(1);
    expect(grupos[0].id).toBe("ERP");
    expect(grupos[0].links.map(l => l.href)).toEqual(["/despesas"]);
    expect(grupoDaRota("/despesas", grupos)?.id).toBe("ERP");
  });
  it("identifica a área de links diretos e não inventa seleção no início", () => {
    const grupos = gruposDeNavegacao("ADMIN", MODULOS);
    expect(grupoDaRota("/financeiro/notas-fiscais", grupos)?.id).toBe("ERP");
    expect(grupoDaRota("/relatorios/visitas/123/editar", grupos)?.id).toBe("VISITAS");
    expect(grupoDaRota("/dashboard", grupos)?.id).toBe("VENDAS");
    expect(grupoDaRota("/inicio", grupos)).toBeUndefined();
    expect(grupoDaRota("/produtos", gruposDeNavegacao("ADMIN", ["VISITAS"]))).toBeUndefined();
  });
  it("não cria menus sem funções acessíveis", () => {
    expect(gruposDeNavegacao("CONSULTOR", [])).toEqual([]);
    expect(gruposDeNavegacao("CONSULTOR", ["ESTOQUE"])).toEqual([]);
  });
});
