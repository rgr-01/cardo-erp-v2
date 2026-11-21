// Cor de cada consultor no mapa de clientes e na legenda. O admin pode
// escolher a cor de cada um (User.corMapa); sem escolha vale a cor padrão,
// que sai da paleta na ordem da lista (sem repetir enquanto couber).

export const PALETA_CONSULTOR = [
  "#4ade80",
  "#38bdf8",
  "#fbbf24",
  "#f472b6",
  "#a78bfa",
  "#fb923c",
  "#2dd4bf",
  "#f87171",
  "#e879f9",
  "#60a5fa",
];

export const COR_SEM_CONSULTOR = "#71717a"; // zinc-500

export function corValida(cor: string): boolean {
  return /^#[0-9a-f]{6}$/i.test(cor);
}

// Cor padrão de cada consultor: paleta na ordem em que aparecem em `ids`.
export function coresPadrao(ids: string[]): Record<string, string> {
  return Object.fromEntries(ids.map((id, i) => [id, PALETA_CONSULTOR[i % PALETA_CONSULTOR.length]]));
}

// `cores` já traz as escolhas do admin por cima do padrão.
export function corDoConsultor(consultorId: string | null, cores?: Record<string, string>): string {
  if (!consultorId) return COR_SEM_CONSULTOR;
  return cores?.[consultorId] ?? PALETA_CONSULTOR[hashDoId(consultorId) % PALETA_CONSULTOR.length];
}

function hashDoId(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return hash;
}
