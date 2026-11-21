export const runtime = "nodejs";

import { validarCredenciais } from "@/lib/auth-credenciais";
import { marcaParaApp } from "@/lib/empresa-marca";
import { emitirTokenMobile } from "@/lib/mobile-auth";
import { jsonOk, jsonErro } from "@/lib/api-mobile";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const email = String(body?.email ?? "");
  const senha = String(body?.senha ?? "");

  const usuario = await validarCredenciais(email, senha);
  if (!usuario) return jsonErro("Credenciais inválidas.", 401);

  const token = await emitirTokenMobile(usuario);
  return jsonOk({
    token,
    usuario: { id: usuario.id, nome: usuario.nome, role: usuario.role },
    empresa: await marcaParaApp(usuario.empresaId, new URL(request.url).origin),
  });
}
