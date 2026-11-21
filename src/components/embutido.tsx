"use client";

import { createContext, useContext } from "react";

// true quando a página foi aberta numa janela sobreposta (iframe) de outra tela.
// Vem do servidor (cabeçalho Sec-Fetch-Dest), então não gera divergência de hidratação.
const EmbutidoContext = createContext(false);

export const EmbutidoProvider = EmbutidoContext.Provider;

export function useEmbutido(): boolean {
  return useContext(EmbutidoContext);
}
