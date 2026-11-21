function escapar(campo: string): string {
  if (/[";\n\r]/.test(campo)) {
    return `"${campo.replace(/"/g, '""')}"`;
  }
  return campo;
}

/** Gera e baixa um CSV compatível com Excel pt-BR (separador ; e BOM UTF-8). */
export function baixarCSV(
  nomeArquivo: string,
  cabecalho: string[],
  linhas: (string | number | null | undefined)[][]
) {
  const conteudo = [cabecalho, ...linhas]
    .map((linha) => linha.map((c) => escapar(String(c ?? ""))).join(";"))
    .join("\r\n");
  const blob = new Blob(["﻿" + conteudo], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nomeArquivo;
  a.click();
  URL.revokeObjectURL(url);
}
