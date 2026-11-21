import type { CSSProperties } from "react";

// Versão clara do resumo do dashboard, usada só para gerar o PDF: inverte a
// escala zinc (900 = cartão, 950 = trilho de barra). Fica inline para valer
// sobre qualquer outra regra de CSS.
export const TEMA_CLARO: CSSProperties = {
  "--foreground": "#10232a",
  "--surface": "#ffffff",
  "--text-secondary": "#34525d",
  "--text-muted": "#4a626d",
  "--text-subtle": "#4a626d",
  "--accent": "#006d2e",
  "--accent-foreground": "#ffffff",
  "--danger-ink": "#9e1b32",
  "--info-ink": "#1d4ed8",
  "--warning-ink": "#8c4a05",
  "--notice-ink": "#9a420c",
  "--color-white": "#10232a",
  "--color-zinc-100": "#19323b",
  "--color-zinc-200": "#24434e",
  "--color-zinc-300": "#34525d",
  "--color-zinc-400": "#4a6670",
  "--color-zinc-500": "#67818a",
  "--color-zinc-900": "#ffffff",
  "--color-zinc-950": "#e8eef0",
  "--surface-border": "#d6dfe2",
  background: "#ffffff",
  color: "#10232a",
} as CSSProperties;
