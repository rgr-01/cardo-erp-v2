import crypto from "node:crypto";
import { verificarSaude } from "@/lib/monitoramento";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const segredo = process.env.CRON_SECRET;
  const recebido = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const recebidoBuffer = Buffer.from(recebido);
  const segredoBuffer = Buffer.from(segredo || "");
  if (!segredo || !recebido || recebidoBuffer.byteLength !== segredoBuffer.byteLength || !crypto.timingSafeEqual(recebidoBuffer, segredoBuffer)) {
    return Response.json({ erro: "Não autorizado." }, { status: 401 });
  }
  const componentes = await verificarSaude();
  const saudavel = componentes.every((item) => item.saudavel);
  return Response.json({ saudavel, componentes }, { status: saudavel ? 200 : 503 });
}
