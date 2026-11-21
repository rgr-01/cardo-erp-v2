import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { gerarPdfPlanoDespesas } from "@/lib/despesas-plano-pdf";

const v = { r: 1000, o: 800, ra: 3000, oa: 2400 };

describe("gerarPdfPlanoDespesas", () => {
  it("gera um PDF e quebra em várias páginas quando há muitas contas", async () => {
    const contas = Array.from({ length: 40 }, (_, i) => ({ codigo: `3.1.${i}`, nome: "Conta Ç ã é", ...v }));
    const bytes = await gerarPdfPlanoDespesas({
      subtitulo: "setembro de 2026",
      grupos: [{ nome: "Pessoal", ...v, contas }],
      total: v,
      temOrc: true,
    });
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe("%PDF-");
    const paginas = (await PDFDocument.load(bytes)).getPageCount();
    expect(paginas).toBeGreaterThan(1);
  });
});
