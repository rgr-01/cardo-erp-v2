// Mostrado na hora do clique enquanto o servidor monta a página: a sidebar
// (layout) continua visível e só o conteúdo vira esqueleto.
export default function Carregando() {
  return (
    <div className="animate-pulse space-y-4" aria-busy="true" role="status" aria-label="Carregando dados da página">
      <div className="space-y-2">
        <div className="h-6 w-48 rounded bg-zinc-800" />
        <div className="h-3 w-32 rounded bg-zinc-800/70" />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div
            key={i}
            className="h-20 rounded-xl border border-surface-border bg-zinc-900"
          />
        ))}
      </div>

      <div className="space-y-2 rounded-xl border border-surface-border bg-zinc-900 p-4">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="h-4 rounded bg-zinc-800" />
        ))}
      </div>
    </div>
  );
}
