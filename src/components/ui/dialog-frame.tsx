"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";
import clsx from "clsx";

let scrollLocks = 0;
let previousOverflow = "";

/** Native modal isolation also covers nested dialogs and restores their opener. */
export function DialogFrame({
  open = true,
  onClose,
  label,
  labelledBy,
  describedBy,
  role = "dialog",
  className,
  children,
}: {
  open?: boolean;
  onClose: () => void;
  label?: string;
  labelledBy?: string;
  describedBy?: string;
  role?: "dialog" | "alertdialog";
  className?: string;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useLayoutEffect(() => {
    const element = dialog.current;
    if (!open || !element) return;
    if (!element.open) element.showModal();
    if (scrollLocks++ === 0) {
      previousOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
    }
    return () => {
      if (element.open) element.close();
      if (--scrollLocks === 0) document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  // Callers can keep their layout classes, but a closed dialog must stay hidden.
  const layout = className?.split(/\s+/).filter(c => c !== "flex" && !/^bg-black\//.test(c)).join(" ");
  return (
    <dialog
      ref={dialog}
      role={role}
      aria-modal="true"
      aria-label={labelledBy ? undefined : (label ?? "Detalhes")}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      onCancel={event => { event.preventDefault(); event.stopPropagation(); onClose(); }}
      onKeyDown={event => { if (event.key === "Escape") event.stopPropagation(); }}
      onClick={event => { if (event.target === event.currentTarget) onClose(); }}
      className={clsx(
        "fixed inset-0 m-0 h-dvh w-screen max-h-none max-w-none border-0 bg-transparent p-4 text-inherit open:flex open:items-center open:justify-center backdrop:bg-black/70 [&>div]:max-h-[calc(100dvh-2rem)] [&>div]:overflow-y-auto",
        layout,
      )}
    >
      {open && children}
    </dialog>
  );
}
