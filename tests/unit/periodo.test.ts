import { describe, expect, it } from "vitest";
import { rotuloMes, somarDias, somarMeses } from "@/lib/periodo";

describe("períodos do resumo", () => {
  it("soma meses atravessando o ano", () => {
    expect(somarMeses("2026-10", 1)).toBe("2026-11");
    expect(somarMeses("2026-12", 1)).toBe("2027-01");
    expect(somarMeses("2026-01", -1)).toBe("2025-12");
    expect(somarMeses("2026-03", -14)).toBe("2025-01");
  });

  it("soma dias atravessando mês e ano", () => {
    expect(somarDias("2026-10-31", 1)).toBe("2026-11-01");
    expect(somarDias("2026-01-01", -1)).toBe("2025-12-31");
    expect(somarDias("2028-02-28", 1)).toBe("2028-02-29");
  });

  it("escreve o mês por extenso", () => {
    expect(rotuloMes("2026-10")).toBe("outubro de 2026");
    expect(rotuloMes("2026-03")).toBe("março de 2026");
  });
});
