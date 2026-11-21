import { exigirSuperAdminPagina } from "@/lib/master";
import { sair } from "@/app/actions/auth";
import { ConfirmProvider } from "@/components/ui/confirm-dialog";
import { MasterNav } from "@/components/master/master-nav";
import { CardoLogo } from "@/components/cardo-logo";

export const metadata = { title: "Cardo AI — Painel master" };

// Painel da equipe Cardo AI: casca própria, sem menu nem dados de empresa.
export default async function MasterLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const { nome } = await exigirSuperAdminPagina();

  return (
    <ConfirmProvider>
      <div className="tema-cardo erp-shell flex min-h-dvh flex-col lg:flex-row">
        <aside className="flex shrink-0 flex-col border-b border-surface-border bg-zinc-900 lg:sticky lg:top-0 lg:h-dvh lg:w-64 lg:border-b-0 lg:border-r">
          <div className="flex items-center justify-between gap-3 px-5 py-5">
            <div>
              <CardoLogo className="text-xl text-white" />
              <p className="mt-1 text-xs font-medium text-muted">Painel master</p>
            </div>
          </div>
          <MasterNav />
          <div className="mt-auto hidden border-t border-surface-border px-5 py-4 lg:block">
            <p className="truncate text-sm text-white">{nome}</p>
            <p className="text-xs text-muted">Equipe Cardo AI</p>
            <form action={sair} className="mt-3">
              <button type="submit" className="text-xs text-secondary transition hover:text-white">
                Sair
              </button>
            </form>
          </div>
        </aside>
        <main className="erp-main min-w-0 flex-1 p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </ConfirmProvider>
  );
}
