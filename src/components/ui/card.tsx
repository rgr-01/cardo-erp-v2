import { ReactNode } from "react";
import clsx from "clsx";
import { BotaoExportarCard } from "@/components/dashboard/botao-exportar-card";
import { ESTILO_PAINEL, ESTILO_TITULO_PAINEL } from "./padroes-painel";

export function Card({
  title,
  children,
  className,
  glow = false,
  exportavel = false,
  titleClassName,
}: {
  title?: string;
  children: ReactNode;
  className?: string;
  glow?: boolean;
  exportavel?: boolean;
  titleClassName?: string;
}) {
  return (
    <section
      data-export-card={exportavel ? "" : undefined}
      className={clsx(
        exportavel && "relative",
        ESTILO_PAINEL,
        glow && "border-accent/30",
        className,
      )}
    >
      {exportavel && title && <BotaoExportarCard titulo={title} />}
      {title && (
        <h2 className={clsx(ESTILO_TITULO_PAINEL, titleClassName)}>
          {title}
        </h2>
      )}
      {children}
    </section>
  );
}
