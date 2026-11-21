"use client";

import { useId, type ReactNode } from "react";
import { X } from "lucide-react";
import clsx from "clsx";
import { DialogFrame } from "./dialog-frame";

export function Modal({
  open,
  onClose,
  title,
  children,
  maxWidth = "max-w-lg",
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  maxWidth?: string;
}) {
  const titleId = useId();

  return (
    <DialogFrame
      open={open}
      onClose={onClose}
      labelledBy={title ? titleId : undefined}
      className="p-4 lg:pl-64"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={clsx(
          "flex w-full flex-col overflow-hidden rounded-xl border border-surface-border bg-zinc-900 shadow-2xl shadow-black/50",
          maxWidth,
        )}
      >
        {title && (
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-surface-border px-5 py-4">
            <h2 id={titleId} className="min-w-0 break-words text-sm font-semibold text-white">{title}</h2>
            <button
              onClick={onClose}
              type="button"
              aria-label="Fechar"
              className="rounded p-1 text-muted hover:text-white"
            >
              <X size={18} />
            </button>
          </div>
        )}
        <div className="min-h-0 overflow-y-auto overscroll-contain p-5">{children}</div>
      </div>
    </DialogFrame>
  );
}
