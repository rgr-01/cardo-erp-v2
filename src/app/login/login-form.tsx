"use client";

import { useActionState, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowRight, Eye, EyeOff, Loader2, LockKeyhole, Mail } from "lucide-react";
import { autenticar } from "@/app/actions/auth";

// Campos seguem o tema de acesso; verde identifica ação e foco.
const campo =
  "h-12 w-full rounded-lg border border-control bg-zinc-950 pl-11 pr-3.5 text-sm text-foreground placeholder:text-muted outline-none transition-colors duration-150 focus:border-accent focus:ring-2 focus:ring-accent/15";
const iconeCampo = "pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-secondary";
const rotulo = "mb-1.5 block text-sm font-medium text-secondary";

export function LoginForm() {
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") ?? "/inicio";
  const [erro, formAction, pendente] = useActionState(autenticar, undefined);
  const [email, setEmail] = useState("");
  const [mostrarSenha, setMostrarSenha] = useState(false);

  return (
    <form action={formAction} aria-busy={pendente} className="space-y-5">
      <input type="hidden" name="redirectTo" value={callbackUrl} />
      <div>
        <label htmlFor="email" className={rotulo}>
          E-mail
        </label>
        <div className="relative">
        <Mail size={18} className={iconeCampo} aria-hidden />
        <input
          id="email"
          name="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          type="email"
          required
          autoComplete="email"
          aria-describedby={erro ? "login-error" : undefined}
          placeholder="nome@exemplo.com"
          className={campo}
        />
        </div>
      </div>
      <div>
        <label htmlFor="senha" className={rotulo}>
          Senha
        </label>
        <div className="relative">
          <LockKeyhole size={18} className={iconeCampo} aria-hidden />
          <input
            id="senha"
            name="senha"
            type={mostrarSenha ? "text" : "password"}
            required
            autoComplete="current-password"
            aria-describedby={erro ? "login-error" : undefined}
            placeholder="••••••••"
            className={`${campo} pr-11`}
          />
          <button
            type="button"
            onClick={() => setMostrarSenha((v) => !v)}
            aria-label={mostrarSenha ? "Ocultar senha" : "Mostrar senha"}
            className="absolute inset-y-0 right-0 flex items-center px-3.5 text-secondary transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
          >
            {mostrarSenha ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>
      </div>
      {erro && (
        <p id="login-error" role="alert" className="rounded-xl border border-danger/40 bg-danger/10 px-3.5 py-2.5 text-sm text-danger-ink">
          {erro}
        </p>
      )}
      <button
        type="submit"
        disabled={pendente}
        className="flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-accent text-sm font-semibold text-accent-foreground transition-colors duration-150 hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pendente ? (
          <>
            <Loader2 size={16} aria-hidden className="animate-spin" /> Verificando acesso...
          </>
        ) : (
          <>
            Entrar <ArrowRight size={16} aria-hidden />
          </>
        )}
      </button>
    </form>
  );
}
