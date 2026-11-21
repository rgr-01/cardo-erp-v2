import { describe, expect, it } from "vitest";
import { fracaoDoMes, mesesDaSafra } from "@/lib/despesas-contas";

describe("mesesDaSafra", () => {
  it("vai de julho a junho", () => {
    const m = mesesDaSafra("26/27", { y: 2026, m: 9 });
    expect(m).toHaveLength(12);
    expect(m[0]).toEqual({ y: 2026, m: 6 });
    expect(m[11]).toEqual({ y: 2027, m: 5 });
  });

  it("cobre todos os meses de uma safra de vários anos", () => {
    const m = mesesDaSafra("24/27", { y: 2026, m: 9 });
    expect(m).toHaveLength(36);
    expect(m[35]).toEqual({ y: 2027, m: 5 });
  });

  it("nome fora do padrão usa a safra do mês atual", () => {
    expect(mesesDaSafra("Teste", { y: 2027, m: 2 })[0]).toEqual({ y: 2026, m: 6 });
  });
});

describe("fracaoDoMes", () => {
  it("é proporcional só no mês corrente", () => {
    expect(fracaoDoMes(2026, 9, { y: 2026, m: 9, d: 1 })).toBeCloseTo(1 / 31);
    expect(fracaoDoMes(2026, 8, { y: 2026, m: 9, d: 1 })).toBe(1);
  });
});
