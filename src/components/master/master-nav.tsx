"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2, LayoutDashboard } from "lucide-react";

const LINKS = [
  { href: "/master", label: "Visão geral", icon: LayoutDashboard },
  { href: "/master/empresas", label: "Empresas", icon: Building2 },
];

export function MasterNav() {
  const pathname = usePathname();
  return (
    <nav className="flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-col lg:pb-0">
      {LINKS.map(({ href, label, icon: Icone }) => {
        const ativo = href === "/master" ? pathname === href : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={`flex shrink-0 items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
              ativo ? "bg-accent/15 text-accent" : "text-secondary hover:bg-zinc-800 hover:text-white"
            }`}
          >
            <Icone size={18} strokeWidth={1.75} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
