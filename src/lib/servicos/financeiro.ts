// Financeiro: notas fiscais, boletos e cobrança dos pedidos em carteira.
// Nota fiscal pode ser preenchida manualmente (Financeiro digita os dados
// depois de emitir por fora) ou emitida automaticamente via Focus NFe (ver
// emitirNotaFiscalFocusNfe abaixo). Assim que o pedido tem NotaFiscal EMITIDA
// + Boleto EMITIDO/PAGO, a venda vira FATURADO sozinha (ver
// marcarFaturadoSeCompleto abaixo) — não é mais uma opção do dropdown manual
// de status da Venda (ver app/actions/vendas.ts).

import type { Sessao } from "@/app/actions/helpers";
import { prisma } from "@/lib/prisma";
import { numeroDecimal } from "@/lib/dinheiro";
import { numeroProposta } from "@/lib/propostas";
import { ErroPermissao } from "@/lib/servicos/erros";
import { exigirAcessoProposta } from "@/lib/servicos/propostas";
import {
  emitirNfeFocus,
  consultarNfeFocus,
  cancelarNfeFocus,
  urlAbsolutaFocusNfe,
  focusNfeConfigurado,
  ambienteFocusNfe,
  type FocusNfeResposta,
} from "@/lib/focusnfe";

const ehAdmin = (sessao: Sessao) => sessao.role === "ADMIN";

async function registrar(sessao: Sessao, acao: string, entidade: string, detalhes: string) {
  await prisma.historico.create({
    data: { usuarioNome: sessao.nome, acao, entidade, detalhes },
  });
}

// Só entra em carteira depois da conferência final (ver aprovarConferenciaFinal
// em lib/servicos/propostas.ts) — é isso que o Financeiro fatura.
const incluirPedido = {
  cliente: { select: { nome: true } },
  consultor: { select: { nome: true } },
  itens: { select: { vendaId: true } },
  notaFiscal: true,
  boleto: true,
} as const;

function formatarPedido(p: Awaited<ReturnType<typeof buscarPedidoOuFalha>>) {
  return {
    id: p.id,
    codigo: numeroProposta(p.numero),
    clienteNome: p.cliente.nome,
    consultorNome: p.consultor.nome,
    total: p.total,
    createdAt: p.createdAt,
    notaFiscal: p.notaFiscal,
    boleto: p.boleto,
  };
}

async function buscarPedidoOuFalha(id: string) {
  return prisma.proposta.findUniqueOrThrow({ where: { id }, include: incluirPedido });
}

// Pro bot do WhatsApp (enviar_nf_boleto): consultor só vê pedido dele, admin
// vê qualquer um — mesma regra de obterProposta em lib/servicos/propostas.ts.
export async function obterDocumentosFiscais(sessao: Sessao, propostaId: string) {
  await exigirAcessoProposta(sessao, propostaId);
  const pedido = await buscarPedidoOuFalha(propostaId);
  return formatarPedido(pedido);
}

async function vendaIdsDoPedido(propostaId: string): Promise<string[]> {
  const pedido = await prisma.proposta.findUniqueOrThrow({
    where: { id: propostaId },
    select: { itens: { select: { vendaId: true } } },
  });
  return pedido.itens.map((i) => i.vendaId).filter((v): v is string => Boolean(v));
}

// Só fatura de verdade (Venda -> FATURADO) quando os dois documentos existem
// e estão em dia — nota emitida e boleto emitido ou já pago.
async function marcarFaturadoSeCompleto(propostaId: string) {
  const pedido = await prisma.proposta.findUniqueOrThrow({
    where: { id: propostaId },
    include: { notaFiscal: true, boleto: true, itens: { select: { vendaId: true } } },
  });
  const completo =
    pedido.notaFiscal?.status === "EMITIDA" &&
    (pedido.boleto?.status === "EMITIDO" || pedido.boleto?.status === "PAGO");
  if (!completo) return;

  const vendaIds = pedido.itens.map((i) => i.vendaId).filter((v): v is string => Boolean(v));
  if (vendaIds.length === 0) return;
  await prisma.venda.updateMany({
    where: { id: { in: vendaIds }, status: "EM_CARTEIRA" },
    data: { status: "FATURADO" },
  });
}

// Alimenta Notas Fiscais/Boletos: só pedido cuja emissão foi solicitada depois
// da conferência final entra aqui — antes disso ele fica só em Em Carteira,
// sem emitir nada.
export async function listarPedidosEmCarteira(sessao: Sessao, filtros: { safraId?: string } = {}) {
  if (!ehAdmin(sessao)) throw new ErroPermissao("Somente o administrativo acessa o Financeiro.");
  const pedidos = await prisma.proposta.findMany({
    where: {
      ...(filtros.safraId ? { safraId: filtros.safraId } : {}),
      tipo: "PROPOSTA",
      autorizadoFaturarEm: { not: null },
      itens: { some: { venda: { status: { in: ["EM_CARTEIRA", "FATURADO"] } } } },
    },
    include: incluirPedido,
    orderBy: [{ updatedAt: "desc" }],
  });
  return pedidos.map(formatarPedido);
}

// Depois da conferência final, o consultor solicita a emissão do próprio
// pedido; o administrador pode solicitar qualquer um. A emissão de NF/boleto
// em si continua restrita ao administrativo.
export async function solicitarFaturamento(sessao: Sessao, propostaId: string) {
  await exigirAcessoProposta(sessao, propostaId);
  const pedido = await prisma.proposta.findUniqueOrThrow({
    where: { id: propostaId },
    include: { cliente: { select: { nome: true } }, itens: { select: { venda: { select: { status: true } } } } },
  });
  if (pedido.tipo !== "PROPOSTA") throw new Error("Isso ainda não é um pedido fechado.");
  const conferenciaAprovada = pedido.itens.length > 0 && pedido.itens.every((item) =>
    item.venda?.status === "EM_CARTEIRA" || item.venda?.status === "FATURADO"
  );
  if (!conferenciaAprovada) throw new Error("Aguarde a aprovação da conferência final para solicitar o faturamento.");
  if (pedido.autorizadoFaturarEm) throw new Error("A emissão deste pedido já foi solicitada.");

  await prisma.proposta.update({
    where: { id: propostaId },
    data: { autorizadoFaturarEm: new Date() },
  });

  await registrar(
    sessao,
    "Solicitou faturamento",
    "PROPOSTA",
    `${numeroProposta(pedido.numero)} - ${pedido.cliente.nome}`
  );
}

// Regime tributário assumido nos itens: Simples Nacional (o mais comum em
// empresa pequena/média) — ICMS sem direito a crédito (CSOSN 102), PIS/COFINS
// não tributados nesta operação (CST 07). Se a emitente cadastrada na Focus
// NFe for de Lucro Presumido/Real (regime normal, com CST de ICMS em vez de
// CSOSN) ou recolher PIS/COFINS de fato, ajuste estas constantes antes de
// emitir em produção.
const ICMS_CSOSN_PADRAO = "102";
const PIS_CST_PADRAO = "07";
const COFINS_CST_PADRAO = "07";

function apenasDigitos(texto: string): string {
  return texto.replace(/\D/g, "");
}

// CFOP cadastrado no produto é o "base" pra venda dentro do estado da
// emitente (grupo 5xxx). Quando o cliente é de outro estado, a SEFAZ exige o
// CFOP do grupo 6xxx (mesmo dígito final) — sem essa troca a nota é rejeitada
// sempre que o cliente não for do mesmo estado da emitente.
function cfopParaDestino(cfopBase: string, ufCliente: string | null): string {
  const ufEmitente = process.env.FOCUS_NFE_UF_EMITENTE;
  if (!ufEmitente || !ufCliente || ufCliente.toUpperCase() === ufEmitente.toUpperCase()) {
    return cfopBase;
  }
  return cfopBase.startsWith("5") ? `6${cfopBase.slice(1)}` : cfopBase;
}

// Muda a cada tentativa: a Focus NFe não deixa reemitir em cima da mesma
// referência depois de um erro (ver comentário em lib/focusnfe.ts).
function gerarReferenciaNotaFiscal(propostaId: string): string {
  return `pedido-${propostaId}-${Date.now()}`;
}

type PedidoParaFocusNfe = Awaited<ReturnType<typeof buscarPedidoParaFocusNfe>>;

async function buscarPedidoParaFocusNfe(propostaId: string) {
  return prisma.proposta.findUniqueOrThrow({
    where: { id: propostaId },
    include: {
      cliente: true,
      itens: { include: { produto: true }, orderBy: { ordem: "asc" } },
    },
  });
}

// Falha rápido com mensagem acionável em vez de deixar a Focus NFe rejeitar
// o payload (ou pior, a SEFAZ) por um dado fiscal faltando.
function validarDadosFiscaisPedido(pedido: PedidoParaFocusNfe): string[] {
  const erros: string[] = [];
  const documento = pedido.cliente.documento ? apenasDigitos(pedido.cliente.documento) : "";
  if (documento.length !== 11 && documento.length !== 14) {
    erros.push(`Cliente "${pedido.cliente.nome}" sem CPF/CNPJ válido cadastrado.`);
  }
  if (!pedido.cliente.endereco || !pedido.cliente.cidade || !pedido.cliente.uf || !pedido.cliente.cep) {
    erros.push(`Cliente "${pedido.cliente.nome}" está com endereço incompleto (endereço, cidade, UF e CEP são obrigatórios).`);
  }
  if (pedido.itens.length === 0) erros.push("Pedido sem itens.");
  for (const item of pedido.itens) {
    if (!item.produto.ncm) erros.push(`Produto "${item.produto.nome}" sem NCM cadastrado (Produtos > Editar).`);
    if (!item.produto.cfop) erros.push(`Produto "${item.produto.nome}" sem CFOP cadastrado (Produtos > Editar).`);
    if (!item.volume || item.volume <= 0) erros.push(`Item "${item.produto.nome}" sem quantidade válida.`);
    if (item.valorUnitario == null || numeroDecimal(item.valorUnitario) < 0) erros.push(`Item "${item.produto.nome}" sem valor unitário.`);
  }
  return erros;
}

// Nomes de campo conforme a referência pública da API v2 da Focus NFe no
// momento em que este código foi escrito — validar contra a documentação
// atual (painel Focus NFe > Documentação) na primeira emissão em
// homologação, já que a Focus NFe pode ter ajustado nomes/formatos.
function montarPayloadFocusNfe(pedido: PedidoParaFocusNfe): Record<string, unknown> {
  const cnpjEmitente = process.env.FOCUS_NFE_CNPJ_EMITENTE;
  if (!cnpjEmitente) throw new Error("FOCUS_NFE_CNPJ_EMITENTE não configurado.");

  const documento = apenasDigitos(pedido.cliente.documento!);
  const chaveDocumentoDestinatario = documento.length === 14 ? "cnpj_destinatario" : "cpf_destinatario";

  const items = pedido.itens.map((item, indice) => {
    const quantidade = item.volume ?? 0;
    const valorUnitario = numeroDecimal(item.valorUnitario);
    const valorBruto = numeroDecimal(item.total) || quantidade * valorUnitario;
    // Cliente cadastra "unidade" livre (ex.: "saca", "L") — Focus NFe/SEFAZ
    // esperam um código curto; maiúsculo e truncado é o melhor esforço até
    // existir um de-para formal.
    const unidade = (item.unidade || "UN").slice(0, 6).toUpperCase();
    return {
      numero_item: indice + 1,
      codigo_produto: item.produtoId,
      descricao: item.produto.nome.slice(0, 120),
      cfop: cfopParaDestino(item.produto.cfop!, pedido.cliente.uf),
      ncm: item.produto.ncm,
      unidade_comercial: unidade,
      quantidade_comercial: quantidade,
      valor_unitario_comercial: valorUnitario,
      valor_bruto: valorBruto,
      unidade_tributavel: unidade,
      quantidade_tributavel: quantidade,
      valor_unitario_tributavel: valorUnitario,
      icms_origem: "0",
      icms_situacao_tributaria: ICMS_CSOSN_PADRAO,
      pis_situacao_tributaria: PIS_CST_PADRAO,
      cofins_situacao_tributaria: COFINS_CST_PADRAO,
    };
  });

  return {
    natureza_operacao: "Venda de mercadoria",
    data_emissao: new Date().toISOString(),
    tipo_documento: 1,
    finalidade_emissao: 1,
    consumidor_final: 1,
    presenca_comprador: 9,
    cnpj_emitente: apenasDigitos(cnpjEmitente),
    nome_destinatario: pedido.cliente.razaoSocial || pedido.cliente.nome,
    [chaveDocumentoDestinatario]: documento,
    inscricao_estadual_destinatario: pedido.cliente.inscricaoEstadual || undefined,
    telefone_destinatario: pedido.cliente.telefone ? apenasDigitos(pedido.cliente.telefone) : undefined,
    email_destinatario: pedido.cliente.email || undefined,
    logradouro_destinatario: pedido.cliente.endereco,
    // Cadastro de Cliente guarda o endereço como texto livre, sem separar
    // número/bairro — placeholders abaixo até o cadastro ganhar esses campos.
    numero_destinatario: "S/N",
    bairro_destinatario: "Não informado",
    municipio_destinatario: pedido.cliente.cidade,
    uf_destinatario: pedido.cliente.uf,
    cep_destinatario: apenasDigitos(pedido.cliente.cep!),
    items,
  };
}

function interpretarRespostaFocusNfe(
  resposta: FocusNfeResposta
): { status: "PROCESSANDO" | "EMITIDA" | "ERRO"; mensagemErro: string | null } {
  if (resposta.status === "autorizado") return { status: "EMITIDA", mensagemErro: null };
  if (resposta.status === "processando_autorizacao") {
    return { status: "PROCESSANDO", mensagemErro: null };
  }
  // Sem `status`: ou erro de validação/requisição antes de a nota existir na
  // Focus NFe (payload malformado, empresa não encontrada — vem com `codigo`
  // e `mensagem`, sem `status`), ou já é um erro_autorizacao/denegado da
  // SEFAZ. Tratar "sem status" como PROCESSANDO (como era antes) mascarava
  // esses erros de requisição pra sempre, deixando a nota presa.
  const detalhe =
    resposta.erros?.map((e) => e.mensagem).join("; ") ||
    resposta.mensagem_sefaz ||
    resposta.mensagem ||
    "Falha não detalhada pela Focus NFe.";
  return { status: "ERRO", mensagemErro: detalhe };
}

// Dispara a emissão na Focus NFe. Como a autorização é assíncrona, a nota
// pode ficar em PROCESSANDO aqui e só virar EMITIDA/ERRO quando o webhook
// (app/api/webhooks/focusnfe/route.ts) ou a varredura periódica
// (iniciarVarreduraNotasFiscais abaixo) consultarem o status depois.
export async function emitirNotaFiscalFocusNfe(sessao: Sessao, propostaId: string) {
  if (!ehAdmin(sessao)) throw new ErroPermissao("Somente o administrativo emite nota fiscal.");
  if (!focusNfeConfigurado()) {
    throw new Error("Focus NFe não está configurado (FOCUS_NFE_TOKEN/FOCUS_NFE_CNPJ_EMITENTE ausentes).");
  }

  const existente = await prisma.notaFiscal.findUnique({ where: { propostaId } });
  if (existente?.status === "EMITIDA") {
    throw new Error("Este pedido já tem nota fiscal emitida. Cancele antes de reemitir.");
  }

  const pedido = await buscarPedidoParaFocusNfe(propostaId);
  const errosValidacao = validarDadosFiscaisPedido(pedido);
  if (errosValidacao.length > 0) throw new Error(errosValidacao.join(" "));

  const referencia = gerarReferenciaNotaFiscal(propostaId);
  const payload = montarPayloadFocusNfe(pedido);
  const resposta = await emitirNfeFocus(referencia, payload);
  const { status, mensagemErro } = interpretarRespostaFocusNfe(resposta);

  const dados = {
    status,
    referencia,
    ambiente: ambienteFocusNfe(),
    numero: resposta.numero ?? null,
    serie: resposta.serie ?? null,
    chaveAcesso: resposta.chave_nfe ?? null,
    valor: pedido.total,
    dataEmissao: status === "EMITIDA" ? new Date() : null,
    pdfUrl: resposta.caminho_danfe ? urlAbsolutaFocusNfe(resposta.caminho_danfe) : null,
    xmlUrl: resposta.caminho_xml_nota_fiscal ? urlAbsolutaFocusNfe(resposta.caminho_xml_nota_fiscal) : null,
    mensagemErro,
  };
  await prisma.notaFiscal.upsert({
    where: { propostaId },
    create: { propostaId, criadoPor: sessao.nome, ...dados },
    update: dados,
  });

  await registrar(
    sessao,
    "Solicitou emissão de nota fiscal (Focus NFe)",
    "NOTA_FISCAL",
    `${numeroProposta(pedido.numero)} - ${pedido.cliente.nome}: ${status}`
  );

  if (status === "EMITIDA") await marcarFaturadoSeCompleto(propostaId);
  if (status === "ERRO") throw new Error(mensagemErro ?? "Falha ao emitir nota fiscal.");
}

// Chamado tanto pelo webhook quanto pela varredura periódica — a API da
// Focus NFe é a fonte de verdade em ambos os casos (mesmo desenho de
// sincronizarAssinatura em lib/assinaturas.ts).
export async function sincronizarNotaFiscalFocusNfe(referencia: string) {
  const notaFiscal = await prisma.notaFiscal.findUnique({ where: { referencia } });
  if (!notaFiscal) return "NAO_ENCONTRADO";
  if (notaFiscal.status === "EMITIDA" || notaFiscal.status === "CANCELADA") return notaFiscal.status;

  const resposta = await consultarNfeFocus(referencia);
  const { status, mensagemErro } = interpretarRespostaFocusNfe(resposta);
  if (status === "PROCESSANDO") return "PROCESSANDO";

  await prisma.notaFiscal.update({
    where: { referencia },
    data: {
      status,
      numero: resposta.numero ?? notaFiscal.numero,
      serie: resposta.serie ?? notaFiscal.serie,
      chaveAcesso: resposta.chave_nfe ?? notaFiscal.chaveAcesso,
      dataEmissao: status === "EMITIDA" ? new Date() : notaFiscal.dataEmissao,
      pdfUrl: resposta.caminho_danfe ? urlAbsolutaFocusNfe(resposta.caminho_danfe) : notaFiscal.pdfUrl,
      xmlUrl: resposta.caminho_xml_nota_fiscal ? urlAbsolutaFocusNfe(resposta.caminho_xml_nota_fiscal) : notaFiscal.xmlUrl,
      mensagemErro,
    },
  });

  if (status === "EMITIDA") await marcarFaturadoSeCompleto(notaFiscal.propostaId);
  console.info(`[Focus NFe] nota sincronizada: ${referencia} -> ${status}`);
  return status;
}

const globalNotasFiscais = globalThis as unknown as { varreduraNotasFiscais?: boolean };

// Fallback caso o webhook da Focus NFe não chegue (rede instável, painel sem
// webhook configurado) — mesmo desenho de iniciarVarreduraAssinaturas em
// lib/assinaturas.ts. Chamado uma vez no boot (ver src/instrumentation.ts).
export function iniciarVarreduraNotasFiscais() {
  if (globalNotasFiscais.varreduraNotasFiscais || !focusNfeConfigurado()) return;
  globalNotasFiscais.varreduraNotasFiscais = true;
  let cursor = "";
  const rodar = async () => {
    try {
      const notas = await prisma.notaFiscal.findMany({
        where: { status: "PROCESSANDO", referencia: { not: null }, id: { gt: cursor } },
        select: { id: true, referencia: true },
        orderBy: { id: "asc" },
        take: 10,
      });
      cursor = notas.length === 10 ? notas[9].id : "";
      for (const nota of notas) {
        try {
          await sincronizarNotaFiscalFocusNfe(nota.referencia!);
        } catch (error) {
          console.error(`[Focus NFe] falha na sincronização de ${nota.referencia}:`, error);
        }
      }
    } catch (error) {
      console.error("[Focus NFe] falha na varredura de notas fiscais:", error);
    } finally {
      setTimeout(rodar, 60_000).unref();
    }
  };
  setTimeout(rodar, 5_000).unref();
}

export async function emitirNotaFiscal(
  sessao: Sessao,
  propostaId: string,
  dados: {
    numero: string;
    serie?: string;
    chaveAcesso?: string;
    valor?: number;
    dataEmissao?: Date;
    pdfUrl?: string;
    xmlUrl?: string;
    observacoes?: string;
  }
) {
  if (!ehAdmin(sessao)) throw new ErroPermissao("Somente o administrativo emite nota fiscal.");
  if (!dados.numero.trim()) throw new Error("Informe o número da nota fiscal.");

  const pedido = await buscarPedidoOuFalha(propostaId);

  await prisma.notaFiscal.upsert({
    where: { propostaId },
    create: {
      propostaId,
      status: "EMITIDA",
      numero: dados.numero.trim(),
      serie: dados.serie?.trim() || null,
      chaveAcesso: dados.chaveAcesso?.trim() || null,
      valor: dados.valor ?? null,
      dataEmissao: dados.dataEmissao ?? new Date(),
      pdfUrl: dados.pdfUrl?.trim() || null,
      xmlUrl: dados.xmlUrl?.trim() || null,
      observacoes: dados.observacoes?.trim() || null,
      criadoPor: sessao.nome,
    },
    update: {
      status: "EMITIDA",
      numero: dados.numero.trim(),
      serie: dados.serie?.trim() || null,
      chaveAcesso: dados.chaveAcesso?.trim() || null,
      valor: dados.valor ?? null,
      dataEmissao: dados.dataEmissao ?? new Date(),
      pdfUrl: dados.pdfUrl?.trim() || null,
      xmlUrl: dados.xmlUrl?.trim() || null,
      observacoes: dados.observacoes?.trim() || null,
    },
  });

  await registrar(
    sessao,
    "Emitiu nota fiscal",
    "NOTA_FISCAL",
    `${numeroProposta(pedido.numero)} - ${pedido.cliente.nome}: NF ${dados.numero.trim()}`
  );

  await marcarFaturadoSeCompleto(propostaId);
}

export async function cancelarNotaFiscal(sessao: Sessao, propostaId: string, justificativa?: string) {
  if (!ehAdmin(sessao)) throw new ErroPermissao("Somente o administrativo cancela nota fiscal.");
  const pedido = await buscarPedidoOuFalha(propostaId);
  if (!pedido.notaFiscal) throw new Error("Este pedido não tem nota fiscal emitida.");

  // Nota emitida via Focus NFe precisa ser cancelada na SEFAZ antes de mudar
  // o status aqui — nota preenchida manualmente não passou pela Focus NFe,
  // então não há o que cancelar lá.
  if (pedido.notaFiscal.referencia && pedido.notaFiscal.status === "EMITIDA") {
    const motivo = (justificativa ?? "").trim();
    if (motivo.length < 15) {
      throw new Error("Informe uma justificativa com pelo menos 15 caracteres para cancelar na SEFAZ.");
    }
    const resposta = await cancelarNfeFocus(pedido.notaFiscal.referencia, motivo);
    if (resposta.status !== "cancelado") {
      const detalhe =
        resposta.erros?.map((e) => e.mensagem).join("; ") ||
        resposta.mensagem_sefaz ||
        resposta.mensagem ||
        "Falha não detalhada pela Focus NFe.";
      throw new Error(`Focus NFe recusou o cancelamento: ${detalhe}`);
    }
  }

  await prisma.notaFiscal.update({
    where: { propostaId },
    data: { status: "CANCELADA" },
  });

  // Nota cancelada derruba o faturamento — volta pra Em carteira (a venda so
  // fica FATURADO com os dois documentos em dia, ver marcarFaturadoSeCompleto).
  const vendaIds = await vendaIdsDoPedido(propostaId);
  if (vendaIds.length > 0) {
    await prisma.venda.updateMany({
      where: { id: { in: vendaIds }, status: "FATURADO" },
      data: { status: "EM_CARTEIRA" },
    });
  }

  await registrar(
    sessao,
    "Cancelou nota fiscal",
    "NOTA_FISCAL",
    `${numeroProposta(pedido.numero)} - ${pedido.cliente.nome}`
  );
}

export async function emitirBoleto(
  sessao: Sessao,
  propostaId: string,
  dados: {
    numeroDocumento?: string;
    valor?: number;
    vencimento?: Date;
    linhaDigitavel?: string;
    pdfUrl?: string;
    observacoes?: string;
  }
) {
  if (!ehAdmin(sessao)) throw new ErroPermissao("Somente o administrativo emite boleto.");

  const pedido = await buscarPedidoOuFalha(propostaId);

  await prisma.boleto.upsert({
    where: { propostaId },
    create: {
      propostaId,
      status: "EMITIDO",
      numeroDocumento: dados.numeroDocumento?.trim() || null,
      valor: dados.valor ?? null,
      vencimento: dados.vencimento ?? null,
      linhaDigitavel: dados.linhaDigitavel?.trim() || null,
      pdfUrl: dados.pdfUrl?.trim() || null,
      observacoes: dados.observacoes?.trim() || null,
      criadoPor: sessao.nome,
    },
    update: {
      status: "EMITIDO",
      numeroDocumento: dados.numeroDocumento?.trim() || null,
      valor: dados.valor ?? null,
      vencimento: dados.vencimento ?? null,
      linhaDigitavel: dados.linhaDigitavel?.trim() || null,
      pdfUrl: dados.pdfUrl?.trim() || null,
      observacoes: dados.observacoes?.trim() || null,
    },
  });

  await registrar(
    sessao,
    "Emitiu boleto",
    "BOLETO",
    `${numeroProposta(pedido.numero)} - ${pedido.cliente.nome}`
  );

  await marcarFaturadoSeCompleto(propostaId);
}

export async function marcarBoletoPago(sessao: Sessao, propostaId: string, dataPagamento?: Date) {
  if (!ehAdmin(sessao)) throw new ErroPermissao("Somente o administrativo baixa pagamento de boleto.");
  const pedido = await buscarPedidoOuFalha(propostaId);
  if (!pedido.boleto) throw new Error("Este pedido não tem boleto emitido.");

  await prisma.boleto.update({
    where: { propostaId },
    data: { status: "PAGO", dataPagamento: dataPagamento ?? new Date() },
  });

  await registrar(
    sessao,
    "Baixou pagamento de boleto",
    "BOLETO",
    `${numeroProposta(pedido.numero)} - ${pedido.cliente.nome}`
  );

  await marcarFaturadoSeCompleto(propostaId);
}

export async function cancelarBoleto(sessao: Sessao, propostaId: string) {
  if (!ehAdmin(sessao)) throw new ErroPermissao("Somente o administrativo cancela boleto.");
  const pedido = await buscarPedidoOuFalha(propostaId);
  if (!pedido.boleto) throw new Error("Este pedido não tem boleto emitido.");

  await prisma.boleto.update({
    where: { propostaId },
    data: { status: "CANCELADO" },
  });

  const vendaIds = await vendaIdsDoPedido(propostaId);
  if (vendaIds.length > 0) {
    await prisma.venda.updateMany({
      where: { id: { in: vendaIds }, status: "FATURADO" },
      data: { status: "EM_CARTEIRA" },
    });
  }

  await registrar(
    sessao,
    "Cancelou boleto",
    "BOLETO",
    `${numeroProposta(pedido.numero)} - ${pedido.cliente.nome}`
  );
}

export type ResumoFinanceiro = {
  totalEmCarteira: number;
  totalFaturado: number;
  qtdNotasPendentes: number;
  qtdBoletosPendentes: number;
  qtdBoletosVencidos: number;
  evolucaoFaturamento: { mes: string; total: number }[];
};

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

export async function getResumoFinanceiro(sessao: Sessao, safraId: string): Promise<ResumoFinanceiro> {
  if (!ehAdmin(sessao)) throw new ErroPermissao("Somente o administrativo acessa o Financeiro.");

  const vendas = await prisma.venda.findMany({
    where: { safraId, status: { in: ["EM_CARTEIRA", "FATURADO"] } },
    select: { valorTotal: true, status: true, dataFechamento: true },
  });

  let totalEmCarteira = 0;
  let totalFaturado = 0;
  const evolucaoMap = new Map<string, number>();

  for (const v of vendas) {
    const valor = numeroDecimal(v.valorTotal);
    if (v.status === "EM_CARTEIRA") totalEmCarteira += valor;
    if (v.status === "FATURADO") {
      totalFaturado += valor;
      if (v.dataFechamento) {
        const d = v.dataFechamento;
        const chave = `${d.getUTCFullYear()}-${String(d.getUTCMonth()).padStart(2, "0")}`;
        evolucaoMap.set(chave, (evolucaoMap.get(chave) ?? 0) + valor);
      }
    }
  }

  // Boleto só existe como registro depois de emitido (upsert já cria direto
  // EMITIDO). NotaFiscal também pode existir em PROCESSANDO/ERRO (emissão via
  // Focus NFe ainda não confirmada) — "pendente" aqui é autorizado a faturar
  // mas sem nenhum registro ainda, não cobre esses estados intermediários.
  const [qtdNotasPendentes, qtdBoletosPendentes, qtdBoletosVencidos] = await Promise.all([
    prisma.proposta.count({
      where: { safraId, tipo: "PROPOSTA", autorizadoFaturarEm: { not: null }, notaFiscal: null },
    }),
    prisma.proposta.count({
      where: { safraId, tipo: "PROPOSTA", autorizadoFaturarEm: { not: null }, boleto: null },
    }),
    prisma.boleto.count({
      where: { status: "EMITIDO", vencimento: { lt: new Date() }, proposta: { safraId } },
    }),
  ]);

  return {
    totalEmCarteira,
    totalFaturado,
    qtdNotasPendentes,
    qtdBoletosPendentes,
    qtdBoletosVencidos,
    evolucaoFaturamento: [...evolucaoMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([chave, total]) => {
        const [ano, mes] = chave.split("-");
        return { mes: `${MESES[Number(mes)]}/${ano.slice(2)}`, total };
      }),
  };
}
