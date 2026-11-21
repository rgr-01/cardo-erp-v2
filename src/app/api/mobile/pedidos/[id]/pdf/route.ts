export const runtime = "nodejs";

import { gerarPdfDaProposta } from "@/lib/servicos/propostas";
import { respostaPdf, rotaMobile } from "@/lib/api-mobile";

export const GET = rotaMobile(async ({ sessao, params }) => {
  const { bytes, nomeArquivo } = await gerarPdfDaProposta(sessao, params.id);
  return respostaPdf(bytes, nomeArquivo);
});
