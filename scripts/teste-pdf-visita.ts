import { writeFileSync } from "fs";
import { gerarPdfRelatorioVisita } from "../src/lib/relatorio-pdf";
import { novoId, type Bloco } from "../src/lib/relatorio-conteudo";

async function main() {
  const blocos: Bloco[] = [
    {
      id: novoId(),
      tipo: "texto",
      texto:
        "Lavoura apresentando bom desenvolvimento vegetativo, com boa uniformidade. " +
        "Identificada ocorrência de buva em reboleiras no talhão 10. Recomenda-se " +
        "acompanhamento e possível intervenção nos próximos 7 dias.",
      estilo: "card",
      titulo: "Observações da visita",
      pagina: 0,
      x: 40,
      y: 40,
      w: 720,
      h: 150,
    },
    {
      id: novoId(),
      tipo: "foto",
      url: "https://images.example.com/inexistente.jpg",
      path: null,
      legenda: "Desenvolvimento da lavoura observado durante a visita técnica.",
      estilo: "card",
      titulo: "Registro fotográfico",
      pagina: 0,
      x: 40,
      y: 220,
      w: 720,
      h: 500,
    },
  ];

  const pdf = await gerarPdfRelatorioVisita({
    clienteNome: "Fazenda Esperança",
    consultorNome: "João da Silva",
    titulo: "Suporte técnico",
    dataVisita: new Date("2026-09-11T08:42:00-03:00"),
    safraNome: "2026/2027",
    blocos,
    rastreamento: {
      finalidade: "Suporte técnico",
      horaChegada: new Date("2026-09-11T08:30:00-03:00"),
      horaSaida: new Date("2026-09-11T09:45:00-03:00"),
      kmChegada: 123456,
      kmSaida: 123512,
      latitude: -19.8745,
      longitude: -49.321,
    },
  });
  writeFileSync("scripts/teste-visita.pdf", pdf);
  console.log("PDF gerado: scripts/teste-visita.pdf");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
