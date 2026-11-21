import type { NextAuthConfig } from "next-auth";

export const authConfig = {
  trustHost: true,
  pages: {
    signIn: "/login",
  },
  session: { strategy: "jwt" },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const logado = !!auth?.user;
      const naPaginaLogin = nextUrl.pathname.startsWith("/login");
      if (naPaginaLogin) {
        if (logado) return Response.redirect(new URL("/inicio", nextUrl));
        return true;
      }
      return logado;
    },
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.nome = user.nome;
      }
      return token;
    },
    session({ session, token }) {
      if (token) {
        session.user.id = token.id as string;
        session.user.role = token.role as "ADMIN" | "CONSULTOR";
        session.user.nome = token.nome as string;
      }
      return session;
    },
  },
  providers: [],
} satisfies NextAuthConfig;
