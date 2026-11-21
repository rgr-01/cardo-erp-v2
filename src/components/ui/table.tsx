import { ComponentProps } from "react";
import clsx from "clsx";

export function TableWrap({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={clsx(
        "tabela-fixa overflow-x-auto rounded-xl border border-surface-border",
        className,
      )}
      {...props}
    />
  );
}

export function Table({ className, ...props }: ComponentProps<"table">) {
  return <table className={clsx("w-full text-sm tabular-nums", className)} {...props} />;
}

export function Thead({ className, ...props }: ComponentProps<"thead">) {
  return (
    <thead
      className={clsx(
        "border-b border-surface-border bg-zinc-900 text-xs font-medium text-secondary",
        className,
      )}
      {...props}
    />
  );
}

export function Tbody(props: ComponentProps<"tbody">) {
  return <tbody {...props} />;
}

export function Tr({
  className,
  selected,
  ...props
}: ComponentProps<"tr"> & { selected?: boolean }) {
  return (
    <tr
      className={clsx(
        "border-b border-surface-border/50 hover:bg-zinc-900/60",
        selected && "bg-accent/5",
        className,
      )}
      {...props}
    />
  );
}

export function Th({ className, ...props }: ComponentProps<"th">) {
  return (
    <th className={clsx("px-3 py-2 text-left font-medium", className)} {...props} />
  );
}

export function Td({ className, ...props }: ComponentProps<"td">) {
  return <td className={clsx("px-3 py-2", className)} {...props} />;
}
