"use client";

import { createContext, useContext } from "react";

// Marca da empresa do documento/usuário atual, para <Logo> e textos de rodapé.
// Sem provedor (ex.: telas antigas fora da área logada) vale a Rede Agro.
export type MarcaVisual = { nome: string; claro: string | null; escuro: string | null };

const MarcaContexto = createContext<MarcaVisual | null>(null);

export function MarcaEmpresaProvider({ marca, children }: { marca: MarcaVisual | null; children: React.ReactNode }) {
  return <MarcaContexto.Provider value={marca}>{children}</MarcaContexto.Provider>;
}

export function useMarcaEmpresa(): MarcaVisual | null {
  return useContext(MarcaContexto);
}

export function NomeEmpresa() {
  return <>{useMarcaEmpresa()?.nome ?? "Rede Agro"}</>;
}
