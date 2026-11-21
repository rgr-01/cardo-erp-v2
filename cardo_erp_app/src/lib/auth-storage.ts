import * as SecureStore from "expo-secure-store";
import type { MarcaEmpresa } from "@/lib/api";

const CHAVE_TOKEN = "rede_agro_token";
const CHAVE_USUARIO = "rede_agro_usuario";
const CHAVE_CREDENCIAIS = "rede_agro_credenciais";
const CHAVE_MARCA = "cardo_marca_empresa";

export type UsuarioSessao = {
  id: string;
  nome: string;
  role: "ADMIN" | "CONSULTOR";
};

export async function salvarSessao(token: string, usuario: UsuarioSessao) {
  await SecureStore.setItemAsync(CHAVE_TOKEN, token);
  await SecureStore.setItemAsync(CHAVE_USUARIO, JSON.stringify(usuario));
}

export async function getToken(): Promise<string | null> {
  return SecureStore.getItemAsync(CHAVE_TOKEN);
}

export async function getUsuario(): Promise<UsuarioSessao | null> {
  const raw = await SecureStore.getItemAsync(CHAVE_USUARIO);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as UsuarioSessao;
  } catch {
    return null;
  }
}

export async function limparSessao() {
  await SecureStore.deleteItemAsync(CHAVE_TOKEN);
  await SecureStore.deleteItemAsync(CHAVE_USUARIO);
}

export type Credenciais = { email: string; senha: string };

export async function salvarCredenciais(email: string, senha: string) {
  await SecureStore.setItemAsync(CHAVE_CREDENCIAIS, JSON.stringify({ email, senha }));
}

export async function getCredenciais(): Promise<Credenciais | null> {
  const raw = await SecureStore.getItemAsync(CHAVE_CREDENCIAIS);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Credenciais;
  } catch {
    return null;
  }
}

export async function limparCredenciais() {
  await SecureStore.deleteItemAsync(CHAVE_CREDENCIAIS);
}

// Marca da última empresa que entrou no aparelho: continua depois do Sair,
// para o login já aparecer com a cara dela (igual ao web).
export async function salvarMarca(marca: MarcaEmpresa | null) {
  if (marca) await SecureStore.setItemAsync(CHAVE_MARCA, JSON.stringify(marca));
  else await SecureStore.deleteItemAsync(CHAVE_MARCA);
}

export async function getMarca(): Promise<MarcaEmpresa | null> {
  const raw = await SecureStore.getItemAsync(CHAVE_MARCA);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as MarcaEmpresa;
  } catch {
    return null;
  }
}
