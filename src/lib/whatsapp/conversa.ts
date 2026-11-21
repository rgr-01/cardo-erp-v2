// Processa um lote de mensagens do mesmo número (ver fila.ts): tudo que
// chegou junto vira UMA mensagem pro agente e UMA resposta.
//
// Conversa ao vivo: o lote costuma ser uma mensagem só (ou fotos + texto) e a
// mensagem vai pro agente como sempre foi. Rajada que estava presa no celular
// sem internet: vai como uma linha do tempo com o horário de envio de cada
// item, pro agente montar um relato só, perguntar as dúvidas de uma vez e
// datar visita/check-in pelo horário real — não pelo da chegada.

import { comUsuario } from "@/lib/empresa-contexto";
import {
  enviarMensagemTexto,
  enviarDigitando,
  reagir,
  enviarAudio,
  baixarMidia,
  type MensagemRecebida,
} from "@/lib/whatsapp/transporte";
import { transcreverAudio, sintetizarVoz } from "@/lib/whatsapp/audio";
import { responderComAgente, MENU_INICIAL } from "@/lib/whatsapp/agente";
import { partesDaResposta, semSeparador } from "@/lib/whatsapp/resposta-audio";
import {
  resolverUsuarioPorWaId,
  tentarVincularPorCodigo,
  salvarEstadoConversa,
  obterEstadoConversa,
  podarFotosPendentes,
  marcarAvisoAudioEnviado,
  type FotoPendente,
  type ModoResposta,
} from "@/lib/whatsapp/vinculo";
import { atualizarLegendaFoto } from "@/lib/relatorios-visita";
import { classificarImagem } from "@/lib/correcao-previa";
import { descreverLocalizacao, localizacaoRecente } from "@/lib/whatsapp/proximidade";

// Rajada offline com pelo menos isso de mensagens ganha um "recebi, já
// respondo" antes — transcrever vários áudios e pensar leva um tempo.
const MIN_MENSAGENS_AVISO = 3;
// Rajada offline pede mais idas e voltas com ferramentas (achar cliente,
// fazenda, visita aberta…) do que uma mensagem solta.
const MAX_VOLTAS_OFFLINE = 12;

type Item = {
  quando: number;
  tipo: "texto" | "audio" | "foto" | "localizacao" | "ilegivel";
  // Conteúdo já em texto (transcrição, legenda da foto, marcação da localização).
  texto: string;
};

export async function processarLote(
  waId: string,
  mensagens: MensagemRecebida[],
  opcoes: { atrasada: boolean }
): Promise<void> {
  if (mensagens.length === 0) return;
  const usuario = await resolverUsuarioPorWaId(waId);

  // Número não vinculado: só aceita um código de verificação de 6 dígitos e
  // fica em silêncio para qualquer outra coisa (evita responder a estranhos).
  if (!usuario) {
    const codigo = mensagens
      .map((m) => (m.tipo === "text" ? (m.texto ?? "").trim() : ""))
      .find((t) => /^\d{6}$/.test(t));
    if (codigo) {
      const resultado = await tentarVincularPorCodigo(waId, codigo);
      await enviarMensagemTexto(
        waId,
        resultado.ok
          ? `✅ WhatsApp vinculado à conta de ${resultado.nome}! O que você quer fazer?\n\n${MENU_INICIAL}\n\nResponda com o número ou já me conte direto.`
          : "Código inválido ou expirado. Gere um novo código na tela de configurações do sistema."
      );
    }
    return;
  }

  // Daqui em diante tudo roda como o usuário vinculado (filtro de empresa).
  await comUsuario(usuario.userId, () => processarLoteDoUsuario(waId, mensagens, opcoes, usuario));
}

async function processarLoteDoUsuario(
  waId: string,
  mensagens: MensagemRecebida[],
  opcoes: { atrasada: boolean },
  usuario: NonNullable<Awaited<ReturnType<typeof resolverUsuarioPorWaId>>>
): Promise<void> {
  const estado = await obterEstadoConversa(waId);
  let ultimaMidia = estado.ultimaMidia ?? undefined;
  let ultimaLocalizacao = estado.ultimaLocalizacao ?? undefined;
  let fotosPendentes = podarFotosPendentes(estado.fotosPendentes);

  const uteis = mensagens.filter((m) => m.tipo !== "outro");
  if (opcoes.atrasada && uteis.length >= MIN_MENSAGENS_AVISO) {
    await enviarMensagemTexto(
      waId,
      `📥 Chegaram ${uteis.length} mensagens que estavam presas no seu celular (${faixaDeHorario(uteis)}). Vou juntar tudo e já te respondo.`
    );
  }
  enviarDigitando(waId);

  // Texto/áudio só é convertido uma vez (a transcrição custa) — e os áudios
  // em paralelo, porque numa rajada offline costumam ser vários.
  const conteudos = await Promise.all(mensagens.map((m) => textoDaMensagem(m, usuario.userId)));

  const itens: Item[] = [];
  let recebeuAudio = false;

  for (let i = 0; i < mensagens.length; i++) {
    const msg = mensagens[i];
    const conteudo = conteudos[i]?.trim() || null;
    if (msg.tipo === "audio") recebeuAudio = true;

    if (msg.tipo === "image" && msg.midia) {
      // A imagem não vai para o modelo: fica guardada e as ferramentas a usam.
      ultimaMidia = msg.midia;
      const midia = await baixarMidia(msg.midia).catch(() => null);
      const tipo = midia ? await classificarImagem(midia.buffer, midia.contentType) : undefined;
      fotosPendentes = [
        ...fotosPendentes,
        { id: msg.id, ref: msg.midia, legenda: msg.texto ?? null, recebidaEm: Date.now(), tipo },
      ];
      itens.push({ quando: msg.enviadaEm, tipo: "foto", texto: msg.texto?.trim() ?? "" });
      continue;
    }

    if (msg.tipo === "location" && msg.localizacao) {
      // Vale a partir da chegada: o check-in costuma ser confirmado numa
      // mensagem seguinte, e a localização tem que continuar valendo.
      ultimaLocalizacao = { ...msg.localizacao, recebidaEm: Date.now() };
    }

    // Resposta a uma foto (WhatsApp > Responder na foto): a mensagem é a
    // descrição daquela foto, não um pedido pro agente. Vira a legenda e o bot
    // só reage com ✅.
    const fotoRespondida = msg.respondendoA
      ? fotosPendentes.find((f) => f.id === msg.respondendoA)
      : undefined;
    const fotoJaAnexada = msg.respondendoA
      ? (estado.fotosAnexadas ?? []).find((f) => f.mensagemId === msg.respondendoA)
      : undefined;

    if ((fotoRespondida || fotoJaAnexada) && conteudo) {
      if (fotoRespondida) {
        fotosPendentes = fotosPendentes.map((f) =>
          f === fotoRespondida ? { ...f, legenda: conteudo } : f
        );
      } else if (fotoJaAnexada) {
        await atualizarLegendaFoto(fotoJaAnexada.fotoVisitaId, conteudo).catch((error) =>
          console.error("[WhatsApp] falha ao atualizar legenda da foto:", error)
        );
      }
      if (msg.id) await reagir(waId, msg.id, "✅");
      continue;
    }

    if (msg.tipo === "text" && conteudo) {
      itens.push({ quando: msg.enviadaEm, tipo: "texto", texto: conteudo });
    } else if (msg.tipo === "audio" && conteudo) {
      itens.push({ quando: msg.enviadaEm, tipo: "audio", texto: conteudo });
    } else if (msg.tipo === "location" && conteudo) {
      itens.push({ quando: msg.enviadaEm, tipo: "localizacao", texto: conteudo });
    } else {
      itens.push({
        quando: msg.enviadaEm,
        tipo: "ilegivel",
        texto: msg.tipo === "audio" ? "áudio que não consegui entender" : "mensagem que não consigo ler (vídeo, figurinha, documento…)",
      });
    }
  }

  const salvarSemResponder = () =>
    salvarEstadoConversa(waId, { ...estado, ultimaMidia, ultimaLocalizacao, fotosPendentes });

  // Fotos que chegaram e ainda não foram mencionadas pro agente entram numa
  // marcação só (ou na linha do tempo, na rajada offline).
  const novas = fotosPendentes.filter((f) => !f.anunciada);
  const falas = itens.filter((i) => i.tipo !== "foto");

  // Só descrições de foto já anotadas (reação ✅ feita): nada pra responder.
  if (falas.length === 0 && novas.length === 0) {
    await salvarSemResponder();
    return;
  }

  // Nada legível e nenhuma foto nova: não gasta o agente pra isso.
  if (novas.length === 0 && falas.every((i) => i.tipo === "ilegivel")) {
    await salvarSemResponder();
    await enviarMensagemTexto(
      waId,
      "Não consegui ler essa mensagem. Pode mandar em texto, áudio ou foto?"
    );
    return;
  }

  const texto = opcoes.atrasada
    ? linhaDoTempo(itens, fotosPendentes.length)
    : [avisoDeFotos(novas, fotosPendentes.length), ...falas.map(falaAoVivo)]
        .filter(Boolean)
        .join("\n")
        .trim() || " ";
  fotosPendentes = fotosPendentes.map((f) => ({ ...f, anunciada: true }));

  // Pedido de formato NESTA mensagem ("manda em texto", "quero a lista",
  // "manda em áudio") vale só pra essa resposta, sem mexer no modo
  // persistido (isso continua sendo definir_modo_resposta/"só texto" etc.).
  const formatoPedido = formatoPedidoNaMensagem(texto);

  const resultado = await responderComAgente({
    consultorId: usuario.userId,
    consultorNome: usuario.nome,
    role: usuario.role,
    waId,
    mensagem: texto,
    historico: estado.historico,
    ultimaMidia,
    // Localização velha não vale pra check-in: o consultor já pode estar
    // em outra fazenda.
    ultimaLocalizacao: localizacaoRecente(ultimaLocalizacao),
    fotosPendentes,
    fotosAnexadas: estado.fotosAnexadas ?? [],
    respostaEmAudio:
      formatoPedido === "TEXTO"
        ? false
        : formatoPedido === "AUDIO"
          ? true
          : responderEmAudio(usuario.modoResposta, recebeuAudio),
    maxVoltas: opcoes.atrasada ? MAX_VOLTAS_OFFLINE : undefined,
  });

  await salvarEstadoConversa(waId, {
    historico: resultado.historico,
    ultimaMidia,
    ultimaLocalizacao,
    fotosPendentes: resultado.fotosPendentes,
    fotosAnexadas: resultado.fotosAnexadas,
  });

  // Se a pessoa acabou de trocar o modo ("só texto"), já vale nesta resposta.
  const modo = resultado.novoModoResposta ?? usuario.modoResposta;
  const querAudio =
    formatoPedido === "TEXTO" ? false : formatoPedido === "AUDIO" ? true : responderEmAudio(modo, recebeuAudio);
  const enviouAudio = querAudio && (await enviarRespostaEmAudio(waId, resultado.resposta));

  if (!enviouAudio) {
    await enviarMensagemTexto(waId, semSeparador(resultado.resposta));
    return;
  }

  if (!usuario.avisoAudioEnviado && !resultado.novoModoResposta) {
    await enviarMensagemTexto(
      waId,
      modo === "AUDIO"
        ? "💡 Estou respondendo sempre em áudio. Pra voltar ao texto, é só pedir \"só texto\" — ou mudar no site, em WhatsApp."
        : "💡 Respondo em áudio quando você manda áudio. Se preferir, é só pedir \"sempre em áudio\" ou \"só texto\" — ou mudar no site, em WhatsApp."
    );
    await marcarAvisoAudioEnviado(waId);
  }
}

function responderEmAudio(modo: ModoResposta, recebeuAudio: boolean): boolean {
  if (modo === "AUDIO") return true;
  if (modo === "TEXTO") return false;
  return recebeuAudio;
}

// "lista"/"listagem" conta como pedido de texto: uma lista é, por natureza,
// pra ler, não pra ouvir. Palavras soltas de áudio ("em áudio", "manda
// áudio") exigem frase mais específica, pra não disparar em algo tipo
// "mandei um áudio pro cliente" (relato de visita, não pedido de formato).
const RE_PEDIU_TEXTO =
  /\b(lista(gem)?|em\s+texto|por\s+texto|por\s+escrit[oa]|manda[r]?\s+escrit[oa]|sem\s+audio|nao\s+manda[r]?\s+(em\s+)?audio|modo\s+texto)\b/;
const RE_PEDIU_AUDIO =
  /\b(em\s+audio|por\s+audio|manda[r]?\s+(em\s+)?audio|quero\s+ouvir|responde[r]?\s+em\s+audio|modo\s+audio)\b/;

function formatoPedidoNaMensagem(texto: string): "TEXTO" | "AUDIO" | null {
  const normalizado = texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
  if (RE_PEDIU_TEXTO.test(normalizado)) return "TEXTO";
  if (RE_PEDIU_AUDIO.test(normalizado)) return "AUDIO";
  return null;
}

// ~40 palavras faladas (pedido no prompt) dá uns 250-300 caracteres em
// português; acima disso é sinal de que o modelo não separou a listagem do
// jeito que devia (ex.: uma lista de produtos virou parágrafo falado
// inteiro). Trava por tamanho aqui garante nunca mandar um áudio longo,
// independente do modelo ter cooperado ou não com o prompt/separador.
const MAX_CARACTERES_FALADO = 420;

// Parte falada vira mensagem de voz; o que é pra conferir lendo (resumo,
// lista, valores) vai em texto logo abaixo. false = não deu pra gerar/enviar
// o áudio (ou o "falado" saiu grande demais pra ser voz), e quem chamou
// manda tudo em texto.
async function enviarRespostaEmAudio(waId: string, resposta: string): Promise<boolean> {
  const { falado, escrito } = partesDaResposta(resposta);
  if (!falado || falado.length > MAX_CARACTERES_FALADO) return false;

  const voz = await sintetizarVoz(falado);
  if (!voz || !(await enviarAudio(waId, voz))) return false;

  if (escrito) await enviarMensagemTexto(waId, escrito);
  return true;
}

function falaAoVivo(item: Item): string {
  return item.tipo === "ilegivel" ? `[${item.texto}]` : item.texto;
}

function avisoDeFotos(novas: FotoPendente[], totalPendentes: number): string {
  if (novas.length === 0) return "";
  const legendas = novas
    .map((f) => f.legenda?.trim())
    .filter(Boolean)
    .map((l) => `"${l}"`);
  const tipos = {
    print: "PRINT DA PRÉVIA/PÁGINA OU DOCUMENTO (é correção ou nota, não foto de campo)",
    rabiscada: "FOTO RABISCADA À MÃO (é referência de onde marcar; não vai pro relatório)",
    campo: "foto de campo",
  };
  const descricao = [...new Set(novas.map((f) => f.tipo ?? "campo"))].map((t) => tipos[t]).join(" + ");
  return (
    `[o consultor enviou ${novas.length === 1 ? "1 imagem" : `${novas.length} imagens`}: ${descricao}` +
    (legendas.length ? `, com legenda ${legendas.join(", ")}` : "") +
    `; imagens aguardando uso na conversa: ${totalPendentes}]`
  );
}

// Rajada offline: cada item com o horário em que o consultor enviou. Fotos
// seguidas viram uma linha só.
function linhaDoTempo(itens: Item[], totalFotosPendentes: number): string {
  const ordenados = [...itens].sort((a, b) => a.quando - b.quando);
  const linhas: string[] = [];

  for (let i = 0; i < ordenados.length; i++) {
    const item = ordenados[i];
    const hora = horario(item.quando);

    if (item.tipo === "foto") {
      let fim = i;
      while (fim + 1 < ordenados.length && ordenados[fim + 1].tipo === "foto") fim++;
      const fotos = ordenados.slice(i, fim + 1);
      const legendas = fotos.map((f) => f.texto).filter(Boolean).map((l) => `"${l}"`);
      linhas.push(
        `${hora} — ${fotos.length === 1 ? "foto" : `${fotos.length} fotos`}` +
          (legendas.length ? ` (legenda ${legendas.join(", ")})` : "")
      );
      i = fim;
      continue;
    }

    const rotulo =
      item.tipo === "audio"
        ? "áudio"
        : item.tipo === "localizacao"
          ? "localização"
          : item.tipo === "ilegivel"
            ? "não lido"
            : "texto";
    linhas.push(
      `${hora} — ${rotulo}: ${item.tipo === "texto" || item.tipo === "audio" ? `"${item.texto}"` : item.texto}`
    );
  }

  const quantidade = itens.length === 1 ? "Esta mensagem foi enviada" : `Estas ${itens.length} mensagens foram enviadas`;
  return [
    `[${quantidade} pelo consultor SEM INTERNET (${faixaDeHorario(itens)}) e chegaram agora todas juntas. Os horários são de quando ele enviou. Trate como um relato só — ver regras de mensagens offline.]`,
    ...linhas,
    ...(totalFotosPendentes > 0 ? [`[fotos aguardando uso na conversa: ${totalFotosPendentes}]`] : []),
  ].join("\n");
}

function faixaDeHorario(itens: { quando?: number; enviadaEm?: number }[]): string {
  const instantes = itens.map((i) => i.quando ?? i.enviadaEm ?? Date.now());
  const inicio = Math.min(...instantes);
  const fim = Math.max(...instantes);
  const dataInicio = diaBrasilia(inicio);
  const dataFim = diaBrasilia(fim);
  if (inicio === fim) return `enviada em ${dataInicio} às ${horaBrasilia(inicio)}`;
  if (dataInicio === dataFim) {
    return `enviadas em ${dataInicio}, entre ${horaBrasilia(inicio)} e ${horaBrasilia(fim)}`;
  }
  return `enviadas entre ${dataInicio} ${horaBrasilia(inicio)} e ${dataFim} ${horaBrasilia(fim)}`;
}

// "09:12" se foi hoje; "22/09 09:12" se foi outro dia.
function horario(ms: number): string {
  const dia = diaBrasilia(ms);
  return dia === diaBrasilia(Date.now()) ? horaBrasilia(ms) : `${dia} ${horaBrasilia(ms)}`;
}

function diaBrasilia(ms: number): string {
  return new Date(ms).toLocaleDateString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
  });
}

function horaBrasilia(ms: number): string {
  return new Date(ms).toLocaleTimeString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Normaliza a mensagem em texto para o agente: áudio vira transcrição,
// localização vira uma marcação (o dado bruto fica guardado pra ferramenta).
// Foto sem legenda não tem texto próprio — o aviso de fotos cobre.
async function textoDaMensagem(
  msg: MensagemRecebida,
  consultorId: string
): Promise<string | null> {
  if (msg.tipo === "text") {
    return msg.texto?.trim() || null;
  }

  if (msg.tipo === "image" && msg.midia) {
    return msg.texto?.trim() || " ";
  }

  if (msg.tipo === "location" && msg.localizacao) {
    return descreverLocalizacao(msg.localizacao);
  }

  if (msg.tipo === "audio" && msg.midia) {
    try {
      const midia = await baixarMidia(msg.midia);
      if (!midia) return null;
      const transcrito = await transcreverAudio(midia.buffer, midia.contentType, consultorId);
      return transcrito || null;
    } catch (error) {
      // Um áudio com problema não derruba a rajada inteira.
      console.error("[WhatsApp] falha ao transcrever áudio:", error);
      return null;
    }
  }

  return null;
}
