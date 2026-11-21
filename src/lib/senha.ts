import { z } from "zod";

export const senhaForteSchema = z.string().min(12, "A senha deve ter ao menos 12 caracteres.")
  .regex(/[a-z]/, "A senha precisa ter letra minúscula.")
  .regex(/[A-Z]/, "A senha precisa ter letra maiúscula.")
  .regex(/\d/, "A senha precisa ter número.")
  .regex(/[^A-Za-z0-9]/, "A senha precisa ter símbolo.");
