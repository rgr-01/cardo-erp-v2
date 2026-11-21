// Trabalhos da safra (área demonstrativa, ensaio, vitrine, dia de campo):
// constantes e regras puras, usadas no servidor e no navegador.

export type TipoTrabalho = "AREA_DEMONSTRATIVA" | "ENSAIO" | "VITRINE" | "DIA_DE_CAMPO";
export type StatusTrabalho = "PLANEJADO" | "EM_ANDAMENTO" | "CONCLUIDO";

export const TIPOS_TRABALHO: { id: TipoTrabalho; rotulo: string; classe: string }[] = [
  { id: "AREA_DEMONSTRATIVA", rotulo: "Área demonstrativa", classe: "bg-accent/15 text-accent" },
  { id: "ENSAIO", rotulo: "Ensaio", classe: "bg-sky-500/15 text-sky-300" },
  { id: "VITRINE", rotulo: "Vitrine", classe: "bg-violet-500/15 text-violet-300" },
  { id: "DIA_DE_CAMPO", rotulo: "Dia de campo", classe: "bg-amber-500/15 text-amber-300" },
];

export const STATUS_TRABALHO: { id: StatusTrabalho; rotulo: string; classe: string }[] = [
  { id: "PLANEJADO", rotulo: "Planejado", classe: "border border-dashed border-zinc-500 text-zinc-400" },
  { id: "EM_ANDAMENTO", rotulo: "Em andamento", classe: "bg-sky-500/15 text-sky-300" },
  { id: "CONCLUIDO", rotulo: "Concluído", classe: "bg-accent/15 text-accent" },
];

export const rotuloDoTipoTrabalho = (id: string) => TIPOS_TRABALHO.find((t) => t.id === id)?.rotulo ?? id;

export type TrabalhoLinha = {
  id: string;
  nome: string;
  tipo: TipoTrabalho;
  status: StatusTrabalho;
  produto: string | null;
  fornecedor: string | null;
  cultura: string | null;
  clientes: { id: string; nome: string }[];
  campos: number;
  visitasPrevistas: number;
  dataPrevista: string | null;
  observacao: string | null;
  relatorios: number;
  // Dias distintos com relatório no trabalho: as visitas feitas ao campo.
  visitasFeitas: number;
  ultimoRelatorio: { data: string; titulo: string | null } | null;
};

export type RelatorioDoTrabalho = {
  id: string;
  titulo: string | null;
  dataVisita: string;
  clienteNome: string;
  consultorNome: string;
  podeEditar: boolean;
};

export type RelatorioAvulso = {
  id: string;
  titulo: string | null;
  dataVisita: string;
  clienteId: string;
  clienteNome: string;
  consultorNome: string;
};

// Sugere o trabalho de um relatório avulso: trabalhos ainda abertos que
// incluem o cliente do relatório. Havendo mais de um, o com visita mais
// recente (o que está "quente" no campo).
export function sugerirTrabalho(
  avulso: Pick<RelatorioAvulso, "clienteId">,
  trabalhos: TrabalhoLinha[]
): TrabalhoLinha | null {
  const candidatos = trabalhos.filter(
    (t) => t.status !== "CONCLUIDO" && t.clientes.some((c) => c.id === avulso.clienteId)
  );
  if (candidatos.length === 0) return null;
  return [...candidatos].sort((a, b) => (b.ultimoRelatorio?.data ?? "").localeCompare(a.ultimoRelatorio?.data ?? ""))[0];
}

export type AgruparPor = "tipo" | "produto" | "fornecedor" | "cliente";

export type GrupoTrabalhos = { nome: string; trabalhos: TrabalhoLinha[]; relatorios: number };

export function agruparTrabalhos(trabalhos: TrabalhoLinha[], por: AgruparPor): GrupoTrabalhos[] {
  const mapa = new Map<string, TrabalhoLinha[]>();
  const colocar = (chave: string, t: TrabalhoLinha) => mapa.set(chave, [...(mapa.get(chave) ?? []), t]);
  for (const t of trabalhos) {
    if (por === "tipo") colocar(rotuloDoTipoTrabalho(t.tipo), t);
    else if (por === "produto") colocar(t.produto ?? "Sem produto", t);
    else if (por === "fornecedor") colocar(t.fornecedor ?? "Sem fornecedor", t);
    else if (t.clientes.length === 0) colocar("Sem cliente", t);
    else for (const c of t.clientes) colocar(c.nome, t);
  }
  return [...mapa.entries()]
    .map(([nome, lista]) => ({ nome, trabalhos: lista, relatorios: lista.reduce((s, t) => s + t.relatorios, 0) }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

export function relatoriosPorFornecedor(trabalhos: TrabalhoLinha[]) {
  const mapa = new Map<string, { nome: string; trabalhos: number; relatorios: number }>();
  for (const t of trabalhos) {
    const nome = t.fornecedor ?? "Sem fornecedor";
    const atual = mapa.get(nome) ?? { nome, trabalhos: 0, relatorios: 0 };
    atual.trabalhos++;
    atual.relatorios += t.relatorios;
    mapa.set(nome, atual);
  }
  return [...mapa.values()].sort((a, b) => b.relatorios - a.relatorios || a.nome.localeCompare(b.nome, "pt-BR"));
}
