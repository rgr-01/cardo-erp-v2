import { SignJWT, jwtVerify } from "jose";
import type { Sessao } from "@/app/actions/helpers";
import { ErroAutenticacao, ErroPermissao } from "@/lib/servicos/erros";
import { moduloDaRota, podeAcessarRota } from "@/lib/modulos";
import { modulosDoUsuario } from "@/lib/modulos-servidor";
import { prisma } from "@/lib/prisma";

const EXPIRACAO = "24h";

function getSecret(): Uint8Array {
  const secret = process.env.MOBILE_JWT_SECRET;
  if (!secret) {
    throw new Error("MOBILE_JWT_SECRET não configurado.");
  }
  return new TextEncoder().encode(secret);
}

export async function emitirTokenMobile(usuario: {
  id: string;
  role: "ADMIN" | "CONSULTOR";
  nome: string;
  versaoSessao?: number;
}): Promise<string> {
  return new SignJWT({ role: usuario.role, nome: usuario.nome, versao: usuario.versaoSessao ?? 0 })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(usuario.id)
    .setIssuedAt()
    .setExpirationTime(EXPIRACAO)
    .sign(getSecret());
}

export async function verificarTokenMobile(token: string): Promise<Sessao | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    if (!payload.sub || !payload.role || !payload.nome || typeof payload.versao !== "number") return null;
    const usuario = await prisma.user.findUnique({ where: { id: payload.sub }, select: { nome: true, role: true, ativo: true, versaoSessao: true } });
    if (!usuario || !usuario.ativo || usuario.versaoSessao !== payload.versao) return null;
    return {
      id: payload.sub,
      nome: usuario.nome,
      role: usuario.role,
    };
  } catch {
    return null;
  }
}

// Só confere a assinatura (sem banco): usado pelo filtro de empresa do Prisma,
// que não pode consultar o banco para descobrir o usuário.
export async function userIdDoTokenMobile(authorization: string | null): Promise<string | undefined> {
  const [tipo, token] = (authorization ?? "").split(" ");
  if (tipo !== "Bearer" || !token) return undefined;
  try {
    const { payload } = await jwtVerify(token, getSecret());
    return payload.sub;
  } catch {
    return undefined;
  }
}

export async function exigirSessaoMobile(request: Request): Promise<Sessao> {
  const authHeader = request.headers.get("authorization") || "";
  const [tipo, token] = authHeader.split(" ");
  if (tipo !== "Bearer" || !token) {
    throw new ErroAutenticacao("Não autenticado.");
  }
  const sessao = await verificarTokenMobile(token);
  if (!sessao) throw new ErroAutenticacao("Token inválido ou expirado.");
  const pathname = new URL(request.url).pathname;
  // Leituras de clientes/fazendas alimentam seletores das visitas e pedidos;
  // alterações cadastrais, inclusive pelo app, pertencem a Cadastros.
  const escritaCadastro = !["GET", "HEAD"].includes(request.method) && /^\/api\/mobile\/clientes(?:\/|$)/.test(pathname);
  const modulo = escritaCadastro ? "CADASTROS" : moduloDaRota(pathname);
  const modulos = modulo ? await modulosDoUsuario(sessao.id) : [];
  if (modulo && (escritaCadastro ? !modulos.includes("CADASTROS") : !podeAcessarRota(pathname, modulos))) {
    throw new ErroPermissao("Este módulo não está contratado pela sua empresa.");
  }
  return sessao;
}
