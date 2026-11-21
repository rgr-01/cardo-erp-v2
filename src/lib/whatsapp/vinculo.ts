import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import type { RefMidia } from "@/lib/whatsapp/tipos";
import type { Localizacao } from "@/lib/whatsapp/proximidade";

const CODIGO_TTL_MS = 15 * 60 * 1000; // 15 min

// Gera o código pra vincular um número. Cada número é um registro próprio:
// o código fica num registro "pendente" (sem waId), reaproveitado se já
// existir. Admin pode ter vários números; consultor, só um.
export async function gerarCodigoVinculo(
  userId: string,
  role: "ADMIN" | "CONSULTOR"
): Promise<string> {
  const codigo = crypto.randomInt(100000, 999999).toString();
  const codigoExpiraEm = new Date(Date.now() + CODIGO_TTL_MS);

  const pendente = await prisma.whatsAppVinculo.findFirst({
    where: { userId, waId: null },
    select: { id: true },
  });
  if (pendente) {
    await prisma.whatsAppVinculo.update({
      where: { id: pendente.id },
      data: { codigo, codigoExpiraEm },
    });
    return codigo;
  }

  if (role !== "ADMIN") {
    const vinculados = await prisma.whatsAppVinculo.count({ where: { userId, waId: { not: null } } });
    if (vinculados > 0) {
      throw new Error("Você já tem um número vinculado. Desvincule o atual pra vincular outro.");
    }
  }

  await prisma.whatsAppVinculo.create({ data: { userId, codigo, codigoExpiraEm } });
  return codigo;
}

// Números vinculados de um usuário, do mais antigo pro mais novo.
export async function listarVinculos(userId: string) {
  return prisma.whatsAppVinculo.findMany({
    where: { userId, waId: { not: null } },
    select: {
      id: true,
      waId: true,
      modoResposta: true,
      receberRelatorioMensal: true,
      receberAlertasSeguranca: true,
      receberAlertasMargem: true,
      receberNotificacoesPedidos: true,
      createdAt: true,
    },
    orderBy: { createdAt: "asc" },
  });
}

// Relato mensal de visitas é só pra admin; cada número escolhe se recebe.
export async function definirReceberRelatorioMensal(
  userId: string,
  role: "ADMIN" | "CONSULTOR",
  vinculoId: string,
  receber: boolean
) {
  if (role !== "ADMIN") throw new Error("O relatório mensal é enviado só para administradores.");
  await prisma.whatsAppVinculo.updateMany({
    where: { id: vinculoId, userId },
    data: { receberRelatorioMensal: receber },
  });
}

export async function definirReceberAlertasSeguranca(userId: string, role: "ADMIN" | "CONSULTOR", vinculoId: string, receber: boolean) {
  if (role !== "ADMIN") throw new Error("Alertas de segurança são enviados só para administradores.");
  await prisma.whatsAppVinculo.updateMany({ where: { id: vinculoId, userId }, data: { receberAlertasSeguranca: receber } });
}

async function definirPreferenciaDeNotificacao(
  userId: string,
  role: "ADMIN" | "CONSULTOR",
  vinculoId: string,
  campo: "receberAlertasMargem" | "receberNotificacoesPedidos",
  receber: boolean
) {
  if (role !== "ADMIN") throw new Error("Notificações são enviadas só para administradores.");
  await prisma.whatsAppVinculo.updateMany({ where: { id: vinculoId, userId }, data: { [campo]: receber } });
}

export async function definirReceberAlertasMargem(userId: string, role: "ADMIN" | "CONSULTOR", vinculoId: string, receber: boolean) {
  await definirPreferenciaDeNotificacao(userId, role, vinculoId, "receberAlertasMargem", receber);
}

export async function definirReceberNotificacoesPedidos(userId: string, _role: "ADMIN" | "CONSULTOR", vinculoId: string, receber: boolean) {
  // Todo usuário pode optar pelos avisos dos próprios pedidos. O filtro de
  // destinatário define que consultor só recebe os pedidos pelos quais responde.
  await prisma.whatsAppVinculo.updateMany({ where: { id: vinculoId, userId }, data: { receberNotificacoesPedidos: receber } });
}

export async function desvincularNumero(userId: string, vinculoId: string) {
  // deleteMany com userId: ninguém desvincula número de outra pessoa.
  await prisma.whatsAppVinculo.deleteMany({ where: { id: vinculoId, userId } });
}

export async function resolverUsuarioPorWaId(waId: string) {
  const vinculo = await prisma.whatsAppVinculo.findUnique({
    where: { waId },
    include: { user: true },
  });
  if (!vinculo || !vinculo.user.ativo) return null;
  return {
    vinculoId: vinculo.id,
    userId: vinculo.userId,
    nome: vinculo.user.nome,
    role: vinculo.user.role,
    modoResposta: normalizarModoResposta(vinculo.modoResposta),
    avisoAudioEnviado: vinculo.avisoAudioEnviado,
  };
}

export type ModoResposta = "ESPELHAR" | "AUDIO" | "TEXTO";

export function normalizarModoResposta(valor: string | null | undefined): ModoResposta {
  return valor === "AUDIO" || valor === "TEXTO" ? valor : "ESPELHAR";
}

// O modo de resposta é por número (um admin pode querer áudio num e texto
// no outro).
export async function definirModoRespostaPorWaId(waId: string, modo: ModoResposta) {
  await prisma.whatsAppVinculo.updateMany({ where: { waId }, data: { modoResposta: modo } });
}

export async function definirModoRespostaDoVinculo(
  userId: string,
  vinculoId: string,
  modo: ModoResposta
) {
  await prisma.whatsAppVinculo.updateMany({
    where: { id: vinculoId, userId },
    data: { modoResposta: modo },
  });
}

export async function marcarAvisoAudioEnviado(waId: string) {
  await prisma.whatsAppVinculo.updateMany({
    where: { waId },
    data: { avisoAudioEnviado: true },
  });
}

export async function tentarVincularPorCodigo(
  waId: string,
  codigo: string
): Promise<{ ok: true; nome: string } | { ok: false }> {
  const vinculo = await prisma.whatsAppVinculo.findFirst({
    where: {
      codigo,
      codigoExpiraEm: { gt: new Date() },
      waId: null,
    },
    include: { user: true },
  });
  if (!vinculo) return { ok: false };

  // Só chega aqui número sem usuário ativo; se ele ainda estiver preso a um
  // vínculo antigo (usuário desativado), esse vínculo sai pra liberar o número.
  await prisma.whatsAppVinculo.deleteMany({ where: { waId } });
  await prisma.whatsAppVinculo.update({
    where: { id: vinculo.id },
    data: { waId, codigo: null, codigoExpiraEm: null },
  });
  return { ok: true, nome: vinculo.user.nome };
}

// Sessão do agente: o histórico curto da conversa e a última imagem recebida.
// Substituiu a antiga máquina de estados de fluxo (nova_visita/nova_despesa) —
// quem conduz a conversa agora é o modelo, via ferramentas.
//
// Cada turno guarda a sequência BRUTA de itens trocados com a API da OpenAI
// numa mensagem recebida (a mensagem do usuário, function_calls, seus
// function_call_output e a resposta final) — não só o texto. Isso preserva
// IDs que as ferramentas descobriram (ex.: cliente_id de buscar_clientes) para
// a próxima mensagem do WhatsApp poder reusá-los, em vez de o modelo ter que
// adivinhar ou re-buscar (e arriscar inventar um id inválido) na hora de
// salvar algo que foi identificado numa mensagem anterior.
export type TurnoAgente = unknown[];

// Foto recebida que ainda não foi usada (anexada a relatório técnico ou como
// comprovante de despesa).
export type FotoPendente = {
  // Id da mensagem da foto no WhatsApp — liga a descrição mandada depois
  // (Responder na foto) a esta foto.
  id?: string;
  ref: RefMidia;
  legenda?: string | null;
  recebidaEm: number;
  // O que a imagem é (classificarImagem): campo | rabiscada | print.
  tipo?: "campo" | "rabiscada" | "print";
  // Já foi mencionada pro agente numa resposta anterior.
  anunciada?: boolean;
};

type EstadoConversa = {
  historico: TurnoAgente[];
  // Guardamos a referência da mídia, não os bytes: para a Evolution é a própria
  // mensagem bruta (alguns KB) e a foto é baixada sob demanda pela ferramenta.
  ultimaMidia?: RefMidia | null;
  // Última localização mandada (📎 > Localização), consumida por
  // abrir_visita_fazenda pra anexar coordenadas ao check-in.
  ultimaLocalizacao?: Localizacao | null;
  // Fotos mandadas e ainda não usadas — o consultor manda várias de uma vez
  // pro relatório técnico, não só a última.
  fotosPendentes?: FotoPendente[];
  // Fotos já anexadas a relatório, pela mensagem de origem: permite ainda
  // trocar a legenda respondendo a foto depois de anexada.
  fotosAnexadas?: FotoAnexada[];
};

export type FotoAnexada = { mensagemId: string; fotoVisitaId: string };

const MAX_FOTOS_ANEXADAS = 40;

const MAX_FOTOS_PENDENTES = 20;
const TTL_FOTO_PENDENTE_MS = 12 * 60 * 60 * 1000;

// A referência da Evolution pode trazer a imagem inteira em base64 (webhook
// com base64 ligado). Isso serve pro processamento imediato, mas não vai pro
// banco: depois a foto é baixada de novo pela mensagem original.
export function refSemBase64(ref: RefMidia): RefMidia {
  if (ref.transporte !== "evolution") return ref;
  const mensagem = ref.mensagem as { message?: Record<string, unknown> } | null;
  const semBase64 =
    mensagem?.message && "base64" in mensagem.message
      ? { ...mensagem, message: { ...mensagem.message, base64: undefined } }
      : mensagem;
  return { transporte: "evolution", mensagem: semBase64, mimetype: ref.mimetype };
}

export function podarFotosPendentes(fotos: FotoPendente[] | undefined): FotoPendente[] {
  const limite = Date.now() - TTL_FOTO_PENDENTE_MS;
  return (fotos ?? []).filter((f) => f.recebidaEm > limite).slice(-MAX_FOTOS_PENDENTES);
}

// Corta o histórico para a conversa não crescer sem limite no banco — por
// turno inteiro, nunca no meio de um par function_call/function_call_output.
const MAX_TURNOS = 8;

export async function salvarEstadoConversa(waId: string, estado: EstadoConversa) {
  const podado: EstadoConversa = {
    ...estado,
    historico: estado.historico.slice(-MAX_TURNOS),
    ultimaMidia: estado.ultimaMidia ? refSemBase64(estado.ultimaMidia) : estado.ultimaMidia,
    fotosPendentes: podarFotosPendentes(estado.fotosPendentes).map((f) => ({
      ...f,
      ref: refSemBase64(f.ref),
    })),
    fotosAnexadas: (estado.fotosAnexadas ?? []).slice(-MAX_FOTOS_ANEXADAS),
  };
  await prisma.whatsAppSessao.upsert({
    where: { waId },
    create: { waId, estado: podado as unknown as Prisma.InputJsonValue },
    update: { estado: podado as unknown as Prisma.InputJsonValue },
  });
}

export async function obterEstadoConversa(waId: string): Promise<EstadoConversa> {
  const sessao = await prisma.whatsAppSessao.findUnique({ where: { waId } });
  const bruto = sessao?.estado as { historico?: unknown } | null;
  // Sessões gravadas pela máquina de estados antiga, ou pelo formato anterior
  // (texto simples, sem os itens brutos de function_call), não são
  // compatíveis: começam de novo em vez de quebrar.
  if (!bruto || !Array.isArray(bruto.historico) || bruto.historico.some((t) => !Array.isArray(t))) {
    return { historico: [] };
  }
  return bruto as unknown as EstadoConversa;
}

export async function limparEstadoConversa(waId: string) {
  await prisma.whatsAppSessao.deleteMany({ where: { waId } });
}

export type { EstadoConversa };
