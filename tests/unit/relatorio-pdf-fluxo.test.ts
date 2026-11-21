import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { gerarPdfRelatorioVisita } from "@/lib/relatorio-pdf";
import type { Bloco } from "@/lib/relatorio-conteudo";

describe("PDF fluido de relatório de visita", () => {
  it("quebra relato longo em várias páginas e aceita gráfico em visita comum", async () => {
    const geometria = { pagina: 0, x: 40, y: 40, w: 714, h: 160 };
    const blocos: Bloco[] = [
      {
        ...geometria,
        id: "relato",
        tipo: "texto",
        texto: Array.from({ length: 180 }, (_, i) => `Observação de campo ${i + 1}: desenvolvimento uniforme e recomendação registrada.`).join(" "),
      },
      {
        ...geometria,
        id: "grafico",
        tipo: "grafico",
        titulo: "Desenvolvimento por talhão",
        formato: "barra",
        series: ["Altura"],
        linhas: [
          { rotulo: "Talhão 1", valores: [52] },
          { rotulo: "Talhão 2", valores: [61] },
        ],
        largura: "inteira",
      },
    ];

    const bytes = await gerarPdfRelatorioVisita({
      tipo: "VISITA",
      clienteNome: "Cliente de teste",
      fazendaNome: "Fazenda de teste",
      consultorNome: "Consultor",
      titulo: "Visita de acompanhamento",
      dataVisita: new Date("2026-10-12T12:00:00-03:00"),
      blocos,
    });
    const pdf = await PDFDocument.load(bytes);

    expect(pdf.getPageCount()).toBeGreaterThan(1);
  });
});
