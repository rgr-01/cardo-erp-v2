// servidor.ts — o app como extensão do web: tudo que já está no servidor
// (relatórios, despesas, pedidos/propostas, clientes) para ver, editar,
// atualizar e excluir, com as mesmas regras do web (o servidor decide).
//
// Leitura: a última resposta de cada lista/detalhe fica em cache no SQLite,
// então dá pra consultar sem sinal. Escrita: exige estar online — não há fila
// de edições (evita conflito com o que foi mudado no web nesse meio tempo).

import NetInfo from "@react-native-community/netinfo";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";

import {
  API_URL,
  TIMEOUT_UPLOAD_MS,
  SessaoExpiradaError,
  autenticado,
  tratarResposta,
  type CategoriaDespesa,
} from "@/lib/api";
import { getToken } from "@/lib/auth-storage";
import { db, gravarCache, lerCache, type Lido } from "@/lib/banco";

export { gravarCache, lerCache, type Lido };

// ---------------------------------------------------------------------------
// Tipos (espelham o que a API /api/mobile devolve)
// ---------------------------------------------------------------------------

export type Ref = { id: string; nome: string };

type Geometria = { pagina: number; x: number; y: number; w: number; h: number };

export type BlocoTexto = Partial<Geometria> & {
  id: string;
  tipo: "texto";
  texto: string;
  estilo?: "card" | "simples";
  titulo?: string | null;
  secao?: "sintese" | "observacoes" | "analise" | "encaminhamentos";
  /** No PDF, o bloco começa no topo de uma página nova. */
  novaPagina?: boolean;
};

export type BlocoFoto = Partial<Geometria> & {
  id: string;
  tipo: "foto";
  url: string;
  path: string | null;
  legenda: string | null;
  estilo?: "card" | "simples";
  titulo?: string | null;
  largura?: "metade" | "inteira";
  novaPagina?: boolean;
};

export type BlocoGrafico = Partial<Geometria> & {
  id: string;
  tipo: "grafico";
  titulo: string;
  formato: "barra" | "linha" | "pizza";
  series: string[];
  linhas: { rotulo: string; valores: (number | null)[] }[];
  largura?: "metade" | "inteira";
  novaPagina?: boolean;
};

/** Padrão de quem não escolheu: gráfico em largura inteira, foto em meia. */
export function larguraDoBloco(bloco: BlocoFoto | BlocoGrafico): "metade" | "inteira" {
  return bloco.largura ?? (bloco.tipo === "grafico" ? "inteira" : "metade");
}

export type Bloco = BlocoTexto | BlocoFoto | BlocoGrafico;

export type RelatorioResumo = {
  id: string;
  tipo: "VISITA" | "TECNICO" | string;
  titulo: string | null;
  resumo: string;
  status: string;
  dataVisita: string;
  atualizadoEm: string;
  clienteId: string;
  clienteNome: string;
  fazendaNome: string | null;
  consultorNome: string;
  capaUrl: string | null;
  fotos: number;
  podeEditar: boolean;
};

export type RelatorioDetalhe = {
  id: string;
  tipo: string;
  titulo: string | null;
  texto: string;
  status: string;
  dataVisita: string;
  atualizadoEm: string;
  cliente: Ref;
  fazenda: Ref | null;
  consultorNome: string;
  safra: Ref;
  blocos: Bloco[];
  rastreamento: {
    finalidade: string | null;
    horaChegada: string | null;
    horaSaida: string | null;
    kmChegada: number | null;
    kmSaida: number | null;
    latitude: number | null;
    longitude: number | null;
  };
  podeEditar: boolean;
};

export type DespesaServidor = {
  id: string;
  categoria: CategoriaDespesa;
  valor: number;
  data: string;
  estabelecimento: string | null;
  descricao: string | null;
  origemOcr: boolean;
  cliente: Ref | null;
  consultorNome: string;
  safra: Ref;
  fotos: { id: string; url: string }[];
  atualizadoEm: string;
  podeEditar: boolean;
};

export type StatusProposta = "RASCUNHO" | "ENVIADA" | "ACEITA" | "RECUSADA" | "CANCELADA";

export type ItemProposta = {
  id?: string;
  produtoId: string;
  produtoNome: string;
  fornecedorNome: string;
  vendaId: string | null;
  cultura: string | null;
  volume: number | null;
  unidade: string | null;
  valorUnitario: number | null;
  total?: number;
};

export type PropostaServidor = {
  id: string;
  numero: number;
  codigo: string;
  tipo: "PEDIDO" | "PROPOSTA";
  status: StatusProposta;
  cliente: Ref;
  consultor: Ref;
  safra: Ref;
  validade: string | null;
  previsaoEntrega: string | null;
  condicaoPagamento: string | null;
  observacoes: string | null;
  subtotal: number;
  desconto: number;
  total: number;
  itens: ItemProposta[];
  criadoEm: string;
  atualizadoEm: string;
  podeEditar: boolean;
};

export type ClienteServidor = {
  id: string;
  nome: string;
  documento: string | null;
  razaoSocial: string | null;
  inscricaoEstadual: string | null;
  telefone: string | null;
  email: string | null;
  endereco: string | null;
  cidade: string | null;
  uf: string | null;
  cep: string | null;
  ctv: string | null;
  areaPlantio: number | null;
  areaTotal: number | null;
  latitude: number | null;
  longitude: number | null;
  consultorId: string | null;
  consultorNome: string | null;
  ultimaVisita: string | null;
  totais?: { vendas: number; relatoriosVisita: number; propostas: number; despesas: number };
  fazendas?: FazendaServidor[];
};

export type FazendaServidor = {
  id: string;
  clienteId?: string;
  nome: string;
  cidade?: string | null;
  uf?: string | null;
  area?: number | null;
  latitude?: number | null;
  longitude?: number | null;
};

export type FazendaEntrada = {
  nome: string;
  cidade?: string | null;
  uf?: string | null;
  area?: number | null;
  latitude?: number | null;
  longitude?: number | null;
};

export type Produto = { id: string; nome: string; fornecedor: { nome: string } };

// ---------------------------------------------------------------------------
// Cache local (consulta offline)
// ---------------------------------------------------------------------------

export async function apagarCache(chave: string): Promise<void> {
  const d = await db();
  await d.runAsync(`DELETE FROM cache_servidor WHERE chave = ?`, [chave]);
}

/** Limpa tudo que veio do servidor (ex.: ao sair da conta). */
export async function limparCacheServidor(): Promise<void> {
  const d = await db();
  await d.runAsync(`DELETE FROM cache_servidor`);
}

// ---------------------------------------------------------------------------
// Chamadas
// ---------------------------------------------------------------------------

export class SemConexaoError extends Error {
  constructor() {
    super("Sem conexão. Para editar é preciso estar online.");
  }
}

/** Edição só com internet: falha cedo, com mensagem clara, em vez de timeout. */
export async function exigirOnline(): Promise<void> {
  const estado = await NetInfo.fetch();
  if (estado.isConnected === false) throw new SemConexaoError();
}

async function obter<T>(path: string): Promise<T> {
  return tratarResposta<T>(await autenticado(path));
}

async function enviarJson<T>(path: string, method: string, body?: unknown): Promise<T> {
  await exigirOnline();
  const resp = await autenticado(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return tratarResposta<T>(resp);
}

async function enviarForm<T>(path: string, method: string, formData: FormData): Promise<T> {
  await exigirOnline();
  const resp = await autenticado(path, { method, body: formData, timeoutMs: TIMEOUT_UPLOAD_MS });
  return tratarResposta<T>(resp);
}

export type FotoLocal = { uri: string; nome: string; tipo: string };

// Chaves de cache: uma por lista/detalhe.
export const chaves = {
  relatorios: "relatorios",
  relatorio: (id: string) => `relatorio:${id}`,
  despesas: "despesas",
  despesa: (id: string) => `despesa:${id}`,
  propostas: (tipo: "PEDIDO" | "PROPOSTA") => `propostas:${tipo}`,
  proposta: (id: string) => `proposta:${id}`,
  clientes: "clientes",
  cliente: (id: string) => `cliente:${id}`,
  produtos: "produtos",
};

// Relatórios de visita
export const servidor = {
  relatorios: () => obter<RelatorioResumo[]>("/api/mobile/relatorios-visita"),
  relatorio: (id: string) => obter<RelatorioDetalhe>(`/api/mobile/relatorios-visita/${id}`),
  atualizarRelatorio: (
    id: string,
    dados: {
      titulo: string | null;
      dataVisita: string | null;
      fazendaId: string | null;
      conteudo: Bloco[];
    }
  ) => enviarJson<RelatorioDetalhe>(`/api/mobile/relatorios-visita/${id}`, "PATCH", dados),
  excluirRelatorio: (id: string) =>
    enviarJson<{ ok: true }>(`/api/mobile/relatorios-visita/${id}`, "DELETE"),
  enviarFotoRelatorio: (id: string, foto: FotoLocal) => {
    const formData = new FormData();
    formData.append("foto", new File(foto.uri));
    return enviarForm<{ url: string; path: string }>(
      `/api/mobile/relatorios-visita/${id}/fotos`,
      "POST",
      formData
    );
  },

  // Despesas
  despesas: () => obter<DespesaServidor[]>("/api/mobile/despesas"),
  despesa: (id: string) => obter<DespesaServidor>(`/api/mobile/despesas/${id}`),
  atualizarDespesa: (
    id: string,
    dados: {
      categoria: CategoriaDespesa;
      valor: number;
      data: string | null;
      clienteId: string | null;
      estabelecimento: string | null;
      descricao: string | null;
    },
    fotosNovas: FotoLocal[]
  ) => {
    const formData = new FormData();
    formData.append("categoria", dados.categoria);
    formData.append("valor", String(dados.valor));
    if (dados.data) formData.append("data", dados.data);
    if (dados.clienteId) formData.append("clienteId", dados.clienteId);
    if (dados.estabelecimento) formData.append("estabelecimento", dados.estabelecimento);
    if (dados.descricao) formData.append("descricao", dados.descricao);
    for (const foto of fotosNovas) formData.append("fotos", new File(foto.uri));
    return enviarForm<DespesaServidor>(`/api/mobile/despesas/${id}`, "PATCH", formData);
  },
  excluirFotoDespesa: (id: string, fotoId: string) =>
    enviarJson<DespesaServidor>(`/api/mobile/despesas/${id}/fotos/${fotoId}`, "DELETE"),
  excluirDespesa: (id: string) => enviarJson<{ ok: true }>(`/api/mobile/despesas/${id}`, "DELETE"),

  // Pedidos e propostas
  propostas: (tipo: "PEDIDO" | "PROPOSTA") =>
    obter<PropostaServidor[]>(`/api/mobile/pedidos?tipo=${tipo}`),
  proposta: (id: string) => obter<PropostaServidor>(`/api/mobile/pedidos/${id}`),
  atualizarProposta: (
    id: string,
    dados: {
      clienteId: string;
      validade: string | null;
      previsaoEntrega: string | null;
      condicaoPagamento: string | null;
      observacoes: string | null;
      desconto: number;
      itens: {
        produtoId: string;
        vendaId: string | null;
        cultura: string | null;
        volume: number | null;
        unidade: string | null;
        valorUnitario: number | null;
      }[];
    }
  ) => enviarJson<PropostaServidor>(`/api/mobile/pedidos/${id}`, "PUT", dados),
  alterarStatusProposta: (id: string, status: StatusProposta) =>
    enviarJson<PropostaServidor>(`/api/mobile/pedidos/${id}/status`, "POST", { status }),
  aprovarPedido: (id: string) =>
    enviarJson<PropostaServidor>(`/api/mobile/pedidos/${id}/aprovar`, "POST"),
  excluirProposta: (id: string) => enviarJson<{ ok: true }>(`/api/mobile/pedidos/${id}`, "DELETE"),

  // Clientes
  clientes: () => obter<ClienteServidor[]>("/api/mobile/clientes?completo=1"),
  cliente: (id: string) => obter<ClienteServidor>(`/api/mobile/clientes/${id}`),
  criarCliente: (dados: Partial<ClienteServidor>) =>
    enviarJson<{ id: string }>("/api/mobile/clientes", "POST", dados),
  atualizarCliente: (id: string, dados: Partial<ClienteServidor>) =>
    enviarJson<ClienteServidor>(`/api/mobile/clientes/${id}`, "PATCH", dados),
  atualizarLocalizacaoCliente: (id: string, latitude: number, longitude: number) =>
    enviarJson<ClienteServidor>(`/api/mobile/clientes/${id}/localizacao`, "PUT", {
      latitude,
      longitude,
    }),
  excluirCliente: (id: string) => enviarJson<{ ok: true }>(`/api/mobile/clientes/${id}`, "DELETE"),

  // Fazendas de um cliente
  criarFazenda: (clienteId: string, dados: FazendaEntrada) =>
    enviarJson<FazendaServidor>(`/api/mobile/clientes/${clienteId}/fazendas`, "POST", dados),
  atualizarFazenda: (id: string, dados: FazendaEntrada) =>
    enviarJson<FazendaServidor>(`/api/mobile/fazendas/${id}`, "PATCH", dados),
  excluirFazenda: (id: string) => enviarJson<{ ok: true }>(`/api/mobile/fazendas/${id}`, "DELETE"),

  produtos: () => obter<Produto[]>("/api/mobile/produtos"),
};

/**
 * Baixa o PDF gerado pelo servidor (mesmo PDF do web) e abre a folha de
 * compartilhamento do sistema — WhatsApp, e-mail, salvar em arquivos etc.
 */
export async function compartilharPdf(path: string, nomeArquivo: string): Promise<void> {
  await exigirOnline();
  const token = await getToken();
  if (!token) throw new SessaoExpiradaError();

  const nome = nomeArquivo.replace(/[^a-zA-Z0-9._-]+/g, "-");
  const destino = new File(Paths.cache, nome);
  if (destino.exists) destino.delete();

  let arquivo: File;
  try {
    arquivo = await File.downloadFileAsync(`${API_URL}${path}`, destino, {
      headers: { Authorization: `Bearer ${token}` },
      idempotent: true,
    });
  } catch (e) {
    // O download falha sem corpo legível; refaz a chamada pra pegar a
    // mensagem do servidor (ex.: "complete o cadastro do cliente").
    await tratarResposta(await autenticado(path));
    throw e;
  }

  if (!(await Sharing.isAvailableAsync())) {
    throw new Error("Compartilhamento não disponível neste aparelho.");
  }
  await Sharing.shareAsync(arquivo.uri, { mimeType: "application/pdf", dialogTitle: nome });
}
