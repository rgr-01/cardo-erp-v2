import { ComponentProps } from "react";
import clsx from "clsx";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md";

const variantCls: Record<Variant, string> = {
  primary:
    "bg-accent text-accent-foreground hover:brightness-110 focus-visible:ring-accent/40 disabled:hover:brightness-100",
  secondary:
    "border border-control bg-surface text-zinc-300 hover:bg-zinc-800 hover:text-white focus-visible:ring-accent/40",
  ghost:
    "text-secondary hover:bg-zinc-800 hover:text-white focus-visible:ring-accent/40",
  danger:
    "border border-danger/40 bg-danger/10 text-danger-ink hover:bg-danger/20 focus-visible:ring-danger/40",
};

const sizeCls: Record<Size, string> = {
  sm: "min-h-9 px-3 py-1.5 text-xs",
  md: "min-h-10 px-4 py-2 text-sm",
};

export function Button({
  variant = "secondary",
  size = "md",
  className,
  ...props
}: ComponentProps<"button"> & { variant?: Variant; size?: Size }) {
  return (
    <button
      className={clsx(
        "erp-button inline-flex items-center justify-center gap-1.5 rounded-lg font-semibold outline-none transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:ring-2",
        variantCls[variant],
        sizeCls[size],
        className,
      )}
      {...props}
    />
  );
}
