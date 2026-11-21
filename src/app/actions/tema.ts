"use server";

import { cookies } from "next/headers";
import { COOKIE_TEMA, temaValido, type Tema } from "@/lib/tema";

export async function definirTema(tema: Tema): Promise<void> {
  (await cookies()).set(COOKIE_TEMA, temaValido(tema), {
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 365,
    path: "/",
  });
}
