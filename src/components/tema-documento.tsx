"use client";

import { useLayoutEffect } from "react";
import type { Tema } from "@/lib/tema";

export function TemaDocumento({ tema }: { tema: Tema }) {
  useLayoutEffect(() => {
    document.documentElement.dataset.theme = tema === "claro" ? "light" : "dark";
    return () => { delete document.documentElement.dataset.theme; };
  }, [tema]);
  return null;
}
