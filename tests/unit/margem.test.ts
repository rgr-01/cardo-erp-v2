import { describe, expect, it } from "vitest";
import {
  MARGEM_MINIMA,
  calcularMargem,
  faixaDaMargem,
  margemPonderada,
  precisaAprovacaoGestor,
  tabelaMinima,
  tabelaSugerida,
} from "@/lib/margem";

describe("regras de margem", () => {
  it("calcula margem sobre o preço de venda", () => {
    expect(calcularMargem(100, 73)).toBeCloseTo(MARGEM_MINIMA);
    expect(calcularMargem(100, null)).toBeNull();
    expect(calcularMargem(0, 10)).toBeNull();
  });

  it("calcula as tabelas mínima e sugerida", () => {
    expect(tabelaMinima(73)).toBeCloseTo(100);
    expect(tabelaSugerida(70)).toBeCloseTo(100);
  });

  it("classifica corretamente os limites de faixa", () => {
    expect(faixaDaMargem(0.2699)).toBe("ABAIXO");
    expect(faixaDaMargem(0.27)).toBe("NA_META");
    expect(faixaDaMargem(0.28)).toBe("BOA");
    expect(faixaDaMargem(0.3)).toBe("BOA");
    expect(faixaDaMargem(0.3001)).toBe("ALTA");
  });

  it("pondera a margem pelo valor de venda, ignorando itens sem custo", () => {
    const margem = margemPonderada([
      { precoVenda: 100, volume: 10, custo: 70 },
      { precoVenda: 100, volume: 1, custo: 50 },
      { precoVenda: 500, volume: 10, custo: null },
    ]);

    expect(margem).toBeCloseTo(350 / 1100);
  });

  it("exige aprovação abaixo da meta ou quando a margem é indeterminada", () => {
    expect(precisaAprovacaoGestor(null)).toBe(true);
    expect(precisaAprovacaoGestor(0.2699)).toBe(true);
    expect(precisaAprovacaoGestor(0.27)).toBe(false);
  });
});
