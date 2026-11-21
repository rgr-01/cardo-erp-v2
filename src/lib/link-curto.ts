import { createHmac, timingSafeEqual } from "node:crypto";

// Link curto de assinatura pra mandar pelo WhatsApp: o link do D4Sign tem mais
// de 300 caracteres. O curto é <site>/api/a/<numero do pedido>-<assinatura>,
// onde a assinatura é um HMAC do id do pedido — sem ela o número (35, fácil de
// chutar) não abre nada. A rota redireciona pro link do D4Sign.

function assinar(propostaId: string): string {
  const segredo = process.env.AUTH_SECRET;
  if (!segredo) throw new Error("AUTH_SECRET não configurado.");
  return createHmac("sha256", segredo)
    .update(`assinatura:${propostaId}`)
    .digest("base64url")
    .slice(0, 8);
}

function urlBase(): string | null {
  // Domínio próprio só pra links curtos (ver proxy.ts), se configurado.
  const curto = process.env.LINK_CURTO_URL?.trim();
  if (curto) return curto.replace(/\/$/, "");
  const auth = process.env.AUTH_URL?.trim();
  if (auth && !/localhost|127\.0\.0\.1/.test(auth)) return auth.replace(/\/$/, "");
  const publico = process.env.RAILWAY_PUBLIC_DOMAIN?.trim();
  return publico ? `https://${publico}` : null;
}

// Sem URL base conhecida devolve o link original, pra nunca ficar sem link.
export function linkCurtoAssinatura(
  proposta: { id: string; codigo: string },
  linkOriginal: string
): string {
  const base = urlBase();
  if (!base) return linkOriginal;
  const numero = Number(proposta.codigo.replace(/\D/g, ""));
  if (!Number.isInteger(numero) || numero <= 0) return linkOriginal;
  return `${base}/api/a/${numero}-${assinar(proposta.id)}`;
}

export function partesDoLinkCurto(valor: string): { numero: number; assinatura: string } | null {
  const i = valor.indexOf("-");
  if (i <= 0) return null;
  const numero = Number(valor.slice(0, i));
  if (!Number.isInteger(numero) || numero <= 0) return null;
  return { numero, assinatura: valor.slice(i + 1) };
}

export function assinaturaConfere(propostaId: string, assinatura: string): boolean {
  const esperado = Buffer.from(assinar(propostaId));
  const recebido = Buffer.from(assinatura);
  return esperado.length === recebido.length && timingSafeEqual(esperado, recebido);
}
