export const runtime = "nodejs";

import { z } from "zod";
import { salvarRelatorioVisita } from "@/lib/relatorios-visita";
import { listarRelatorios } from "@/lib/servicos/relatorios";
import { jsonOk, lerImagens, rotaMobile } from "@/lib/api-mobile";

const relatorioSchema = z.object({
  clienteId: z.string().min(1, "Selecione o cliente."),
  fazendaId: z.string().nullish(),
  safraId: z.string().min(1, "Informe a safra."),
  titulo: z.string().nullish(),
  texto: z.string().min(1, "Descreva a visita."),
  dataVisita: z.string().nullish(),
});

export const GET = rotaMobile(async ({ request, sessao }) => {
  const safraId = new URL(request.url).searchParams.get("safraId");
  return jsonOk(await listarRelatorios(sessao, { safraId }));
});

export const POST = rotaMobile(async ({ request, sessao }) => {
  const formData = await request.formData();

  const dados = relatorioSchema.parse({
    clienteId: formData.get("clienteId"),
    fazendaId: formData.get("fazendaId") || null,
    safraId: formData.get("safraId"),
    titulo: formData.get("titulo"),
    texto: formData.get("texto"),
    dataVisita: formData.get("dataVisita"),
  });

  const relatorio = await salvarRelatorioVisita({
    clienteId: dados.clienteId,
    fazendaId: dados.fazendaId,
    consultorId: sessao.id,
    safraId: dados.safraId,
    titulo: dados.titulo,
    texto: dados.texto,
    dataVisita: dados.dataVisita ? new Date(dados.dataVisita) : undefined,
    fotos: await lerImagens(formData, "fotos"),
  });

  return jsonOk({ id: relatorio.id }, 201);
});
