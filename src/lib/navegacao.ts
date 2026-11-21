import {
  LayoutDashboard,
  Sprout,
  Users,
  MapPin,
  Package,
  Factory,
  ClipboardList,
  Receipt,
  FileText,
  FileSignature,
  Wallet,
  AlertTriangle,
  ShieldCheck,
  Landmark,
  FlaskConical,
  BarChart3,
  CalendarClock,
  type LucideIcon,
  FilePlus2,
} from "lucide-react";
import { NOMES_MODULO, moduloDaRota, type Modulo } from "@/lib/modulos";

const LINKS_DASHBOARD = [
  { href: "/dashboard", label: "Painel de vendas", icon: LayoutDashboard },
];

const LINKS = [
  { href: "/clientes", label: "Clientes", icon: Users },
  { href: "/localizacao", label: "Localização", icon: MapPin },
];

const LINKS_ADMIN = [
  { href: "/fornecedores", label: "Fornecedores", icon: Factory },
];

const LINKS_ESTOQUE = [{ href: "/produtos", label: "Produtos", icon: Package }];

const LINKS_RELATORIOS = [
  { href: "/relatorios/visitas", label: "Relatórios de visita", icon: ClipboardList },
  { href: "/relatorios/trabalhos", label: "Geração de demanda", icon: FlaskConical },
];

const LINKS_ERP = [
  { href: "/vendas", label: "Plano de vendas", icon: Sprout },
  { href: "/pedidos", label: "Orçamentos", icon: Receipt },
  { href: "/propostas", label: "Pedidos", icon: FileText },
];

const LINKS_CARTEIRA = [{ href: "/em-carteira", label: "Em carteira", icon: FileSignature }];

const LINKS_DESPESAS = [{ href: "/despesas", label: "Despesas", icon: Wallet }];

const LINKS_ERP_ADMIN = [
  { href: "/propostas/aprovacao-margem", label: "Aprovações", icon: ShieldCheck },
];

// Notas fiscais/boletos/cobrança são só do ADMIN; Despesas todo consultor usa
// (lança as próprias despesas de campo) — mora aqui do mesmo jeito porque é
// "dinheiro saindo", mesma família de Notas Fiscais/Boletos.
const LINKS_FATURAMENTO_ADMIN = [
  { href: "/financeiro/faturamento", label: "Resumo do faturamento", icon: BarChart3 },
  { href: "/financeiro/notas-fiscais", label: "Notas fiscais", icon: FileText },
  { href: "/financeiro/boletos", label: "Boletos", icon: Receipt },
];
// Só para empresa com Financeiro sem Plano de Vendas (notas sem pedido).
const LINK_NOTAS_AVULSAS = { href: "/financeiro/notas-avulsas", label: "Notas avulsas", icon: FilePlus2 };

const LINKS_FINANCEIRO_ADMIN = [
  { href: "/financeiro", label: "Visão geral", icon: Landmark },
  { href: "/financeiro/contas-a-pagar", label: "Contas a pagar", icon: CalendarClock },
  { href: "/financeiro/cobranca", label: "Contas a receber", icon: AlertTriangle },
];




export type LinkNavegacao = { href: string; label: string; icon: LucideIcon };
export type GrupoNavegacao = { id: Modulo; nome: string; links: LinkNavegacao[] };

export function gruposDeNavegacao(role: "ADMIN" | "CONSULTOR", modulos: readonly Modulo[]): GrupoNavegacao[] {
  const admin = role === "ADMIN";
  const vendas = modulos.includes("VENDAS");
  const erp = modulos.includes("ERP");
  const grupos: GrupoNavegacao[] = [];
  const adicionar = (id: Modulo, links: LinkNavegacao[]) => {
    if (links.length) grupos.push({ id, nome: NOMES_MODULO[id], links });
  };
  if (modulos.includes("CADASTROS")) adicionar("CADASTROS", [...LINKS, ...(admin ? LINKS_ADMIN : [])]);
  if (admin && modulos.includes("ESTOQUE")) adicionar("ESTOQUE", LINKS_ESTOQUE);
  if (vendas) adicionar("VENDAS", [...LINKS_DASHBOARD, ...LINKS_ERP, ...(admin ? LINKS_ERP_ADMIN : [])]);
  adicionar("ERP", [
    ...(erp && admin ? LINKS_FINANCEIRO_ADMIN : []),
    ...(erp && vendas ? LINKS_CARTEIRA : []),
    ...(erp && admin ? (vendas ? LINKS_FATURAMENTO_ADMIN : [LINK_NOTAS_AVULSAS]) : []),
    ...(modulos.includes("DESPESAS") ? LINKS_DESPESAS : []),
  ]);
  if (modulos.includes("VISITAS")) adicionar("VISITAS", LINKS_RELATORIOS);
  return grupos;
}

export function grupoDaRota(pathname: string, grupos: readonly GrupoNavegacao[]): GrupoNavegacao | undefined {
  const modulo = pathname === "/dashboard" || pathname.startsWith("/apresentacao") ? "VENDAS" : moduloDaRota(pathname);
  return grupos.find(grupo => grupo.id === (modulo === "DESPESAS" ? "ERP" : modulo));
}
