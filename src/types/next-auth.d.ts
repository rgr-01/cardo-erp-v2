import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      nome: string;
      role: "ADMIN" | "CONSULTOR";
    } & DefaultSession["user"];
  }

  interface User {
    nome: string;
    role: "ADMIN" | "CONSULTOR";
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    nome: string;
    role: "ADMIN" | "CONSULTOR";
  }
}
