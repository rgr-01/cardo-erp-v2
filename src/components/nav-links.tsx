"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Modulo } from "@/lib/modulos";
import { gruposDeNavegacao, type LinkNavegacao } from "@/lib/navegacao";

function NavItem({ link, ativo }: { link: LinkNavegacao; ativo: boolean }) {
  const Icon = link.icon;
  return (
    <Link href={link.href} aria-current={ativo ? "page" : undefined}
      className={`flex min-h-9 items-center gap-3 rounded-lg px-3 py-1.5 text-[12px] font-normal transition-colors duration-150 max-lg:min-h-11 ${ativo ? "bg-accent/10 text-accent" : "text-secondary hover:bg-zinc-800/70 hover:text-white"}`}>
      <Icon size={18} strokeWidth={ativo ? 2 : 1.75} className="shrink-0" aria-hidden />
      <span className="min-w-0">{link.label}</span>
    </Link>
  );
}

// Menu lateral com todos os módulos liberados de uma vez, cada um com seu título.
export function NavLinks({ role, modulos }: { role: "ADMIN" | "CONSULTOR"; modulos: Modulo[] }) {
  const pathname = usePathname();
  const grupos = gruposDeNavegacao(role, modulos);
  const todos = grupos.flatMap(grupo => grupo.links);
  // /inicio é o mesmo painel de /dashboard; destaca o link mais específico da rota.
  const rota = pathname === "/inicio" ? "/dashboard" : pathname;
  const hrefAtivo = todos.filter(link => rota === link.href || rota.startsWith(link.href + "/"))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;
  const painel = todos.find(link => link.href === "/dashboard");

  return (
    <nav aria-label="Navegação principal" className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
      {painel && <NavItem link={painel} ativo={hrefAtivo === painel.href} />}
      {grupos.map(grupo => {
        const links = grupo.links.filter(link => link.href !== "/dashboard");
        if (!links.length) return null;
        return (
          <div key={grupo.id} className="mt-5 first:mt-0 space-y-0.5" aria-label={`Menu de ${grupo.nome}`}>
            <p className="px-3 pb-1.5 text-sm font-semibold text-foreground">{grupo.nome}</p>
            {links.map(link => <NavItem key={link.href} link={link} ativo={hrefAtivo === link.href} />)}
          </div>
        );
      })}
    </nav>
  );
}
