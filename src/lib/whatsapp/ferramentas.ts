// Ferramentas que o agente do WhatsApp pode chamar.
//
// Regra de ouro: o modelo NUNCA escolhe de quem é o dado. Toda ferramenta é
// executada já amarrada ao consultor dono do número que mandou a mensagem —
// `consultorId` vem do vínculo, não dos argumentos do modelo.

import type { Modulo } from "@/lib/modulos";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import type { Sessao } from "@/app/actions/helpers";
import { getSafraAtualId } from "@/lib/safra-atual";
import { criarPedidoParaConsultor, type PropostaInput } from "@/lib/pedidos";
import {
  obterProposta,
  gerarPdfDaProposta,
  aprovarPedido,
  alterarStatusProposta,
  obterLinkAssinaturaCliente,
  listarOrcamentosAguardandoMargem,
  aprovarMargem,
  recusarMargem,
} from "@/lib/servicos/propostas";
import { obterDocumentosFiscais } from "@/lib/servicos/financeiro";
import { clienteCompleto, camposFaltantes } from "@/lib/clientes";
import { atualizarCliente as atualizarClienteServico } from "@/lib/servicos/clientes";
import { numeroDocumento, STATUS_PROPOSTA_LABELS } from "@/lib/propostas";
import { precoMinimo } from "@/lib/preco-minimo";
import { numeroDecimal, numeroDecimalOuNulo } from "@/lib/dinheiro";
import { UNIDADES_ITEM } from "@/lib/unidades";
import {
  salvarRelatorioVisita,
  abrirVisita,
  fecharVisita,
  buscarVisitaAbertaPorConsultor,
  formatarDuracao,
  complementarRelatorio,
  anexarFotosRelatorio,
  adicionarGraficoRelatorio,
  coordenadasDoRelatorio,
  fotosDoRelatorio,
  salvarAnotacoesFoto,
  itensDoRelatorio,
  editarItemRelatorio,
  aprovarRelatorio,
  ajustarCapaRelatorio,
  guardarVersaoBot,
  desfazerUltimaMudancaBot,
  contextoDoCliente,
  copiarFotosDeOutroRelatorio,
  vincularTrabalho,
  type MudancaItem,
} from "@/lib/relatorios-visita";
import { ehPaginaOuPrint, lerCorrecoesDaPrevia } from "@/lib/correcao-previa";
import { analisarFotoCampo } from "@/lib/analise-foto-campo";
import { combinadosPendentes, concluirCombinado, criarCombinado } from "@/lib/combinados";
import {
  anotacoesParaImagem,
  desenharPrevia,
  dimensoesImagem,
  localizarNaFoto,
  marcacoesParaQuadro,
  type MarcacaoImagem,
} from "@/lib/foto-anotada";
import { salvarDespesa } from "@/lib/despesas";
import { extrairDadosNotaFiscal } from "@/lib/ocr-despesa";
import { extrairDadosProduto } from "@/lib/ocr-produto";
import { gerarImagemTabela } from "@/lib/tabela-imagem";
import { paginasComoJpeg, primeiraPaginaComoJpeg } from "@/lib/pdf-para-imagem";
import { baixarMidia, enviarDocumento, enviarEnquete, enviarImagem } from "@/lib/whatsapp/transporte";
import { guardarArquivo } from "@/lib/assistente-arquivos";
import type { RefMidia } from "@/lib/whatsapp/tipos";
import {
  definirModoRespostaPorWaId,
  type FotoAnexada,
  type FotoPendente,
  type ModoResposta,
} from "@/lib/whatsapp/vinculo";
import { montarPdfDespesas, montarPdfGerencial } from "@/lib/relatorios-exportacao";
import { clientesProximos, type Localizacao } from "@/lib/whatsapp/proximidade";
import {
  geocodificarCidade,
  historicoChuvaAnual,
  gerarGraficoChuvaAnual,
  chuvaMensalComparada,
  previsaoTempo,
} from "@/lib/clima";
import { gerarGraficoChuvaMensal, gerarGraficoPrevisao } from "@/lib/graficos-clima";
import {
  buscarCotacao,
  encontrarProduto,
  PRODUTOS_COTACAO,
  buscarSerieHistorica,
  mediaPrecoAnual,
  gerarGraficoPrecoAnual,
} from "@/lib/cotacoes";
import { linkCurtoAssinatura } from "@/lib/link-curto";
import type { CategoriaDespesa, StatusVenda } from "@/generated/prisma/client";
import {
  lerConteudo,
  tipoEfetivoRelatorio,
  type BlocoGrafico,
  type BlocoFoto as BlocoFotoTipo,
  type EstruturaRelatorio,
  type FormatoGrafico,
  FORMATOS_GRAFICO,
  usaSerieUnica, orientacaoDe } from "@/lib/relatorio-conteudo";
import { gerarPdfGrafico, gerarPdfRelatorioVisita } from "@/lib/relatorio-pdf";
import { assinarUrlArmazenada, enviarBufferLogoRelatorio, urlLogoParceiro } from "@/lib/storage";
import { gerarGradeDeLogos } from "@/lib/logos-grade";
import { pdfIdenticoAPagina } from "@/lib/relatorio-pdf-web";
import { CATEGORIA_DESPESA_LABELS, STATUS_LABELS, fmtBRL, fmtDataHoraBrasilia } from "@/lib/format";
import { contemNome, semelhancaNome, SEMELHANCA_MINIMA } from "@/lib/whatsapp/busca-nomes";

const estruturaRelatorioSchema = z.object({
  sintese: z.string().trim().min(1),
  observacoes: z.array(z.object({ area: z.string().trim(), texto: z.string().trim().min(1) })).max(20),
  analise: z.string().trim().nullable(),
  encaminhamentos: z.array(z.string().trim().min(1)).max(20),
});

const CATEGORIAS_VISITA_IDS = ["COMERCIAL", "TECNICA", "POS_VENDA", "RELACIONAMENTO"];
function categoriaVisitaArg(v: unknown): string | null {
  const c = String(v ?? "").toUpperCase();
  return CATEGORIAS_VISITA_IDS.includes(c) ? c : null;
}

const CATEGORIAS: CategoriaDespesa[] = [
  "COMBUSTIVEL",
  "ALIMENTACAO",
  "HOSPEDAGEM",
  "MANUTENCAO_VEICULO",
  "PEDAGIO",
  "MATERIAL_ESCRITORIO",
  "OUTROS",
];

// Remove acentos e normaliza caixa/espaços para comparar nomes digitados no
// WhatsApp (sem acento, comum em teclado de celular ou áudio transcrito)
// contra o nome cadastrado no sistema (com acento) — o ILIKE do Postgres
// ignora maiúscula/minúscula mas não acento, então "Sao Jose" não batia com
// "São José" cadastrado, e o agente dizia "cliente não encontrado".
function normalizarNome(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}


export type ContextoFerramenta = {
  consultorId: string;
  consultorNome: string;
  role: "ADMIN" | "CONSULTOR";
  waId: string;
  // "web" = assistente do site: sem envio de arquivo/foto pelo WhatsApp.
  canal?: "web";
  // Só no site: arquivos gerados nesta resposta, como markdown de link/imagem.
  entregas?: string[];
  // Última imagem que o consultor mandou nesta conversa, se houver.
  ultimaMidia?: RefMidia;
  // Última localização (📎 > Localização) mandada nesta conversa, se houver.
  // Só vem preenchida se for recente (ver VALIDADE_LOCALIZACAO_MS).
  ultimaLocalizacao?: Localizacao;
  // Fotos recebidas e ainda não usadas. As ferramentas tiram daqui o que
  // anexam; o webhook salva o que sobrar.
  fotosPendentes: FotoPendente[];
  // Foto anexada ← mensagem de origem, pra descrição mandada depois.
  fotosAnexadas: FotoAnexada[];
  // Preenchido quando o consultor troca o modo de resposta nesta mensagem.
  novoModoResposta?: ModoResposta;
};

// Entrega de arquivo: no WhatsApp manda a mensagem; no site guarda o arquivo e
// devolve o link, que o agente cola ao fim da resposta (ver agente.ts).
async function entregarDocumento(ctx: ContextoFerramenta, bytes: Buffer, nome: string, mime: string, legenda?: string) {
  if (ctx.canal !== "web") return enviarDocumento(ctx.waId, bytes, nome, mime, legenda);
  const url = guardarArquivo(ctx.consultorId, bytes, mime, nome);
  (ctx.entregas ??= []).push(`[📄 ${(legenda || nome).replace(/[\[\]]/g, "")}](${url})`);
  return true;
}

async function entregarImagem(ctx: ContextoFerramenta, bytes: Buffer, mime: string, legenda?: string) {
  if (ctx.canal !== "web") return enviarImagem(ctx.waId, bytes, mime, legenda);
  const url = guardarArquivo(ctx.consultorId, bytes, mime, "imagem");
  (ctx.entregas ??= []).push(`![${(legenda || "Imagem").replace(/[\[\]]/g, "")}](${url})`);
  return true;
}


// Decide a fazenda de um relatório criado pelo bot. A regra fica aqui (não
// só no prompt): cliente com mais de uma fazenda exige a escolha — a
// ferramenta devolve as opções pro agente perguntar; com uma só, ela é usada
// direto; sem fazenda, segue sem.
async function resolverFazenda(
  clienteId: string,
  fazendaIdArg: unknown
): Promise<{ id: string | null; nome: string | null } | { erro: string; fazendas: { id: string; nome: string }[] }> {
  const fazendas = await prisma.fazenda.findMany({
    where: { clienteId },
    select: { id: true, nome: true },
    orderBy: { nome: "asc" },
  });
  const pedida = fazendaIdArg ? String(fazendaIdArg) : null;
  if (pedida) {
    const escolhida = fazendas.find((f) => f.id === pedida);
    if (!escolhida) {
      return { erro: "Essa fazenda não é desse cliente. Use um dos ids em fazendas.", fazendas };
    }
    return { id: escolhida.id, nome: escolhida.nome };
  }
  if (fazendas.length === 1) return { id: fazendas[0].id, nome: fazendas[0].nome };
  if (fazendas.length > 1) {
    return {
      erro:
        "Esse cliente tem mais de uma fazenda. Pergunte ao consultor de qual fazenda é a visita (opções numeradas) e chame de novo com fazenda_id.",
      fazendas,
    };
  }
  return { id: null, nome: null };
}

// Definições no formato de function tool da API de Responses da OpenAI.
export const DEFINICOES_FERRAMENTAS = [
  {
    type: "function",
    name: "buscar_clientes",
    description:
      "Procura clientes cadastrados por parte do nome. Use antes de criar um relatório de visita ou de vincular uma despesa a um cliente.",
    parameters: {
      type: "object",
      properties: {
        termo: { type: "string", description: "Parte do nome do cliente." },
        consultor_id: {
          type: ["string", "null"],
          description:
            "Só vale pro gestor: restringe a busca aos clientes de um consultor específico (id de listar_consultores). null = todos os consultores.",
        },
      },
      required: ["termo"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "listar_meus_clientes",
    description:
      "Lista todos os clientes vinculados ao consultor (ou todos os clientes cadastrados, se for o gestor/admin). Use quando pedirem 'lista meus clientes', 'quais clientes eu tenho', 'meus clientes' e afins — sem precisar de nome/termo. Se o gestor/admin pedir a lista de um consultor específico (ex.: 'lista de clientes da Camila'), primeiro use listar_consultores pra achar o id e passe em consultor_id.",
    parameters: {
      type: "object",
      properties: {
        consultor_id: {
          type: ["string", "null"],
          description:
            "Só vale pro gestor: clientes de um consultor específico (id de listar_consultores). null = a própria pessoa (ou a equipe toda, se for gestor).",
        },
      },
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "consultar_cliente",
    description:
      "Mostra o cadastro completo de um cliente (documento/CPF-CNPJ, razão social, telefone, e-mail, endereço, cidade, UF, CEP) por nome ou parte dele. Use quando pedirem pra 'consultar', 'mostrar' ou 'ver os dados' de um cliente. Se achar mais de um nome igual ou parecido (inclusive grafia diferente, tipo 'Wontroba' vs 'Wontrobra'), devolve a lista em 'opcoes' — liste numerado (1, 2, 3...) e pergunte qual é, nunca escolha sozinho nem misture os dados dos dois. O cliente_id devolvido serve pra atualizar_cadastro_cliente depois.",
    parameters: {
      type: "object",
      properties: {
        termo: { type: "string", description: "Nome ou parte do nome do cliente." },
        consultor_id: {
          type: ["string", "null"],
          description:
            "Só vale pro gestor: restringe a busca aos clientes de um consultor específico (id de listar_consultores). null = todos os consultores.",
        },
      },
      required: ["termo"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "buscar_cliente_por_localizacao",
    description:
      "Usa a última localização recebida na conversa (📎 > Localização) pra achar os clientes cadastrados mais próximos, ordenados por distância. Use isso ANTES de perguntar o nome do cliente quando for fazer check-in ('cheguei na fazenda') e a localização já tiver chegado — é mais rápido só confirmar o cliente mais próximo do que perguntar o nome.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    type: "function",
    name: "criar_relatorio_visita",
    description:
      "Cria um relatório de visita ou um relatório técnico (laudo/ensaio) para um cliente. Chame quando tiver o cliente_id via buscar_clientes e o relato do consultor: não mande prévia depois, a não ser que ele peça.",
    parameters: {
      type: "object",
      properties: {
        cliente_id: { type: "string" },
        tipo: {
          type: "string",
          enum: ["visita", "tecnico"],
          description:
            "'visita' pro relato comum de campo. 'tecnico' quando for um laudo/ensaio de produto, comparação de tratamentos, resultado de safra etc. — esse tipo ganha uma capa diferente no PDF.",
        },
        categoria: {
          type: "string",
          enum: ["COMERCIAL", "TECNICA", "POS_VENDA", "RELACIONAMENTO"],
          description:
            "Categoria da visita, que define a cor no calendário e os indicadores: 'COMERCIAL' (prospecção, negociação, venda), 'TECNICA' (acompanhamento técnico, ensaio, laudo), 'POS_VENDA' (entrega, reclamação, suporte depois da venda) ou 'RELACIONAMENTO' (visita de cortesia, evento, outros). Se não estiver óbvio pelo relato, PERGUNTE ao consultor com as 4 opções numeradas.",
        },
        texto: { type: "string", description: "O relato da visita ou o resumo do laudo técnico." },
        estrutura: {
          type: ["object", "null"],
          description: "Seções extraídas apenas do relato confirmado. Use null para visita comum ou relato curto.",
          properties: {
            sintese: { type: "string" },
            observacoes: {
              type: "array",
              items: { type: "object", properties: { area: { type: "string" }, texto: { type: "string" } }, required: ["area", "texto"], additionalProperties: false },
            },
            analise: { type: ["string", "null"] },
            encaminhamentos: { type: "array", items: { type: "string" } },
          },
          required: ["sintese", "observacoes", "analise", "encaminhamentos"],
          additionalProperties: false,
        },
        titulo: {
          type: ["string", "null"],
          description:
            "Pro tipo 'tecnico', o assunto do laudo, que vira o título da capa (ex: 'Ensaio de fungicida na soja'). A fazenda NÃO vai aqui — vai em fazenda_id e já aparece na capa. Sem assunto claro, null.",
        },
        fazenda_id: {
          type: ["string", "null"],
          description:
            "Fazenda do cliente onde foi a visita (os ids vêm em 'fazendas' no buscar_clientes / buscar_cliente_por_localizacao). Cliente com UMA fazenda: use essa, sem perguntar. Com MAIS DE UMA: pergunte de qual fazenda é, com as opções numeradas, antes de chamar. Sem fazendas: null.",
        },
        data_visita: {
          type: ["string", "null"],
          description:
            "Dia da visita (yyyy-mm-dd) quando o relato veio de mensagens enviadas sem internet — o dia em que ele enviou. Na conversa normal, null (vale hoje).",
        },
      },
      required: ["cliente_id", "tipo", "categoria", "texto", "estrutura", "titulo", "fazenda_id", "data_visita"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "abrir_visita_fazenda",
    description:
      "Registra a chegada do consultor numa fazenda (check-in): cliente, tipo, KM do veículo no odômetro e a finalidade da visita. Use quando ele disser algo como 'cheguei na fazenda X' ou 'cheguei no cliente'. Se a localização atual tiver acabado de chegar na conversa, é anexada automaticamente. Só pode haver uma visita aberta por consultor por vez.",
    parameters: {
      type: "object",
      properties: {
        cliente_id: { type: "string" },
        tipo: {
          type: "string",
          enum: ["visita", "tecnico"],
          description:
            "'visita' pro relato comum de campo. 'tecnico' quando for um laudo/ensaio de produto, comparação de tratamentos etc. — pergunte se não estiver óbvio pelo contexto.",
        },
        categoria: {
          type: "string",
          enum: ["COMERCIAL", "TECNICA", "POS_VENDA", "RELACIONAMENTO"],
          description:
            "Categoria da visita, que define a cor no calendário e os indicadores: 'COMERCIAL' (prospecção, negociação, venda), 'TECNICA' (acompanhamento técnico, ensaio, laudo), 'POS_VENDA' (entrega, reclamação, suporte depois da venda) ou 'RELACIONAMENTO' (visita de cortesia, evento, outros). Se não estiver óbvio pelo relato, PERGUNTE ao consultor com as 4 opções numeradas.",
        },
        km_chegada: { type: "number", description: "KM do odômetro na chegada." },
        finalidade: {
          type: "string",
          description: "Motivo da visita (ex: venda, suporte técnico, prospecção).",
        },
        fazenda_id: {
          type: ["string", "null"],
          description:
            "Fazenda do cliente onde foi a visita (os ids vêm em 'fazendas' no buscar_clientes / buscar_cliente_por_localizacao). Cliente com UMA fazenda: use essa, sem perguntar. Com MAIS DE UMA: pergunte de qual fazenda é, com as opções numeradas, antes de chamar. Sem fazendas: null.",
        },
        hora_chegada: {
          type: ["string", "null"],
          description:
            "Hora real da chegada quando veio de mensagens enviadas sem internet: o horário da mensagem de chegada. Formato \"yyyy-mm-dd HH:MM\" (horário de Brasília). Na conversa normal, null (vale agora).",
        },
      },
      required: ["cliente_id", "tipo", "categoria", "km_chegada", "finalidade", "fazenda_id", "hora_chegada"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "fechar_visita_fazenda",
    description:
      "Registra a saída do consultor de uma visita aberta (check-out): pede o KM final do veículo, calcula o tempo na fazenda e o KM rodado, e fecha a visita. Use quando disser 'saindo', 'finalizei a visita' e afins. Se o consultor contar o que aconteceu na visita nesse momento, passe em texto. Prévia e PDF só se pedirem.",
    parameters: {
      type: "object",
      properties: {
        relatorio_id: { type: "string" },
        km_saida: { type: "number" },
        texto: {
          type: ["string", "null"],
          description: "Relato da visita, se o consultor contou nesse momento.",
        },
        hora_saida: {
          type: ["string", "null"],
          description:
            "Hora real da saída quando veio de mensagens enviadas sem internet: o horário da mensagem de saída. Formato \"yyyy-mm-dd HH:MM\" (horário de Brasília). Na conversa normal, null (vale agora).",
        },
      },
      required: ["relatorio_id", "km_saida", "texto", "hora_saida"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "visita_aberta_atual",
    description:
      "Verifica se o consultor tem uma visita em aberto no momento (check-in feito, sem check-out ainda) e devolve os dados dela. Use antes de fechar_visita_fazenda se não souber o relatorio_id.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    type: "function",
    name: "anexar_foto_ao_relatorio",
    description:
      "Anexa a um relatório técnico já criado (tipo 'tecnico') as fotos que o consultor mandou e ainda não foram usadas — todas de uma vez, com a legenda de cada uma. Relatório de visita não leva fotos anexadas.",
    parameters: {
      type: "object",
      properties: {
        relatorio_id: { type: "string" },
        quantidade: {
          type: ["number", "null"],
          description: "Quantas das fotos mais recentes anexar. null = todas as pendentes.",
        },
      },
      required: ["relatorio_id", "quantidade"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "ler_nota_fiscal",
    description:
      "Lê a última foto enviada como nota fiscal/cupom e devolve valor, data, estabelecimento e categoria sugeridos. Não salva nada — use lancar_despesa depois de confirmar com o consultor.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    type: "function",
    name: "lancar_despesa",
    description:
      "Registra uma despesa do consultor. Se anexar_ultima_foto for true, a última foto enviada vira o comprovante. Chame só depois que o consultor confirmar os dados (valor, categoria, etc.) e disser que pode salvar.",
    parameters: {
      type: "object",
      properties: {
        valor: { type: "number", description: "Valor em reais, maior que zero." },
        categoria: { type: "string", enum: CATEGORIAS },
        data: {
          type: ["string", "null"],
          description:
            "Data ISO yyyy-mm-dd. Se a nota/despesa veio em mensagens enviadas sem internet e a nota não mostra a data, use o dia em que foi enviada.",
        },
        estabelecimento: { type: ["string", "null"] },
        cliente_id: { type: ["string", "null"] },
        anexar_ultima_foto: { type: "boolean" },
      },
      required: [
        "valor",
        "categoria",
        "data",
        "estabelecimento",
        "cliente_id",
        "anexar_ultima_foto",
      ],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "resumo_vendas",
    description:
      "Resumo das vendas do próprio consultor na safra atual: quantidade, total e faturado.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    type: "function",
    name: "buscar_produtos",
    description:
      "Procura produtos cadastrados por parte do nome (fornecedor, ingrediente ativo, embalagem, preço à vista, preço a prazo e o preço mínimo — 3% de desconto sobre o preço cadastrado — de cada condição). Só retorna produtos com preço à vista OU a prazo cadastrado; produto sem nenhum preço definido não aparece nem pode ser usado num orçamento. Use antes de abrir uma venda/negociação ou de montar um orçamento com criar_orcamento. Quando o pedido for pra ver a lista (não pra cotar um item específico) E como_imagem for true, a lista já é mandada como foto de tabela — não repita os dados por escrito, só confirme em uma linha. Se como_imagem for false, use o campo `tabela` (bloco de código ```...```) mandado por escrito, exatamente como veio. Se a pessoa pedir a lista com desconto (ex: 'com 1,5% de desconto'), passe desconto_pct — NUNCA calcule o valor com desconto você mesmo, o cálculo já vem pronto.",
    parameters: {
      type: "object",
      properties: {
        termo: { type: "string", description: "Parte do nome do produto." },
        desconto_pct: {
          type: ["number", "null"],
          description: "Percentual de desconto a aplicar nos preços da tabela (ex: 1.5 para 1,5%). null se não foi pedido desconto.",
        },
        como_imagem: {
          type: "boolean",
          description:
            "true quando o pedido é pra VER a lista (ex: 'quais produtos vocês têm', 'me manda em foto/tabela') — manda a lista pronta como foto em vez de texto, melhor pra listas grandes. false quando é só cotação de um item específico pra montar orçamento/venda (o preço já vem no campo produtos, sem precisar mostrar tabela nenhuma).",
        },
      },
      required: ["termo", "desconto_pct", "como_imagem"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "listar_produtos_por_fornecedor",
    description:
      "Lista os produtos com preço cadastrado (à vista e/ou a prazo) de um fornecedor/fabricante, pra pedidos como 'quero a lista da Koppert', 'produtos da Syngenta', 'tem produto da CCAB?'. Se o nome bater com mais de um fornecedor, devolve a lista de fornecedores encontrados em vez dos produtos — pergunte qual é antes de chamar de novo com o nome exato. Produto sem preço cadastrado não aparece. Se como_imagem for true, a lista já é mandada como foto de tabela — não repita por escrito, só confirme em uma linha. Se for false, use o campo `tabela` (bloco de código ```...```) mandado por escrito, exatamente como veio. Se a pessoa pedir a lista com desconto (ex: 'com 1,5% de desconto'), passe desconto_pct — NUNCA calcule o valor com desconto você mesmo, o cálculo já vem pronto.",
    parameters: {
      type: "object",
      properties: {
        fornecedor: { type: "string", description: "Nome ou parte do nome do fornecedor/fabricante." },
        desconto_pct: {
          type: ["number", "null"],
          description: "Percentual de desconto a aplicar nos preços da tabela (ex: 1.5 para 1,5%). null se não foi pedido desconto.",
        },
        como_imagem: {
          type: "boolean",
          description: "true pra mandar a lista já pronta como foto de tabela (recomendado — é sempre um pedido de lista aqui). false só se a pessoa pedir explicitamente em texto.",
        },
      },
      required: ["fornecedor", "desconto_pct", "como_imagem"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "abrir_venda",
    description:
      "Abre um registro de venda (prospecção ou negociação) no pipeline comercial, pra quando uma visita/conversa acabar rendendo uma oportunidade de venda. NÃO é um pedido fechado — é só o início do pipeline (Prospecção → Negociação → Em carteira → Faturado); o pedido formal com preço e condições continua sendo feito depois, na tela de Vendas. Chame só depois de confirmar com o consultor um resumo (cliente, produto, volume, status).",
    parameters: {
      type: "object",
      properties: {
        cliente_id: { type: "string" },
        produto_id: { type: "string" },
        status: {
          type: "string",
          enum: ["prospeccao", "negociacao"],
          description: "'prospeccao' se é só um interesse; 'negociacao' se já está bem encaminhado.",
        },
        volume: { type: ["number", "null"], description: "Volume estimado, se souber." },
        cultura: { type: ["string", "null"] },
      },
      required: ["cliente_id", "produto_id", "status", "volume", "cultura"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "criar_orcamento",
    description:
      "Cria um ORÇAMENTO comercial para um cliente (aparece em Comercial > Orçamentos, com origem 'Bot'). NÃO cria pedido nem contrato — o orçamento fica como rascunho editável; a venda só é fechada depois, na Web. Os produtos vêm de buscar_produtos (o preço de venda é o que o consultor combinar com o cliente — use preco_sugerido/preco_minimo como referência de margem, nunca invente um preço). Validade é opcional (pergunte uma vez; se a pessoa não informar, passe null e siga). Previsão de entrega e frete NÃO são pedidos aqui — são perguntados na hora de virar pedido (fechar_negocio_orcamento); só passe a previsão se a pessoa já tiver dito. Chame só depois de mostrar um resumo completo (cliente, cada item com quantidade x preço e subtotal, desconto, total e, se informada, validade) e o consultor confirmar que pode salvar.",
    parameters: {
      type: "object",
      properties: {
        cliente_id: { type: "string" },
        itens: {
          type: "array",
          description: "Cada produto do orçamento.",
          items: {
            type: "object",
            properties: {
              produto_id: { type: "string" },
              quantidade: { type: "number", description: "Quantidade/volume, maior que zero." },
              unidade: { type: ["string", "null"], enum: [...UNIDADES_ITEM, null], description: "Unidade padronizada do sistema. null se não souber." },
              preco_unitario: { type: "number", description: "Preço de venda por unidade, combinado com o consultor. Nunca invente." },
              cultura: { type: ["string", "null"] },
            },
            required: ["produto_id", "quantidade", "unidade", "preco_unitario", "cultura"],
            additionalProperties: false,
          },
        },
        desconto: { type: ["number", "null"], description: "Desconto total em reais. null = sem desconto." },
        condicao_pagamento_tipo: {
          type: "string",
          enum: ["avista", "aprazo"],
          description: "Define qual custo do produto entra no cálculo de margem.",
        },
        condicao_pagamento: { type: ["string", "null"], description: "Texto livre, ex: '30/60/90 dias'." },
        previsao_entrega: {
          type: ["string", "null"],
          description: "Data prevista de entrega, yyyy-mm-dd. Opcional — não pergunte aqui (é perguntada ao fechar o pedido); null se a pessoa não disse.",
        },
        validade: { type: ["string", "null"], description: "Validade do orçamento, yyyy-mm-dd. Opcional — null se a pessoa não informar." },
        observacoes: { type: ["string", "null"] },
      },
      required: [
        "cliente_id",
        "itens",
        "desconto",
        "condicao_pagamento_tipo",
        "condicao_pagamento",
        "previsao_entrega",
        "validade",
        "observacoes",
      ],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "meus_orcamentos",
    description:
      "Lista os últimos ORÇAMENTOS (número ORC-xxxxx, ainda rascunho) do consultor (ou de um cliente específico), com número, cliente, status e total. Use para 'meus orçamentos', 'manda o orçamento da Fazenda X' ou para achar o orcamento_id antes de detalhar_orcamento. Se a pessoa mencionar um número PED-xxxxx (isso é um PEDIDO, não orçamento), use meus_pedidos em vez desta.",
    parameters: {
      type: "object",
      properties: {
        cliente_id: { type: ["string", "null"], description: "Filtra por cliente. null = todos." },
      },
      required: ["cliente_id"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "meus_pedidos",
    description:
      "Lista os últimos PEDIDOS (número PED-xxxxx — negócio já fechado, veio de um orçamento) do consultor (ou de um cliente específico), com número, cliente, status e total. Já vem separado em pedidos_em_aberto (ainda não passou pela conferência final do administrativo, mesmo que já assinado) e pedidos_finalizados (venda de fato em carteira) — ao responder, mostre os dois grupos separados com esses títulos. Use para 'meus pedidos', 'lista os pedidos', 'pedido da Fazenda X' ou pra achar o id de um PED-xxxxx antes de detalhar_orcamento/enviar_pdf_orcamento (essas duas funcionam tanto pra orçamento quanto pra pedido).",
    parameters: {
      type: "object",
      properties: {
        cliente_id: { type: ["string", "null"], description: "Filtra por cliente. null = todos." },
      },
      required: ["cliente_id"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "pedidos_aguardando_assinatura",
    description:
      "Lista SÓ os PEDIDOS (PED-xxxxx) que já foram enviados pra assinatura e o cliente AINDA NÃO assinou (nem recusou). Use pra 'quais pedidos estão aguardando assinatura', 'o que falta assinar', 'pedidos pendentes de assinatura'. Não inclui pedido já assinado nem pedido que ainda não foi enviado.",
    parameters: {
      type: "object",
      properties: {
        cliente_id: { type: ["string", "null"], description: "Filtra por cliente. null = todos." },
      },
      required: ["cliente_id"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "buscar_por_numero",
    description:
      "Acha o orcamento_id a partir de um número de documento digitado/falado (ex: 'PED-00024', 'PROP-00024' — prefixo antigo, ainda pode aparecer —, 'ORC-00012', ou só '24'). Use SEMPRE que a pessoa mandar um número de documento direto (sem passar por meus_orcamentos/meus_pedidos antes) — nunca tente adivinhar ou usar o texto digitado como se fosse o orcamento_id.",
    parameters: {
      type: "object",
      properties: {
        numero: { type: "string", description: "O texto como veio, com ou sem prefixo (ex: 'PED-00024', 'PROP-24', '24')." },
      },
      required: ["numero"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "detalhar_orcamento",
    description:
      "Mostra os itens, valores e status completos de um ORÇAMENTO (ORC-xxxxx) ou PEDIDO (PED-xxxxx) já existente — funciona pros dois tipos, é só passar o id certo (id vem de meus_orcamentos, meus_pedidos, buscar_por_numero ou de criar_orcamento).",
    parameters: {
      type: "object",
      properties: { orcamento_id: { type: "string" } },
      required: ["orcamento_id"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "fechar_negocio_orcamento",
    description:
      "Fecha o negócio: transforma o ORÇAMENTO (rascunho) num PEDIDO de verdade — a venda vinculada sai de negociação e vai pra 'Em carteira'. Isso é DEFINITIVO (orçamento fechado não volta a ser rascunho), então só chame depois que o consultor confirmar explicitamente (\"pode fechar\", \"fecha esse negócio\", \"confirma o pedido\" e afins) — mostre um resumo antes se fizer tempo desde a última confirmação. Antes de fechar, SEMPRE pergunte se já tem data de entrega e qual o frete (pode ser na mesma mensagem): o que a pessoa informar vai em previsao_entrega/frete; o que ela não informar (ou disser que não tem) vai null e segue sem — não insista. IMPORTANTE: isso NUNCA manda pra assinatura — enviar pro cliente assinar continua sendo feito manualmente na Web, pelo botão 'Enviar para assinatura'. Não ofereça mandar pra assinatura nem diga que isso foi feito.",
    parameters: {
      type: "object",
      properties: {
        orcamento_id: { type: "string" },
        previsao_entrega: {
          type: ["string", "null"],
          description: "Data de entrega do pedido, yyyy-mm-dd, se a pessoa informou ao ser perguntada. null = sem data (mantém a que o orçamento já tinha, se tinha).",
        },
        frete: {
          type: ["string", "null"],
          description: "Condição de frete, opcional. Use um destes textos quando bater: 'CIF - por conta do vendedor', 'FOB - por conta do cliente', 'Frete incluso no valor', 'Retirada pelo cliente', 'A combinar'. null = sem frete informado (mantém o que já tinha, se tinha)."
        },
      },
      required: ["orcamento_id", "previsao_entrega", "frete"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "enviar_pdf_orcamento",
    description:
      "Gera e manda pelo WhatsApp o ORÇAMENTO (ORC-xxxxx) ou PEDIDO (PED-xxxxx), igual o que sai na Web (mesmo modelo, com produtos e condições) — funciona pros dois tipos. Use quando pedirem o PDF/arquivo/foto/imagem pra mandar pro cliente (id vem de meus_orcamentos, meus_pedidos, detalhar_orcamento ou de criar_orcamento). Padrão é mandar como PDF; se pedirem foto/imagem/print (pra mandar mais rápido pelo WhatsApp sem abrir anexo), use formato 'imagem'.",
    parameters: {
      type: "object",
      properties: {
        orcamento_id: { type: "string" },
        formato: {
          type: "string",
          enum: ["pdf", "imagem"],
          description: "'pdf' = arquivo PDF (padrão). 'imagem' = mesma página convertida em JPEG.",
        },
      },
      required: ["orcamento_id", "formato"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "enviar_nf_boleto",
    description:
      "Manda pelo WhatsApp a nota fiscal e/ou o boleto já emitidos de um PEDIDO (PED-xxxxx) — id vem de meus_pedidos, detalhar_orcamento ou buscar_por_numero. Só funciona pra pedido que já está em carteira ou faturado E o Financeiro já emitiu o documento (registro manual, ver /financeiro na Web) — se ainda não tiver nota ou boleto emitido, avise que não foi emitido ainda em vez de inventar. Use 'documento' pra escolher só nota, só boleto, ou os dois (padrão).",
    parameters: {
      type: "object",
      properties: {
        orcamento_id: { type: "string" },
        documento: {
          type: "string",
          enum: ["nota_fiscal", "boleto", "ambos"],
          description: "Qual mandar. 'ambos' (padrão) manda os dois que estiverem emitidos.",
        },
      },
      required: ["orcamento_id", "documento"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "checar_pedido_para_assinatura",
    description:
      "Verifica se um PEDIDO (PED-xxxxx) está pronto pra ir pra assinatura: confere se o cliente tem cadastro completo (CPF/CNPJ, endereço, cidade, UF, CEP e telefone ou e-mail) e devolve o e-mail cadastrado do cliente. Se faltar algo, vem em campos_faltando (lista) e cliente_id (pra chamar atualizar_cadastro_cliente) — descreva pro consultor exatamente o que falta e pergunte os dados, nunca invente. Use SEMPRE antes de enviar_pedido_para_assinatura, pra montar o resumo e perguntar se quer adicionar mais e-mails (que também vão assinar, além do cliente) antes de confirmar o envio de verdade.",
    parameters: {
      type: "object",
      properties: { orcamento_id: { type: "string" } },
      required: ["orcamento_id"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "atualizar_cadastro_cliente",
    description:
      "Atualiza dados cadastrais de um cliente (documento/CPF-CNPJ, razão social, telefone, e-mail, endereço, cidade, UF, CEP) — cliente_id vem de consultar_cliente, checar_pedido_para_assinatura (campo cliente_id) ou buscar_clientes. Use tanto quando o consultor pede diretamente ('atualiza o telefone do Fulano') quanto depois de checar_pedido_para_assinatura apontar cadastro incompleto. Só passe os campos que o consultor de fato informou; o resto do cadastro não muda. Depois de atualizar, se o motivo foi completar cadastro pra assinatura, sugira chamar checar_pedido_para_assinatura de novo pra confirmar que já está completo.",
    parameters: {
      type: "object",
      properties: {
        cliente_id: { type: "string" },
        documento: { type: ["string", "null"], description: "CPF ou CNPJ, só números ou formatado. null = não mudar." },
        razao_social: { type: ["string", "null"] },
        telefone: { type: ["string", "null"] },
        email: { type: ["string", "null"] },
        endereco: { type: ["string", "null"] },
        cidade: { type: ["string", "null"] },
        uf: { type: ["string", "null"], description: "Sigla de 2 letras, ex: BA." },
        cep: { type: ["string", "null"] },
      },
      required: [
        "cliente_id",
        "documento",
        "razao_social",
        "telefone",
        "email",
        "endereco",
        "cidade",
        "uf",
        "cep",
      ],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "enviar_pedido_para_assinatura",
    description:
      "Manda de fato o PEDIDO (PED-xxxxx) pro D4Sign pra assinatura — o cliente e todo e-mail extra na lista recebem o documento pra assinar. AÇÃO DEFINITIVA E IRREVERSÍVEL: só chame depois de checar_pedido_para_assinatura e o consultor confirmar explicitamente (\"pode mandar\", \"confirma\", \"sim, envia\" e afins), já com a lista final de e-mails (pode ser só o do cliente, sem mais nenhum).",
    parameters: {
      type: "object",
      properties: {
        orcamento_id: { type: "string" },
        emails_extras: {
          type: "array",
          items: { type: "string" },
          description: "E-mails extras (além do cliente) que também vão assinar. Array vazio se for só o cliente.",
        },
      },
      required: ["orcamento_id", "emails_extras"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "link_assinatura_pedido",
    description:
      "Devolve o link de assinatura do CLIENTE de um PEDIDO (PED-xxxxx) já enviado pra assinatura — o mesmo documento que ele recebeu por e-mail —, pro consultor encaminhar pelo WhatsApp. Use quando pedirem 'manda o link de assinatura', 'me passa o link de novo' e afins. id vem de meus_pedidos, buscar_por_numero ou detalhar_orcamento.",
    parameters: {
      type: "object",
      properties: { orcamento_id: { type: "string" } },
      required: ["orcamento_id"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "listar_meus_registros",
    description:
      "Lista os últimos relatórios de visita e despesas do próprio consultor, para ele consultar ou continuar de onde parou.",
    parameters: {
      type: "object",
      properties: {
        tipo: { type: "string", enum: ["visitas", "despesas"] },
      },
      required: ["tipo"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "enviar_pdf_relatorio_visita",
    description:
      "Gera e envia pelo próprio WhatsApp o PDF de um relatório de visita já salvo. Use o relatorio_id devolvido por listar_meus_registros (tipo visitas), criar_relatorio_visita ou, pro gestor, listar_visitas_equipe.",
    parameters: {
      type: "object",
      properties: { relatorio_id: { type: "string" } },
      required: ["relatorio_id"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "complementar_relatorio",
    description:
      "Acrescenta informação a um relatório de visita/técnico já salvo (modo 'acrescentar') ou reescreve o relato inteiro (modo 'substituir'). Use quando o consultor disser algo como 'acrescenta no relatório de hoje que...' ou 'corrige o relatório da Fazenda X'. Mostre o texto final e peça confirmação antes de chamar.",
    parameters: {
      type: "object",
      properties: {
        relatorio_id: { type: "string" },
        texto: { type: "string" },
        modo: { type: "string", enum: ["acrescentar", "substituir"] },
        estrutura: {
          type: ["object", "null"],
          description: "Seções organizadas do texto final confirmado, ou null se for só um complemento curto.",
          properties: {
            sintese: { type: "string" },
            observacoes: { type: "array", items: { type: "object", properties: { area: { type: "string" }, texto: { type: "string" } }, required: ["area", "texto"], additionalProperties: false } },
            analise: { type: ["string", "null"] },
            encaminhamentos: { type: "array", items: { type: "string" } },
          },
          required: ["sintese", "observacoes", "analise", "encaminhamentos"],
          additionalProperties: false,
        },
      },
      required: ["relatorio_id", "texto", "modo", "estrutura"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "corrigir_relatorio",
    description:
      "Corrige os DADOS de um relatório de visita/técnico já salvo: cliente, fazenda, título, data ou tipo (o texto do relato é com complementar_relatorio). Use quando disserem 'o relatório de hoje era da Fazenda X', 'troca o cliente pra Y', 'a data certa é ontem', 'o nome saiu errado'. Passe null em tudo que não muda. Mostre o que vai mudar e confirme antes de chamar. Prévia só se pedirem.",
    parameters: {
      type: "object",
      properties: {
        relatorio_id: { type: "string" },
        cliente_id: {
          type: ["string", "null"],
          description: "Novo cliente (id via buscar_clientes), ou null pra manter.",
        },
        fazenda_id: {
          type: ["string", "null"],
          description:
            "Nova fazenda (id em 'fazendas' do cliente), 'sem_fazenda' pra tirar a fazenda, ou null pra manter. Ao trocar o cliente com null aqui: se o cliente novo tiver uma fazenda ela é usada; se tiver mais de uma a ferramenta devolve as opções pra você perguntar.",
        },
        titulo: {
          type: ["string", "null"],
          description: "Novo título (assunto do laudo), 'sem_titulo' pra apagar, ou null pra manter.",
        },
        data_visita: {
          type: ["string", "null"],
          description: "Nova data da visita no formato AAAA-MM-DD, ou null pra manter.",
        },
        tipo: {
          type: ["string", "null"],
          enum: ["visita", "tecnico", null],
          description: "Novo tipo, ou null pra manter.",
        },
        categoria: {
          type: ["string", "null"],
          enum: ["COMERCIAL", "TECNICA", "POS_VENDA", "RELACIONAMENTO", null],
          description:
            "Nova categoria da visita (COMERCIAL, TECNICA, POS_VENDA ou RELACIONAMENTO), ou null pra manter.",
        },
      },
      required: ["relatorio_id", "cliente_id", "fazenda_id", "titulo", "data_visita", "tipo", "categoria"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "enviar_pdf_despesas",
    description:
      "Gera e envia pelo WhatsApp o PDF do relatório de despesas (total, por categoria, lista detalhada) de um período. Ex: 'me manda minhas despesas de setembro' → data_inicio do dia 1 ao último dia do mês.",
    parameters: {
      type: "object",
      properties: {
        data_inicio: { type: ["string", "null"], description: "yyyy-mm-dd; null = desde o início da safra." },
        data_fim: { type: ["string", "null"], description: "yyyy-mm-dd; null = até hoje." },
        consultor_id: {
          type: ["string", "null"],
          description:
            "Só vale pro gestor: despesas de um consultor específico (id de listar_consultores). null = a própria pessoa (ou a equipe toda, se for gestor).",
        },
      },
      required: ["data_inicio", "data_fim", "consultor_id"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "enviar_relatorio_gerencial",
    description:
      "Gera e envia pelo WhatsApp o PDF gerencial de vendas da safra atual: pipeline, faturado x meta, status, culturas e evolução mensal.",
    parameters: {
      type: "object",
      properties: {
        consultor_id: {
          type: ["string", "null"],
          description:
            "Só vale pro gestor: relatório de um consultor específico. null = a própria carteira (ou a equipe toda, com ranking, se for gestor).",
        },
      },
      required: ["consultor_id"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "dados_despesas",
    description:
      "Soma as despesas de um período agrupadas (por categoria, dia, mês ou cliente) — os números pra montar um gráfico com enviar_grafico ou pra responder 'quanto gastei de combustível?'. Não envia nada.",
    parameters: {
      type: "object",
      properties: {
        agrupar_por: { type: "string", enum: ["categoria", "dia", "mes", "cliente"] },
        data_inicio: { type: ["string", "null"], description: "yyyy-mm-dd; null = começo do mês atual." },
        data_fim: { type: ["string", "null"], description: "yyyy-mm-dd; null = hoje." },
        consultor_id: {
          type: ["string", "null"],
          description:
            "Só vale pro gestor: despesas de um consultor específico (id de listar_consultores). null = a própria pessoa (ou a equipe toda, se for gestor).",
        },
      },
      required: ["agrupar_por", "data_inicio", "data_fim", "consultor_id"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "dados_vendas",
    description:
      "Soma as vendas da safra atual agrupadas (por produto, cliente, status ou mês de fechamento) — valor total e quantidade de cada grupo. Serve pra montar um gráfico com enviar_grafico. Não envia nada.",
    parameters: {
      type: "object",
      properties: {
        agrupar_por: { type: "string", enum: ["produto", "cliente", "status", "mes"] },
        status: {
          type: ["array", "null"],
          items: { type: "string", enum: ["PROSPECCAO", "NEGOCIACAO", "FECHADO", "EM_CARTEIRA", "FATURADO", "CANCELADO"] },
          description: "Filtra por status (ex: só FATURADO). null = todos menos CANCELADO.",
        },
        consultor_id: {
          type: ["string", "null"],
          description:
            "Só vale pro gestor: vendas de um consultor específico. null = a própria pessoa (ou a equipe toda, se for gestor).",
        },
      },
      required: ["agrupar_por", "status", "consultor_id"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "enviar_grafico",
    description:
      "Desenha um gráfico e envia no WhatsApp como IMAGEM (no visual da marca). Use quando pedirem um gráfico avulso: com números de dados_despesas / dados_vendas, ou com números que a pessoa ditou. Não salva em relatório nenhum.",
    parameters: {
      type: "object",
      properties: {
        titulo: { type: "string", description: "Ex: 'Despesas de setembro por categoria'." },
        subtitulo: { type: ["string", "null"], description: "Contexto curto (período, total, unidade). null se não precisar." },
        formato: {
          type: "string",
          enum: [...FORMATOS_GRAFICO],
          description:
            "barra = comparar grupos; barra_horizontal = ranking ou nomes compridos (produtos, clientes, talhões), muitas categorias; barra_empilhada = total por categoria dividido nas séries (ex.: despesa por mês e categoria); linha = evolução no tempo (dias, meses, avaliações); area = evolução com volume/acumulado; pizza = partes de um total (só 1 série, até 8 fatias); rosca = igual pizza, com o total no meio.",
        },
        series: {
          type: "array",
          items: { type: "string" },
          description: "Nome de cada série (1 a 6), ex: ['Valor (R$)'] ou ['Testemunha', 'Tratamento A']. Pizza: 1 série.",
        },
        linhas: {
          type: "array",
          description: "Cada categoria do eixo X (ou fatia da pizza) com um valor por série, na mesma ordem de series. Até 30.",
          items: {
            type: "object",
            properties: {
              rotulo: { type: "string" },
              valores: { type: "array", items: { type: ["number", "null"] } },
            },
            required: ["rotulo", "valores"],
            additionalProperties: false,
          },
        },
        cores: {
          type: ["array", "null"],
          items: { type: "string" },
          description: "Cores na ordem das séries (ou das fatias/barras na pizza e numa série só): nomes (verde, azul, azul marinho, vermelho, laranja, amarelo, roxo, cinza, marrom, turquesa...) ou #hex. null = paleta padrão.",
        },
        unidade: { type: ["string", "null"], description: "Unidade dos valores, ex: 'sc/ha', 'R$', 'mm', '%'. null se não tiver." },
        eixo_x: { type: ["string", "null"], description: "Nome do eixo X, ex: 'Tratamento'. null = sem nome." },
        eixo_y: { type: ["string", "null"], description: "Nome do eixo Y, ex: 'Produtividade (sc/ha)'. null = sem nome." },
        ordenar: { type: ["string", "null"], enum: ["maior_primeiro", "menor_primeiro", "alfabetica", null], description: "null = manter a ordem dada (use null em séries no tempo)." },
      },
      required: ["titulo", "subtitulo", "formato", "series", "linhas", "cores", "unidade", "eixo_x", "eixo_y", "ordenar"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "adicionar_grafico_ao_relatorio",
    description:
      "Anexa um gráfico a um relatório TÉCNICO já salvo (ensaio, comparação de tratamentos, produtividade por talhão etc.) — ele aparece no PDF, como o gráfico do editor do site. Os números vêm do que o consultor disse; nunca invente. Mostre a tabela (séries × categorias) e confirme antes de chamar.",
    parameters: {
      type: "object",
      properties: {
        relatorio_id: { type: "string" },
        titulo: { type: "string", description: "Ex: 'Produtividade por tratamento (sc/ha)'." },
        formato: { type: "string", enum: [...FORMATOS_GRAFICO] },
        series: { type: "array", items: { type: "string" } },
        linhas: {
          type: "array",
          items: {
            type: "object",
            properties: {
              rotulo: { type: "string" },
              valores: { type: "array", items: { type: ["number", "null"] } },
            },
            required: ["rotulo", "valores"],
            additionalProperties: false,
          },
        },
        cores: {
          type: ["array", "null"],
          items: { type: "string" },
          description: "Cores na ordem das séries (ou das fatias/barras na pizza e numa série só): nomes (verde, azul, azul marinho, vermelho, laranja, amarelo, roxo, cinza, marrom, turquesa...) ou #hex. null = paleta padrão.",
        },
        unidade: { type: ["string", "null"], description: "Unidade dos valores, ex: 'sc/ha', 'R$', 'mm', '%'. null se não tiver." },
        eixo_x: { type: ["string", "null"], description: "Nome do eixo X, ex: 'Tratamento'. null = sem nome." },
        eixo_y: { type: ["string", "null"], description: "Nome do eixo Y, ex: 'Produtividade (sc/ha)'. null = sem nome." },
        ordenar: { type: ["string", "null"], enum: ["maior_primeiro", "menor_primeiro", "alfabetica", null], description: "null = manter a ordem dada (use null em séries no tempo)." },
      },
      required: ["relatorio_id", "titulo", "formato", "series", "linhas", "cores", "unidade", "eixo_x", "eixo_y", "ordenar"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "previa_relatorio",
    description:
      "Manda no WhatsApp a(s) página(s) do relatório como IMAGEM (todas, ou só as que o consultor pedir: 'prévia da pág 4' → paginas [4]), exatamente como vão sair no PDF, pro consultor conferir antes de aprovar. Ele pode responder falando o que mudar ou rabiscar na imagem com o lápis do WhatsApp (circular, riscar, escrever) e devolver. Devolve também a lista numerada de itens da página.",
    parameters: {
      type: "object",
      properties: {
        relatorio_id: { type: "string" },
        paginas: { type: ["array", "null"], items: { type: "integer" }, description: "Páginas pedidas (1 = primeira). null = todas." },
      },
      required: ["relatorio_id", "paginas"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "ler_correcao_previa",
    description:
      "Lê a última imagem que o consultor mandou como prévia RABISCADA do relatório: diz quais itens ele circulou/riscou e o que escreveu à mão em cada um. Use quando chegar uma foto logo depois de previa_relatorio. Se a imagem não for a página (e_previa false), trate como foto comum.",
    parameters: {
      type: "object",
      properties: {
        relatorio_id: { type: "string" },
        comentario: { type: ["string", "null"], description: "O que o consultor falou junto da imagem (legenda/áudio), ou null." },
      },
      required: ["relatorio_id", "comentario"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "editar_item_relatorio",
    description:
      "Muda UM item do relatório pela numeração de previa_relatorio/ler_correcao_previa: 'texto' troca o texto (parágrafo, destaque ou legenda de foto) pelo texto novo COMPLETO; 'titulo' troca o título (gráfico, tabela, card); 'grafico' refaz o gráfico (formato, séries, linhas — só com números que o consultor deu; texto = título, ou null pra manter); 'remover' tira o item da página — numa FOTO, só quando o consultor pedir com todas as letras pra tirar/apagar a foto; 'texto explicativo', 'arruma a legenda', 'descreve a foto' é acao 'texto' (troca só a legenda e a foto fica). Marcação dentro de foto é com marcar_foto_relatorio. Prévia só se pedirem.",
    parameters: {
      type: "object",
      properties: {
        relatorio_id: { type: "string" },
        item_numero: { type: "integer" },
        acao: { type: "string", enum: ["texto", "titulo", "grafico", "tamanho", "remover"] },
        largura: {
          type: ["string", "null"],
          enum: ["terco", "metade", "inteira", null],
          description: "Só na acao 'tamanho' (foto, gráfico ou tabela): 'inteira' = largura toda da página ('foto grande', 'aumenta'); 'metade' = duas por linha; 'terco' = três por linha.",
        },
        proporcao: {
          type: ["string", "null"],
          enum: ["paisagem", "panoramica", "quadrada", "retrato", null],
          description: "Só pra FOTO na acao 'tamanho': formato do recorte. 'paisagem' = 16:9 (padrão); 'panoramica' = 21:9, mais baixa — use quando pedirem a foto na largura toda embaixo de outro item na mesma página (16:9 inteira ocupa quase uma folha e pula pra próxima); 'quadrada'; 'retrato'. null = manter. As marcações acompanham e o corte centraliza nelas.",
        },
        texto: { type: ["string", "null"], description: "Texto novo completo (acao 'texto') ou título novo (acao 'titulo' ou 'grafico')." },
        formato: { type: ["string", "null"], enum: [...FORMATOS_GRAFICO, null], description: "Só na acao 'grafico'." },
        series: { type: ["array", "null"], items: { type: "string" } },
        linhas: {
          type: ["array", "null"],
          items: {
            type: "object",
            properties: {
              rotulo: { type: "string" },
              valores: { type: "array", items: { type: ["number", "null"] } },
            },
            required: ["rotulo", "valores"],
            additionalProperties: false,
          },
        },
        cores: {
          type: ["array", "null"],
          items: { type: "string" },
          description: "Cores na ordem das séries (ou das fatias/barras na pizza e numa série só): nomes (verde, azul, azul marinho, vermelho, laranja, amarelo, roxo, cinza, marrom, turquesa...) ou #hex. null = paleta padrão.",
        },
        unidade: { type: ["string", "null"], description: "Unidade dos valores, ex: 'sc/ha', 'R$', 'mm', '%'. null se não tiver." },
        eixo_x: { type: ["string", "null"], description: "Nome do eixo X, ex: 'Tratamento'. null = sem nome." },
        eixo_y: { type: ["string", "null"], description: "Nome do eixo Y, ex: 'Produtividade (sc/ha)'. null = sem nome." },
        ordenar: { type: ["string", "null"], enum: ["maior_primeiro", "menor_primeiro", "alfabetica", null], description: "null = manter a ordem dada (use null em séries no tempo)." },
      },
      required: ["relatorio_id", "item_numero", "acao", "largura", "proporcao", "texto", "formato", "series", "linhas", "cores", "unidade", "eixo_x", "eixo_y", "ordenar"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "aprovar_relatorio",
    description:
      "Fecha a prévia e manda o PDF final. Use quando disserem que a prévia está boa ('pode aprovar', 'tá certo', 'fechou'). Gestor: fica APROVADO. Consultor: vai pra EM_REVISAO (o gestor aprova no site) — diga isso em uma linha.",
    parameters: {
      type: "object",
      properties: { relatorio_id: { type: "string" } },
      required: ["relatorio_id"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "contexto_cliente",
    description:
      "Antes de montar o relatório (ou quando perguntarem 'como tá o cliente X', 'o que ficou da última visita'): traz as últimas 5 visitas do cliente com o relato, os combinados pendentes (atrasados marcados), os trabalhos da safra e as vendas em aberto. Use pra escrever com continuidade ('na visita de 12/10 a ferrugem estava no início...') e cobrar o que ficou combinado. Chame assim que souber o cliente de uma visita nova.",
    parameters: {
      type: "object",
      properties: {
        cliente_id: { type: "string" },
        fazenda_id: { type: ["string", "null"] },
        relatorio_atual_id: { type: ["string", "null"], description: "Relatório que está sendo feito agora, pra não vir na lista de anteriores; null se ainda não existe." },
      },
      required: ["cliente_id", "fazenda_id", "relatorio_atual_id"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "registrar_combinado",
    description:
      "Registra algo que o consultor combinou na visita, pra lembrar no dia e cobrar na próxima ('volto quinta pra ver a aplicação', 'levar amostra de solo', 'mandar orçamento até sexta'). Pode registrar vários, um por chamada. Não precisa confirmar antes — diga numa linha o que registrou e a data.",
    parameters: {
      type: "object",
      properties: {
        cliente_id: { type: "string" },
        relatorio_id: { type: ["string", "null"] },
        texto: { type: "string", description: "Curto e acionável, ex: 'Voltar pra avaliar a aplicação de fungicida no talhão 3'." },
        data: { type: ["string", "null"], description: "Data prevista AAAA-MM-DD ('quinta' = a próxima quinta), ou null se não tiver data." },
      },
      required: ["cliente_id", "relatorio_id", "texto", "data"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "listar_combinados",
    description: "Combinados pendentes do consultor (ou de um cliente): 'o que eu tenho pra fazer essa semana?', 'o que ficou pendente com o cliente X?'.",
    parameters: {
      type: "object",
      properties: {
        cliente_id: { type: ["string", "null"] },
        ate: { type: ["string", "null"], description: "Só os previstos até esta data (AAAA-MM-DD); null = todos." },
      },
      required: ["cliente_id", "ate"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "concluir_combinado",
    description: "Dá baixa num combinado quando o consultor contar que fez (FEITO) ou que não vai mais fazer (CANCELADO). Use o combinado_id de contexto_cliente/listar_combinados.",
    parameters: {
      type: "object",
      properties: {
        combinado_id: { type: "string" },
        status: { type: "string", enum: ["FEITO", "CANCELADO"] },
      },
      required: ["combinado_id", "status"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "analisar_foto_campo",
    description:
      "Olha a última foto de campo que o consultor mandou e diz o que aparece e POSSÍVEIS problemas (doença, praga, deficiência), com o sinal visual e a confiança. Use quando chegar foto de lavoura sem explicação, ou quando perguntarem 'o que é isso?'. O resultado é SUGESTÃO: apresente como hipótese ('parece ferrugem — pústulas no verso da folha; confere no campo?'), nunca como diagnóstico, e só leve pro relatório o que o consultor confirmar. Ofereça marcar na foto (marcar_foto_relatorio).",
    parameters: {
      type: "object",
      properties: { contexto: { type: ["string", "null"], description: "O que o consultor disse junto (cultura, talhão), ou null." } },
      required: ["contexto"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "trazer_fotos_visita_anterior",
    description:
      "Copia fotos de um relatório anterior do mesmo cliente pro relatório atual, com a data na legenda — pra comparar antes e depois ('compara com a última visita', 'põe a foto da visita passada'). Use o relatorio_id de contexto_cliente (ultimas_visitas). Depois escreva o comparativo com editar/complementar.",
    parameters: {
      type: "object",
      properties: {
        relatorio_id: { type: "string", description: "Relatório atual (destino)." },
        relatorio_anterior_id: { type: "string" },
        fotos: { type: ["array", "null"], items: { type: "integer" }, description: "Números das fotos do anterior (1 = primeira); null = até 4 primeiras." },
      },
      required: ["relatorio_id", "relatorio_anterior_id", "fotos"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "desfazer_ultima_mudanca",
    description:
      "Desfaz a última mudança que o bot fez no relatório (texto, item, gráfico, capa, marcação de foto): 'volta como estava', 'desfaz', 'não, deixa como antes'. Cada chamada volta um passo. Prévia só se pedirem.",
    parameters: {
      type: "object",
      properties: { relatorio_id: { type: "string" } },
      required: ["relatorio_id"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "enviar_enquete",
    description:
      "Manda uma ENQUETE do WhatsApp pro consultor tocar e marcar/desmarcar (o voto volta como '[o consultor marcou na enquete: …]'). Use sempre que ele tiver de ESCOLHER entre opções: o que incluir no relatório (multipla true), qual parceiro, qual fazenda, categoria, tipo (multipla false). Até 12 opções curtas. Depois de mandar, responda só uma linha curta (ou nada além de 'Marca aí 👆'). No site (canal web) vira lista numerada.",
    parameters: {
      type: "object",
      properties: {
        pergunta: { type: "string" },
        opcoes: { type: "array", items: { type: "string" } },
        multipla: { type: "boolean", description: "true = pode marcar várias (o que incluir); false = só uma (qual parceiro, qual fazenda)." },
      },
      required: ["pergunta", "opcoes", "multipla"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "vincular_trabalho",
    description:
      "Liga o relatório a um TRABALHO da safra (ensaio, área demonstrativa, vitrine, dia de campo — ids em contexto_cliente → trabalhos_da_safra). O relatório vira técnico e a capa passa a ser a do trabalho: sem subtítulo, com as visitas técnicas e as datas; copia a logo do programa e o parceiro do relatório anterior do mesmo trabalho. Se vier tem_parceiro false, ofereça o parceiro na enquete do relatório.",
    parameters: {
      type: "object",
      properties: { relatorio_id: { type: "string" }, trabalho_id: { type: "string" } },
      required: ["relatorio_id", "trabalho_id"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "listar_logos",
    description:
      "Lista as logos já cadastradas na biblioteca da empresa (nome e logo_id). Pra ele escolher, use os nomes numa enviar_enquete (escolha única). mostrar_imagem true só se ele pedir pra VER as logos.",
    parameters: {
      type: "object",
      properties: { mostrar_imagem: { type: "boolean" } },
      required: ["mostrar_imagem"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "definir_logo_relatorio",
    description:
      "Troca a logo de um relatório. posicao 'cabecalho' = logo da esquerda (capa e topo das páginas); 'rodape' = logo do rodapé das páginas (também aparece no canto direito da capa). Origem: logo_id da biblioteca (listar_logos) OU usar_imagem_enviada true pra usar a última imagem que o consultor mandou ('usa esta logomarca no rodapé') — ela também fica salva na biblioteca. remover true volta ao padrão (logo da empresa). Prévia só se pedirem.",
    parameters: {
      type: "object",
      properties: {
        relatorio_id: { type: "string" },
        posicao: { type: "string", enum: ["cabecalho", "rodape"] },
        logo_id: { type: ["string", "null"] },
        usar_imagem_enviada: { type: "boolean" },
        nome_logo: { type: ["string", "null"], description: "Nome pra salvar na biblioteca quando usar a imagem enviada (ex: 'Koppert')." },
        rotulo: { type: ["string", "null"], description: "Só no rodapé: texto acima da logo, ex: 'Em parceria com'. null = sem texto." },
        remover: { type: "boolean" },
      },
      required: ["relatorio_id", "posicao", "logo_id", "usar_imagem_enviada", "nome_logo", "rotulo", "remover"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "ajustar_capa_relatorio",
    description:
      "Muda a capa do relatório (por padrão ela sai SEM foto): 'sem_foto' tira a foto da capa (a capa fica só com título/dados; as fotos continuam no corpo); 'foto' põe a foto foto_numero na capa (1 = primeira); 'sem_capa' tira a página de capa inteira (começa direto no conteúdo); 'com_capa' volta a capa. Use pra 'sem foto na capa', 'tira a foto da capa', 'põe a foto 3 na capa', 'sem capa'. Prévia só se pedirem.",
    parameters: {
      type: "object",
      properties: {
        relatorio_id: { type: "string" },
        acao: { type: "string", enum: ["sem_foto", "foto", "sem_capa", "com_capa"] },
        foto_numero: { type: ["integer", "null"], description: "Só na acao 'foto'." },
      },
      required: ["relatorio_id", "acao", "foto_numero"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "marcar_foto_relatorio",
    description:
      "Desenha marcações numa foto já anexada a um relatório — círculo, retângulo, seta, linha, texto ou ETIQUETA (texto em destaque sobre tarja colorida) — e grava. Com mostrar=true (só quando o consultor pediu pra ver) manda a foto marcada. Ex.: 'circula a ferrugem na foto 2 e escreve Ferrugem asiática', 'põe uma etiqueta Testemunha em cima da foto 1', 'seta apontando a lagarta'. Com 'instrucao', a IA de imagem acha o alvo na foto sozinha. Pra AJUSTAR o que já foi marcado ('mais pra esquerda', 'troca pra amarelo', 'aumenta o círculo', 'tira a seta'), passe 'marcacoes' com a lista completa já corrigida, partindo das 'marcacoes' que esta ferramenta devolveu (coordenadas em % da imagem: 0 = esquerda/topo, 100 = direita/base). Grava direto e o consultor confere na prévia; pra desfazer use modo 'limpar'.",
    parameters: {
      type: "object",
      properties: {
        relatorio_id: { type: "string" },
        foto_numero: {
          type: ["integer", "null"],
          description: "Posição da foto no relatório (1 = primeira). null = a última foto anexada.",
        },
        modo: {
          type: "string",
          enum: ["acrescentar", "substituir", "limpar"],
          description: "'acrescentar' soma às marcações que a foto já tem; 'substituir' troca todas pelas novas (use ao ajustar com 'marcacoes'); 'limpar' apaga todas.",
        },
        instrucao: {
          type: ["string", "null"],
          description: "O que marcar e escrever, nas palavras do consultor, com o texto exato entre aspas (ex: \"circular as lesões de ferrugem em vermelho e etiqueta 'Ferrugem asiática – terço médio'\"). null quando vier 'marcacoes' ou no modo 'limpar'.",
        },
        mostrar: { type: "boolean", description: "true só se o consultor pediu pra ver a foto marcada." },
        usar_referencia: {
          type: "boolean",
          description: "true quando o consultor mandou uma FOTO RABISCADA (círculo/seta à mão) pra mostrar onde marcar: as marcas dela são copiadas como marcações limpas na foto do relatório (a rabiscada não entra no relatório).",
        },
        marcacoes: {
          type: ["array", "null"],
          description: "Lista explícita de marcações (em % da IMAGEM), pra ajustes. null quando usar 'instrucao'.",
          items: {
            type: "object",
            properties: {
              forma: { type: "string", enum: ["elipse", "retangulo", "seta", "linha", "texto", "etiqueta"] },
              x1: { type: "number" }, y1: { type: "number" }, x2: { type: "number" }, y2: { type: "number" },
              cor: { type: "string", enum: ["vermelho", "amarelo", "verde", "azul", "branco", "preto"] },
              espessura: { type: "string", enum: ["fina", "media", "grossa"] },
              texto: { type: ["string", "null"] },
            },
            required: ["forma", "x1", "y1", "x2", "y2", "cor", "espessura", "texto"],
            additionalProperties: false,
          },
        },
      },
      required: ["relatorio_id", "foto_numero", "modo", "instrucao", "marcacoes", "mostrar", "usar_referencia"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "adicionar_clima_ao_relatorio",
    description:
      "Põe no relatório TÉCNICO um gráfico da chuva na fazenda: ano atual mês a mês contra a média dos últimos 5 anos (dados de satélite), já com título e cores. Use quando pedirem 'põe a chuva no relatório', 'coloca o clima', ou ofereça quando o relato falar de seca, excesso de chuva, estresse hídrico ou janela de aplicação. Devolve acumulado e desvio % pra você citar no texto se o consultor quiser.",
    parameters: {
      type: "object",
      properties: { relatorio_id: { type: "string" } },
      required: ["relatorio_id"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "definir_modo_resposta",
    description:
      "Muda como o bot responde pra essa pessoa: 'espelhar' (áudio quando ela manda áudio, texto quando manda texto — o padrão), 'audio' (sempre mensagem de voz) ou 'texto' (nunca voz). Use quando pedir 'me responde em áudio', 'para de mandar áudio', 'só texto' etc.",
    parameters: {
      type: "object",
      properties: { modo: { type: "string", enum: ["espelhar", "audio", "texto"] } },
      required: ["modo"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "historico_chuva",
    description:
      "Manda uma foto com gráfico de chuva de uma cidade OU da fazenda de um cliente (pela localização cadastrada). modo 'mensal' (padrão): ano atual mês a mês contra a média dos últimos 5 anos, com acumulado e desvio %. modo 'anual': total de cada um dos últimos 5 anos. Use pra 'quanto choveu', 'histórico de chuva', 'tá chovendo abaixo da média?', 'chuva na Fazenda X'. Devolve os números pra você comentar como um agrônomo (acima/abaixo da média, meses secos).",
    parameters: {
      type: "object",
      properties: {
        cidade: {
          type: ["string", "null"],
          description:
            "Nome da cidade, com estado se souber (ex.: 'Luís Eduardo Magalhães, BA'). null quando vier fazenda_id ou cliente_id.",
        },
        cliente_id: { type: ["string", "null"], description: "Cliente (de buscar_clientes): usa a localização da fazenda/cliente. null se for por cidade." },
        fazenda_id: { type: ["string", "null"], description: "Fazenda específica do cliente, ou null." },
        modo: { type: "string", enum: ["mensal", "anual"] },
      },
      required: ["cidade", "cliente_id", "fazenda_id", "modo"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "previsao_tempo",
    description:
      "Manda uma foto com a previsão dos próximos 15 dias (chuva por dia em barras, máxima e mínima em linhas, dia mais chuvoso em destaque) de uma cidade OU da fazenda de um cliente. Use pra 'previsão do tempo', 'vai chover essa semana', 'dá pra aplicar na quinta na Fazenda X?'. Devolve os dias pra você responder a pergunta de verdade (janela sem chuva pra aplicação, chuva acumulada etc.).",
    parameters: {
      type: "object",
      properties: {
        cidade: {
          type: ["string", "null"],
          description:
            "Nome da cidade, com estado se souber (ex.: 'Luís Eduardo Magalhães, BA'). null quando vier fazenda_id ou cliente_id.",
        },
        cliente_id: { type: ["string", "null"], description: "Cliente (de buscar_clientes): usa a localização da fazenda/cliente. null se for por cidade." },
        fazenda_id: { type: ["string", "null"], description: "Fazenda específica do cliente, ou null." },
      },
      required: ["cidade", "cliente_id", "fazenda_id"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "cotacao_agricola",
    description:
      `Manda o preço do dia de um produto agrícola/pecuário (indicador CEPEA/ESALQ). Produtos disponíveis: ${PRODUTOS_COTACAO.map((p) => p.nome).join(", ")}. Use quando pedirem 'cotação da soja', 'preço do milho hoje', 'quanto tá o boi gordo' e afins. Sorgo e milheto não têm indicador no CEPEA — avise que não tem essa cotação.`,
    parameters: {
      type: "object",
      properties: {
        produto: {
          type: "string",
          description: "Nome do produto, ex.: 'soja', 'milho', 'algodão', 'boi gordo'.",
        },
      },
      required: ["produto"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "historico_cotacao",
    description:
      "Manda uma foto com um gráfico da média de preço de cada um dos últimos anos (padrão 10) de um produto agrícola (indicador CEPEA/ESALQ). Use quando pedirem 'histórico de preço da soja', 'média do preço do milho nos últimos 10 anos' e afins. Por enquanto só tenho a série histórica da soja — pra outros produtos, avise que ainda não tenho.",
    parameters: {
      type: "object",
      properties: {
        produto: { type: "string", description: "Nome do produto, ex.: 'soja'." },
        anos: { type: ["number", "null"], description: "Quantos anos. null = 10." },
      },
      required: ["produto", "anos"],
      additionalProperties: false,
    },
  },
  { type: "web_search" },
] as const;

// Ferramentas extras do gestor (role ADMIN): enxergar a equipe inteira.
const FERRAMENTAS_GESTOR = [
  {
    type: "function",
    name: "listar_consultores",
    description: "Lista os consultores ativos (id e nome), pra usar o id nas outras ferramentas.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    type: "function",
    name: "listar_margens_pendentes",
    description:
      "Lista os PEDIDOS (PED-xxxxx) fechados com margem abaixo de 27% que aguardam aprovação do gestor. Use quando o gestor perguntar 'o que tá pendente de margem?' ou não lembrar o número do pedido antes de aprovar_margem/recusar_margem.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    type: "function",
    name: "aprovar_margem",
    description:
      "Aprova a margem de um PEDIDO (PED-xxxxx) que estava aguardando aprovação do gestor — libera o pedido pra seguir (assinatura, se ainda não foi enviada). Use quando o gestor confirmar algo como 'aprova o PED-00123' ou 'pode aprovar'. id vem de listar_margens_pendentes, buscar_por_numero ou da própria notificação recebida.",
    parameters: {
      type: "object",
      properties: { pedido_id: { type: ["string", "null"] }, numero: { type: ["string", "null"], description: "PED-xxxxx, se pedido_id não vier." } },
      required: ["pedido_id", "numero"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "recusar_margem",
    description:
      "Recusa a margem de um PEDIDO (PED-xxxxx) que estava aguardando aprovação do gestor, com motivo obrigatório. Use quando o gestor disser algo como 'recusa o PED-00123, preço baixo demais'. id vem de listar_margens_pendentes, buscar_por_numero ou da própria notificação recebida.",
    parameters: {
      type: "object",
      properties: {
        pedido_id: { type: ["string", "null"] },
        numero: { type: ["string", "null"], description: "PED-xxxxx, se pedido_id não vier." },
        motivo: { type: "string" },
      },
      required: ["pedido_id", "numero", "motivo"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "listar_visitas_equipe",
    description:
      "Visitas da equipe num período, com consultor, cliente, horários de chegada/saída, KM rodado e se tem relato. Use pra 'quem visitou hoje?', 'o que o João fez essa semana?'. Os ids servem pra enviar_pdf_relatorio_visita.",
    parameters: {
      type: "object",
      properties: {
        data_inicio: { type: ["string", "null"], description: "yyyy-mm-dd; null = hoje." },
        data_fim: { type: ["string", "null"], description: "yyyy-mm-dd; null = mesmo dia de data_inicio." },
        consultor_id: { type: ["string", "null"], description: "null = todos." },
      },
      required: ["data_inicio", "data_fim", "consultor_id"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "ler_embalagem_produto",
    description:
      "Lê a última foto enviada como embalagem/rótulo de produto e devolve nome, fornecedor sugerido, ingrediente ativo e embalagem. Não salva nada — use cadastrar_produto depois de confirmar com o gestor.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    type: "function",
    name: "cadastrar_fornecedor",
    description:
      "Cadastra um novo fornecedor/fabricante. Se já existir um com esse nome, devolve o existente em vez de duplicar. Use antes de cadastrar_produto quando o fornecedor ainda não existe.",
    parameters: {
      type: "object",
      properties: { nome: { type: "string" } },
      required: ["nome"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "cadastrar_produto",
    description:
      "Cadastra um novo produto vinculado a um fornecedor já existente (pelo nome — não precisa do id). Se o fornecedor não for encontrado, devolve sugestoes_parecidas ou erro:'fornecedor_ambiguo' — nesses casos confirme com o gestor ou use cadastrar_fornecedor antes de tentar de novo. Chame só depois que o gestor confirmar os dados (ex.: depois de ler_embalagem_produto ou de ele ditar os dados). NCM/CFOP não entram aqui — use atualizar_ncm_cfop depois, se o gestor já tiver esses códigos; senão, avise que ficam pendentes pra preencher na Web (Produtos > Editar) antes de emitir NF-e desse produto.",
    parameters: {
      type: "object",
      properties: {
        nome: { type: "string" },
        fornecedor_nome: { type: "string" },
        ingrediente_ativo: { type: ["string", "null"] },
        embalagem: { type: ["string", "null"] },
      },
      required: ["nome", "fornecedor_nome", "ingrediente_ativo", "embalagem"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "atualizar_ncm_cfop",
    description:
      "Define o NCM e/ou CFOP de um produto já cadastrado (exigidos pra emitir NF-e via Focus NFe). Se produto_id vier de cadastrar_produto na mesma conversa, use ele direto; senão informe produto_nome (e fornecedor_nome se souber, pra desambiguar) — NÃO use buscar_produtos pra achar o id aqui, porque produto recém-cadastrado ainda não tem preço e não aparece lá. Se vier ambiguo:true, pergunte qual produto (lista) antes de repetir a chamada com fornecedor_nome. Nunca invente o código — só grave o que o gestor ditar.",
    parameters: {
      type: "object",
      properties: {
        produto_id: { type: ["string", "null"] },
        produto_nome: { type: ["string", "null"], description: "Obrigatório se produto_id não vier." },
        fornecedor_nome: { type: ["string", "null"], description: "Ajuda a desambiguar quando há mais de um produto com nome parecido." },
        ncm: { type: ["string", "null"], description: "8 dígitos." },
        cfop: { type: ["string", "null"], description: "4 dígitos." },
      },
      required: ["produto_id", "produto_nome", "fornecedor_nome", "ncm", "cfop"],
      additionalProperties: false,
    },
  },
] as const;

// Ferramentas que dependem de mídia recebida pelo WhatsApp (foto, localização,
// modo áudio): ficam de fora do assistente do site, por enquanto.
const SO_WHATSAPP = new Set([
  "buscar_cliente_por_localizacao",
  "anexar_foto_ao_relatorio",
  "ler_nota_fiscal",
  "definir_modo_resposta",
  "ler_embalagem_produto",
]);

// Ferramentas de cada módulo contratado (src/lib/modulos.ts); as demais
// (clientes, produtos, clima, cotações...) valem para qualquer empresa.
const MODULO_DA_FERRAMENTA: Record<string, Modulo> = {
  cadastrar_fornecedor: "CADASTROS",
  cadastrar_produto: "ESTOQUE",
  atualizar_ncm_cfop: "ESTOQUE",
  atualizar_cadastro_cliente: "CADASTROS",
  resumo_vendas: "VENDAS",
  abrir_venda: "VENDAS",
  dados_vendas: "VENDAS",
  criar_orcamento: "VENDAS",
  meus_orcamentos: "VENDAS",
  meus_pedidos: "VENDAS",
  detalhar_orcamento: "VENDAS",
  fechar_negocio_orcamento: "VENDAS",
  enviar_pdf_orcamento: "VENDAS",
  pedidos_aguardando_assinatura: "VENDAS",
  checar_pedido_para_assinatura: "VENDAS",
  enviar_pedido_para_assinatura: "VENDAS",
  link_assinatura_pedido: "VENDAS",
  listar_margens_pendentes: "VENDAS",
  aprovar_margem: "VENDAS",
  recusar_margem: "VENDAS",
  ler_nota_fiscal: "DESPESAS",
  lancar_despesa: "DESPESAS",
  enviar_pdf_despesas: "DESPESAS",
  dados_despesas: "DESPESAS",
  enviar_nf_boleto: "ERP",
  criar_relatorio_visita: "VISITAS",
  abrir_visita_fazenda: "VISITAS",
  fechar_visita_fazenda: "VISITAS",
  visita_aberta_atual: "VISITAS",
  anexar_foto_ao_relatorio: "VISITAS",
  marcar_foto_relatorio: "VISITAS",
  previa_relatorio: "VISITAS",
  ler_correcao_previa: "VISITAS",
  editar_item_relatorio: "VISITAS",
  aprovar_relatorio: "VISITAS",
  ajustar_capa_relatorio: "VISITAS",
  listar_logos: "VISITAS",
  vincular_trabalho: "VISITAS",
  enviar_enquete: "VISITAS",
  definir_logo_relatorio: "VISITAS",
  contexto_cliente: "VISITAS",
  registrar_combinado: "VISITAS",
  listar_combinados: "VISITAS",
  concluir_combinado: "VISITAS",
  analisar_foto_campo: "VISITAS",
  trazer_fotos_visita_anterior: "VISITAS",
  desfazer_ultima_mudanca: "VISITAS",
  adicionar_clima_ao_relatorio: "VISITAS",
  enviar_pdf_relatorio_visita: "VISITAS",
  complementar_relatorio: "VISITAS",
  corrigir_relatorio: "VISITAS",
  listar_visitas_equipe: "VISITAS",
};

export function ferramentasPara(role: ContextoFerramenta["role"], canal: "web" | undefined, modulos: Modulo[]) {
  const todas = role === "ADMIN" ? [...DEFINICOES_FERRAMENTAS, ...FERRAMENTAS_GESTOR] : [...DEFINICOES_FERRAMENTAS];
  return todas.filter((f) => {
    if (!("name" in f)) return true;
    if (canal === "web" && SO_WHATSAPP.has(f.name)) return false;
    const modulo = MODULO_DA_FERRAMENTA[f.name];
    return !modulo || modulos.includes(modulo);
  });
}

type Resultado = Record<string, unknown>;

// NotaFiscal/Boleto guardam só a URL do PDF (Supabase Storage) — baixa os
// bytes pra mandar como documento pelo WhatsApp (ver enviar_nf_boleto).
async function baixarArquivoDeUrl(url: string): Promise<Buffer | null> {
  try {
    const resposta = await fetch(url);
    if (!resposta.ok) return null;
    return Buffer.from(await resposta.arrayBuffer());
  } catch (error) {
    console.error("[whatsapp/ferramentas] Falha ao baixar arquivo:", error);
    return null;
  }
}

async function baixarUltimaFoto(ctx: ContextoFerramenta) {
  const ref = ctx.fotosPendentes.at(-1)?.ref ?? ctx.ultimaMidia;
  if (!ref) return null;
  return baixarMidia(ref);
}

// Onde buscar o clima: fazenda/cliente com coordenada cadastrada, ou a cidade
// (do argumento, ou a do cadastro do cliente quando ele não tem coordenada).
async function localDoClima(
  argumentos: Record<string, unknown>,
  ctx: ContextoFerramenta
): Promise<{ latitude: number; longitude: number; nomeExibicao: string } | { erro: string }> {
  const fazendaId = argumentos.fazenda_id ? String(argumentos.fazenda_id) : null;
  const clienteId = argumentos.cliente_id ? String(argumentos.cliente_id) : null;
  let cidade = String(argumentos.cidade ?? "").trim();
  if (fazendaId || clienteId) {
    const fazenda = fazendaId
      ? await prisma.fazenda.findUnique({
          where: { id: fazendaId },
          select: { nome: true, latitude: true, longitude: true, cliente: { select: { consultorId: true } } },
        })
      : null;
    if (fazenda && !podeAcessar(fazenda.cliente.consultorId ?? "", ctx)) return { erro: "Esse cliente não é seu." };
    if (fazenda?.latitude != null && fazenda.longitude != null) {
      return { latitude: fazenda.latitude, longitude: fazenda.longitude, nomeExibicao: fazenda.nome };
    }
    if (clienteId) {
      const cliente = await prisma.cliente.findUnique({
        where: { id: clienteId },
        select: { nome: true, consultorId: true, latitude: true, longitude: true, cidade: true, uf: true },
      });
      if (!cliente) return { erro: "Cliente não encontrado." };
      if (!podeAcessar(cliente.consultorId ?? "", ctx)) return { erro: "Esse cliente não é seu." };
      if (cliente.latitude != null && cliente.longitude != null) {
        return { latitude: cliente.latitude, longitude: cliente.longitude, nomeExibicao: cliente.nome };
      }
      if (!cidade && cliente.cidade) cidade = [cliente.cidade, cliente.uf].filter(Boolean).join(", ");
    }
    if (!cidade) return { erro: "Esse cliente não tem localização nem cidade no cadastro. Pergunte a cidade." };
  }
  if (!cidade) return { erro: "Informe a cidade ou o cliente." };
  const local = await geocodificarCidade(cidade);
  return local ?? { erro: `Não encontrei a cidade "${cidade}".` };
}

// Bloco de foto que está no item `numero` da página (numeração da prévia), ou null.
async function itensComFoto(relatorioId: string, numero: number): Promise<BlocoFotoTipo | null> {
  const relatorio = await prisma.relatorioVisita.findUnique({
    where: { id: relatorioId },
    select: { texto: true, conteudo: true, fotos: { select: { url: true, path: true, legenda: true }, orderBy: { ordem: "asc" } } },
  });
  if (!relatorio) return null;
  const bloco = lerConteudo(relatorio.conteudo, relatorio.texto, relatorio.fotos)[numero - 1];
  return bloco?.tipo === "foto" ? bloco : null;
}

// Consultor só mexe no que é dele; gestor (ADMIN) enxerga a equipe toda.
function podeAcessar(consultorDono: string, ctx: ContextoFerramenta): boolean {
  return ctx.role === "ADMIN" || consultorDono === ctx.consultorId;
}

// De quem são os dados de um relatório pedido pelo WhatsApp: o gestor pode
// escolher um consultor (ou a equipe toda, undefined); o consultor, só ele.
function consultorAlvo(
  argumentos: Record<string, unknown>,
  ctx: ContextoFerramenta
): string | undefined {
  if (ctx.role !== "ADMIN") return ctx.consultorId;
  return argumentos.consultor_id ? String(argumentos.consultor_id) : undefined;
}

function dataIso(valor: unknown): string | undefined {
  const texto = valor ? String(valor).trim() : "";
  return /^\d{4}-\d{2}-\d{2}$/.test(texto) ? texto : undefined;
}

// Janela aceita pra horário vindo de mensagem offline: o consultor pode ter
// ficado dias sem sinal, mas não semanas — e nunca no futuro.
const MAX_ATRASO_OFFLINE_MS = 15 * 24 * 60 * 60 * 1000;

function dentroDaJanela(data: Date): boolean {
  const agora = Date.now();
  const t = data.getTime();
  return !Number.isNaN(t) && t <= agora + 5 * 60 * 1000 && agora - t <= MAX_ATRASO_OFFLINE_MS;
}

// "yyyy-mm-dd HH:MM" (Brasília) → instante. Inválido ou fora da janela = undefined (vale agora).
function instanteBrasilia(valor: unknown): Date | undefined {
  const m = (valor ? String(valor).trim() : "").match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}):(\d{2})/);
  if (!m) return undefined;
  const data = new Date(`${m[1]}T${m[2]}:${m[3]}:00-03:00`);
  if (!dentroDaJanela(data)) return undefined;
  return data.getTime() > Date.now() ? new Date() : data;
}

// Dia da visita offline; hoje (undefined) se não vier ou for inválido.
function diaDaVisita(valor: unknown): Date | undefined {
  const iso = dataIso(valor);
  if (!iso || iso === hojeBrasilia()) return undefined;
  const data = new Date(`${iso}T12:00:00-03:00`);
  return dentroDaJanela(data) ? data : undefined;
}

function hojeBrasilia(): string {
  // en-CA formata como yyyy-mm-dd.
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

// Valida o gráfico que o agente montou, no mesmo formato do bloco do editor.
type DadosGrafico = Pick<BlocoGrafico, "formato" | "series" | "linhas" | "unidade" | "eixoX" | "eixoY" | "cores">;

const CORES_GRAFICO_POR_NOME: Record<string, string> = {
  verde: "#16a34a", "verde claro": "#4ade80", azul: "#2563eb", "azul claro": "#60a5fa", "azul marinho": "#1e3a8a",
  vermelho: "#dc2626", laranja: "#f97316", amarelo: "#eab308", roxo: "#7c3aed", rosa: "#db2777",
  cinza: "#6b7280", preto: "#111827", marrom: "#92400e", turquesa: "#0d9488",
};

function corDoGrafico(valor: unknown): string | null {
  const texto = String(valor ?? "").trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(texto)) return texto;
  return CORES_GRAFICO_POR_NOME[texto] ?? null;
}

// Ajustes visuais pedidos ("melhora", "põe em verde", "ordena do maior pro
// menor", "mostra em sc/ha"): mesmos campos que o editor do site grava.
function estiloDoGrafico(argumentos: Record<string, unknown>, dados: Pick<BlocoGrafico, "series" | "linhas">) {
  const texto = (v: unknown, max: number) => (v == null ? undefined : String(v).trim().slice(0, max) || undefined);
  const cores = Array.isArray(argumentos.cores)
    ? argumentos.cores.map(corDoGrafico).filter((c): c is string => Boolean(c)).slice(0, 60)
    : [];
  let linhas = dados.linhas;
  const ordem = String(argumentos.ordenar ?? "");
  const total = (l: { valores: (number | null)[] }) => l.valores.reduce<number>((a, v) => a + (v ?? 0), 0);
  if (ordem === "maior_primeiro") linhas = [...linhas].sort((a, b) => total(b) - total(a));
  else if (ordem === "menor_primeiro") linhas = [...linhas].sort((a, b) => total(a) - total(b));
  else if (ordem === "alfabetica") linhas = [...linhas].sort((a, b) => a.rotulo.localeCompare(b.rotulo, "pt-BR"));
  return {
    linhas,
    unidade: texto(argumentos.unidade, 20),
    eixoX: texto(argumentos.eixo_x, 40),
    eixoY: texto(argumentos.eixo_y, 40),
    cores: cores.length ? cores : undefined,
  };
}

function graficoDosArgumentos(
  argumentos: Record<string, unknown>
): DadosGrafico | { erro: string } {
  const formato = String(argumentos.formato ?? "barra") as FormatoGrafico;
  if (!(FORMATOS_GRAFICO as readonly string[]).includes(formato)) return { erro: "Formato de gráfico inválido." };
  const series = (Array.isArray(argumentos.series) ? argumentos.series : [])
    .map((serie) => String(serie ?? "").trim())
    .slice(0, usaSerieUnica(formato) ? 1 : 6);
  if (series.length === 0) series.push("Valor");
  const linhasBrutas = Array.isArray(argumentos.linhas) ? argumentos.linhas : [];
  if (linhasBrutas.length === 0) return { erro: "O gráfico precisa de pelo menos uma linha de dados." };
  if (linhasBrutas.length > 30) {
    return { erro: "Gráfico com mais de 30 itens fica ilegível — agrupe ou corte os menores." };
  }
  const linhas = linhasBrutas.map((bruta) => {
    const linha = (bruta ?? {}) as { rotulo?: unknown; valores?: unknown };
    const valores = Array.isArray(linha.valores) ? linha.valores : [];
    return {
      rotulo: String(linha.rotulo ?? "").trim(),
      // Um valor por série: completa com null ou corta o que sobrar.
      valores: series.map((_, i) => {
        const v = Number(valores[i]);
        return valores[i] == null || !Number.isFinite(v) ? null : v;
      }),
    };
  });
  if (linhas.every((l) => l.valores.every((v) => v === null))) {
    return { erro: "O gráfico está sem nenhum número." };
  }
  return { formato, series, ...estiloDoGrafico(argumentos, { series, linhas }) };
}

function somarPorGrupo<T>(
  itens: T[],
  chave: (item: T) => string,
  valor: (item: T) => number
): { rotulo: string; valor: number; quantidade: number }[] {
  const grupos = new Map<string, { valor: number; quantidade: number }>();
  for (const item of itens) {
    const k = chave(item);
    const g = grupos.get(k) ?? { valor: 0, quantidade: 0 };
    g.valor += valor(item);
    g.quantidade += 1;
    grupos.set(k, g);
  }
  return [...grupos].map(([rotulo, g]) => ({
    rotulo,
    valor: arredondar(g.valor),
    quantidade: g.quantidade,
  }));
}

function arredondar(v: number): number {
  return Math.round(v * 100) / 100;
}

function diaMesBrasilia(d: Date): string {
  return d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" });
}

// "set/26"
function mesAnoBrasilia(d: Date): string {
  const mes = d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", month: "short" }).replace(".", "");
  const ano = d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", year: "2-digit" });
  return `${mes}/${ano}`;
}

function nomeArquivoSeguro(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

// PDF do relatório (o mesmo da página web), sem enviar — usado pelo envio do
// PDF e pela prévia em imagem (previa_relatorio).
async function montarPdfVisita(
  relatorioId: string,
  ctx: ContextoFerramenta,
  opcoes: { numerar?: boolean } = {}
): Promise<{ erro: string } | { pdf: Uint8Array; cliente: string; tecnico: boolean }> {
  const relatorio = await prisma.relatorioVisita.findUnique({
    where: { id: relatorioId },
    include: {
      cliente: { select: { nome: true, latitude: true, longitude: true } },
      fazenda: { select: { nome: true, latitude: true, longitude: true } },
      consultor: { select: { nome: true } },
      safra: { select: { nome: true } },
      fotos: { orderBy: { ordem: "asc" } },
    },
  });
  if (!relatorio) return { erro: "Relatório não encontrado." };
  if (!podeAcessar(relatorio.consultorId, ctx)) {
    return { erro: "Esse relatório não é seu." };
  }

  // PDF impresso da própria página (idêntico ao que o consultor vê no site);
  // gerador interno só como reserva.
  const pdf = await pdfIdenticoAPagina(relatorio.id, async () => {
    const blocos = lerConteudo(relatorio.conteudo, relatorio.texto, relatorio.fotos);
    return gerarPdfRelatorioVisita({
      tipo: tipoEfetivoRelatorio(relatorio.tipo, blocos),
      clienteNome: relatorio.cliente.nome,
      fazendaNome: relatorio.fazenda?.nome ?? null,
      consultorNome: relatorio.consultor.nome,
      titulo: relatorio.titulo,
      dataVisita: relatorio.dataVisita,
      safraNome: relatorio.safra.nome,
      blocos,
      logoParceiroUrl: await urlLogoParceiro(relatorio.logoParceiroPath),
      mostrarLocalizacao: relatorio.mostrarLocalizacao,
      mostrarHorarios: relatorio.mostrarHorarios,
      semCapa: relatorio.semCapa,
      orientacao: orientacaoDe(relatorio.orientacao),
      escalaLogoPrincipal: relatorio.escalaLogoPrincipal,
      logoPrincipalTexto: relatorio.logoPrincipalTexto,
      escalaLogoPrincipalPaginas: relatorio.escalaLogoPrincipalPaginas,
      escalaLogoParceiro: relatorio.escalaLogoParceiro,
      escalaLogoParceiroPaginas: relatorio.escalaLogoParceiroPaginas,
      logoParceiroRotulo: relatorio.logoParceiroRotulo,
      logoPrincipalUrl: await urlLogoParceiro(relatorio.logoPrincipalPath),
      rastreamento: {
        finalidade: relatorio.finalidade,
        horaChegada: relatorio.horaChegada,
        horaSaida: relatorio.horaSaida,
        kmChegada: relatorio.kmChegada,
        kmSaida: relatorio.kmSaida,
        ...coordenadasDoRelatorio(relatorio),
      },
    });
  }, opcoes);

  return { pdf, cliente: relatorio.cliente.nome, tecnico: relatorio.tipo === "TECNICO" };
}

async function enviarPdfVisita(relatorioId: string, ctx: ContextoFerramenta): Promise<Resultado> {
  const montado = await montarPdfVisita(relatorioId, ctx);
  if ("erro" in montado) return montado;
  const tipo = montado.tecnico ? "Relatório técnico" : "Relatório de visita";
  await entregarDocumento(ctx, Buffer.from(montado.pdf),
    `relatorio-${nomeArquivoSeguro(montado.cliente)}.pdf`,
    "application/pdf",
    `${tipo} — ${montado.cliente}`
  );
  return { enviado: true, cliente: montado.cliente };
}

type ProdutoComPreco = {
  id: string;
  nome: string;
  fornecedor: { nome: string };
  ingredienteAtivo: string | null;
  embalagem: string | null;
  custoAvista: number | null;
  custoAprazo: number | null;
};

function formatarProdutoComPreco(p: ProdutoComPreco) {
  return {
    id: p.id,
    nome: p.nome,
    fornecedor: p.fornecedor.nome,
    ingrediente_ativo: p.ingredienteAtivo,
    embalagem: p.embalagem,
    preco_avista: p.custoAvista,
    preco_aprazo: p.custoAprazo,
    preco_minimo_avista: p.custoAvista != null ? precoMinimo(p.custoAvista) : null,
    preco_minimo_aprazo: p.custoAprazo != null ? precoMinimo(p.custoAprazo) : null,
  };
}

// Monta a listagem já pronta, alinhada num bloco monoespaçado (```...```,
// que o WhatsApp renderiza com fonte de largura fixa) — o agente manda esse
// texto como veio, em vez de tentar alinhar preço na mão, que ele não faz
// de forma confiável (fica torto ou vira parágrafo corrido).
// Nome do produto sozinho numa linha (pode ser longo, sem quebrar layout
// nenhum) e os dois preços logo abaixo, alinhados só entre si — uma tabela
// de 3 colunas lado a lado estoura a largura da tela do celular (a fonte
// monoespaçada do WhatsApp é mais larga que a normal) e quebra no meio do
// valor, o que fica pior que não alinhar nada.
const LARG_VALOR_TABELA = "R$ 1.234,56".length; // maior valor plausível, referência de largura

function formatarTabelaProdutos(
  produtos: ReturnType<typeof formatarProdutoComPreco>[],
  titulo?: string,
  descontoPct?: number | null
): string {
  if (produtos.length === 0) return "";

  const preco = (v: number | null) => (v != null ? fmtBRL(v) : "—");
  const comDesconto = (v: number | null) =>
    v != null && descontoPct ? v * (1 - descontoPct / 100) : null;
  const largLabel = "a prazo".length;
  const largValor = LARG_VALOR_TABELA;

  const linha = (label: string, valor: number | null) =>
    `  ${label}${" ".repeat(largLabel - label.length)}  ${preco(valor).padStart(largValor)}`;

  const blocos = produtos.map((p) => {
    if (descontoPct) {
      const linhas = [
        p.nome,
        linha("à vista", p.preco_avista),
        linha("a prazo", p.preco_aprazo),
        `  com ${descontoPct}% de desconto:`,
        linha("à vista", comDesconto(p.preco_avista)),
        linha("a prazo", comDesconto(p.preco_aprazo)),
      ];
      return linhas.join("\n");
    }
    return [p.nome, linha("à vista", p.preco_avista), linha("a prazo", p.preco_aprazo)].join("\n");
  });

  return [
    ...(titulo ? [`*${titulo}*`, ""] : []),
    "```",
    blocos.join("\n\n"),
    "```",
  ].join("\n");
}

// Mesma listagem de formatarTabelaProdutos, só que como foto (gerarImagemTabela)
// em vez de texto monoespaçado — pedida quando a lista é grande demais pra
// rolar confortavelmente no WhatsApp (ver buscar_produtos e
// listar_produtos_por_fornecedor). incluirFornecedor só faz sentido quando a
// lista pode ter produtos de fornecedores diferentes (busca por nome); numa
// lista de um fornecedor só, o nome dele já vai no título.
// Embalagem cadastrada costuma ser só o tamanho ("5L", "1kg"), mas alguns
// produtos vêm como "cx160ds (75ml/ds)" — a caixa toda não cabe numa coluna
// sem ficar enorme. Extrai só o "Nml" de dentro do parênteses quando existir
// (sem rotular como "dose": não dá pra saber se é a dosagem recomendada ou
// o conteúdo real da embalagem, então mostra só o número).
function formatarEmbalagemResumida(embalagem: string | null): string {
  if (!embalagem?.trim()) return "—";
  const parenteses = embalagem.match(/\(([^)]+)\)/);
  if (parenteses) {
    const ml = parenteses[1].match(/(\d+(?:[.,]\d+)?)\s*ml/i);
    if (ml) return `${ml[1]}ml`;
    return parenteses[1].trim();
  }
  return embalagem.trim();
}

async function enviarTabelaProdutosComoImagem(
  ctx: ContextoFerramenta,
  titulo: string,
  produtos: ReturnType<typeof formatarProdutoComPreco>[],
  descontoPct: number | null,
  incluirFornecedor: boolean
): Promise<boolean> {
  if (produtos.length === 0) return false;
  const preco = (v: number | null) => (v != null ? fmtBRL(v) : "—");
  const comDesconto = (v: number | null) => (v != null && descontoPct ? v * (1 - descontoPct / 100) : null);

  const colunas = [
    { titulo: "Produto" },
    ...(incluirFornecedor ? [{ titulo: "Fornecedor" }] : []),
    { titulo: "Embalagem" },
    { titulo: "À vista", alinhamento: "direita" as const },
    { titulo: "A prazo", alinhamento: "direita" as const },
    ...(descontoPct
      ? [
          { titulo: `À vista (${descontoPct}%)`, alinhamento: "direita" as const },
          { titulo: `A prazo (${descontoPct}%)`, alinhamento: "direita" as const },
        ]
      : []),
  ];

  const linhas = produtos.map((p) => [
    p.nome,
    ...(incluirFornecedor ? [p.fornecedor] : []),
    formatarEmbalagemResumida(p.embalagem),
    preco(p.preco_avista),
    preco(p.preco_aprazo),
    ...(descontoPct ? [preco(comDesconto(p.preco_avista)), preco(comDesconto(p.preco_aprazo))] : []),
  ]);

  const imagem = gerarImagemTabela({ titulo, colunas, linhas });
  return entregarImagem(ctx, imagem, "image/png", titulo);
}

// Ferramentas que mudam um relatório já salvo: antes delas, o estado atual
// vira uma versão BOT pra desfazer_ultima_mudanca poder voltar.
const MUDAM_RELATORIO = new Set([
  "vincular_trabalho", "definir_logo_relatorio", "editar_item_relatorio", "marcar_foto_relatorio", "ajustar_capa_relatorio", "adicionar_grafico_ao_relatorio",
  "adicionar_clima_ao_relatorio", "complementar_relatorio", "corrigir_relatorio", "anexar_foto_ao_relatorio",
  "trazer_fotos_visita_anterior",
]);

export async function executarFerramenta(
  nome: string,
  argumentos: Record<string, unknown>,
  ctx: ContextoFerramenta
): Promise<Resultado> {
  if (MUDAM_RELATORIO.has(nome) && argumentos.relatorio_id) {
    const relatorioId = String(argumentos.relatorio_id);
    const dono = await prisma.relatorioVisita.findUnique({ where: { id: relatorioId }, select: { consultorId: true } });
    if (dono && podeAcessar(dono.consultorId, ctx)) {
      await guardarVersaoBot(relatorioId).catch((e) => console.error("[bot] não guardou a versão pra desfazer:", e));
    }
  }
  return executarFerramentaSemVersao(nome, argumentos, ctx);
}

async function executarFerramentaSemVersao(
  nome: string,
  argumentos: Record<string, unknown>,
  ctx: ContextoFerramenta
): Promise<Resultado> {
  switch (nome) {
    case "buscar_clientes": {
      const termo = String(argumentos.termo ?? "").trim();
      if (!termo) return { erro: "Informe parte do nome." };
      const todos = await prisma.cliente.findMany({
        where: { consultorId: consultorAlvo(argumentos, ctx) },
        select: {
          id: true,
          nome: true,
          fazendas: { select: { id: true, nome: true }, orderBy: { nome: "asc" } },
        },
        orderBy: { nome: "asc" },
      });
      // O consultor costuma falar o nome da fazenda, não do dono — as duas valem.
      const nomes = (c: (typeof todos)[number]) => [c.nome, ...c.fazendas.map((f) => f.nome)];
      const clientes = todos.filter((c) => nomes(c).some((n) => contemNome(termo, n))).slice(0, 8);
      // Nome igual ao digitado (sem diferenciar maiúscula/minúscula/acento) vale
      // como resposta única, mesmo que outros nomes contenham o termo.
      const termoNorm = normalizarNome(termo);
      const iguais = clientes.filter((c) => nomes(c).some((n) => normalizarNome(n) === termoNorm));
      if (iguais.length === 1) return { clientes: iguais, correspondencia_exata: true };
      if (clientes.length > 0) return { clientes };

      // Nada com esse trecho: nome digitado errado ou mal transcrito do áudio.
      // Devolve os mais parecidos pra oferecer como lista.
      const sugestoes = todos
        .map((c) => ({ c, nota: Math.max(...nomes(c).map((n) => semelhancaNome(termo, n))) }))
        .filter((x) => x.nota >= SEMELHANCA_MINIMA)
        .sort((a, b) => b.nota - a.nota)
        .slice(0, 6)
        .map((x) => x.c);
      return { clientes: [], nao_encontrado: termo, sugestoes_parecidas: sugestoes };
    }

    case "listar_meus_clientes": {
      const clientes = await prisma.cliente.findMany({
        where: { consultorId: consultorAlvo(argumentos, ctx) },
        select: { id: true, nome: true },
        orderBy: { nome: "asc" },
      });
      return { clientes, total: clientes.length };
    }

    case "consultar_cliente": {
      const termo = String(argumentos.termo ?? "").trim();
      if (!termo) return { erro: "Informe o nome do cliente." };
      const todos = await prisma.cliente.findMany({
        where: { consultorId: consultorAlvo(argumentos, ctx) },
        select: {
          id: true,
          nome: true,
          documento: true,
          razaoSocial: true,
          inscricaoEstadual: true,
          telefone: true,
          email: true,
          endereco: true,
          cidade: true,
          uf: true,
          cep: true,
        },
        orderBy: { nome: "asc" },
      });
      let encontrados = todos.filter((c) => contemNome(termo, c.nome));
      // Nada por substring: nome parecido mas com grafia diferente (ex.:
      // "Wontroba 10" vs "Wontrobra 10") — tambem entra na lista de opcoes.
      if (encontrados.length === 0) {
        encontrados = todos
          .map((c) => ({ c, nota: semelhancaNome(termo, c.nome) }))
          .filter((x) => x.nota >= SEMELHANCA_MINIMA)
          .sort((a, b) => b.nota - a.nota)
          .slice(0, 6)
          .map((x) => x.c);
      }
      if (encontrados.length === 0) {
        return { erro: `Nenhum cliente encontrado com "${termo}".` };
      }
      if (encontrados.length > 1) {
        return {
          opcoes: encontrados.map((c) => ({ cliente_id: c.id, nome: c.nome })),
        };
      }
      const c = encontrados[0];
      return {
        cliente_id: c.id,
        nome: c.nome,
        documento: c.documento,
        razao_social: c.razaoSocial,
        inscricao_estadual: c.inscricaoEstadual,
        telefone: c.telefone,
        email: c.email,
        endereco: c.endereco,
        cidade: c.cidade,
        uf: c.uf,
        cep: c.cep,
        cadastro_completo_para_assinatura: clienteCompleto(c),
      };
    }

    case "buscar_cliente_por_localizacao": {
      if (!ctx.ultimaLocalizacao) {
        return {
          erro:
            "Não tem localização recente (das últimas 2 horas) nessa conversa. Peça pra mandar a localização atual (📎 > Localização > Localização atual).",
        };
      }
      const { latitude, longitude } = ctx.ultimaLocalizacao;
      const proximos = await clientesProximos(latitude, longitude, 5);
      if (proximos.length === 0) {
        return { erro: "Nenhum cliente cadastrado tem localização salva ainda." };
      }
      // Junto de cada cliente, as fazendas dele — pro agente saber se precisa
      // perguntar de qual fazenda é (quando a localização não já apontou uma).
      const fazendasPorCliente = await prisma.fazenda.findMany({
        where: { clienteId: { in: [...new Set(proximos.map((p) => p.id))] } },
        select: { id: true, nome: true, clienteId: true },
        orderBy: { nome: "asc" },
      });
      return {
        clientes_proximos: proximos.map((p) => ({
          ...p,
          fazendas: fazendasPorCliente
            .filter((f) => f.clienteId === p.id)
            .map(({ id, nome }) => ({ id, nome })),
        })),
      };
    }

    case "criar_relatorio_visita": {
      const clienteId = String(argumentos.cliente_id ?? "");
      const texto = String(argumentos.texto ?? "").trim();
      const estruturaBruta = argumentos.estrutura;
      const estrutura = estruturaBruta == null ? null : estruturaRelatorioSchema.safeParse(estruturaBruta);
      if (estrutura && !estrutura.success) return { erro: "A estrutura do relatório está inválida." };
      if (!clienteId || !texto) return { erro: "cliente_id e texto são obrigatórios." };

      const cliente = await prisma.cliente.findUnique({
        where: { id: clienteId },
        select: { nome: true },
      });
      if (!cliente) return { erro: "Cliente não encontrado." };

      const fazenda = await resolverFazenda(clienteId, argumentos.fazenda_id);
      if ("erro" in fazenda) return fazenda;

      const safraId = await getSafraAtualId();
      const tipo = String(argumentos.tipo ?? "visita") === "tecnico" ? "TECNICO" : "VISITA";
      const categoria = categoriaVisitaArg(argumentos.categoria);
      if (!categoria) {
        return { erro: "categoria é obrigatória: COMERCIAL, TECNICA, POS_VENDA ou RELACIONAMENTO. Pergunte ao consultor." };
      }
      const relatorio = await salvarRelatorioVisita({
        clienteId,
        fazendaId: fazenda.id,
        consultorId: ctx.consultorId,
        safraId,
        tipo,
        categoria,
        titulo: argumentos.titulo ? String(argumentos.titulo) : undefined,
        texto,
        estrutura: estrutura?.data as EstruturaRelatorio | undefined,
        dataVisita: diaDaVisita(argumentos.data_visita),
        latitude: ctx.ultimaLocalizacao?.latitude ?? null,
        longitude: ctx.ultimaLocalizacao?.longitude ?? null,
        fotos: [],
      });
      return {
        relatorio_id: relatorio.id,
        cliente: cliente.nome,
        ...(fazenda.nome ? { fazenda: fazenda.nome } : {}),
      };
    }

    case "abrir_visita_fazenda": {
      const clienteId = String(argumentos.cliente_id ?? "");
      const kmChegada = Number(argumentos.km_chegada);
      const finalidade = String(argumentos.finalidade ?? "").trim();
      if (!clienteId || !Number.isFinite(kmChegada) || !finalidade) {
        return { erro: "cliente_id, km_chegada e finalidade são obrigatórios." };
      }

      const cliente = await prisma.cliente.findUnique({
        where: { id: clienteId },
        select: { nome: true, latitude: true, longitude: true },
      });
      if (!cliente) return { erro: "Cliente não encontrado." };

      const aberta = await buscarVisitaAbertaPorConsultor(ctx.consultorId);
      if (aberta) {
        return {
          erro: `Já existe uma visita aberta em ${aberta.cliente.nome} (relatorio_id ${aberta.id}). Feche-a com fechar_visita_fazenda antes de abrir outra.`,
        };
      }

      const fazenda = await resolverFazenda(clienteId, argumentos.fazenda_id);
      if ("erro" in fazenda) return fazenda;

      const safraId = await getSafraAtualId();
      const tipo = String(argumentos.tipo ?? "visita") === "tecnico" ? "TECNICO" : "VISITA";
      const categoria = categoriaVisitaArg(argumentos.categoria);
      if (!categoria) {
        return { erro: "categoria é obrigatória: COMERCIAL, TECNICA, POS_VENDA ou RELACIONAMENTO. Pergunte ao consultor." };
      }
      const visita = await abrirVisita({
        clienteId,
        fazendaId: fazenda.id,
        consultorId: ctx.consultorId,
        safraId,
        tipo,
        categoria,
        finalidade,
        kmChegada,
        horaChegada: instanteBrasilia(argumentos.hora_chegada),
        latitude: ctx.ultimaLocalizacao?.latitude ?? null,
        longitude: ctx.ultimaLocalizacao?.longitude ?? null,
      });

      // Sem coordenada ainda, a do check-in fica salva — na fazenda, se a
      // visita é de uma fazenda, senão no cliente: o mapa e a busca por
      // proximidade vão se completando com o uso.
      let localizacaoClienteSalva = false;
      if (ctx.ultimaLocalizacao && fazenda.id) {
        const atualizadas = await prisma.fazenda.updateMany({
          where: { id: fazenda.id, OR: [{ latitude: null }, { longitude: null }] },
          data: {
            latitude: ctx.ultimaLocalizacao.latitude,
            longitude: ctx.ultimaLocalizacao.longitude,
          },
        });
        localizacaoClienteSalva = atualizadas.count > 0;
      } else if (ctx.ultimaLocalizacao && (cliente.latitude == null || cliente.longitude == null)) {
        await prisma.cliente.update({
          where: { id: clienteId },
          data: {
            latitude: ctx.ultimaLocalizacao.latitude,
            longitude: ctx.ultimaLocalizacao.longitude,
          },
        });
        localizacaoClienteSalva = true;
      }

      return {
        relatorio_id: visita.id,
        cliente: cliente.nome,
        ...(fazenda.nome ? { fazenda: fazenda.nome } : {}),
        tipo: visita.tipo,
        hora_chegada: fmtDataHoraBrasilia(visita.horaChegada),
        localizacao_anexada: Boolean(ctx.ultimaLocalizacao),
        ...(localizacaoClienteSalva ? { localizacao_do_cliente_cadastrada: true } : {}),
      };
    }

    case "fechar_visita_fazenda": {
      const relatorioId = String(argumentos.relatorio_id ?? "");
      const kmSaida = Number(argumentos.km_saida);
      if (!relatorioId || !Number.isFinite(kmSaida)) {
        return { erro: "relatorio_id e km_saida são obrigatórios." };
      }

      const relatorio = await prisma.relatorioVisita.findUnique({
        where: { id: relatorioId },
        select: {
          id: true,
          consultorId: true,
          status: true,
          horaChegada: true,
          kmChegada: true,
          cliente: { select: { nome: true } },
        },
      });
      if (!relatorio) return { erro: "Relatório não encontrado." };
      if (relatorio.consultorId !== ctx.consultorId) return { erro: "Essa visita não é sua." };
      if (relatorio.status !== "ABERTA") return { erro: "Essa visita já está fechada." };

      const texto = argumentos.texto ? String(argumentos.texto).trim() : undefined;
      // Saída antes da chegada é erro de leitura do horário: vale a chegada.
      const horaSaidaInformada = instanteBrasilia(argumentos.hora_saida);
      const horaSaida =
        horaSaidaInformada && relatorio.horaChegada && horaSaidaInformada < relatorio.horaChegada
          ? relatorio.horaChegada
          : horaSaidaInformada;
      const fechada = await fecharVisita(relatorioId, { kmSaida, texto, horaSaida });
      const duracao = relatorio.horaChegada
        ? formatarDuracao(relatorio.horaChegada, fechada.horaSaida!)
        : null;
      const kmRodado = relatorio.kmChegada != null ? kmSaida - relatorio.kmChegada : null;

      // PDF só quando o consultor pede (ou ao aprovar): com relato, o agente
      // manda a prévia em imagem; sem relato (o texto ainda é só a finalidade
      // do check-in), pede o relato antes.
      const temRelato =
        fechada.texto.trim() !== "" && fechada.texto.trim() !== (fechada.finalidade ?? "").trim();
      const pdf: Resultado = { sem_relato: !temRelato };

      return {
        relatorio_id: fechada.id,
        cliente: relatorio.cliente.nome,
        duracao,
        km_rodado: kmRodado,
        ...pdf,
      };
    }

    case "visita_aberta_atual": {
      const aberta = await buscarVisitaAbertaPorConsultor(ctx.consultorId);
      if (!aberta) return { aberta: false };
      return {
        aberta: true,
        relatorio_id: aberta.id,
        cliente: aberta.cliente.nome,
        hora_chegada: fmtDataHoraBrasilia(aberta.horaChegada),
        finalidade: aberta.finalidade,
      };
    }

    case "anexar_foto_ao_relatorio": {
      const relatorioId = String(argumentos.relatorio_id ?? "");
      const relatorio = await prisma.relatorioVisita.findUnique({
        where: { id: relatorioId },
        select: { id: true, consultorId: true, tipo: true },
      });
      if (!relatorio) return { erro: "Relatório não encontrado." };
      if (!podeAcessar(relatorio.consultorId, ctx)) {
        return { erro: "Esse relatório não é seu." };
      }
      if (relatorio.tipo !== "TECNICO") {
        return {
          erro:
            "Relatório de visita não leva fotos anexadas — fica só em texto, mais enxuto. Fotos são pro relatório técnico.",
        };
      }

      // Conversas antigas só têm `ultimaMidia`, sem a lista de pendentes.
      const pendentes: FotoPendente[] =
        ctx.fotosPendentes.length > 0
          ? ctx.fotosPendentes
          : ctx.ultimaMidia
            ? [{ ref: ctx.ultimaMidia, recebidaEm: Date.now() }]
            : [];
      const pedida = Number(argumentos.quantidade);
      const quantidade =
        Number.isFinite(pedida) && pedida > 0 ? Math.floor(pedida) : pendentes.length;
      // Rabiscada (referência) e print (correção/nota) nunca viram evidência.
      const escolhidas = pendentes.filter((f) => !f.tipo || f.tipo === "campo").slice(-quantidade);
      if (escolhidas.length === 0 && pendentes.length > 0) {
        return {
          anexado: false,
          motivo: "As imagens pendentes não são foto de campo: print da prévia → ler_correcao_previa; foto rabiscada → é referência pra marcar_foto_relatorio (usar_referencia true) na foto limpa.",
        };
      }
      if (escolhidas.length === 0) return { erro: "Não há foto recente para anexar." };

      const fotos = [];
      const origens: (string | undefined)[] = [];
      let falharam = 0;
      const prints: string[] = [];
      for (const [i, foto] of escolhidas.entries()) {
        const midia = await baixarMidia(foto.ref);
        if (!midia) {
          falharam++;
          continue;
        }
        // Conversa antiga (sem tipo): confere aqui se é print.
        if (!foto.tipo && await ehPaginaOuPrint(midia.buffer, midia.contentType)) {
          prints.push(foto.legenda ?? "");
          continue;
        }
        origens.push(foto.id);
        fotos.push({
          buffer: midia.buffer,
          contentType: midia.contentType,
          nomeOriginal: `whatsapp-${Date.now()}-${i}.jpg`,
          legenda: foto.legenda ?? null,
        });
      }
      if (fotos.length === 0) {
        if (prints.length > 0) {
          return {
            anexado: false,
            motivo: "A imagem é um print/página do relatório (a prévia rabiscada), não foto de campo — NÃO foi anexada. Leia a correção com ler_correcao_previa (comentario = o que ele escreveu) e aplique.",
            texto_que_veio_junto: prints.filter(Boolean),
          };
        }
        return { erro: "Não consegui baixar as fotos do WhatsApp." };
      }

      const idsCriados = await anexarFotosRelatorio(relatorio.id, fotos);
      idsCriados.forEach((fotoVisitaId, i) => {
        const mensagemId = origens[i];
        if (fotoVisitaId && mensagemId) ctx.fotosAnexadas.push({ mensagemId, fotoVisitaId });
      });
      ctx.fotosPendentes = ctx.fotosPendentes.filter((f) => !escolhidas.includes(f));
      return {
        ok: true,
        fotos_anexadas: idsCriados.filter(Boolean).length,
        legendas: fotos.map((f) => f.legenda),
        ...(prints.length ? { prints_nao_anexados: prints.length, aviso: "Alguma imagem era print da prévia: use ler_correcao_previa pra ela." } : {}),
        ...(falharam ? { fotos_que_falharam: falharam } : {}),
        fotos_ainda_pendentes: ctx.fotosPendentes.length,
      };
    }

    case "ler_nota_fiscal": {
      const midia = await baixarUltimaFoto(ctx);
      if (!midia) return { erro: "Não há foto recente para ler." };
      const extraido = await extrairDadosNotaFiscal(midia.buffer, midia.contentType);
      return { extraido };
    }

    case "lancar_despesa": {
      const valor = Number(argumentos.valor);
      if (!Number.isFinite(valor) || valor <= 0) {
        return { erro: "Valor inválido." };
      }
      const categoria = String(argumentos.categoria ?? "OUTROS") as CategoriaDespesa;
      if (!CATEGORIAS.includes(categoria)) return { erro: "Categoria inválida." };

      const dataBruta = argumentos.data ? String(argumentos.data) : null;
      const data = dataBruta ? new Date(`${dataBruta}T12:00:00`) : new Date();
      const dataValida = Number.isNaN(data.getTime()) ? new Date() : data;

      const anexar = Boolean(argumentos.anexar_ultima_foto);
      const fotoUsada = anexar ? ctx.fotosPendentes.at(-1) : undefined;
      const midia = anexar ? await baixarUltimaFoto(ctx) : null;

      const safraId = await getSafraAtualId();
      const despesa = await salvarDespesa({
        consultorId: ctx.consultorId,
        clienteId: argumentos.cliente_id ? String(argumentos.cliente_id) : null,
        safraId,
        categoria,
        valor,
        data: dataValida,
        estabelecimento: argumentos.estabelecimento
          ? String(argumentos.estabelecimento)
          : null,
        origemOcr: anexar,
        fotos: midia
          ? [
              {
                buffer: midia.buffer,
                contentType: midia.contentType,
                nomeOriginal: `whatsapp-${Date.now()}.jpg`,
              },
            ]
          : [],
      });
      if (midia && fotoUsada) {
        ctx.fotosPendentes = ctx.fotosPendentes.filter((f) => f !== fotoUsada);
      }
      return {
        despesa_id: despesa.id,
        valor,
        categoria,
        comprovante_anexado: Boolean(midia),
      };
    }

    case "resumo_vendas": {
      const safraId = await getSafraAtualId();
      const safra = await prisma.safra.findUnique({ where: { id: safraId } });
      const vendas = await prisma.venda.findMany({
        where: { consultorId: ctx.consultorId, safraId },
        select: { status: true, valorTotal: true },
      });
      const total = vendas.reduce((s, v) => s + numeroDecimal(v.valorTotal), 0);
      const faturado = vendas
        .filter((v) => v.status === "FATURADO")
        .reduce((s, v) => s + numeroDecimal(v.valorTotal), 0);
      return { safra: safra?.nome ?? null, quantidade: vendas.length, total, faturado };
    }

    case "buscar_produtos": {
      const termo = String(argumentos.termo ?? "").trim();
      if (!termo) return { erro: "Informe parte do nome." };
      const termoNormalizado = normalizarNome(termo);
      // So' produto com preco a vista OU a prazo cadastrado pode aparecer —
      // sem nenhum dos dois, o bot nao tem preco pra mostrar nem pra usar
      // num orcamento (ver tambem a validacao em criar_orcamento).
      const todos = await prisma.produto.findMany({
        where: { OR: [{ custoAvista: { not: null } }, { custoAprazo: { not: null } }] },
        select: {
          id: true,
          nome: true,
          fornecedor: { select: { nome: true } },
          ingredienteAtivo: true,
          embalagem: true,
          custoAvista: true,
          custoAprazo: true,
        },
        orderBy: { nome: "asc" },
      });
      const produtos = todos
        .filter((p) => normalizarNome(p.nome).includes(termoNormalizado))
        .slice(0, 8);
      const formatados = produtos.map((p) => formatarProdutoComPreco({
        ...p,
        custoAvista: numeroDecimalOuNulo(p.custoAvista),
        custoAprazo: numeroDecimalOuNulo(p.custoAprazo),
      }));
      const descontoPct =
        argumentos.desconto_pct != null && Number.isFinite(Number(argumentos.desconto_pct))
          ? Number(argumentos.desconto_pct)
          : null;
      if (argumentos.como_imagem && ctx.canal !== "web") {
        const enviado = await enviarTabelaProdutosComoImagem(ctx, "Produtos", formatados, descontoPct, true);
        return { produtos: formatados, imagem_enviada: enviado };
      }
      return { produtos: formatados, tabela: formatarTabelaProdutos(formatados, undefined, descontoPct) };
    }

    case "listar_produtos_por_fornecedor": {
      const termo = String(argumentos.fornecedor ?? "").trim();
      if (!termo) return { erro: "Informe o nome do fornecedor." };

      const fornecedores = await prisma.fornecedor.findMany({ select: { id: true, nome: true } });
      const encontrados = fornecedores.filter((f) => contemNome(termo, f.nome));

      if (encontrados.length === 0) {
        const sugestoes = fornecedores
          .map((f) => ({ f, nota: semelhancaNome(termo, f.nome) }))
          .filter((x) => x.nota >= SEMELHANCA_MINIMA)
          .sort((a, b) => b.nota - a.nota)
          .slice(0, 6)
          .map((x) => x.f);
        return { fornecedores: [], nao_encontrado: termo, sugestoes_parecidas: sugestoes };
      }

      // Mais de um fornecedor batendo com o termo: devolve a lista pra
      // confirmar em vez de adivinhar qual foi pedido (ex.: "basf" pode bater
      // com mais de um cadastro parecido).
      if (encontrados.length > 1) {
        return { fornecedores: encontrados, ambiguo: true };
      }

      const fornecedor = encontrados[0];
      const produtos = await prisma.produto.findMany({
        where: {
          fornecedorId: fornecedor.id,
          OR: [{ custoAvista: { not: null } }, { custoAprazo: { not: null } }],
        },
        select: {
          id: true,
          nome: true,
          fornecedor: { select: { nome: true } },
          ingredienteAtivo: true,
          embalagem: true,
          custoAvista: true,
          custoAprazo: true,
        },
        orderBy: { nome: "asc" },
      });
      const formatados = produtos.map((p) => formatarProdutoComPreco({
        ...p,
        custoAvista: numeroDecimalOuNulo(p.custoAvista),
        custoAprazo: numeroDecimalOuNulo(p.custoAprazo),
      }));
      const descontoPct =
        argumentos.desconto_pct != null && Number.isFinite(Number(argumentos.desconto_pct))
          ? Number(argumentos.desconto_pct)
          : null;
      if (argumentos.como_imagem && ctx.canal !== "web") {
        const enviado = await enviarTabelaProdutosComoImagem(ctx, fornecedor.nome, formatados, descontoPct, false);
        return { fornecedor: fornecedor.nome, produtos: formatados, imagem_enviada: enviado };
      }
      return {
        fornecedor: fornecedor.nome,
        produtos: formatados,
        tabela: formatarTabelaProdutos(formatados, fornecedor.nome, descontoPct),
      };
    }

    case "abrir_venda": {
      const clienteId = String(argumentos.cliente_id ?? "");
      const produtoId = String(argumentos.produto_id ?? "");
      const status = String(argumentos.status ?? "") === "negociacao" ? "NEGOCIACAO" : "PROSPECCAO";
      if (!clienteId || !produtoId) {
        return { erro: "cliente_id e produto_id são obrigatórios." };
      }

      const [cliente, produto] = await Promise.all([
        prisma.cliente.findUnique({ where: { id: clienteId }, select: { nome: true } }),
        prisma.produto.findUnique({ where: { id: produtoId }, select: { nome: true } }),
      ]);
      if (!cliente) return { erro: "Cliente não encontrado." };
      if (!produto) return { erro: "Produto não encontrado." };

      const safraId = await getSafraAtualId();
      const volume =
        argumentos.volume != null && Number.isFinite(Number(argumentos.volume))
          ? Number(argumentos.volume)
          : null;
      const cultura = argumentos.cultura ? String(argumentos.cultura) : null;

      const venda = await prisma.venda.create({
        data: {
          clienteId,
          produtoId,
          consultorId: ctx.consultorId,
          safraId,
          status,
          volume,
          cultura,
        },
      });
      await prisma.historico.create({
        data: {
          usuarioNome: ctx.consultorNome,
          acao: "Criou (WhatsApp)",
          entidade: "VENDA",
          detalhes: `${cliente.nome} — ${produto.nome}${volume ? ` (${volume})` : ""}, ${status}`,
        },
      });

      return {
        venda_id: venda.id,
        cliente: cliente.nome,
        produto: produto.nome,
        status,
      };
    }

    case "criar_orcamento": {
      const clienteId = String(argumentos.cliente_id ?? "").trim();
      const itensBrutos = Array.isArray(argumentos.itens) ? argumentos.itens : [];
      if (!clienteId || itensBrutos.length === 0) {
        return { erro: "cliente_id e ao menos um item são obrigatórios." };
      }
      // Opcional no orcamento — a data de entrega e' perguntada ao fechar o
      // pedido (fechar_negocio_orcamento).
      const previsaoEntrega = dataIso(argumentos.previsao_entrega) ?? null;
      // Condicao de pagamento agora e' POR ITEM (ver PropostaItem no schema)
      // — o bot ainda so escolhe uma so pro orcamento inteiro, propagada pra
      // cada item.
      const condicaoPagamentoTipoItens =
        String(argumentos.condicao_pagamento_tipo) === "aprazo" ? ("APRAZO" as const) : ("AVISTA" as const);

      const itens: PropostaInput["itens"] = [];
      for (const bruto of itensBrutos as Record<string, unknown>[]) {
        const produtoId = String(bruto.produto_id ?? "").trim();
        const quantidade = Number(bruto.quantidade);
        const precoUnitario = Number(bruto.preco_unitario);
        if (!produtoId || !Number.isFinite(quantidade) || quantidade <= 0) {
          return { erro: "Cada item precisa de produto_id e quantidade maior que zero." };
        }
        if (!Number.isFinite(precoUnitario) || precoUnitario <= 0) {
          return { erro: "Cada item precisa de preco_unitario maior que zero." };
        }
        itens.push({
          produtoId,
          volume: quantidade,
          unidade: bruto.unidade ? String(bruto.unidade) : null,
          condicaoPagamentoTipo: condicaoPagamentoTipoItens,
          valorUnitario: precoUnitario,
          cultura: bruto.cultura ? String(bruto.cultura) : null,
        });
      }

      const cliente = await prisma.cliente.findUnique({ where: { id: clienteId }, select: { nome: true } });
      if (!cliente) return { erro: "Cliente não encontrado." };
      const produtosDosItens = await prisma.produto.findMany({
        where: { id: { in: itens.map((i) => i.produtoId) } },
        select: { id: true, nome: true, custoAvista: true, custoAprazo: true },
      });
      if (produtosDosItens.length !== itens.length) {
        return { erro: "Um dos produtos não foi encontrado — confira com buscar_produtos." };
      }
      // So' entra no orcamento produto com preco a vista ou a prazo
      // cadastrado — sem preco definido, nao pode ser usado (ver buscar_produtos).
      const semPreco = produtosDosItens.filter((p) => p.custoAvista == null && p.custoAprazo == null);
      if (semPreco.length > 0) {
        return {
          erro: `Produto sem preço cadastrado, não pode entrar no orçamento: ${semPreco.map((p) => p.nome).join(", ")}.`,
        };
      }

      const sessao: Sessao = { id: ctx.consultorId, nome: ctx.consultorNome, role: ctx.role };
      const safraId = await getSafraAtualId();
      const desconto = argumentos.desconto != null ? Number(argumentos.desconto) : 0;
      const condicaoPagamentoTipo = String(argumentos.condicao_pagamento_tipo) === "aprazo" ? "APRAZO" : "AVISTA";

      try {
        const proposta = await criarPedidoParaConsultor({
          sessao,
          tipo: "PEDIDO",
          safraId,
          origem: "BOT",
          input: {
            clienteId,
            validade: argumentos.validade ? String(argumentos.validade) : null,
            previsaoEntrega,
            condicaoPagamento: argumentos.condicao_pagamento ? String(argumentos.condicao_pagamento) : null,
            condicaoPagamentoTipo,
            observacoes: argumentos.observacoes ? String(argumentos.observacoes) : null,
            desconto: Number.isFinite(desconto) ? desconto : 0,
            itens,
          },
        });
        return {
          orcamento_id: proposta.id,
          numero: numeroDocumento("PEDIDO", proposta.numero),
          cliente: cliente.nome,
          total: proposta.total,
        };
      } catch (error) {
        return { erro: error instanceof Error ? error.message : "Não consegui criar o orçamento." };
      }
    }

    case "meus_orcamentos": {
      const clienteId = argumentos.cliente_id ? String(argumentos.cliente_id) : undefined;
      const propostas = await prisma.proposta.findMany({
        where: {
          tipo: "PEDIDO",
          ...(ctx.role === "ADMIN" ? {} : { consultorId: ctx.consultorId }),
          ...(clienteId ? { clienteId } : {}),
        },
        select: {
          id: true,
          numero: true,
          status: true,
          total: true,
          origem: true,
          createdAt: true,
          cliente: { select: { nome: true } },
        },
        orderBy: { updatedAt: "desc" },
        take: 10,
      });
      return {
        orcamentos: propostas.map((p) => ({
          orcamento_id: p.id,
          numero: numeroDocumento("PEDIDO", p.numero),
          cliente: p.cliente.nome,
          status: STATUS_PROPOSTA_LABELS[p.status],
          total: p.total,
          origem: p.origem,
          criado_em: fmtDataHoraBrasilia(p.createdAt),
        })),
      };
    }

    case "meus_pedidos": {
      const clienteId = argumentos.cliente_id ? String(argumentos.cliente_id) : undefined;
      const propostas = await prisma.proposta.findMany({
        where: {
          tipo: "PROPOSTA",
          ...(ctx.role === "ADMIN" ? {} : { consultorId: ctx.consultorId }),
          ...(clienteId ? { clienteId } : {}),
        },
        select: {
          id: true,
          numero: true,
          status: true,
          statusAssinatura: true,
          total: true,
          origem: true,
          createdAt: true,
          cliente: { select: { nome: true } },
          itens: { select: { venda: { select: { status: true } } } },
        },
        orderBy: { updatedAt: "desc" },
        take: 20,
      });
      // Mesmo criterio da tela Pedidos na Web (app/(app)/propostas/page.tsx):
      // "em aberto" = ainda nao foi enviado pra assinatura, OU a venda
      // vinculada esta em FECHADO (assinado ou nao, mas ainda sem a
      // conferencia final do administrativo). O resto (venda ja EM_CARTEIRA
      // de fato) conta como finalizado.
      const emAberto = (p: (typeof propostas)[number]) =>
        p.statusAssinatura === "NAO_ENVIADA" || p.itens.some((item) => item.venda?.status === "FECHADO");
      const formatado = (p: (typeof propostas)[number]) => ({
        orcamento_id: p.id,
        numero: numeroDocumento("PROPOSTA", p.numero),
        cliente: p.cliente.nome,
        status: STATUS_PROPOSTA_LABELS[p.status],
        total: p.total,
        origem: p.origem,
        criado_em: fmtDataHoraBrasilia(p.createdAt),
      });
      return {
        pedidos_em_aberto: propostas.filter(emAberto).map(formatado),
        pedidos_finalizados: propostas.filter((p) => !emAberto(p)).map(formatado),
      };
    }

    case "pedidos_aguardando_assinatura": {
      const clienteId = argumentos.cliente_id ? String(argumentos.cliente_id) : undefined;
      const pedidos = await prisma.proposta.findMany({
        where: {
          tipo: "PROPOSTA",
          statusAssinatura: "AGUARDANDO_ASSINATURA",
          ...(ctx.role === "ADMIN" ? {} : { consultorId: ctx.consultorId }),
          ...(clienteId ? { clienteId } : {}),
        },
        select: {
          id: true,
          numero: true,
          total: true,
          createdAt: true,
          cliente: { select: { nome: true } },
          consultor: { select: { nome: true } },
        },
        orderBy: { createdAt: "asc" },
        take: 50,
      });
      return {
        total_aguardando: pedidos.length,
        pedidos: pedidos.map((p) => ({
          orcamento_id: p.id,
          numero: numeroDocumento("PROPOSTA", p.numero),
          cliente: p.cliente.nome,
          total: p.total,
          criado_em: fmtDataHoraBrasilia(p.createdAt),
          ...(ctx.role === "ADMIN" ? { consultor: p.consultor.nome } : {}),
        })),
      };
    }

    case "buscar_por_numero": {
      const bruto = String(argumentos.numero ?? "").trim();
      // Aceita "PED-00024", "PROP-24" (prefixo antigo, numero por baixo é o
      // mesmo — so mudou o texto de exibicao, ver numeroProposta em
      // lib/propostas.ts), "ORC-12", "24" etc. numero e' unico globalmente
      // (nao repete entre orcamento e pedido — ver Proposta.numero no schema).
      const numero = Number(bruto.replace(/\D/g, ""));
      if (!bruto || !Number.isFinite(numero) || numero <= 0) {
        return { erro: "Não consegui identificar o número do documento." };
      }
      const proposta = await prisma.proposta.findUnique({
        where: { numero },
        select: { id: true, tipo: true, numero: true, consultorId: true, cliente: { select: { nome: true } } },
      });
      if (!proposta || (ctx.role !== "ADMIN" && proposta.consultorId !== ctx.consultorId)) {
        return { erro: `Não achei nenhum orçamento ou pedido com o número ${numero}.` };
      }
      return {
        orcamento_id: proposta.id,
        numero: numeroDocumento(proposta.tipo, proposta.numero),
        tipo: proposta.tipo === "PEDIDO" ? "orcamento" : "pedido",
        cliente: proposta.cliente.nome,
      };
    }

    case "detalhar_orcamento": {
      const orcamentoId = String(argumentos.orcamento_id ?? "").trim();
      if (!orcamentoId) return { erro: "orcamento_id é obrigatório." };
      const sessao: Sessao = { id: ctx.consultorId, nome: ctx.consultorNome, role: ctx.role };
      try {
        const proposta = await obterProposta(sessao, orcamentoId);
        return {
          numero: proposta.codigo,
          cliente: proposta.cliente.nome,
          status: STATUS_PROPOSTA_LABELS[proposta.status],
          subtotal: proposta.subtotal,
          desconto: proposta.desconto,
          total: proposta.total,
          itens: proposta.itens.map((i) => ({
            produto: i.produtoNome,
            fornecedor: i.fornecedorNome,
            quantidade: i.volume,
            unidade: i.unidade,
            preco_unitario: i.valorUnitario,
            subtotal_item: i.total,
          })),
        };
      } catch (error) {
        return { erro: error instanceof Error ? error.message : "Orçamento não encontrado." };
      }
    }

    case "fechar_negocio_orcamento": {
      const orcamentoId = String(argumentos.orcamento_id ?? "").trim();
      if (!orcamentoId) return { erro: "orcamento_id é obrigatório." };
      const sessao: Sessao = { id: ctx.consultorId, nome: ctx.consultorNome, role: ctx.role };
      try {
        // false: fechar negocio pelo bot nunca manda pra assinatura sozinho
        // — isso fica exclusivo do botao "Enviar para assinatura" na Web
        // (ver aprovarPedido em lib/servicos/propostas.ts).
        await aprovarPedido(sessao, orcamentoId, false);
        // Data de entrega e frete perguntados na hora de fechar (opcionais):
        // o que veio, grava; o que nao veio, o pedido segue sem (ou com o
        // que o orcamento ja tinha).
        const previsaoEntrega = dataIso(argumentos.previsao_entrega);
        const frete = argumentos.frete ? String(argumentos.frete).trim() : "";
        if (previsaoEntrega || frete) {
          await prisma.proposta.update({
            where: { id: orcamentoId },
            data: {
              ...(previsaoEntrega ? { previsaoEntrega: new Date(previsaoEntrega) } : {}),
              ...(frete ? { frete } : {}),
            },
          });
        }
        const proposta = await obterProposta(sessao, orcamentoId);
        return {
          pedido_id: proposta.id,
          numero: proposta.codigo,
          cliente: proposta.cliente.nome,
          total: proposta.total,
          previsao_entrega: proposta.previsaoEntrega ?? null,
          frete: proposta.frete ?? null,
          margem_aguardando_aprovacao: proposta.statusMargem === "AGUARDANDO_APROVACAO",
        };
      } catch (error) {
        return { erro: error instanceof Error ? error.message : "Não consegui fechar o negócio." };
      }
    }

    case "enviar_pdf_orcamento": {
      const orcamentoId = String(argumentos.orcamento_id ?? "").trim();
      if (!orcamentoId) return { erro: "orcamento_id é obrigatório." };
      const comoImagem = String(argumentos.formato ?? "pdf") === "imagem";
      const sessao: Sessao = { id: ctx.consultorId, nome: ctx.consultorNome, role: ctx.role };
      try {
        const { bytes, nomeArquivo } = await gerarPdfDaProposta(sessao, orcamentoId);
        const proposta = await obterProposta(sessao, orcamentoId);
        const legenda = `Orçamento — ${proposta.cliente.nome}`;

        if (comoImagem) {
          const jpeg = await primeiraPaginaComoJpeg(Buffer.from(bytes));
          if (!jpeg) return { erro: "Não consegui converter o orçamento em imagem." };
          await entregarImagem(ctx, jpeg, "image/jpeg", legenda);
        } else {
          await entregarDocumento(ctx, Buffer.from(bytes), nomeArquivo, "application/pdf", legenda);
        }
        return { enviado: true, cliente: proposta.cliente.nome };
      } catch (error) {
        return { erro: error instanceof Error ? error.message : "Não consegui gerar o orçamento." };
      }
    }

    case "enviar_nf_boleto": {
      const orcamentoId = String(argumentos.orcamento_id ?? "").trim();
      if (!orcamentoId) return { erro: "orcamento_id é obrigatório." };
      const documento = String(argumentos.documento ?? "ambos");
      const sessao: Sessao = { id: ctx.consultorId, nome: ctx.consultorNome, role: ctx.role };
      try {
        const pedido = await obterDocumentosFiscais(sessao, orcamentoId);
        const enviados: string[] = [];
        const pendentes: string[] = [];

        if (documento === "nota_fiscal" || documento === "ambos") {
          if (pedido.notaFiscal?.status === "EMITIDA" && pedido.notaFiscal.pdfUrl) {
            const buffer = await baixarArquivoDeUrl(pedido.notaFiscal.pdfUrl);
            if (buffer) {
              await entregarDocumento(ctx, buffer,
                `NF-${pedido.notaFiscal.numero ?? pedido.codigo}.pdf`,
                "application/pdf",
                `Nota fiscal — ${pedido.clienteNome}`
              );
              enviados.push("nota fiscal");
            } else {
              return { erro: "Não consegui baixar o PDF da nota fiscal." };
            }
          } else {
            pendentes.push("nota fiscal");
          }
        }

        if (documento === "boleto" || documento === "ambos") {
          if ((pedido.boleto?.status === "EMITIDO" || pedido.boleto?.status === "PAGO") && pedido.boleto.pdfUrl) {
            const buffer = await baixarArquivoDeUrl(pedido.boleto.pdfUrl);
            if (buffer) {
              await entregarDocumento(ctx, buffer,
                `Boleto-${pedido.codigo}.pdf`,
                "application/pdf",
                `Boleto — ${pedido.clienteNome}`
              );
              enviados.push("boleto");
            } else {
              return { erro: "Não consegui baixar o PDF do boleto." };
            }
          } else {
            pendentes.push("boleto");
          }
        }

        if (enviados.length === 0) {
          return {
            erro: `Ainda não tem ${pendentes.join(" nem ")} emitido pra este pedido — o Financeiro precisa emitir primeiro.`,
          };
        }
        return { enviado: true, cliente: pedido.clienteNome, documentos_enviados: enviados, pendentes };
      } catch (error) {
        return { erro: error instanceof Error ? error.message : "Não consegui enviar os documentos." };
      }
    }

    case "checar_pedido_para_assinatura": {
      const orcamentoId = String(argumentos.orcamento_id ?? "").trim();
      if (!orcamentoId) return { erro: "orcamento_id é obrigatório." };
      const sessao: Sessao = { id: ctx.consultorId, nome: ctx.consultorNome, role: ctx.role };
      try {
        const proposta = await obterProposta(sessao, orcamentoId);
        const cliente = await prisma.cliente.findUnique({
          where: { id: proposta.cliente.id },
          select: {
            nome: true,
            documento: true,
            razaoSocial: true,
            telefone: true,
            email: true,
            endereco: true,
            cidade: true,
            uf: true,
            cep: true,
          },
        });
        if (!cliente) return { erro: "Cliente não encontrado." };
        return {
          numero: proposta.codigo,
          cliente: cliente.nome,
          cliente_id: proposta.cliente.id,
          email_cliente: cliente.email,
          cadastro_completo: clienteCompleto(cliente),
          campos_faltando: camposFaltantes(cliente),
          total: proposta.total,
        };
      } catch (error) {
        return { erro: error instanceof Error ? error.message : "Não consegui checar o pedido." };
      }
    }

    case "atualizar_cadastro_cliente": {
      const clienteId = String(argumentos.cliente_id ?? "").trim();
      if (!clienteId) return { erro: "cliente_id é obrigatório." };
      const sessao: Sessao = { id: ctx.consultorId, nome: ctx.consultorNome, role: ctx.role };
      try {
        const atual = await prisma.cliente.findUnique({ where: { id: clienteId } });
        if (!atual) return { erro: "Cliente não encontrado." };

        const campo = (chave: string) => {
          const v = argumentos[chave];
          return v == null ? undefined : String(v).trim() || undefined;
        };

        await atualizarClienteServico(sessao, clienteId, {
          nome: atual.nome,
          documento: campo("documento") ?? atual.documento,
          razaoSocial: campo("razao_social") ?? atual.razaoSocial,
          inscricaoEstadual: atual.inscricaoEstadual,
          telefone: campo("telefone") ?? atual.telefone,
          email: campo("email") ?? atual.email,
          endereco: campo("endereco") ?? atual.endereco,
          cidade: campo("cidade") ?? atual.cidade,
          uf: campo("uf") ?? atual.uf,
          cep: campo("cep") ?? atual.cep,
          ctv: atual.ctv,
          areaPlantio: atual.areaPlantio,
          areaTotal: atual.areaTotal,
          pctIrrigada: atual.pctIrrigada,
          pctArroz: atual.pctArroz,
          pctSoja: atual.pctSoja,
          pctMilho: atual.pctMilho,
          pctAlgodao: atual.pctAlgodao,
          pctFeijao: atual.pctFeijao,
          pctTrigo: atual.pctTrigo,
          pctMilho2: atual.pctMilho2,
          pctSorgo2: atual.pctSorgo2,
          latitude: atual.latitude,
          longitude: atual.longitude,
          consultorId: atual.consultorId,
        });

        const atualizado = await prisma.cliente.findUniqueOrThrow({ where: { id: clienteId } });
        return {
          atualizado: true,
          cliente: atualizado.nome,
          cadastro_completo: clienteCompleto(atualizado),
          campos_faltando: camposFaltantes(atualizado),
        };
      } catch (error) {
        return { erro: error instanceof Error ? error.message : "Não consegui atualizar o cadastro." };
      }
    }

    case "enviar_pedido_para_assinatura": {
      const orcamentoId = String(argumentos.orcamento_id ?? "").trim();
      if (!orcamentoId) return { erro: "orcamento_id é obrigatório." };
      const emailsExtras = Array.isArray(argumentos.emails_extras)
        ? argumentos.emails_extras.map((e) => String(e).trim()).filter(Boolean)
        : [];
      const sessao: Sessao = { id: ctx.consultorId, nome: ctx.consultorNome, role: ctx.role };
      try {
        await alterarStatusProposta(sessao, orcamentoId, "ENVIADA", emailsExtras);
        const proposta = await obterProposta(sessao, orcamentoId);
        // O link nao vai junto: o bot so oferece no fim ("deseja receber o
        // link?") e busca com link_assinatura_pedido se a pessoa quiser. Nao
        // pode derrubar o envio (que ja foi feito) se falhar.
        const link = await obterLinkAssinaturaCliente(sessao, orcamentoId).catch(() => null);
        return {
          enviado: true,
          numero: proposta.codigo,
          cliente: proposta.cliente.nome,
          link_disponivel: Boolean(link),
        };
      } catch (error) {
        return { erro: error instanceof Error ? error.message : "Não consegui enviar pra assinatura." };
      }
    }

    case "link_assinatura_pedido": {
      const orcamentoId = String(argumentos.orcamento_id ?? "").trim();
      if (!orcamentoId) return { erro: "orcamento_id é obrigatório." };
      const sessao: Sessao = { id: ctx.consultorId, nome: ctx.consultorNome, role: ctx.role };
      try {
        const proposta = await obterProposta(sessao, orcamentoId);
        if (proposta.statusAssinatura === "ASSINADA") {
          return { erro: `${proposta.codigo} já foi assinado — não precisa de link.` };
        }
        const link = await obterLinkAssinaturaCliente(sessao, orcamentoId);
        if (!link) {
          return {
            erro: "Não tenho link de assinatura pra esse pedido — ou ainda não foi enviado pra assinatura, ou o D4Sign não devolveu o link. O cliente continua podendo assinar pelo e-mail.",
          };
        }
        return {
          numero: proposta.codigo,
          cliente: proposta.cliente.nome,
          link_assinatura_cliente: linkCurtoAssinatura({ id: orcamentoId, codigo: proposta.codigo }, link),
        };
      } catch (error) {
        return { erro: error instanceof Error ? error.message : "Não consegui buscar o link de assinatura." };
      }
    }

    case "listar_meus_registros": {
      const tipo = String(argumentos.tipo ?? "visitas");
      if (tipo === "despesas") {
        const despesas = await prisma.despesa.findMany({
          where: { consultorId: ctx.consultorId },
          select: {
            id: true,
            valor: true,
            categoria: true,
            data: true,
            estabelecimento: true,
          },
          orderBy: { data: "desc" },
          take: 10,
        });
        return { despesas };
      }
      const visitas = await prisma.relatorioVisita.findMany({
        where: { consultorId: ctx.consultorId },
        select: {
          id: true,
          titulo: true,
          dataVisita: true,
          cliente: { select: { nome: true } },
        },
        orderBy: { dataVisita: "desc" },
        take: 10,
      });
      return {
        visitas: visitas.map((v) => ({
          id: v.id,
          titulo: v.titulo,
          data: fmtDataHoraBrasilia(v.dataVisita),
          cliente: v.cliente.nome,
        })),
      };
    }

    case "enviar_pdf_relatorio_visita": {
      return enviarPdfVisita(String(argumentos.relatorio_id ?? ""), ctx);
    }

    case "complementar_relatorio": {
      const relatorioId = String(argumentos.relatorio_id ?? "");
      const texto = String(argumentos.texto ?? "").trim();
      const estruturaBruta = argumentos.estrutura;
      const estrutura = estruturaBruta == null ? null : estruturaRelatorioSchema.safeParse(estruturaBruta);
      if (estrutura && !estrutura.success) return { erro: "A estrutura do relatório está inválida." };
      if (!relatorioId || !texto) return { erro: "relatorio_id e texto são obrigatórios." };
      const relatorio = await prisma.relatorioVisita.findUnique({
        where: { id: relatorioId },
        select: { consultorId: true },
      });
      if (!relatorio) return { erro: "Relatório não encontrado." };
      if (!podeAcessar(relatorio.consultorId, ctx)) return { erro: "Esse relatório não é seu." };

      const modo = String(argumentos.modo) === "substituir" ? "substituir" : "acrescentar";
      const atualizado = await complementarRelatorio(relatorioId, {
        texto, modo, estrutura: estrutura?.data as EstruturaRelatorio | undefined,
      });
      return { ok: true, relatorio_id: atualizado.id, relato_atual: atualizado.texto.slice(0, 1500) };
    }

    case "corrigir_relatorio": {
      const relatorioId = String(argumentos.relatorio_id ?? "");
      const relatorio = await prisma.relatorioVisita.findUnique({
        where: { id: relatorioId },
        select: { consultorId: true, clienteId: true, fazendaId: true },
      });
      if (!relatorio) return { erro: "Relatório não encontrado." };
      if (!podeAcessar(relatorio.consultorId, ctx)) return { erro: "Esse relatório não é seu." };

      const dados: Prisma.RelatorioVisitaUncheckedUpdateInput = {};
      const mudou: string[] = [];

      // Cliente: trocar o cliente reavalia a fazenda (a antiga era do outro).
      const clienteId = argumentos.cliente_id ? String(argumentos.cliente_id) : relatorio.clienteId;
      const trocouCliente = clienteId !== relatorio.clienteId;
      if (trocouCliente) {
        const cliente = await prisma.cliente.findUnique({ where: { id: clienteId }, select: { nome: true } });
        if (!cliente) return { erro: "Cliente não encontrado." };
        dados.clienteId = clienteId;
        mudou.push(`cliente: ${cliente.nome}`);
      }

      const fazendaArg = argumentos.fazenda_id ? String(argumentos.fazenda_id) : null;
      if (fazendaArg === "sem_fazenda") {
        dados.fazendaId = null;
        mudou.push("fazenda: removida");
      } else if (fazendaArg || trocouCliente) {
        const fazenda = await resolverFazenda(clienteId, fazendaArg);
        if ("erro" in fazenda) return fazenda;
        if (fazenda.id !== relatorio.fazendaId) {
          dados.fazendaId = fazenda.id;
          mudou.push(`fazenda: ${fazenda.nome ?? "nenhuma"}`);
        }
      }

      if (argumentos.titulo != null) {
        const titulo = String(argumentos.titulo).trim();
        dados.titulo = titulo === "sem_titulo" || !titulo ? null : titulo;
        mudou.push(`título: ${dados.titulo ?? "removido"}`);
      }

      if (argumentos.data_visita != null) {
        const iso = dataIso(argumentos.data_visita);
        if (!iso) return { erro: "Data inválida. Use AAAA-MM-DD." };
        // Meio-dia em Brasília: a data não "volta um dia" por causa do fuso.
        dados.dataVisita = new Date(`${iso}T12:00:00-03:00`);
        mudou.push(`data: ${iso.split("-").reverse().join("/")}`);
      }

      if (argumentos.tipo != null) {
        dados.tipo = String(argumentos.tipo) === "tecnico" ? "TECNICO" : "VISITA";
        mudou.push(`tipo: ${dados.tipo === "TECNICO" ? "técnico" : "visita"}`);
      }

      if (argumentos.categoria != null) {
        const categoria = categoriaVisitaArg(argumentos.categoria);
        if (!categoria) return { erro: "Categoria inválida." };
        dados.categoria = categoria;
        mudou.push(`categoria: ${categoria}`);
      }

      if (mudou.length === 0) return { erro: "Nada pra corrigir: todos os campos vieram iguais ou nulos." };

      await prisma.relatorioVisita.update({ where: { id: relatorioId }, data: dados });
      return { ok: true, corrigido: mudou };
    }

    case "enviar_pdf_despesas": {
      const safraId = await getSafraAtualId();
      const inicio = dataIso(argumentos.data_inicio);
      const fim = dataIso(argumentos.data_fim);
      const gerado = await montarPdfDespesas({
        safraId,
        consultorId: consultorAlvo(argumentos, ctx),
        inicio,
        fim,
      });
      if (gerado.qtd === 0) return { erro: "Nenhuma despesa encontrada nesse período." };
      await entregarDocumento(ctx, Buffer.from(gerado.pdf),
        gerado.nomeArquivo,
        "application/pdf",
        `Relatório de despesas${inicio || fim ? ` (${inicio ?? "início"} a ${fim ?? "hoje"})` : ""}`
      );
      return { enviado: true, quantidade: gerado.qtd, total: gerado.total };
    }

    case "enviar_relatorio_gerencial": {
      const safraId = await getSafraAtualId();
      const consultorId = consultorAlvo(argumentos, ctx);
      const gerado = await montarPdfGerencial({
        safraId,
        consultorId,
        incluirRanking: ctx.role === "ADMIN" && !consultorId,
      });
      await entregarDocumento(ctx, Buffer.from(gerado.pdf),
        gerado.nomeArquivo,
        "application/pdf",
        "Relatório gerencial de vendas"
      );
      return { enviado: true };
    }

    case "dados_despesas": {
      const agrupar = String(argumentos.agrupar_por ?? "categoria");
      const hoje = hojeBrasilia();
      const inicio = dataIso(argumentos.data_inicio) ?? `${hoje.slice(0, 8)}01`;
      const fim = dataIso(argumentos.data_fim) ?? hoje;
      const consultorId = consultorAlvo(argumentos, ctx);
      const despesas = await prisma.despesa.findMany({
        where: {
          ...(consultorId ? { consultorId } : {}),
          data: {
            gte: new Date(`${inicio}T00:00:00-03:00`),
            lte: new Date(`${fim}T23:59:59.999-03:00`),
          },
        },
        select: { valor: true, data: true, categoria: true, cliente: { select: { nome: true } } },
        orderBy: { data: "asc" },
      });
      const chave = (d: (typeof despesas)[number]) => {
        if (agrupar === "dia") return diaMesBrasilia(d.data);
        if (agrupar === "mes") return mesAnoBrasilia(d.data);
        if (agrupar === "cliente") return d.cliente?.nome ?? "Sem cliente";
        return CATEGORIA_DESPESA_LABELS[d.categoria] ?? d.categoria;
      };
      const grupos = somarPorGrupo(despesas, chave, (d) => numeroDecimal(d.valor));
      // Categoria/cliente: do maior pro menor; tempo: em ordem cronológica.
      if (agrupar === "categoria" || agrupar === "cliente") grupos.sort((a, b) => b.valor - a.valor);
      return {
        periodo: `${inicio} a ${fim}`,
        total: arredondar(grupos.reduce((soma, g) => soma + g.valor, 0)),
        quantidade: despesas.length,
        grupos,
      };
    }

    case "dados_vendas": {
      const agrupar = String(argumentos.agrupar_por ?? "produto");
      const safraId = await getSafraAtualId();
      const safra = await prisma.safra.findUnique({ where: { id: safraId }, select: { nome: true } });
      const consultorId = consultorAlvo(argumentos, ctx);
      const statusFiltro =
        Array.isArray(argumentos.status) && argumentos.status.length > 0
          ? (argumentos.status as string[]).filter((st): st is StatusVenda => st in STATUS_LABELS)
          : null;
      const vendas = await prisma.venda.findMany({
        where: {
          safraId,
          ...(consultorId ? { consultorId } : {}),
          status: statusFiltro ? { in: statusFiltro } : { not: "CANCELADO" },
        },
        select: {
          valorTotal: true,
          status: true,
          dataFechamento: true,
          createdAt: true,
          produto: { select: { nome: true } },
          cliente: { select: { nome: true } },
        },
        orderBy: { createdAt: "asc" },
      });
      const chave = (v: (typeof vendas)[number]) => {
        if (agrupar === "cliente") return v.cliente.nome;
        if (agrupar === "status") return STATUS_LABELS[v.status] ?? v.status;
        if (agrupar === "mes") return mesAnoBrasilia(v.dataFechamento ?? v.createdAt);
        return v.produto.nome;
      };
      const grupos = somarPorGrupo(vendas, chave, (v) => numeroDecimal(v.valorTotal));
      if (agrupar !== "mes") grupos.sort((a, b) => b.valor - a.valor);
      return {
        safra: safra?.nome ?? null,
        total: arredondar(grupos.reduce((soma, g) => soma + g.valor, 0)),
        quantidade: vendas.length,
        grupos: grupos.slice(0, 30),
        ...(grupos.length > 30 ? { aviso: `Mostrando os 30 maiores de ${grupos.length}.` } : {}),
      };
    }

    case "enviar_grafico": {
      const grafico = graficoDosArgumentos(argumentos);
      if ("erro" in grafico) return grafico;
      const titulo = String(argumentos.titulo ?? "").trim() || "Gráfico";
      const pdf = await gerarPdfGrafico({
        titulo,
        subtitulo: argumentos.subtitulo ? String(argumentos.subtitulo) : null,
        consultorNome: ctx.consultorNome,
        grafico,
      });
      // Vai como imagem (abre direto no chat); PDF só se a conversão falhar.
      const imagem = await primeiraPaginaComoJpeg(Buffer.from(pdf));
      const enviado = imagem
        ? await entregarImagem(ctx, imagem, "image/jpeg", `📊 ${titulo}`)
        : await entregarDocumento(ctx, Buffer.from(pdf),
          `${nomeArquivoSeguro(titulo) || "grafico"}.pdf`,
          "application/pdf",
          `📊 ${titulo}`
        );
      return enviado
        ? { enviado: true, grafico_enviado: { titulo, subtitulo: argumentos.subtitulo ?? null, ...grafico } }
        : { erro: "Não consegui enviar o gráfico agora." };
    }

    case "adicionar_grafico_ao_relatorio": {
      const relatorioId = String(argumentos.relatorio_id ?? "");
      const relatorio = await prisma.relatorioVisita.findUnique({
        where: { id: relatorioId },
        select: { consultorId: true, tipo: true },
      });
      if (!relatorio) return { erro: "Relatório não encontrado." };
      if (!podeAcessar(relatorio.consultorId, ctx)) return { erro: "Esse relatório não é seu." };
      if (relatorio.tipo !== "TECNICO") {
        return {
          erro:
            "Relatório de visita sai só em texto e não mostra gráfico. Pra ter gráfico, o relatório precisa ser técnico — dá pra trocar o tipo com corrigir_relatorio (tipo 'tecnico') e depois anexar.",
        };
      }
      const grafico = graficoDosArgumentos(argumentos);
      if ("erro" in grafico) return grafico;
      const titulo = String(argumentos.titulo ?? "").trim() || "Gráfico";
      await adicionarGraficoRelatorio(relatorioId, { titulo, ...grafico });
      return { adicionado: true, relatorio_id: relatorioId, titulo };
    }

    case "previa_relatorio": {
      const relatorioId = String(argumentos.relatorio_id ?? "");
      const montado = await montarPdfVisita(relatorioId, ctx, { numerar: true });
      if ("erro" in montado) return montado;
      const paginas = await paginasComoJpeg(Buffer.from(montado.pdf), 40);
      if (paginas.length === 0) return { erro: "Não consegui gerar a prévia agora." };
      const pedidas = Array.isArray(argumentos.paginas)
        ? [...new Set(argumentos.paginas.map(Number))].filter((n) => n >= 1 && n <= paginas.length).sort((a, b) => a - b)
        : [];
      if (Array.isArray(argumentos.paginas) && argumentos.paginas.length > 0 && pedidas.length === 0) {
        return { erro: `O relatório tem ${paginas.length} página(s).`, total_paginas: paginas.length };
      }
      const enviar = pedidas.length ? pedidas : paginas.map((_, i) => i + 1);
      for (const n of enviar) {
        await entregarImagem(ctx, paginas[n - 1], "image/jpeg",
          paginas.length > 1 ? `Prévia — página ${n} de ${paginas.length}` : "Prévia do relatório");
      }
      return { previa_enviada: true, paginas_enviadas: enviar, total_paginas: paginas.length, itens: await itensDoRelatorio(relatorioId) };
    }

    case "ler_correcao_previa": {
      const relatorioId = String(argumentos.relatorio_id ?? "");
      const relatorio = await prisma.relatorioVisita.findUnique({ where: { id: relatorioId }, select: { consultorId: true } });
      if (!relatorio) return { erro: "Relatório não encontrado." };
      if (!podeAcessar(relatorio.consultorId, ctx)) return { erro: "Esse relatório não é seu." };
      const ultima = ctx.fotosPendentes.at(-1);
      const midia = await baixarUltimaFoto(ctx);
      if (!midia) return { erro: "Não achei a imagem rabiscada. Peça pra mandar de novo." };
      const itens = await itensDoRelatorio(relatorioId);
      const lido = await lerCorrecoesDaPrevia(midia.buffer, midia.contentType, itens,
        argumentos.comentario ? String(argumentos.comentario) : null);
      // A página rabiscada não é foto de campo: não fica esperando ser anexada.
      if (lido.e_previa && ultima) ctx.fotosPendentes = ctx.fotosPendentes.filter((f) => f !== ultima);
      return {
        ...lido,
        itens_marcados: lido.correcoes
          .map((c) => itens.find((i) => i.numero === c.item_numero))
          .filter(Boolean),
      };
    }

    case "editar_item_relatorio": {
      const relatorioId = String(argumentos.relatorio_id ?? "");
      const relatorio = await prisma.relatorioVisita.findUnique({ where: { id: relatorioId }, select: { consultorId: true } });
      if (!relatorio) return { erro: "Relatório não encontrado." };
      if (!podeAcessar(relatorio.consultorId, ctx)) return { erro: "Esse relatório não é seu." };
      const numero = Number(argumentos.item_numero);
      const acao = String(argumentos.acao ?? "");
      const texto = String(argumentos.texto ?? "").trim();
      let mudanca: MudancaItem;
      if (acao === "remover") {
        mudanca = { acao: "remover" };
      } else if (acao === "tamanho") {
        const largura = String(argumentos.largura ?? "");
        if (largura !== "terco" && largura !== "metade" && largura !== "inteira") return { erro: "Diga o tamanho: terco, metade ou inteira." };
        mudanca = { acao, largura };
        const proporcao = String(argumentos.proporcao ?? "");
        if (["paisagem", "panoramica", "quadrada", "retrato"].includes(proporcao)) {
          // Recorte novo: as marcações (em % do quadro) são recalculadas pela
          // imagem, e o foco vertical vai pro meio delas pra não cortá-las.
          const foto = await itensComFoto(relatorioId, numero);
          if (foto) {
            const resposta = await fetch(await assinarUrlArmazenada({ path: foto.path, url: foto.url }));
            if (resposta.ok) {
              const bytes = Buffer.from(await resposta.arrayBuffer());
              const { largura: lw, altura: lh } = await dimensoesImagem(bytes);
              const naImagem = anotacoesParaImagem(foto.anotacoes ?? [], lw, lh, foto);
              const ys = naImagem.flatMap((m) => [m.y1, m.y2]);
              const focoY = ys.length ? Math.round((Math.min(...ys) + Math.max(...ys)) / 2) : foto.focoY;
              const novoBloco = { ...foto, proporcao: proporcao as BlocoFotoTipo["proporcao"], focoY };
              mudanca = { acao, largura, proporcao: novoBloco.proporcao, focoY, anotacoes: marcacoesParaQuadro(naImagem, lw, lh, novoBloco).anotacoes };
            }
          }
        }
      } else if (acao === "texto" || acao === "titulo") {
        if (!texto) return { erro: "Falta o texto novo." };
        mudanca = acao === "texto" ? { acao, texto } : { acao, titulo: texto };
      } else if (acao === "grafico") {
        const grafico = graficoDosArgumentos(argumentos);
        if ("erro" in grafico) return grafico;
        const atual = (await itensDoRelatorio(relatorioId))[numero - 1];
        mudanca = { acao, grafico: { titulo: texto || atual?.resumo.split(" — ")[0] || "Gráfico", ...grafico } };
      } else {
        return { erro: "Ação inválida." };
      }
      try {
        await editarItemRelatorio(relatorioId, numero, mudanca);
      } catch (e) {
        return { erro: e instanceof Error ? e.message : "Não consegui editar." };
      }
      return { editado: true, item_numero: numero, acao };
    }

    case "aprovar_relatorio": {
      const relatorioId = String(argumentos.relatorio_id ?? "");
      const relatorio = await prisma.relatorioVisita.findUnique({ where: { id: relatorioId }, select: { consultorId: true } });
      if (!relatorio) return { erro: "Relatório não encontrado." };
      if (!podeAcessar(relatorio.consultorId, ctx)) return { erro: "Esse relatório não é seu." };
      const status = await aprovarRelatorio(relatorioId, ctx.role === "ADMIN");
      return {
        status,
        ...(status === "EM_REVISAO" ? { aviso: "Fechado pelo consultor; a aprovação final é do gestor, no site." } : {}),
        ...(await enviarPdfVisita(relatorioId, ctx)),
      };
    }

    case "contexto_cliente": {
      const clienteId = String(argumentos.cliente_id ?? "");
      const cliente = await prisma.cliente.findUnique({ where: { id: clienteId }, select: { consultorId: true } });
      if (!cliente) return { erro: "Cliente não encontrado." };
      if (!podeAcessar(cliente.consultorId ?? "", ctx)) return { erro: "Esse cliente não é seu." };
      return contextoDoCliente(clienteId, {
        fazendaId: argumentos.fazenda_id ? String(argumentos.fazenda_id) : null,
        excetoRelatorioId: argumentos.relatorio_atual_id ? String(argumentos.relatorio_atual_id) : undefined,
      });
    }

    case "registrar_combinado": {
      const clienteId = String(argumentos.cliente_id ?? "");
      const cliente = await prisma.cliente.findUnique({ where: { id: clienteId }, select: { consultorId: true } });
      if (!cliente) return { erro: "Cliente não encontrado." };
      if (!podeAcessar(cliente.consultorId ?? "", ctx)) return { erro: "Esse cliente não é seu." };
      const texto = String(argumentos.texto ?? "").trim();
      if (!texto) return { erro: "Diga o que foi combinado." };
      const data = dataIso(argumentos.data);
      const criado = await criarCombinado({
        texto,
        clienteId,
        consultorId: ctx.consultorId,
        relatorioId: argumentos.relatorio_id ? String(argumentos.relatorio_id) : null,
        dataPrevista: data ? new Date(`${data}T12:00:00-03:00`) : null,
      });
      return { registrado: true, combinado_id: criado.id, texto: criado.texto, data: data ?? null };
    }

    case "listar_combinados": {
      const ate = dataIso(argumentos.ate);
      const lista = await combinadosPendentes({
        consultorId: ctx.role === "ADMIN" && !argumentos.cliente_id ? undefined : ctx.consultorId,
        clienteId: argumentos.cliente_id ? String(argumentos.cliente_id) : undefined,
        ate: ate ? new Date(`${ate}T23:59:59-03:00`) : undefined,
      });
      return {
        combinados: lista
          .filter((c) => podeAcessar(c.consultorId, ctx))
          .map((c) => ({
            combinado_id: c.id,
            cliente: c.cliente.nome,
            texto: c.texto,
            data_prevista: c.dataPrevista?.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) ?? null,
            atrasado: Boolean(c.dataPrevista && c.dataPrevista.getTime() < Date.now() - 86_400_000),
          })),
      };
    }

    case "concluir_combinado": {
      const combinadoId = String(argumentos.combinado_id ?? "");
      const combinado = await prisma.combinado.findUnique({ where: { id: combinadoId }, select: { consultorId: true } });
      if (!combinado) return { erro: "Combinado não encontrado." };
      if (!podeAcessar(combinado.consultorId, ctx)) return { erro: "Esse combinado não é seu." };
      const status = argumentos.status === "CANCELADO" ? "CANCELADO" : "FEITO";
      const feito = await concluirCombinado(combinadoId, status);
      return { ok: true, texto: feito.texto, status };
    }

    case "analisar_foto_campo": {
      const midia = await baixarUltimaFoto(ctx);
      if (!midia) return { erro: "Não há foto recente pra analisar." };
      try {
        return { analise: await analisarFotoCampo(midia.buffer, midia.contentType, argumentos.contexto ? String(argumentos.contexto) : null) };
      } catch (e) {
        return { erro: e instanceof Error ? e.message : "Não consegui analisar a foto." };
      }
    }

    case "trazer_fotos_visita_anterior": {
      const destinoId = String(argumentos.relatorio_id ?? "");
      const origemId = String(argumentos.relatorio_anterior_id ?? "");
      const [destino, origem] = await Promise.all([
        prisma.relatorioVisita.findUnique({ where: { id: destinoId }, select: { consultorId: true, clienteId: true } }),
        prisma.relatorioVisita.findUnique({ where: { id: origemId }, select: { consultorId: true, clienteId: true } }),
      ]);
      if (!destino || !origem) return { erro: "Relatório não encontrado." };
      if (!podeAcessar(destino.consultorId, ctx)) return { erro: "Esse relatório não é seu." };
      if (origem.clienteId !== destino.clienteId) return { erro: "O relatório anterior é de outro cliente." };
      const numeros = Array.isArray(argumentos.fotos) ? argumentos.fotos.map(Number).filter((n) => n >= 1) : null;
      try {
        return await copiarFotosDeOutroRelatorio(destinoId, origemId, numeros);
      } catch (e) {
        return { erro: e instanceof Error ? e.message : "Não consegui trazer as fotos." };
      }
    }

    case "desfazer_ultima_mudanca": {
      const relatorioId = String(argumentos.relatorio_id ?? "");
      const relatorio = await prisma.relatorioVisita.findUnique({ where: { id: relatorioId }, select: { consultorId: true } });
      if (!relatorio) return { erro: "Relatório não encontrado." };
      if (!podeAcessar(relatorio.consultorId, ctx)) return { erro: "Esse relatório não é seu." };
      const resultado = await desfazerUltimaMudancaBot(relatorioId);
      return resultado.desfeito
        ? { desfeito: true, ainda_da_pra_voltar: resultado.restantes }
        : { desfeito: false, motivo: "Não há mudança do bot pra desfazer nesse relatório (mudanças feitas no site se desfazem pelo histórico de versões de lá)." };
    }

    case "enviar_enquete": {
      const pergunta = String(argumentos.pergunta ?? "").trim();
      const opcoes = (Array.isArray(argumentos.opcoes) ? argumentos.opcoes : []).map((o) => String(o).trim()).filter(Boolean);
      if (!pergunta || opcoes.length < 2) return { erro: "A enquete precisa de pergunta e pelo menos 2 opções." };
      const multipla = argumentos.multipla === true;
      if (ctx.canal === "web") {
        return { enviado: false, mostrar_como_lista: opcoes.map((o, i) => `${i + 1}. ${o}`), multipla };
      }
      const ok = await enviarEnquete(ctx.waId, pergunta, opcoes, multipla);
      return ok ? { enviado: true, aguardando_voto: true } : { erro: "Não consegui mandar a enquete; use lista numerada." };
    }

    case "vincular_trabalho": {
      const relatorioId = String(argumentos.relatorio_id ?? "");
      const trabalhoId = String(argumentos.trabalho_id ?? "");
      const [relatorio, trabalho] = await Promise.all([
        prisma.relatorioVisita.findUnique({ where: { id: relatorioId }, select: { consultorId: true } }),
        prisma.trabalho.findUnique({ where: { id: trabalhoId }, select: { nome: true } }),
      ]);
      if (!relatorio) return { erro: "Relatório não encontrado." };
      if (!trabalho) return { erro: "Trabalho não encontrado." };
      if (!podeAcessar(relatorio.consultorId, ctx)) return { erro: "Esse relatório não é seu." };
      return { ok: true, trabalho: trabalho.nome, ...(await vincularTrabalho(relatorioId, trabalhoId)) };
    }

    case "listar_logos": {
      const logos = await prisma.logoRelatorio.findMany({ orderBy: { nome: "asc" }, take: 12 });
      if (logos.length === 0) {
        return { logos: [], dica: "A biblioteca está vazia. O consultor pode mandar a imagem da logo aqui e pedir pra usar (definir_logo_relatorio com usar_imagem_enviada)." };
      }
      const lista = logos.map((l, i) => ({ numero: i + 1, logo_id: l.id, nome: l.nome, tipo: l.tipo === "PROGRAMA" ? "programa" : "parceiro" }));
      if (argumentos.mostrar_imagem !== true) return { logos: lista };
      const comUrl = await Promise.all(logos.map(async (l) => ({ ...l, url: await urlLogoParceiro(l.path) })));
      await entregarImagem(ctx, await gerarGradeDeLogos(comUrl), "image/png", "Logos disponíveis");
      return { enviado: true, logos: lista };
    }

    case "definir_logo_relatorio": {
      const relatorioId = String(argumentos.relatorio_id ?? "");
      const relatorio = await prisma.relatorioVisita.findUnique({ where: { id: relatorioId }, select: { consultorId: true, empresaId: true } });
      if (!relatorio) return { erro: "Relatório não encontrado." };
      if (!podeAcessar(relatorio.consultorId, ctx)) return { erro: "Esse relatório não é seu." };
      const rodape = argumentos.posicao === "rodape";
      let path: string | null = null;
      if (!argumentos.remover) {
        if (argumentos.usar_imagem_enviada) {
          const midia = await baixarUltimaFoto(ctx);
          if (!midia) return { erro: "Não achei a imagem da logo. Peça pra mandar de novo." };
          const enviado = await enviarBufferLogoRelatorio(midia.buffer, midia.contentType, "logo-whatsapp.png", relatorio.empresaId);
          const nome = String(argumentos.nome_logo ?? "").trim() || "Logo do WhatsApp";
          await prisma.logoRelatorio.create({ data: { nome, tipo: rodape ? "PARCEIRO" : "PROGRAMA", path: enviado.path } });
          path = enviado.path;
          const ultima = ctx.fotosPendentes.at(-1);
          if (ultima) ctx.fotosPendentes = ctx.fotosPendentes.filter((f) => f !== ultima);
        } else {
          const logo = argumentos.logo_id
            ? await prisma.logoRelatorio.findUnique({ where: { id: String(argumentos.logo_id) }, select: { path: true } })
            : null;
          if (!logo) return { erro: "Logo não encontrada. Use listar_logos." };
          path = logo.path;
        }
      }
      await prisma.relatorioVisita.update({
        where: { id: relatorioId },
        data: rodape
          ? { logoParceiroPath: path, logoParceiroRotulo: path ? (argumentos.rotulo ? String(argumentos.rotulo) : null) : null }
          : { logoPrincipalPath: path },
      });
      return { ok: true, posicao: rodape ? "rodapé" : "cabeçalho", logo: path ? "nova" : "padrão da empresa" };
    }

    case "ajustar_capa_relatorio": {
      const relatorioId = String(argumentos.relatorio_id ?? "");
      const relatorio = await prisma.relatorioVisita.findUnique({ where: { id: relatorioId }, select: { consultorId: true } });
      if (!relatorio) return { erro: "Relatório não encontrado." };
      if (!podeAcessar(relatorio.consultorId, ctx)) return { erro: "Esse relatório não é seu." };
      const acao = String(argumentos.acao ?? "") as "sem_foto" | "foto" | "sem_capa" | "com_capa";
      if (!["sem_foto", "foto", "sem_capa", "com_capa"].includes(acao)) return { erro: "Ação inválida." };
      try {
        await ajustarCapaRelatorio(relatorioId, acao, argumentos.foto_numero == null ? undefined : Number(argumentos.foto_numero));
      } catch (e) {
        return { erro: e instanceof Error ? e.message : "Não consegui mudar a capa." };
      }
      return { ok: true, acao };
    }

    case "marcar_foto_relatorio": {
      const relatorioId = String(argumentos.relatorio_id ?? "");
      const relatorio = await prisma.relatorioVisita.findUnique({
        where: { id: relatorioId },
        select: { consultorId: true },
      });
      if (!relatorio) return { erro: "Relatório não encontrado." };
      if (!podeAcessar(relatorio.consultorId, ctx)) return { erro: "Esse relatório não é seu." };

      const fotos = await fotosDoRelatorio(relatorioId);
      if (fotos.length === 0) return { erro: "Esse relatório não tem foto anexada. Anexe a foto antes (anexar_foto_ao_relatorio)." };
      const pedida = Number(argumentos.foto_numero);
      const indice = Number.isInteger(pedida) && pedida >= 1 ? pedida - 1 : fotos.length - 1;
      const foto = fotos[indice];
      if (!foto) {
        return {
          erro: `O relatório tem ${fotos.length} foto(s). Pergunte qual delas.`,
          fotos: fotos.map((f, i) => ({ numero: i + 1, legenda: f.legenda, marcacoes: (f.anotacoes ?? []).length })),
        };
      }

      const resposta = await fetch(await assinarUrlArmazenada({ path: foto.path, url: foto.url }));
      if (!resposta.ok) return { erro: "Não consegui abrir a foto agora." };
      const bytes = Buffer.from(await resposta.arrayBuffer());

      const modo = String(argumentos.modo ?? "acrescentar");
      const atuais = foto.anotacoes ?? [];
      let novas = atuais;
      let observacao: string | null = null;
      let cortadas = 0;
      const { largura, altura } = await dimensoesImagem(bytes);

      if (modo === "limpar") {
        novas = [];
      } else {
        let pedidas: MarcacaoImagem[];
        if (Array.isArray(argumentos.marcacoes) && argumentos.marcacoes.length > 0) {
          pedidas = argumentos.marcacoes as MarcacaoImagem[];
        } else {
          const instrucao = String(argumentos.instrucao ?? "").trim();
          const rabiscada = argumentos.usar_referencia ? [...ctx.fotosPendentes].reverse().find((f) => f.tipo === "rabiscada") : undefined;
          const referencia = rabiscada ? await baixarMidia(rabiscada.ref) : null;
          if (argumentos.usar_referencia && !referencia) return { erro: "Não achei a foto rabiscada de referência. Peça pra mandar de novo." };
          if (!instrucao && !referencia) return { erro: "Diga o que marcar na foto (instrucao) ou mande as marcações." };
          const achado = await localizarNaFoto(bytes, instrucao || "Reproduza as marcas feitas à mão na referência.", referencia?.buffer);
          if (rabiscada) ctx.fotosPendentes = ctx.fotosPendentes.filter((f) => f !== rabiscada);
          observacao = achado.observacao;
          if (!achado.encontrou || achado.marcacoes.length === 0) {
            return { marcado: false, motivo: achado.observacao ?? "Não achei isso na foto com clareza." };
          }
          pedidas = achado.marcacoes;
        }
        const convertidas = marcacoesParaQuadro(pedidas, largura, altura, foto);
        cortadas = convertidas.cortadas;
        novas = modo === "substituir" ? convertidas.anotacoes : [...atuais, ...convertidas.anotacoes].slice(-40);
      }

      await salvarAnotacoesFoto(relatorioId, indice, novas);
      if (argumentos.mostrar === true) {
        const previa = await desenharPrevia(bytes, { ...foto, anotacoes: novas });
        await entregarImagem(ctx, previa, "image/jpeg", `Foto ${indice + 1} marcada`);
      }
      return {
        marcado: true,
        foto_numero: indice + 1,
        foto_enviada: argumentos.mostrar === true,
        ...(observacao ? { observacao } : {}),
        ...(cortadas ? { aviso: `${cortadas} marcação(ões) caiu fora do recorte da foto no relatório e foi encostada na borda.` } : {}),
        marcacoes: anotacoesParaImagem(novas, largura, altura, foto),
      };
    }

    case "adicionar_clima_ao_relatorio": {
      const relatorioId = String(argumentos.relatorio_id ?? "");
      const relatorio = await prisma.relatorioVisita.findUnique({
        where: { id: relatorioId },
        select: { consultorId: true, tipo: true, clienteId: true, fazendaId: true },
      });
      if (!relatorio) return { erro: "Relatório não encontrado." };
      if (!podeAcessar(relatorio.consultorId, ctx)) return { erro: "Esse relatório não é seu." };
      if (relatorio.tipo !== "TECNICO") {
        return { erro: "Gráfico só aparece em relatório técnico — dá pra trocar o tipo com corrigir_relatorio (tipo 'tecnico')." };
      }
      try {
        const local = await localDoClima({ cliente_id: relatorio.clienteId, fazenda_id: relatorio.fazendaId }, ctx);
        if ("erro" in local) return local;
        const chuva = await chuvaMensalComparada(local.latitude, local.longitude);
        const meses = chuva.meses.filter((m) => m.mes <= chuva.ultimoMes);
        const nomes = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
        const [primeiro, ultimo] = [chuva.anosHistorico[0], chuva.anosHistorico.at(-1)];
        await adicionarGraficoRelatorio(relatorioId, {
          titulo: `Chuva mensal ${chuva.ano} x média ${primeiro}–${ultimo} — ${local.nomeExibicao}`,
          formato: "barra",
          series: [String(chuva.ano), `Média ${primeiro}–${ultimo}`],
          linhas: meses.map((m) => ({ rotulo: nomes[m.mes - 1], valores: [m.atual, m.media] })),
          unidade: "mm",
          eixoY: "Chuva (mm)",
          cores: ["#2f80ed", "#19323b"],
        });
        const acumulado = meses.reduce((a, m) => a + (m.atual ?? 0), 0);
        const media = meses.reduce((a, m) => a + m.media, 0);
        return {
          adicionado: true,
          local: local.nomeExibicao,
          acumulado_mm: acumulado,
          media_mesmo_periodo_mm: media,
          desvio_pct: media ? Math.round(((acumulado - media) / media) * 100) : null,
        };
      } catch (e) {
        return { erro: e instanceof Error ? e.message : "Não consegui buscar a chuva agora." };
      }
    }

    case "definir_modo_resposta": {
      const pedido = String(argumentos.modo ?? "");
      const modo: ModoResposta =
        pedido === "audio" ? "AUDIO" : pedido === "texto" ? "TEXTO" : "ESPELHAR";
      await definirModoRespostaPorWaId(ctx.waId, modo);
      ctx.novoModoResposta = modo;
      return { ok: true, modo };
    }

    case "listar_consultores": {
      if (ctx.role !== "ADMIN") return { erro: "Só o gestor pode ver a equipe." };
      const consultores = await prisma.user.findMany({
        where: { ativo: true },
        select: { id: true, nome: true, role: true },
        orderBy: { nome: "asc" },
      });
      return { consultores };
    }

    case "listar_visitas_equipe": {
      if (ctx.role !== "ADMIN") return { erro: "Só o gestor pode ver a equipe." };
      const inicio = dataIso(argumentos.data_inicio) ?? hojeBrasilia();
      const fim = dataIso(argumentos.data_fim) ?? inicio;
      const visitas = await prisma.relatorioVisita.findMany({
        where: {
          dataVisita: {
            gte: new Date(`${inicio}T00:00:00-03:00`),
            lte: new Date(`${fim}T23:59:59.999-03:00`),
          },
          ...(argumentos.consultor_id ? { consultorId: String(argumentos.consultor_id) } : {}),
        },
        select: {
          id: true,
          tipo: true,
          status: true,
          texto: true,
          finalidade: true,
          dataVisita: true,
          horaChegada: true,
          horaSaida: true,
          kmChegada: true,
          kmSaida: true,
          cliente: { select: { nome: true } },
          consultor: { select: { nome: true } },
        },
        orderBy: { dataVisita: "asc" },
        take: 60,
      });
      return {
        periodo: { inicio, fim },
        total: visitas.length,
        visitas: visitas.map((v) => {
          const temRelato =
            v.texto.trim() !== "" && v.texto.trim() !== (v.finalidade ?? "").trim();
          return {
            id: v.id,
            consultor: v.consultor.nome,
            cliente: v.cliente.nome,
            tipo: v.tipo,
            status: v.status,
            data: fmtDataHoraBrasilia(v.dataVisita),
            chegada: v.horaChegada ? fmtDataHoraBrasilia(v.horaChegada) : null,
            saida: v.horaSaida ? fmtDataHoraBrasilia(v.horaSaida) : null,
            km_rodado:
              v.kmChegada != null && v.kmSaida != null ? v.kmSaida - v.kmChegada : null,
            relato: temRelato ? v.texto.slice(0, 300) : null,
          };
        }),
      };
    }

    case "ler_embalagem_produto": {
      if (ctx.role !== "ADMIN") return { erro: "Só o gestor cadastra produto." };
      const midia = await baixarUltimaFoto(ctx);
      if (!midia) return { erro: "Não há foto recente para ler." };
      const extraido = await extrairDadosProduto(midia.buffer, midia.contentType);
      return { extraido };
    }

    case "cadastrar_fornecedor": {
      if (ctx.role !== "ADMIN") return { erro: "Só o gestor cadastra fornecedor." };
      const nome = String(argumentos.nome ?? "").trim();
      if (!nome) return { erro: "Informe o nome do fornecedor." };

      // Idempotente: se já existir um com esse nome, reaproveita em vez de
      // duplicar — útil quando o fluxo "cadastra o fornecedor X e o produto Y"
      // é chamado mais de uma vez sem querer.
      const existente = await prisma.fornecedor.findFirst({
        where: { nome: { equals: nome, mode: "insensitive" } },
      });
      if (existente) return { fornecedor_id: existente.id, nome: existente.nome, criado: false };

      const criado = await prisma.fornecedor.create({ data: { nome } });
      await prisma.historico.create({
        data: {
          usuarioNome: ctx.consultorNome,
          acao: "Criou (WhatsApp)",
          entidade: "FORNECEDOR",
          detalhes: criado.nome,
        },
      });
      return { fornecedor_id: criado.id, nome: criado.nome, criado: true };
    }

    case "cadastrar_produto": {
      if (ctx.role !== "ADMIN") return { erro: "Só o gestor cadastra produto." };
      const nome = String(argumentos.nome ?? "").trim();
      const fornecedorNome = String(argumentos.fornecedor_nome ?? "").trim();
      if (!nome) return { erro: "Informe o nome do produto." };
      if (!fornecedorNome) return { erro: "Informe o fornecedor (ou cadastre um novo com cadastrar_fornecedor)." };

      // Mesma resolução por nome de listar_produtos_por_fornecedor: nunca
      // adivinha o fornecedor certo, devolve a lista pra confirmar.
      const fornecedores = await prisma.fornecedor.findMany({ select: { id: true, nome: true } });
      const encontrados = fornecedores.filter((f) => contemNome(fornecedorNome, f.nome));
      if (encontrados.length === 0) {
        const sugestoes = fornecedores
          .map((f) => ({ f, nota: semelhancaNome(fornecedorNome, f.nome) }))
          .filter((x) => x.nota >= SEMELHANCA_MINIMA)
          .sort((a, b) => b.nota - a.nota)
          .slice(0, 6)
          .map((x) => x.f);
        return { erro: "fornecedor_nao_encontrado", nao_encontrado: fornecedorNome, sugestoes_parecidas: sugestoes };
      }
      if (encontrados.length > 1) return { erro: "fornecedor_ambiguo", fornecedores: encontrados };
      const fornecedor = encontrados[0];

      const duplicado = await prisma.produto.findFirst({
        where: { fornecedorId: fornecedor.id, nome: { equals: nome, mode: "insensitive" } },
      });
      if (duplicado) {
        return { erro: `Já existe um produto "${duplicado.nome}" cadastrado para ${fornecedor.nome}.` };
      }

      const criado = await prisma.produto.create({
        data: {
          nome,
          fornecedorId: fornecedor.id,
          ingredienteAtivo: argumentos.ingrediente_ativo ? String(argumentos.ingrediente_ativo) : null,
          embalagem: argumentos.embalagem ? String(argumentos.embalagem) : null,
        },
      });
      await prisma.historico.create({
        data: {
          usuarioNome: ctx.consultorNome,
          acao: "Criou (WhatsApp)",
          entidade: "PRODUTO",
          detalhes: `${criado.nome} — ${fornecedor.nome}`,
        },
      });
      return {
        produto_id: criado.id,
        nome: criado.nome,
        fornecedor: fornecedor.nome,
        // Sem NCM/CFOP o produto fica cadastrado mas não pode ser usado numa
        // NF-e via Focus NFe até alguém preencher (aqui com atualizar_ncm_cfop
        // ou na Web em Produtos > Editar).
        precisa_ncm_cfop: true,
      };
    }

    case "atualizar_ncm_cfop": {
      if (ctx.role !== "ADMIN") return { erro: "Só o gestor edita produto." };
      // Mesma exigência de lib/produtos.ts (formato exato, não só limite de
      // tamanho) — SEFAZ rejeita NCM/CFOP fora do formato completo.
      const ncmBruto = argumentos.ncm ? String(argumentos.ncm).replace(/\D/g, "") : null;
      const cfopBruto = argumentos.cfop ? String(argumentos.cfop).replace(/\D/g, "") : null;
      if (!ncmBruto && !cfopBruto) return { erro: "Informe o NCM e/ou o CFOP." };
      if (ncmBruto && ncmBruto.length !== 8) return { erro: "NCM deve ter exatamente 8 dígitos." };
      if (cfopBruto && cfopBruto.length !== 4) return { erro: "CFOP deve ter exatamente 4 dígitos." };
      const ncm = ncmBruto;
      const cfop = cfopBruto;

      let produtoId = argumentos.produto_id ? String(argumentos.produto_id) : "";
      let nomeProduto = "";

      if (!produtoId) {
        const nomeBusca = String(argumentos.produto_nome ?? "").trim();
        if (!nomeBusca) return { erro: "Informe produto_id ou produto_nome." };
        const fornecedorNome = argumentos.fornecedor_nome ? String(argumentos.fornecedor_nome).trim() : "";

        // Não filtra por preço (diferente de buscar_produtos) — produto
        // recém-cadastrado por cadastrar_produto ainda não tem preço.
        const todos = await prisma.produto.findMany({
          select: { id: true, nome: true, fornecedor: { select: { nome: true } } },
        });
        let encontrados = todos.filter((p) => contemNome(nomeBusca, p.nome));
        if (fornecedorNome) {
          encontrados = encontrados.filter((p) => contemNome(fornecedorNome, p.fornecedor.nome));
        }

        if (encontrados.length === 0) return { erro: `Produto "${nomeBusca}" não encontrado.` };
        if (encontrados.length > 1) {
          return {
            erro: "produto_ambiguo",
            ambiguo: true,
            produtos: encontrados.map((p) => ({ id: p.id, nome: p.nome, fornecedor: p.fornecedor.nome })),
          };
        }
        produtoId = encontrados[0].id;
        nomeProduto = encontrados[0].nome;
      }

      const produto = nomeProduto
        ? { nome: nomeProduto }
        : await prisma.produto.findUnique({ where: { id: produtoId }, select: { nome: true } });
      if (!produto) return { erro: "Produto não encontrado." };

      const atualizado = await prisma.produto.update({
        where: { id: produtoId },
        data: { ...(ncm ? { ncm } : {}), ...(cfop ? { cfop } : {}) },
      });
      await prisma.historico.create({
        data: {
          usuarioNome: ctx.consultorNome,
          acao: "Atualizou NCM/CFOP (WhatsApp)",
          entidade: "PRODUTO",
          detalhes: `${produto.nome}: NCM ${atualizado.ncm ?? "—"} / CFOP ${atualizado.cfop ?? "—"}`,
        },
      });
      return { produto_id: atualizado.id, nome: produto.nome, ncm: atualizado.ncm, cfop: atualizado.cfop };
    }

    case "listar_margens_pendentes": {
      const sessao: Sessao = { id: ctx.consultorId, nome: ctx.consultorNome, role: ctx.role };
      try {
        const pendentes = await listarOrcamentosAguardandoMargem(sessao);
        return {
          pedidos: pendentes.map((p) => ({
            pedido_id: p.id,
            numero: numeroDocumento(p.tipo, p.numero),
            cliente: p.cliente.nome,
            consultor: p.consultor.nome,
            total: p.total,
            margem_pct: p.margemPct,
          })),
        };
      } catch (error) {
        return { erro: error instanceof Error ? error.message : "Não consegui listar as margens pendentes." };
      }
    }

    case "aprovar_margem":
    case "recusar_margem": {
      const sessao: Sessao = { id: ctx.consultorId, nome: ctx.consultorNome, role: ctx.role };
      let pedidoId = argumentos.pedido_id ? String(argumentos.pedido_id).trim() : "";
      if (!pedidoId) {
        const bruto = String(argumentos.numero ?? "").trim();
        const numero = Number(bruto.replace(/\D/g, ""));
        if (!bruto || !Number.isFinite(numero) || numero <= 0) {
          return { erro: "Informe pedido_id ou numero (PED-xxxxx)." };
        }
        const proposta = await prisma.proposta.findUnique({ where: { numero }, select: { id: true } });
        if (!proposta) return { erro: `Não achei nenhum pedido com o número ${numero}.` };
        pedidoId = proposta.id;
      }

      try {
        if (nome === "aprovar_margem") {
          await aprovarMargem(sessao, pedidoId);
          return { aprovado: true };
        }
        const motivo = String(argumentos.motivo ?? "").trim();
        if (!motivo) return { erro: "Informe o motivo da recusa." };
        await recusarMargem(sessao, pedidoId, motivo);
        return { recusado: true, motivo };
      } catch (error) {
        return { erro: error instanceof Error ? error.message : "Não consegui processar a aprovação de margem." };
      }
    }

    case "historico_chuva": {
      try {
        const local = await localDoClima(argumentos, ctx);
        if ("erro" in local) return local;
        if (argumentos.modo === "anual") {
          const dados = await historicoChuvaAnual(local.latitude, local.longitude);
          await entregarImagem(ctx, gerarGraficoChuvaAnual(local.nomeExibicao, dados), "image/png",
            `Histórico de chuva — ${local.nomeExibicao}`);
          return { enviado: true, local: local.nomeExibicao, dados };
        }
        const dados = await chuvaMensalComparada(local.latitude, local.longitude);
        await entregarImagem(ctx, gerarGraficoChuvaMensal(local.nomeExibicao, dados), "image/png",
          `Chuva mês a mês — ${local.nomeExibicao}`);
        return { enviado: true, local: local.nomeExibicao, ...dados };
      } catch (error) {
        return {
          erro: error instanceof Error ? error.message : "Não consegui buscar o histórico de chuva agora.",
        };
      }
    }

    case "previsao_tempo": {
      try {
        const local = await localDoClima(argumentos, ctx);
        if ("erro" in local) return local;
        const dias = await previsaoTempo(local.latitude, local.longitude);
        const grafico = gerarGraficoPrevisao(local.nomeExibicao, dias);
        await entregarImagem(ctx, grafico,
          "image/png",
          `Previsão de chuva — ${local.nomeExibicao}`
        );
        return { enviado: true, local: local.nomeExibicao, dias };
      } catch (error) {
        return {
          erro: error instanceof Error ? error.message : "Não consegui buscar a previsão do tempo agora.",
        };
      }
    }

    case "cotacao_agricola": {
      const nomeProduto = String(argumentos.produto ?? "").trim();
      if (!nomeProduto) return { erro: "Informe o produto." };
      const produto = encontrarProduto(nomeProduto);
      if (!produto) {
        return {
          erro: `Não tenho cotação de "${nomeProduto}". Produtos disponíveis: ${PRODUTOS_COTACAO.map((p) => p.nome).join(", ")}.`,
        };
      }
      try {
        const cotacao = await buscarCotacao(produto.slug);
        return {
          produto: produto.nome,
          unidade: cotacao.unidade,
          indicadores: cotacao.indicadores,
        };
      } catch (error) {
        return {
          erro: error instanceof Error ? error.message : "Não consegui buscar a cotação agora.",
        };
      }
    }

    case "historico_cotacao": {
      const nomeProduto = String(argumentos.produto ?? "").trim();
      if (!nomeProduto) return { erro: "Informe o produto." };
      const produto = encontrarProduto(nomeProduto);
      if (!produto) {
        return {
          erro: `Não tenho cotação de "${nomeProduto}". Produtos disponíveis: ${PRODUTOS_COTACAO.map((p) => p.nome).join(", ")}.`,
        };
      }
      const anos = Number(argumentos.anos) || 10;
      try {
        const serie = await buscarSerieHistorica(produto.slug);
        const anual = mediaPrecoAnual(serie, anos);
        const grafico = gerarGraficoPrecoAnual(produto.nome, anual);
        await entregarImagem(ctx, grafico,
          "image/png",
          `Histórico de preço — ${produto.nome}`
        );
        return { enviado: true, produto: produto.nome, dados: anual };
      } catch (error) {
        return {
          erro: error instanceof Error ? error.message : "Não consegui buscar o histórico de preço agora.",
        };
      }
    }

    default:
      return { erro: `Ferramenta desconhecida: ${nome}` };
  }
}
