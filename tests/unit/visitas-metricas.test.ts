import { describe, expect, it } from "vitest";
import {
  classificarBcg,
  clientesParaPriorizar,
  coberturaPorRegiao,
  faixasDeRecencia,
  kpisDoMes,
} from "@/lib/visitas-metricas";
import { categoriaDoTipoTbdc, categoriaEfetiva, safraDaData } from "@/lib/visitas-categoria";
import type { ClienteRecencia } from "@/lib/visitas-calendario";

function cliente(id: string, extra: Partial<ClienteRecencia> = {}): ClienteRecencia {
  return {
    id,
    nome: `Cliente ${id}`,
    consultorId: "u1",
    consultorNome: "Iure",
    ultimaVisita: null,
    dias: null,
    cidade: null,
    area: null,
    faturamento: 0,
    visitasMes: 0,
    visitasSafra: 0,
    ...extra,
  };
}

describe("categoria da visita", () => {
  it("converte os tipos do TBDC", () => {
    expect(categoriaDoTipoTbdc("Visita técnica")).toBe("TECNICA");
    expect(categoriaDoTipoTbdc("Prospecção")).toBe("COMERCIAL");
    expect(categoriaDoTipoTbdc("Visita de negociação")).toBe("COMERCIAL");
    expect(categoriaDoTipoTbdc("Entrega de Produto")).toBe("POS_VENDA");
    expect(categoriaDoTipoTbdc("Tratamento de reclamações")).toBe("POS_VENDA");
    expect(categoriaDoTipoTbdc("Atividade administrativa")).toBe("RELACIONAMENTO");
    expect(categoriaDoTipoTbdc(null)).toBe("RELACIONAMENTO");
  });

  it("deduz a categoria de relatórios antigos pelo tipo", () => {
    expect(categoriaEfetiva({ categoria: null, tipo: "TECNICO" })).toBe("TECNICA");
    expect(categoriaEfetiva({ categoria: null, tipo: "VISITA" })).toBe("RELACIONAMENTO");
    expect(categoriaEfetiva({ categoria: "POS_VENDA", tipo: "TECNICO" })).toBe("POS_VENDA");
  });

  it("define a safra pelo ano da visita", () => {
    expect(safraDaData(new Date("2024-11-05T12:00:00Z"))).toBe("24/25");
    expect(safraDaData(new Date("2025-03-10T12:00:00Z"))).toBe("25/26");
    expect(safraDaData(new Date("2026-09-24T12:00:00Z"))).toBe("26/27");
    // Virada do ano no horário de Brasília (UTC-3).
    expect(safraDaData(new Date("2026-01-01T01:00:00Z"))).toBe("25/26");
  });
});

describe("diagnóstico da carteira", () => {
  it("separa os clientes em faixas de recência", () => {
    const faixas = faixasDeRecencia([
      cliente("a", { dias: 3, visitasSafra: 2 }),
      cliente("b", { dias: 20, visitasSafra: 1 }),
      cliente("c", { dias: 45, visitasSafra: 1 }),
      cliente("d", { dias: 120, visitasSafra: 1 }),
      cliente("e", { dias: 10, visitasSafra: 0 }),
      cliente("f"),
    ]);
    expect(faixas.map((f) => f.n)).toEqual([1, 1, 1, 0, 1, 2]);
  });

  it("classifica pelos cortes da mediana e deixa de fora quem não tem área", () => {
    const { quadrante, semDados } = classificarBcg([
      cliente("estrela", { area: 1000, faturamento: 2_000_000 }),
      cliente("interrogacao", { area: 1000, faturamento: 0 }),
      cliente("vaca", { area: 100, faturamento: 300_000 }),
      cliente("abacaxi", { area: 100, faturamento: 0 }),
      cliente("sem-area"),
    ]);
    expect(quadrante.get("estrela")).toBe("ESTRELA");
    expect(quadrante.get("interrogacao")).toBe("INTERROGACAO");
    expect(quadrante.get("vaca")).toBe("VACA_LEITEIRA");
    expect(quadrante.get("abacaxi")).toBe("ABACAXI");
    expect(quadrante.has("sem-area")).toBe(false);
    expect(semDados).toBe(1);
  });

  it("prioriza por quadrante e depois pelos mais esquecidos", () => {
    const clientes = [
      cliente("a", { dias: 200 }),
      cliente("b", { dias: 40 }),
      cliente("c", { dias: 5 }),
      cliente("d", { dias: 60 }),
    ];
    const q = new Map([
      ["b", "ESTRELA" as const],
      ["d", "ABACAXI" as const],
    ]);
    expect(clientesParaPriorizar(clientes, q).map((p) => p.cliente.id)).toEqual(["b", "d", "a"]);
  });

  it("calcula cobertura por cidade e conta quem não tem cidade", () => {
    const { regioes, semCidade } = coberturaPorRegiao([
      cliente("a", { cidade: "Sinop", visitasMes: 2 }),
      cliente("b", { cidade: "Sinop" }),
      cliente("c", { cidade: "Lucas", visitasMes: 1 }),
      cliente("d"),
    ]);
    expect(regioes.find((r) => r.nome === "Sinop")).toMatchObject({ clientes: 2, visitados: 1, visitas: 2, pct: 50 });
    expect(semCidade).toBe(1);
  });

  it("conta realizadas, agendadas e mês anterior nos KPIs", () => {
    const k = kpisDoMes(
      [cliente("a", { dias: 2, visitasMes: 1, visitasSafra: 1 }), cliente("b", { dias: 50, visitasSafra: 1 })],
      [
        { consultorId: "u1", clienteId: "a", dia: "2026-09-10", agendada: false },
        { consultorId: "u1", clienteId: "a", dia: "2026-09-29", agendada: true },
        { consultorId: "u1", clienteId: "b", dia: "2026-08-20", agendada: false },
        { consultorId: "u1", clienteId: "b", dia: "2026-08-21", agendada: false },
      ],
      new Map(),
      "2026-09-29"
    );
    expect(k).toMatchObject({ realizadas: 1, agendadas: 1, mesAnterior: 2, clientesVisitados: 1, semVisita30: 1 });
  });
});
