import { Suspense } from "react";
import Link from "next/link";
import { cookies } from "next/headers";
import { LoginForm } from "./login-form";
import { CardoLogo } from "@/components/cardo-logo";
import type { Metadata } from "next";
import { COOKIE_EMPRESA_LOGIN, iconeDaEmpresa, marcaDaEmpresa } from "@/lib/empresa-marca";
import { EMPRESA_CARDO_AI } from "@/lib/master";
import { COOKIE_TEMA, temaValido } from "@/lib/tema";
import { SeletorTema } from "@/components/seletor-tema";
import { TemaDocumento } from "@/components/tema-documento";

export async function generateMetadata(): Promise<Metadata> {
  const empresaId = (await cookies()).get(COOKIE_EMPRESA_LOGIN)?.value;
  return { title: "Entrar — Cardo AI · Gestão Comercial Agro", icons: { icon: await iconeDaEmpresa(empresaId) } };
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ trocar?: string }> }) {
  const { trocar } = await searchParams;
  const empresaId = trocar ? undefined : (await cookies()).get(COOKIE_EMPRESA_LOGIN)?.value;
  const empresa = empresaId === EMPRESA_CARDO_AI ? null : await marcaDaEmpresa(empresaId);
  const tema = temaValido((await cookies()).get(COOKIE_TEMA)?.value);
  const logo = tema === "escuro" ? empresa?.logoEscuro ?? empresa?.logoClaro : empresa?.logoClaro ?? empresa?.logoEscuro;

  return (
    <main data-theme={tema === "claro" ? "light" : "dark"} className="login-compacto flex min-h-dvh flex-col bg-background text-foreground">
      <TemaDocumento tema={tema} />
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-6 py-8 sm:px-10">
        {logo ? (
          // eslint-disable-next-line @next/next/no-img-element -- identidade enviada pela empresa
          <img src={logo} alt={empresa?.nome ?? "Empresa"} className="h-10 w-auto max-w-[240px] object-contain object-left" />
        ) : empresa ? (
          <p className="text-xl font-semibold">{empresa.nome}</p>
        ) : (
          <CardoLogo className="text-2xl text-foreground" />
        )}
        <SeletorTema tema={tema} aparencia="icone" />
      </header>
      <div className="mx-auto grid w-full max-w-6xl flex-1 items-center gap-12 px-6 pb-8 sm:px-10 lg:grid-cols-[1fr_1.1fr] lg:gap-20 lg:pb-16">
        <section className="hidden max-w-md lg:block" aria-labelledby="portal-title">
          <h2 id="portal-title" className="text-balance text-3xl font-semibold leading-tight tracking-tight text-foreground">
            {empresa ? `Área de trabalho da ${empresa.nome}` : "Gestão comercial do agronegócio"}
          </h2>
          <p className="mt-4 text-pretty text-base leading-relaxed text-secondary">
            {empresa ? "Acesse os módulos disponíveis para sua equipe e acompanhe o trabalho da safra." : "Planejamento da safra, pedidos, financeiro e visitas de campo."}
          </p>
        </section>
        <section aria-labelledby="login-title" className="mx-auto w-full max-w-md rounded-xl border border-surface-border bg-zinc-900 p-6 sm:p-8">
          <h1 id="login-title" className="text-balance text-2xl font-semibold tracking-tight text-foreground">Acesse sua conta</h1>
          <p className="mt-2 text-sm text-muted">
            {empresa ? `Use o e-mail e a senha cadastrados na ${empresa.nome}.` : "Use o e-mail e a senha cadastrados pela sua empresa."}
          </p>
          <div className="mt-8"><Suspense><LoginForm /></Suspense></div>
          <p className="mt-6 text-pretty text-sm leading-relaxed text-subtle">
            Ainda não tem acesso ou esqueceu a senha? Peça ajuda ao administrador da sua empresa.
          </p>
          {empresa && <p className="mt-6 border-t border-surface-border pt-4 text-sm text-muted">Não é da {empresa.nome}?{" "}<Link href="/login?trocar=1" className="font-semibold text-accent underline-offset-4 hover:underline">Usar outra conta</Link></p>}
        </section>
      </div>
      <footer className="px-6 pb-6 text-center text-xs text-muted">© {new Date().getFullYear()} Cardo AI · Gestão Comercial Agro</footer>
    </main>
  );
}
