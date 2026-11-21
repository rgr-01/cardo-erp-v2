import NextAuth from "next-auth";
import type { NextFetchEvent, NextRequest } from "next/server";
import { authConfig } from "@/auth.config";

const auth = NextAuth(authConfig).auth;

// Domínio curto só pra link de assinatura (LINK_CURTO_URL): nele nada além de
// /api/a/* existe. O matcher abaixo já deixa /api de fora, então qualquer
// outra rota que chegue aqui por esse host é 404 — o site não aparece.
function hostDoLinkCurto(): string | null {
  const url = process.env.LINK_CURTO_URL?.trim();
  if (!url) return null;
  try {
    return new URL(url).host.toLowerCase();
  } catch {
    return null;
  }
}

export default function proxy(req: NextRequest, evt: NextFetchEvent) {
  const curto = hostDoLinkCurto();
  const host = (req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "").toLowerCase();
  if (curto && host === curto) return new Response("Not found", { status: 404 });
  return (auth as unknown as (r: NextRequest, e: NextFetchEvent) => Response | Promise<Response>)(req, evt);
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\.(?:png|svg|jpg|ico)$).*)"],
};
