export const runtime = "nodejs";

import { enviarFotoRelatorio } from "@/lib/servicos/relatorios";
import { jsonOk, rotaMobile } from "@/lib/api-mobile";

// Sobe uma foto pro relatório e devolve url/path; o app coloca a foto como
// bloco no documento e salva com o PATCH do relatório.
export const POST = rotaMobile(async ({ request, sessao, params }) => {
  const formData = await request.formData();
  return jsonOk(await enviarFotoRelatorio(sessao, params.id, formData.get("foto")), 201);
});
