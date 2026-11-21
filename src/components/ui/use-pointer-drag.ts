"use client";

import { useCallback, useEffect, useRef, type PointerEvent as ReactPointerEvent } from "react";

/** One pointer owns a gesture until release, cancellation, blur or unmount. */
export function usePointerDrag() {
  const active = useRef<(() => void) | null>(null);
  const cancelar = useCallback(() => active.current?.(), []);
  useEffect(() => cancelar, [cancelar]);
  const iniciar = useCallback((event: ReactPointerEvent, callbacks: {
    mover: (event: PointerEvent) => void;
    concluir: (event: PointerEvent) => void;
    cancelar: () => void;
  }) => {
    if (active.current || !event.isPrimary || event.button !== 0) return false;
    const target = event.currentTarget;
    const id = event.pointerId;
    const limpar = () => {
      active.current = null;
      window.removeEventListener("pointermove", mover);
      window.removeEventListener("pointerup", concluir);
      window.removeEventListener("pointercancel", interromper);
      window.removeEventListener("blur", cancelarAtual);
      document.removeEventListener("visibilitychange", aoOcultar);
      target.removeEventListener("lostpointercapture", interromper);
      if (target.hasPointerCapture(id)) target.releasePointerCapture(id);
    };
    const cancelarAtual = () => { limpar(); callbacks.cancelar(); };
    const mover = (e: PointerEvent) => { if (e.pointerId === id) callbacks.mover(e); };
    const concluir = (e: PointerEvent) => { if (e.pointerId === id) { limpar(); callbacks.concluir(e); } };
    const interromper = (e: Event) => { if ((e as PointerEvent).pointerId === id) cancelarAtual(); };
    const aoOcultar = () => { if (document.hidden) cancelarAtual(); };
    target.setPointerCapture(id);
    active.current = cancelarAtual;
    window.addEventListener("pointermove", mover);
    window.addEventListener("pointerup", concluir);
    window.addEventListener("pointercancel", interromper);
    window.addEventListener("blur", cancelarAtual);
    document.addEventListener("visibilitychange", aoOcultar);
    target.addEventListener("lostpointercapture", interromper);
    return true;
  }, []);
  return { iniciar, cancelar };
}
