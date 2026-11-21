// Divide a resposta do agente entre o que vira voz e o que vai por escrito.

import { SEPARADOR_AUDIO } from "@/lib/whatsapp/agente";

// Opção numerada/lista, item de produto/orçamento (bullet ou linha com
// valor em R$) ou o "responda com o número" do menu — nunca vai falada,
// mesmo que o modelo coloque antes do separador (rede de segurança pro caso
// dele esquecer o separador numa listagem de produtos/ofertas/itens).
function ehLinhaDeOpcao(linha: string): boolean {
  return (
    /^\s*(\d+[.)]|[-•*▫▪◦‣])\s*\S/.test(linha) ||
    /responda com o n[uú]mero/i.test(linha) ||
    /R\$\s?\d/.test(linha)
  );
}

export function partesDaResposta(resposta: string): { falado: string; escrito: string } {
  const linhas = resposta.split("\n").map((l) => l.trimEnd());
  const i = linhas.findIndex((l) => l.trim() === SEPARADOR_AUDIO);
  const antes = i === -1 ? linhas : linhas.slice(0, i);
  let escrito = i === -1 ? "" : linhas.slice(i + 1).join("\n").trim();

  const opcoes = antes.filter(ehLinhaDeOpcao);
  let falado = antes.filter((l) => !ehLinhaDeOpcao(l)).join("\n").trim();

  if (opcoes.length > 0) {
    // Só o que o escrito ainda não traz (o modelo às vezes repete a lista
    // dos dois lados do separador).
    const faltando = opcoes.filter((o) => !escrito.includes(o.trim()));
    if (faltando.length > 0) {
      escrito = escrito ? `${escrito}\n\n${faltando.join("\n")}` : faltando.join("\n");
    }
    if (!falado) falado = "Te mandei as opções aqui embaixo.";
  }
  return { falado, escrito };
}

// Resposta que vai só em texto: mantém a ordem original, só tira o separador.
export function semSeparador(resposta: string): string {
  return resposta
    .split("\n")
    .filter((l) => l.trim() !== SEPARADOR_AUDIO)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
