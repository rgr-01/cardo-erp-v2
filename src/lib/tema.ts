// Tema da interface escolhido pelo usuário, guardado em cookie no aparelho.
export const COOKIE_TEMA = "tema";
export type Tema = "escuro" | "claro";

export function temaValido(valor: string | undefined): Tema {
  return valor === "escuro" ? "escuro" : "claro";
}
