import { describe, expect, it } from "vitest";
import { COR_SEM_CONSULTOR, PALETA_CONSULTOR, coresPadrao, corDoConsultor, corValida } from "@/lib/cores-consultor";

describe("cores do consultor", () => {
  it("valida só #rrggbb", () => {
    expect(corValida("#4ade80")).toBe(true);
    expect(corValida("#4ADE80")).toBe(true);
    expect(corValida("4ade80")).toBe(false);
    expect(corValida("#fff")).toBe(false);
    expect(corValida("red")).toBe(false);
  });

  it("dá uma cor diferente a cada consultor enquanto a paleta couber", () => {
    const ids = PALETA_CONSULTOR.map((_, i) => `u${i}`);
    expect(new Set(Object.values(coresPadrao(ids))).size).toBe(ids.length);
  });

  it("a escolha do admin vale mais que o padrão; sem consultor é cinza", () => {
    const cores = { ...coresPadrao(["a", "b"]), b: "#123456" };
    expect(corDoConsultor("b", cores)).toBe("#123456");
    expect(corDoConsultor("a", cores)).toBe(PALETA_CONSULTOR[0]);
    expect(corDoConsultor(null, cores)).toBe(COR_SEM_CONSULTOR);
  });
});
