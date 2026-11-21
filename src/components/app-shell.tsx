"use client";

import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import type { Tema } from "@/lib/tema";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { NavLinks } from "@/components/nav-links";
import { SafraSeletor } from "@/components/safra-seletor";
import { PerfilMenu } from "@/components/perfil-menu";
import { AssistenteChat } from "@/components/assistente-chat";
import { Logo } from "@/components/logo";
import { CardoLogo } from "@/components/cardo-logo";
import { MarcaEmpresaProvider, type MarcaVisual } from "@/components/marca-empresa";
import type { Modulo } from "@/lib/modulos";
import { ConfirmProvider } from "@/components/ui/confirm-dialog";
import { EmbutidoProvider } from "@/components/embutido";
import { EscutaFecharEmbutido } from "@/components/visitas/botao-voltar-relatorio";

function observarDesktop(notificar: () => void) {
  const media = window.matchMedia("(min-width: 1024px)");
  media.addEventListener("change", notificar);
  return () => media.removeEventListener("change", notificar);
}

export function AppShell({
  embutido = false,
  tema = "claro",
  nome,
  fotoUrl,
  role,
  modulos,
  marca,
  safras,
  safraAtual,
  sair,
  children,
}: {
  embutido?: boolean;
  tema?: Tema;
  nome: string;
  fotoUrl: string | null;
  role: "ADMIN" | "CONSULTOR";
  modulos: Modulo[];
  marca: MarcaVisual;
  safras: { id: string; nome: string }[];
  safraAtual: { id: string; nome: string };
  sair: () => Promise<void>;
  children: React.ReactNode;
}) {
  // O tema vale no <html> (modais e menus abrem fora desta árvore) só enquanto
  // a área logada está montada; login e painel master seguem com o deles.
  const atributoTema = tema === "claro" ? "light" : "dark";
  useLayoutEffect(() => {
    const html = document.documentElement;
    html.dataset.theme = atributoTema;
    return () => {
      delete html.dataset.theme;
    };
  }, [atributoTema]);

  const [aberto, setAberto] = useState(false);
  const desktop = useSyncExternalStore(observarDesktop, () => window.matchMedia("(min-width: 1024px)").matches, () => true);
  const abrirMenu = useRef<HTMLButtonElement>(null);
  const fecharMenu = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!aberto || desktop) return;
    const acionador = abrirMenu.current;
    fecharMenu.current?.focus();
    return () => { acionador?.focus(); };
  }, [aberto, desktop]);
  const pathname = usePathname();
  const [pathnameAnterior, setPathnameAnterior] = useState(pathname);
  // O servidor só enxerga o iframe na carga inicial da página: depois de um
  // salvamento (que atualiza o layout), o cabeçalho some e o menu voltaria a
  // aparecer dentro da janela. O navegador sabe sempre.
  const dentroDeJanela = useSyncExternalStore(
    () => () => {},
    () => {
      try {
        return window.self !== window.top;
      } catch {
        return true;
      }
    },
    () => false
  );

  if (pathname !== pathnameAnterior) {
    setPathnameAnterior(pathname);
    setAberto(false);
  }

  // O editor de relatório é tela cheia de trabalho: sem o assistente flutuante por cima.
  const noEditorDeRelatorio = /^\/relatorios\/visitas\/(novo|[^/]+\/editar)(\/|$)/.test(pathname);

  if (embutido || dentroDeJanela) {
    return (
      <MarcaEmpresaProvider marca={marca}>
      <ConfirmProvider>
        <div data-theme={atributoTema} className="erp-shell">
        <EmbutidoProvider value>
          <EscutaFecharEmbutido />
          <main className="erp-main min-w-0 overflow-x-hidden p-4">{children}</main>
        </EmbutidoProvider>
        </div>
      </ConfirmProvider>
      </MarcaEmpresaProvider>
    );
  }

  return (
    <MarcaEmpresaProvider marca={marca}>
    <ConfirmProvider>
      <div data-theme={atributoTema} className="erp-shell flex min-h-dvh bg-background text-foreground">
        <header inert={aberto && !desktop} className="fixed inset-x-0 top-0 z-30 flex h-16 items-center justify-between border-b border-surface-border bg-zinc-900 px-4 lg:hidden">
          <h1>
            <Link href="/inicio" title="Ir para o início" className="inline-block"><Logo fundo={tema === "claro" ? "claro" : "escuro"} className="h-6 w-auto max-w-[180px] text-lg" /></Link>
          </h1>
          <div className="flex items-center gap-2">
          <button
            ref={abrirMenu}
            aria-expanded={aberto}
            aria-controls="menu-principal"
            onClick={() => setAberto(true)}
            aria-label="Abrir menu"
            className="flex h-11 w-11 items-center justify-center rounded-lg border border-control text-zinc-300 hover:bg-zinc-800"
          >
            <Menu size={20} />
          </button>
          </div>
        </header>

        {aberto && (
          <div
            onClick={() => setAberto(false)}
            className="fixed inset-0 z-30 bg-black/60 lg:hidden"
          />
        )}

        <aside
          id="menu-principal"
          inert={!desktop && !aberto}
          aria-hidden={!desktop && !aberto}
          onKeyDown={event => { if (event.key === "Escape" && !desktop) { event.preventDefault(); setAberto(false); } }}
          className={`fixed inset-y-0 left-0 z-40 menu-lateral flex h-dvh w-64 -translate-x-full flex-col transition-transform duration-150 ease-out lg:translate-x-0 ${
            aberto ? "translate-x-0" : ""
          }`}
        >
          <div className="flex shrink-0 items-center justify-between gap-2 px-5 py-6">
            <div>
              <h1>
                <Link href="/inicio" title="Ir para o início" className="inline-block"><Logo fundo={tema === "claro" ? "claro" : "escuro"} className="h-7 w-auto max-w-[180px] text-lg" /></Link>
              </h1>
              <div className="mt-2">
                <SafraSeletor safras={safras} safraAtual={safraAtual} />
              </div>
            </div>
            <div className="flex items-center gap-1">
              <PerfilMenu nome={nome} fotoUrl={fotoUrl} role={role} tema={tema} sair={sair} posicao="abaixo" />
              <button
                ref={fecharMenu}
                onClick={() => setAberto(false)}
                aria-label="Fechar menu"
                className="flex h-11 w-11 items-center justify-center rounded-lg text-muted hover:bg-zinc-800 hover:text-white lg:hidden"
              >
                <X size={18} />
              </button>
            </div>
          </div>
          <NavLinks role={role} modulos={modulos} />
          <div className="shrink-0 border-t border-surface-border px-4 py-3 text-[11px] text-muted">
            tecnologia <CardoLogo className="text-[11px] text-secondary" />
          </div>
        </aside>

        <main inert={aberto && !desktop} className="erp-main min-w-0 flex-1 overflow-x-hidden px-4 pb-20 pt-24 sm:px-6 lg:ml-64 lg:py-8 xl:px-8">
          {children}
          {!noEditorDeRelatorio && <AssistenteChat />}
        </main>
      </div>
    </ConfirmProvider>
    </MarcaEmpresaProvider>
  );
}
