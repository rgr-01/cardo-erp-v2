// Primeira página de um PDF como JPEG — usado pra mandar "foto" de
// orçamento/pedido pelo WhatsApp em vez do PDF completo (mais rápido de abrir
// no chat). Compartilhado entre lib/whatsapp/ferramentas.ts (formato:'imagem'
// no enviar_pdf_orcamento) e lib/notificacoes-margem.ts (aviso automático).

import { pdf as pdfParaImagens } from "pdf-to-img";
import path from "node:path";
import { createRequire } from "node:module";

export async function primeiraPaginaComoJpeg(pdfBuffer: Buffer): Promise<Buffer | null> {
  try {
    // require.resolve baseado em import.meta.url falha em produção: o Next
    // empacota este arquivo num chunk (.next/server/chunks/...), então
    // import.meta.url aponta pro chunk, não pro arquivo fonte — resolvendo
    // "pdfjs-dist" a partir de um diretório sem essa árvore de node_modules
    // (gera o erro "path argument must be of type string", bem confuso).
    // process.cwd() é a raiz do projeto tanto em dev quanto no container de
    // produção do Next — resolve certo nos dois casos.
    const requireDoProjeto = createRequire(path.join(process.cwd(), "package.json"));
    const doc = await pdfParaImagens(pdfBuffer, {
      format: "jpeg",
      scale: 2,
      docInitParams: {
        // pdfjs quer um prefixo tipo-URL (barra normal, com "/" no fim) —
        // path.join no Windows usaria "\", que ele rejeita.
        standardFontDataUrl:
          `${path.dirname(requireDoProjeto.resolve("pdfjs-dist/package.json")).replaceAll("\\", "/")}/standard_fonts/`,
      },
    });
    const pagina = await doc.getPage(1);
    return pagina;
  } catch (error) {
    console.error("[pdf-para-imagem] Falha ao converter PDF em imagem:", error);
    return null;
  }
}

// Todas as páginas (até `maximo`) como JPEG — prévia do relatório de visita
// no WhatsApp antes de aprovar (ver previa_relatorio em lib/whatsapp/ferramentas.ts).
export async function paginasComoJpeg(pdfBuffer: Buffer, maximo = 6, escala = 2): Promise<Buffer[]> {
  try {
    const requireDoProjeto = createRequire(path.join(process.cwd(), "package.json"));
    const doc = await pdfParaImagens(pdfBuffer, {
      format: "jpeg",
      scale: escala,
      docInitParams: {
        standardFontDataUrl:
          `${path.dirname(requireDoProjeto.resolve("pdfjs-dist/package.json")).replaceAll("\\", "/")}/standard_fonts/`,
      },
    });
    const paginas: Buffer[] = [];
    for (let n = 1; n <= Math.min(doc.length, maximo); n++) paginas.push(await doc.getPage(n));
    return paginas;
  } catch (error) {
    console.error("[pdf-para-imagem] Falha ao converter PDF em imagens:", error);
    return [];
  }
}
