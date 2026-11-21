// Contas do diagnóstico da carteira (aba Calendário de visitas). Funções puras:
// recebem a carteira já carregada e rodam no navegador, então o filtro por
// consultor não precisa voltar ao servidor.

import type { ClienteRecencia, VisitaResumo } from "@/lib/visitas-calendario";

export type Quadrante = "ESTRELA" | "INTERROGACAO" | "VACA_LEITEIRA" | "ABACAXI";

export const QUADRANTES: {
  id: Quadrante;
  nome: string;
  descricao: string;
  // Visitas por cliente por mês que a carteira deveria receber.
  ideal: number;
}[] = [
  { id: "ESTRELA", nome: "Estrela", descricao: "alto potencial · alta participação", ideal: 2 },
  { id: "INTERROGACAO", nome: "Interrogação", descricao: "alto potencial · baixa participação", ideal: 1.5 },
  { id: "VACA_LEITEIRA", nome: "Vaca leiteira", descricao: "baixo potencial · alta participação", ideal: 1 },
  { id: "ABACAXI", nome: "Abacaxi", descricao: "baixo potencial · baixa participação", ideal: 0.3 },
];

// Ordem de prioridade para visitar quem está sem visita.
const PESO_QUADRANTE: Record<Quadrante, number> = {
  ESTRELA: 0,
  INTERROGACAO: 1,
  VACA_LEITEIRA: 2,
  ABACAXI: 3,
};

function mediana(valores: number[]): number {
  if (valores.length === 0) return 0;
  const o = [...valores].sort((a, b) => a - b);
  const m = Math.floor(o.length / 2);
  return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2;
}

// Potencial = área de plantio; participação = faturamento da safra por
// hectare. Os cortes entre "alto" e "baixo" são a mediana da própria
// carteira, então a matriz se ajusta sozinha ao conjunto filtrado. Cliente
// sem área cadastrada fica fora da matriz.
export function classificarBcg(clientes: ClienteRecencia[]): {
  quadrante: Map<string, Quadrante>;
  semDados: number;
} {
  const comArea = clientes.filter((c) => c.area != null);
  const cortePotencial = mediana(comArea.map((c) => c.area!));
  const cortePart = mediana(comArea.map((c) => c.faturamento / c.area!));
  const quadrante = new Map<string, Quadrante>();
  for (const c of comArea) {
    const potencialAlto = c.area! >= cortePotencial;
    const participacaoAlta = c.faturamento / c.area! >= cortePart && c.faturamento > 0;
    quadrante.set(
      c.id,
      potencialAlto
        ? participacaoAlta
          ? "ESTRELA"
          : "INTERROGACAO"
        : participacaoAlta
          ? "VACA_LEITEIRA"
          : "ABACAXI"
    );
  }
  return { quadrante, semDados: clientes.length - comArea.length };
}

export type FaixaDiagnostico = { rotulo: string; n: number; cor: string };

export function faixasDeRecencia(clientes: ClienteRecencia[]): FaixaDiagnostico[] {
  const faixas: FaixaDiagnostico[] = [
    { rotulo: "até 15 dias", n: 0, cor: "#22c55e" },
    { rotulo: "16 a 30", n: 0, cor: "#86efac" },
    { rotulo: "31 a 60", n: 0, cor: "#eab308" },
    { rotulo: "61 a 90", n: 0, cor: "#f97316" },
    { rotulo: "mais de 90", n: 0, cor: "#ef4444" },
    { rotulo: "sem visita na safra", n: 0, cor: "#71717a" },
  ];
  for (const c of clientes) {
    // Sem visita na safra vale mesmo que haja visita de safra antiga.
    if (c.visitasSafra === 0) faixas[5].n++;
    else if (c.dias === null) faixas[5].n++;
    else if (c.dias <= 15) faixas[0].n++;
    else if (c.dias <= 30) faixas[1].n++;
    else if (c.dias <= 60) faixas[2].n++;
    else if (c.dias <= 90) faixas[3].n++;
    else faixas[4].n++;
  }
  return faixas;
}

export type Prioridade = {
  cliente: ClienteRecencia;
  quadrante: Quadrante | null;
};

// Clientes há mais de 30 dias sem visita (ou nunca visitados), os de maior
// prioridade BCG primeiro e, dentro do quadrante, os mais esquecidos.
export function clientesParaPriorizar(
  clientes: ClienteRecencia[],
  quadrante: Map<string, Quadrante>
): Prioridade[] {
  return clientes
    .filter((c) => c.dias === null || c.dias > 30)
    .map((c) => ({ cliente: c, quadrante: quadrante.get(c.id) ?? null }))
    .sort(
      (a, b) =>
        (a.quadrante ? PESO_QUADRANTE[a.quadrante] : 9) - (b.quadrante ? PESO_QUADRANTE[b.quadrante] : 9) ||
        (b.cliente.dias ?? Infinity) - (a.cliente.dias ?? Infinity) ||
        a.cliente.nome.localeCompare(b.cliente.nome, "pt-BR")
    );
}

export type Regiao = {
  nome: string;
  clientes: number;
  visitados: number;
  visitas: number;
  pct: number;
};

// "Região" = cidade do cliente. Sem cidade cadastrada, o cliente não entra.
export function coberturaPorRegiao(clientes: ClienteRecencia[]): { regioes: Regiao[]; semCidade: number } {
  const mapa = new Map<string, Regiao>();
  let semCidade = 0;
  for (const c of clientes) {
    const nome = c.cidade?.trim();
    if (!nome) {
      semCidade++;
      continue;
    }
    const r = mapa.get(nome) ?? { nome, clientes: 0, visitados: 0, visitas: 0, pct: 0 };
    r.clientes++;
    r.visitas += c.visitasMes;
    if (c.visitasMes > 0) r.visitados++;
    mapa.set(nome, r);
  }
  const regioes = [...mapa.values()].map((r) => ({ ...r, pct: Math.round((r.visitados / r.clientes) * 100) }));
  regioes.sort((a, b) => b.clientes - a.clientes || a.nome.localeCompare(b.nome, "pt-BR"));
  return { regioes, semCidade };
}

export type LinhaMatriz = {
  quadrante: Quadrante;
  clientes: number;
  real: number;
  ideal: number;
  // Diferença percentual do realizado sobre o ideal.
  desvio: number;
};

export function matrizDeFrequencia(clientes: ClienteRecencia[], quadrante: Map<string, Quadrante>): LinhaMatriz[] {
  return QUADRANTES.map((q) => {
    const doQuadrante = clientes.filter((c) => quadrante.get(c.id) === q.id);
    const visitas = doQuadrante.reduce((s, c) => s + c.visitasMes, 0);
    const real = doQuadrante.length ? visitas / doQuadrante.length : 0;
    return {
      quadrante: q.id,
      clientes: doQuadrante.length,
      real,
      ideal: q.ideal,
      desvio: Math.round(((real - q.ideal) / q.ideal) * 100),
    };
  });
}

export type KpisDoMes = {
  realizadas: number;
  agendadas: number;
  mesAnterior: number;
  clientesVisitados: number;
  totalClientes: number;
  semVisita30: number;
  estrelasSemVisita30: number;
  semVisitaNaSafra: number;
};

// `visitas` já vem filtrada pelo consultor escolhido, assim como `clientes`.
export function kpisDoMes(
  clientes: ClienteRecencia[],
  visitas: VisitaResumo[],
  quadrante: Map<string, Quadrante>,
  hoje: string
): KpisDoMes {
  const mes = hoje.slice(0, 7);
  const [a, m] = mes.split("-").map(Number);
  const anterior = m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, "0")}`;
  let realizadas = 0;
  let agendadas = 0;
  let mesAnterior = 0;
  for (const v of visitas) {
    if (v.dia.startsWith(mes)) {
      if (v.agendada) agendadas++;
      else realizadas++;
    } else if (v.dia.startsWith(anterior) && !v.agendada) mesAnterior++;
  }
  const semVisita30 = clientes.filter((c) => c.dias === null || c.dias > 30);
  return {
    realizadas,
    agendadas,
    mesAnterior,
    clientesVisitados: clientes.filter((c) => c.visitasMes > 0).length,
    totalClientes: clientes.length,
    semVisita30: semVisita30.length,
    estrelasSemVisita30: semVisita30.filter((c) => quadrante.get(c.id) === "ESTRELA").length,
    semVisitaNaSafra: clientes.filter((c) => c.visitasSafra === 0).length,
  };
}

export type Sugestao = {
  tag: string;
  titulo: string;
  texto: string;
  // Cliente a pré-selecionar ao agendar; sem ele, a sugestão é só informativa.
  clienteId?: string;
  cta?: string;
};

export function sugestoes(
  clientes: ClienteRecencia[],
  prioridades: Prioridade[],
  regioes: Regiao[]
): Sugestao[] {
  const saida: Sugestao[] = [];

  const sem30PorCidade = new Map<string, number>();
  for (const p of prioridades) {
    const cidade = p.cliente.cidade?.trim();
    if (cidade) sem30PorCidade.set(cidade, (sem30PorCidade.get(cidade) ?? 0) + 1);
  }
  const pior = [...regioes]
    .filter((r) => r.clientes >= 3 && r.pct < 60)
    .sort((a, b) => a.pct - b.pct || b.clientes - a.clientes)[0];
  if (pior) {
    const n = sem30PorCidade.get(pior.nome) ?? 0;
    saida.push({
      tag: "REGIÃO",
      titulo: `Agrupar visitas em ${pior.nome}`,
      texto: `Cobertura de ${pior.pct}% no mês (${pior.visitados} de ${pior.clientes} clientes)${n ? `, com ${n} sem visita há mais de 30 dias` : ""}. Agrupar em dias seguidos evita idas e vindas.`,
    });
  }

  const interrogacoes = prioridades.filter((p) => p.quadrante === "INTERROGACAO").slice(0, 3);
  if (interrogacoes.length > 0) {
    saida.push({
      tag: "INTERROGAÇÃO",
      titulo: "Ganhar participação",
      texto: `${interrogacoes.map((p) => p.cliente.nome).join(", ")} ${interrogacoes.length > 1 ? "têm" : "tem"} alto potencial e pouca compra conosco. Priorizar visitas técnicas.`,
      clienteId: interrogacoes[0].cliente.id,
      cta: "Agendar o primeiro",
    });
  }

  const semSafra = clientes.filter((c) => c.visitasSafra === 0);
  if (semSafra.length > 0) {
    saida.push({
      tag: "SAFRA",
      titulo: `${semSafra.length} ${semSafra.length === 1 ? "cliente sem visita" : "clientes sem visita"} na safra`,
      texto: `${semSafra
        .slice(0, 3)
        .map((c) => c.nome)
        .join(", ")}${semSafra.length > 3 ? " e outros" : ""} ainda não receberam visita nesta safra.`,
      clienteId: semSafra[0].id,
      cta: "Agendar o primeiro",
    });
  }

  return saida;
}
