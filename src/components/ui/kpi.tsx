import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { ESTILO_INDICADOR } from "./padroes-painel";

export function Kpi({ rotulo, valor, detalhe, grande = false, icone: Icone, unidade, alerta = false, children }: {
  rotulo: string;
  valor: string;
  detalhe?: string;
  grande?: boolean;
  icone?: LucideIcon;
  unidade?: string;
  alerta?: boolean;
  children?: ReactNode;
}) {
  return <div className={ESTILO_INDICADOR}>
    <div className="flex items-start justify-between gap-2">
      <p className="text-xs font-medium text-secondary">{rotulo}</p>
      {Icone && <Icone size={16} className={`shrink-0 ${alerta ? "text-danger-ink" : "text-accent"}`} aria-hidden />}
    </div>
    <div className="mt-3 flex flex-wrap items-baseline gap-x-2 gap-y-1">
      <p title={valor} className={`min-w-0 break-words font-semibold tracking-tight tabular-nums ${grande ? "text-3xl" : valor.length > 12 ? "text-base @min-[140px]:text-[17px] @min-[220px]:text-2xl" : "text-xl @min-[220px]:text-2xl"} ${alerta ? "text-danger-ink" : "text-white"}`}>{valor}</p>
      {unidade && <span className="text-xs text-muted">{unidade}</span>}
    </div>
    {detalhe && <p className="mt-2 text-[11px] leading-relaxed text-muted">{detalhe}</p>}
    {children && <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] leading-relaxed text-muted">{children}</div>}
  </div>;
}
