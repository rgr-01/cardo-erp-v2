import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { authConfig } from "@/auth.config";
import { validarCredenciais } from "@/lib/auth-credenciais";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: {},
        senha: {},
      },
      async authorize(credentials) {
        const usuario = await validarCredenciais(
          String(credentials?.email ?? ""),
          String(credentials?.senha ?? "")
        );
        if (!usuario) return null;

        return {
          id: usuario.id,
          email: usuario.email,
          name: usuario.nome,
          nome: usuario.nome,
          role: usuario.role,
        };
      },
    }),
  ],
});
