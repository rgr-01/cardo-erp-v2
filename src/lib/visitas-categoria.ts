// Categoria da visita (Comercial, Técnica, Pós-venda, Relacionamento): é o que
// colore o calendário e agrupa os indicadores. Independe de `tipo`, que só
// decide a capa do PDF.

export type CategoriaVisita = "COMERCIAL" | "TECNICA" | "POS_VENDA" | "RELACIONAMENTO";

export const CATEGORIAS_VISITA: { id: CategoriaVisita; rotulo: string; cor: string }[] = [
  { id: "COMERCIAL", rotulo: "Comercial", cor: "#38bdf8" },
  { id: "TECNICA", rotulo: "Técnica", cor: "#4ade80" },
  { id: "POS_VENDA", rotulo: "Pós-venda", cor: "#fbbf24" },
  { id: "RELACIONAMENTO", rotulo: "Relacionamento", cor: "#a78bfa" },
];

function semAcento(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

// Tipos da plataforma TBDC (e textos livres parecidos) para a categoria.
export function categoriaDoTipoTbdc(tipo: string | null | undefined): CategoriaVisita {
  const t = semAcento(tipo ?? "");
  if (t.includes("tecnica")) return "TECNICA";
  if (t.includes("prospec") || t.includes("negocia")) return "COMERCIAL";
  if (t.includes("entrega") || t.includes("reclama")) return "POS_VENDA";
  // Relacionamento, Evento, Atividade administrativa, Outro e sem tipo.
  return "RELACIONAMENTO";
}

// Relatórios criados antes da categoria existir: deduz do tipo.
export function categoriaEfetiva(v: {
  categoria?: string | null;
  tipo?: string | null;
}): CategoriaVisita {
  if (CATEGORIAS_VISITA.some((c) => c.id === v.categoria)) return v.categoria as CategoriaVisita;
  return v.tipo === "TECNICO" ? "TECNICA" : "RELACIONAMENTO";
}

export function corDaCategoria(c: CategoriaVisita): string {
  return CATEGORIAS_VISITA.find((x) => x.id === c)!.cor;
}

export function rotuloDaCategoria(c: CategoriaVisita): string {
  return CATEGORIAS_VISITA.find((x) => x.id === c)!.rotulo;
}

// Safra de uma visita pela data: o ano define a safra (2024 = "24/25",
// 2025 = "25/26", 2026 = "26/27"), no horário de Brasília.
export function safraDaData(d: Date): string {
  const ano = Number(d.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }).slice(0, 4));
  return `${String(ano).slice(2)}/${String(ano + 1).slice(2)}`;
}
