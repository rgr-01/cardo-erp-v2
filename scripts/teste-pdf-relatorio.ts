import fs from "node:fs";
import { gerarPdfRelatorioVisita } from "../src/lib/relatorio-pdf";
import { novoId } from "../src/lib/relatorio-conteudo";

async function main() {
  const bytes = await gerarPdfRelatorioVisita({
    clienteNome: "Fazenda Teste",
    consultorNome: "Consultor Teste",
    titulo: "Visita de teste",
    dataVisita: new Date(),
    blocos: [
      {
        id: novoId(),
        tipo: "texto",
        texto: "Relato de teste com uma frase mais longa pra checar a quebra de linha automática dentro da caixa de texto do PDF gerado pelo pdf-lib.",
        pagina: 0,
        x: 40,
        y: 40,
        w: 720,
        h: 140,
      },
      {
        id: novoId(),
        tipo: "grafico",
        titulo: "Produtividade por talhão",
        formato: "barra",
        series: ["Safra atual", "Safra anterior"],
        linhas: [
          { rotulo: "Talhão 1", valores: [58, 52] },
          { rotulo: "Talhão 2", valores: [61, 49] },
          { rotulo: "Talhão 3", valores: [null, 55] },
        ],
        pagina: 0,
        x: 40,
        y: 200,
        w: 720,
        h: 260,
      },
      {
        id: novoId(),
        tipo: "grafico",
        titulo: "Distribuição de área",
        formato: "pizza",
        series: ["Área (ha)"],
        linhas: [
          { rotulo: "Soja", valores: [120] },
          { rotulo: "Milho", valores: [80] },
          { rotulo: "Pousio", valores: [20] },
        ],
        pagina: 0,
        x: 40,
        y: 480,
        w: 400,
        h: 260,
      },
      {
        id: novoId(),
        tipo: "texto",
        texto: "Bloco na segunda página.",
        pagina: 1,
        x: 40,
        y: 40,
        w: 720,
        h: 100,
      },
    ],
  });
  fs.writeFileSync("/tmp/teste-relatorio.pdf", bytes);
  console.log("PDF gerado:", bytes.length, "bytes");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
