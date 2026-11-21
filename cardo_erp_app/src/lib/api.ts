import { File } from "expo-file-system";
import { getToken, limparSessao } from "@/lib/auth-storage";
import { comCache } from "@/lib/banco";

export const API_URL = process.env.EXPO_PUBLIC_API_URL;

export class SessaoExpiradaError extends Error {
  constructor() {
    super("Sessão expirada. Faça login novamente.");
  }
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
  }
}

/**
 * O servidor entra em modo de espera (sleep) quando ninguém usa por um
 * tempo, e a primeira requisição depois disso pode levar bem mais que o
 * normal para responder enquanto ele "acorda". Chamar isso antes de
 * sincronizar a fila evita que a primeira tentativa real caia por timeout.
 */
export async function acordarServidor(): Promise<void> {
  const tentativas = [8000, 15000, 20000];
  for (const timeoutMs of tentativas) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      // Rota pública leve — o objetivo é só fazer o container subir,
      // não importa a resposta.
      await fetch(`${API_URL}/api/mobile/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
        signal: controller.signal,
      });
      return;
    } catch {
      // tenta de novo com um timeout maior — o cold start pode levar alguns segundos
    } finally {
      clearTimeout(timer);
    }
  }
}

export async function tratarResposta<T>(resp: Response): Promise<T> {
  if (resp.status === 401) {
    await limparSessao();
    throw new SessaoExpiradaError();
  }
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new ApiError(data?.erro ?? "Erro inesperado.", resp.status);
  }
  return data as T;
}

/** Marca da empresa do usuário (null = Cardo AI, a marca padrão do app). */
export type MarcaEmpresa = {
  id: string;
  nome: string;
  cor: string;
  destaque: string;
  logoClaro: string | null;
  logoEscuro: string | null;
};

export async function apiLogin(
  email: string,
  senha: string
): Promise<{
  token: string;
  usuario: { id: string; nome: string; role: "ADMIN" | "CONSULTOR" };
  empresa?: MarcaEmpresa | null;
}> {
  const resp = await fetch(`${API_URL}/api/mobile/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, senha }),
  });
  return tratarResposta(resp);
}

// Uploads (fotos) e a extração por IA levam mais tempo que uma chamada
// comum — o timeout padrão do fetch em alguns dispositivos é curto demais
// e derrubava essas chamadas antes de terem chance de terminar. Fotos de
// câmera real (não os testes de poucos KB) podem levar bem mais em rede
// móvel, daí o timeout de upload generoso.
const TIMEOUT_PADRAO_MS = 20000;
export const TIMEOUT_UPLOAD_MS = 90000;

export async function autenticado(
  path: string,
  init?: RequestInit & { timeoutMs?: number }
) {
  const token = await getToken();
  if (!token) throw new SessaoExpiradaError();

  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Bearer ${token}`);

  const { timeoutMs, ...resto } = init ?? {};
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs ?? TIMEOUT_PADRAO_MS);
  try {
    return await fetch(`${API_URL}${path}`, {
      ...resto,
      headers,
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(
        `Tempo esgotado ao conectar com o servidor (${path}). Verifique sua conexão e tente novamente.`
      );
    }
    if (error instanceof TypeError) {
      throw new Error(
        `Falha de rede ao conectar com o servidor (${path}): ${error.message}`
      );
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export async function apiMarca(): Promise<MarcaEmpresa | null> {
  const { empresa } = await tratarResposta<{ empresa: MarcaEmpresa | null }>(await autenticado("/api/mobile/marca"));
  return empresa;
}

// Safra e clientes alimentam os formulários de criação, que funcionam sem
// sinal: a última resposta fica guardada e é usada quando não há conexão.
export async function apiSafraAtual(): Promise<{ id: string; nome: string }> {
  return comCache("safra-atual", async () => tratarResposta(await autenticado("/api/mobile/safra-atual")));
}

export type ClienteOpcao = { id: string; nome: string; fazendas: { id: string; nome: string }[] };

export async function apiClientes(): Promise<ClienteOpcao[]> {
  return comCache("clientes-opcoes", async () => tratarResposta(await autenticado("/api/mobile/clientes")));
}

export async function apiCriarRelatorioVisita(dados: {
  clienteId: string;
  fazendaId?: string;
  safraId: string;
  titulo?: string;
  texto: string;
  dataVisita?: string;
  fotos: { uri: string; nome: string; tipo: string }[];
}): Promise<{ id: string }> {
  const formData = new FormData();
  formData.append("clienteId", dados.clienteId);
  if (dados.fazendaId) formData.append("fazendaId", dados.fazendaId);
  formData.append("safraId", dados.safraId);
  formData.append("texto", dados.texto);
  if (dados.titulo) formData.append("titulo", dados.titulo);
  if (dados.dataVisita) formData.append("dataVisita", dados.dataVisita);
  for (const foto of dados.fotos) {
    formData.append("fotos", new File(foto.uri));
  }

  const resp = await autenticado("/api/mobile/relatorios-visita", {
    method: "POST",
    body: formData,
    timeoutMs: TIMEOUT_UPLOAD_MS,
  });
  return tratarResposta(resp);
}

export type CategoriaDespesa =
  | "COMBUSTIVEL"
  | "ALIMENTACAO"
  | "HOSPEDAGEM"
  | "MANUTENCAO_VEICULO"
  | "PEDAGIO"
  | "MATERIAL_ESCRITORIO"
  | "OUTROS";

export type ExtracaoDespesa = {
  valor: number | null;
  data: string | null;
  estabelecimento: string | null;
  categoria: CategoriaDespesa | null;
  confianca: "alta" | "media" | "baixa";
};

export async function apiExtrairDespesa(foto: {
  uri: string;
  nome: string;
  tipo: string;
}): Promise<ExtracaoDespesa> {
  const formData = new FormData();
  formData.append("foto", new File(foto.uri));

  const resp = await autenticado("/api/mobile/despesas/extrair", {
    method: "POST",
    body: formData,
    timeoutMs: TIMEOUT_UPLOAD_MS,
  });
  return tratarResposta(resp);
}

export async function apiCriarDespesa(dados: {
  categoria: CategoriaDespesa;
  valor: number;
  safraId: string;
  data?: string;
  clienteId?: string;
  estabelecimento?: string;
  descricao?: string;
  origemOcr?: boolean;
  fotos: { uri: string; nome: string; tipo: string }[];
}): Promise<{ id: string }> {
  const formData = new FormData();
  formData.append("categoria", dados.categoria);
  formData.append("valor", String(dados.valor));
  formData.append("safraId", dados.safraId);
  if (dados.data) formData.append("data", dados.data);
  if (dados.clienteId) formData.append("clienteId", dados.clienteId);
  if (dados.estabelecimento) formData.append("estabelecimento", dados.estabelecimento);
  if (dados.descricao) formData.append("descricao", dados.descricao);
  formData.append("origemOcr", dados.origemOcr ? "true" : "false");
  for (const foto of dados.fotos) {
    formData.append("fotos", new File(foto.uri));
  }

  const resp = await autenticado("/api/mobile/despesas", {
    method: "POST",
    body: formData,
    timeoutMs: TIMEOUT_UPLOAD_MS,
  });
  return tratarResposta(resp);
}

export async function apiProdutos(): Promise<
  { id: string; nome: string; fornecedor: { nome: string } }[]
> {
  const resp = await autenticado("/api/mobile/produtos");
  return tratarResposta(resp);
}

export async function apiCriarPedido(dados: {
  clienteId: string;
  safraId: string;
  itens: {
    produtoId: string;
    volume?: number;
    unidade?: string;
    valorUnitario?: number;
  }[];
  observacoes?: string;
}): Promise<{ id: string; numero: number }> {
  const resp = await autenticado("/api/mobile/pedidos", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(dados),
  });
  return tratarResposta(resp);
}
