import { ReactNode } from "react";
import clsx from "clsx";

type Variant = "neutral" | "success" | "warning" | "danger" | "info";

const variantCls: Record<Variant, string> = {
  neutral: "bg-zinc-500/15 text-zinc-300",
  success: "bg-success/15 text-green-400",
  warning: "bg-yellow-500/15 text-[var(--warning-ink)]",
  danger: "bg-danger/15 text-danger-ink",
  info: "bg-blue-500/15 text-[var(--info-ink)]",
};

export function Badge({
  children,
  color,
  variant,
  className,
}: {
  children: ReactNode;
  color?: string;
  variant?: Variant;
  className?: string;
}) {
  if (color) {
    return (
      <span
        className={clsx(
          "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium",
          className,
        )}
        style={{ backgroundColor: `color-mix(in srgb, ${color} 13%, transparent)`, color: "var(--foreground)" }}
      >
        <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
        {children}
      </span>
    );
  }

  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        variantCls[variant ?? "neutral"],
        className,
      )}
    >
      {children}
    </span>
  );
}
