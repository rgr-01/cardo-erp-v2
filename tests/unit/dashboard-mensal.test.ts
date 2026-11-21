import { describe, expect, it } from "vitest";
import { serieMensalFaturamento } from "@/lib/dashboard-mensal";

describe("sequência mensal do faturamento", () => {
  it("mostra meses sem faturamento sem criar um salto no eixo", () => {
    expect(serieMensalFaturamento(new Map([["2026-08", 900], ["2026-06", 100]]))).toEqual([
      { mes: "jul/26", total: 100 }, { mes: "ago/26", total: 0 }, { mes: "set/26", total: 900 },
    ]);
  });
  it("respeita a virada de ano e mantém os valores originais", () => {
    expect(serieMensalFaturamento(new Map([["2026-11", 250], ["2027-01", 750]]))).toEqual([
      { mes: "dez/26", total: 250 }, { mes: "jan/27", total: 0 }, { mes: "fev/27", total: 750 },
    ]);
  });
  it("não inventa uma série para um filtro sem faturamento", () => {
    expect(serieMensalFaturamento(new Map())).toEqual([]);
    expect(serieMensalFaturamento(new Map([["2026-00", 50]]))).toEqual([{ mes: "jan/26", total: 50 }]);
  });
});
