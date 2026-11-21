import { fmtBRL } from "@/lib/format";
import { precoMinimo } from "@/lib/preco-minimo";

export function PrecosProduto({ avista, aprazo, custoCompra }: {
  avista: number | null | undefined;
  aprazo: number | null | undefined;
  custoCompra?: number | null;
}) {
  const formatar = (valor: number | null | undefined) =>
    valor != null && Number.isFinite(valor) && valor >= 0 ? fmtBRL(valor) : "—";

  return (
    <div className="space-y-2">
      <span className="grid grid-cols-[auto_1fr_1fr] gap-x-3 gap-y-1 text-xs">
        <span />
        <span className="text-right text-muted" title="Preço cadastrado menos 3%">Preço mínimo</span>
        <span className="text-right text-muted">Preço</span>
        {([
          ["À vista", avista],
          ["A prazo", aprazo],
        ] as const).map(([rotulo, valor]) => (
          <span key={rotulo} className="contents">
            <span className="text-secondary">{rotulo}</span>
            <span className="text-right font-semibold text-accent">{formatar(precoMinimo(valor))}</span>
            <span className="text-right font-semibold text-white">{formatar(valor)}</span>
          </span>
        ))}
      </span>
      {custoCompra !== undefined && (
        <p className="text-xs text-muted">
          Custo de compra:{" "}
          <span className="font-semibold text-zinc-300">{formatar(custoCompra)}</span>
        </p>
      )}
    </div>
  );
}
