export const runtime = "nodejs";

import { extrairDadosNotaFiscal } from "@/lib/ocr-despesa";
import { jsonOk, rotaMobile } from "@/lib/api-mobile";

export const POST = rotaMobile(async ({ request }) => {
  const formData = await request.formData();

  const arquivo = formData.get("foto");
  if (!(arquivo instanceof File) || arquivo.size === 0) {
    throw new Error("Envie uma foto da nota fiscal.");
  }
  if (!arquivo.type.startsWith("image/")) {
    throw new Error("O arquivo enviado não é uma imagem.");
  }
  if (arquivo.size > 8 * 1024 * 1024) {
    throw new Error("A foto excede 8MB.");
  }

  const buffer = Buffer.from(await arquivo.arrayBuffer());
  return jsonOk(await extrairDadosNotaFiscal(buffer, arquivo.type));
});
