export const runtime = "nodejs";

import { gerarPdfDoRelatorio } from "@/lib/servicos/relatorios";
import { respostaPdf, rotaMobile } from "@/lib/api-mobile";

export const GET = rotaMobile(async ({ sessao, params }) => {
  const { bytes, nomeArquivo } = await gerarPdfDoRelatorio(sessao, params.id);
  return respostaPdf(bytes, nomeArquivo);
});
