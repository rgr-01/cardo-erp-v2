// Módulos contratados por empresa, ligados no painel Cardo AI (/admin/empresas).
// Cadastros reúne clientes/fornecedores; Estoque mantém o catálogo de produtos.
// Gestão comercial vai até gerar o pedido. ERP é o Financeiro (notas, boletos, contas),
// independente; com os dois, o pedido segue para assinatura, carteira e faturamento.
// Despesas (hotel, comida, combustível...) vem com o Financeiro: todo usuário da
// empresa lança as suas, e o admin pode desligar por usuário.
// Sem dependências de servidor: o menu (cliente) também usa este arquivo.
export const MODULOS_EMPRESA = ["CADASTROS", "ESTOQUE", "VENDAS", "ERP", "VISITAS"] as const;
export const MODULOS = [...MODULOS_EMPRESA, "DESPESAS"] as const;
export type Modulo = (typeof MODULOS)[number];

export const NOMES_MODULO: Record<Modulo, string> = {
  CADASTROS: "Cadastros",
  ESTOQUE: "Estoque",
  VENDAS: "Gestão comercial",
  ERP: "Financeiro",
  VISITAS: "Gestão de visitas",
  DESPESAS: "Despesas",
};

export const DESCRICAO_MODULO: Record<Modulo, string> = {
  CADASTROS: "Clientes, localização, propriedades e fornecedores.",
  ESTOQUE: "Catálogo de produtos, embalagens, custos, preços e dados fiscais.",
  VENDAS: "Plano de vendas por safra, metas, orçamentos, pedidos e aprovações comerciais.",
  ERP: "Faturamento, notas fiscais, boletos, contas a pagar e a receber e despesas da equipe. Com Gestão comercial: assinatura e carteira dos pedidos.",
  VISITAS: "Relatórios de visita e técnicos com PDF da marca, editor, bot do WhatsApp e geração de demanda.",
  DESPESAS: "Lançar notas de despesas: hotel, alimentação, combustível, KM rodado.",
};

export function normalizarModulos(lista: readonly string[]): Modulo[] {
  const set = new Set(lista.filter((m): m is Modulo => (MODULOS_EMPRESA as readonly string[]).includes(m)));
  return MODULOS_EMPRESA.filter((m) => set.has(m));
}

// Módulos que o usuário enxerga: os da empresa menos os que o admin desligou
// para ele. Admin enxerga tudo da empresa.
export function modulosParaUsuario(
  modulosEmpresa: readonly string[],
  bloqueados: readonly string[],
  role: string,
): Modulo[] {
  const contratados = normalizarModulos(modulosEmpresa);
  const empresa: Modulo[] = contratados.includes("ERP") ? [...contratados, "DESPESAS"] : contratados;
  if (role === "ADMIN") return empresa;
  const set = new Set(empresa.filter((m) => !bloqueados.includes(m)));
  return MODULOS.filter((m) => set.has(m));
}

// Prefixo de rota (página ou API do app) → módulo exigido. Rota fora da
// lista é livre (dashboard, perfil, WhatsApp...). Seletores mobile de clientes
// e produtos continuam compartilhados para os fluxos comercial e de visitas.
const ROTAS: [string, Modulo][] = [
  ["/vendas", "VENDAS"],
  ["/metas", "VENDAS"],
  ["/clientes", "CADASTROS"],
  ["/localizacao", "CADASTROS"],
  ["/fornecedores", "CADASTROS"],
  ["/produtos", "ESTOQUE"],
  ["/pedidos", "VENDAS"],
  ["/propostas", "VENDAS"],
  ["/em-carteira", "ERP"],
  ["/despesas", "DESPESAS"],
  ["/financeiro", "ERP"],
  ["/relatorios", "VISITAS"],
  ["/api/mobile/produtos", "ESTOQUE"],
  ["/api/mobile/pedidos", "VENDAS"],
  ["/api/mobile/despesas", "DESPESAS"],
  ["/api/mobile/relatorios-visita", "VISITAS"],
];

export function moduloDaRota(pathname: string): Modulo | null {
  const achado = ROTAS.find(([prefixo]) => pathname === prefixo || pathname.startsWith(prefixo + "/"));
  return achado?.[1] ?? null;
}

// O catálogo mobile também alimenta pedidos de quem usa apenas Gestão comercial.
export function podeAcessarRota(pathname: string, modulos: readonly Modulo[]): boolean {
  if (pathname === "/api/mobile/produtos" && modulos.includes("VENDAS")) return true;
  const modulo = moduloDaRota(pathname);
  return modulo === null || modulos.includes(modulo);
}
