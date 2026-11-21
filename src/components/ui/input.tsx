import { ComponentProps } from "react";
import clsx from "clsx";

const baseCls =
  "erp-field min-h-10 w-full rounded-lg border bg-zinc-900 px-3 py-2 text-sm text-white placeholder:text-muted outline-none transition-colors duration-150 focus:border-accent focus:ring-1 focus:ring-accent/30 disabled:cursor-not-allowed disabled:opacity-50";

function borderCls(error?: boolean) {
  return error ? "border-danger" : "border-control";
}

export function Input({
  error,
  className,
  ...props
}: ComponentProps<"input"> & { error?: boolean }) {
  return (
    <input className={clsx(baseCls, borderCls(error), className)} {...props} />
  );
}

export function Textarea({
  error,
  className,
  ...props
}: ComponentProps<"textarea"> & { error?: boolean }) {
  return (
    <textarea
      className={clsx(baseCls, borderCls(error), className)}
      {...props}
    />
  );
}

export function Select({
  error,
  className,
  ...props
}: ComponentProps<"select"> & { error?: boolean }) {
  return (
    <select className={clsx(baseCls, borderCls(error), className)} {...props} />
  );
}

export function Label({ className, ...props }: ComponentProps<"label">) {
  return (
    <label
      className={clsx("mb-1 block text-sm font-medium text-zinc-300", className)}
      {...props}
    />
  );
}
