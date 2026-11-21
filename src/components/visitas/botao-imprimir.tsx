// Baixa o PDF gerado no servidor (mesmo layout do canvas), em vez do
// diálogo de impressão do navegador — que só imprimia a página HTML crua,
// sem nenhum design.
export function BotaoImprimir({ relatorioId }: { relatorioId: string }) {
  return (
    <a
      href={`/api/relatorios/visitas/${relatorioId}/pdf`}
      className="rounded-lg border border-surface-border px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
    >
      Exportar PDF
    </a>
  );
}
