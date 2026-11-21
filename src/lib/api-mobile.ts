import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { exigirSessaoMobile } from "@/lib/mobile-auth";
import { validarImagem } from "@/lib/storage";
import type { Sessao } from "@/app/actions/helpers";
import {
  ErroAutenticacao,
  ErroNaoEncontrado,
  ErroPermissao,
} from "@/lib/servicos/erros";

export function jsonOk<T>(data: T, status = 200) {
  return NextResponse.json(data, { status });
}

export function jsonErro(mensagem: string, status = 400) {
  return NextResponse.json({ erro: mensagem }, { status });
}

// Converte o erro no status que o app entende: 401 derruba a sessão e manda
// pro login, 403/404 aparecem como aviso, o resto é erro de validação.
export function respostaDeErro(error: unknown) {
  if (error instanceof ErroAutenticacao) return jsonErro(error.message, 401);
  if (error instanceof ErroPermissao) return jsonErro(error.message, 403);
  if (error instanceof ErroNaoEncontrado) return jsonErro(error.message, 404);
  if (error instanceof ZodError) {
    return jsonErro(error.issues[0]?.message ?? "Dados inválidos.", 400);
  }
  return jsonErro(error instanceof Error ? error.message : "Erro inesperado.", 400);
}

type ContextoRota = { params: Promise<Record<string, string>> };

/**
 * Envolve um handler da API do app: exige o token, entrega a sessão e os
 * parâmetros da rota, e converte qualquer erro na resposta certa.
 */
export function rotaMobile(
  handler: (ctx: {
    request: Request;
    sessao: Sessao;
    params: Record<string, string>;
  }) => Promise<Response>
) {
  return async (request: Request, contexto: ContextoRota) => {
    try {
      const sessao = await exigirSessaoMobile(request);
      const params = contexto?.params ? await contexto.params : {};
      return await handler({ request, sessao, params });
    } catch (error) {
      return respostaDeErro(error);
    }
  };
}

/** Lê as imagens enviadas num campo multipart (fotos de visita/nota). */
export async function lerImagens(formData: FormData, campo: string, maximo = 8) {
  const arquivos = formData
    .getAll(campo)
    .filter((f): f is File => f instanceof File && f.size > 0);
  if (arquivos.length > maximo) throw new Error(`Envie no máximo ${maximo} imagens.`);
  return Promise.all(
    arquivos.map(async (arquivo) => {
      const buffer = Buffer.from(await arquivo.arrayBuffer());
      const imagem = validarImagem(buffer);
      return {
        buffer,
        contentType: imagem.contentType,
        nomeOriginal: arquivo.name,
      };
    })
  );
}

export function respostaPdf(bytes: Uint8Array, nomeArquivo: string) {
  const body = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  return new Response(body, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${nomeArquivo}"`,
    },
  });
}
