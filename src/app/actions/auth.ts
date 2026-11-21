"use server";

import { AuthError } from "next-auth";
import { signIn, signOut } from "@/auth";

export async function autenticar(
  _prevState: string | undefined,
  formData: FormData
) {
  try {
    await signIn("credentials", formData);
  } catch (error) {
    if (error instanceof AuthError) {
      if (error.type === "CredentialsSignin") {
        return "Não foi possível entrar com esses dados. Confira o e-mail e a senha e tente novamente.";
      }
      return "Não foi possível concluir o login. Tente novamente. Se o problema continuar, avise o administrador da sua empresa.";
    }
    throw error;
  }
}

export async function sair() {
  await signOut({ redirectTo: "/login" });
}
