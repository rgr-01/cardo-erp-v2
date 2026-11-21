import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { apiLogin, apiMarca, type MarcaEmpresa } from "@/lib/api";
import {
  getCredenciais,
  getMarca,
  getUsuario,
  limparCredenciais,
  limparSessao,
  salvarCredenciais,
  salvarMarca,
  salvarSessao,
  type UsuarioSessao,
} from "@/lib/auth-storage";
import { autenticarBiometria } from "@/lib/biometria";
import { limparCacheServidor } from "@/lib/servidor";

type AuthContextValue = {
  usuario: UsuarioSessao | null;
  carregando: boolean;
  /** Marca da empresa (null = Cardo AI). Fica salva para o login depois do Sair. */
  marca: MarcaEmpresa | null;
  /** "Entrar por outra empresa": o login volta para a marca Cardo AI. */
  esquecerMarca: () => Promise<void>;
  login: (email: string, senha: string, lembrar?: boolean) => Promise<void>;
  loginComBiometria: () => Promise<void>;
  logout: () => Promise<void>;
  /** O servidor recusou o token (401): a sessão já foi limpa, volta pro login. */
  sessaoExpirada: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<UsuarioSessao | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [marca, setMarca] = useState<MarcaEmpresa | null>(null);

  useEffect(() => {
    Promise.all([getUsuario().catch(() => null), getMarca().catch(() => null)])
      .then(([salvo, marcaSalva]) => {
        setUsuario(salvo);
        setMarca(marcaSalva);
        // Logo e cor podem ter mudado (e as URLs das logos vencem): atualiza sem travar a abertura.
        if (salvo) {
          apiMarca()
            .then(async (nova) => {
              await salvarMarca(nova);
              setMarca(nova);
            })
            .catch(() => {});
        }
      })
      .finally(() => setCarregando(false));
  }, []);

  async function login(email: string, senha: string, lembrar = true) {
    const { token, usuario: dadosUsuario, empresa } = await apiLogin(email, senha);
    // Outra pessoa entrando no mesmo aparelho não vê os dados salvos da anterior.
    const anterior = await getUsuario().catch(() => null);
    if (anterior && anterior.id !== dadosUsuario.id) await limparCacheServidor();
    await salvarSessao(token, dadosUsuario);
    if (lembrar) await salvarCredenciais(email, senha);
    else await limparCredenciais();
    await salvarMarca(empresa ?? null);
    setMarca(empresa ?? null);
    setUsuario(dadosUsuario);
  }

  async function loginComBiometria() {
    const credenciais = await getCredenciais();
    if (!credenciais) throw new Error("Nenhuma conta salva neste aparelho.");

    const liberado = await autenticarBiometria();
    if (!liberado) throw new Error("Biometria não reconhecida.");

    await login(credenciais.email, credenciais.senha);
  }

  async function logout() {
    await limparSessao();
    // O login salvo continua: na volta só confirma "Entrar". Desmarcar "Salvar login" apaga.
    await limparCacheServidor();
    setUsuario(null);
  }

  async function esquecerMarca() {
    await salvarMarca(null);
    await limparCredenciais();
    setMarca(null);
  }

  // Estável: é dependência dos hooks que buscam dados no servidor.
  const sessaoExpirada = useCallback(() => setUsuario(null), []);

  return (
    <AuthContext.Provider value={{ usuario, carregando, marca, esquecerMarca, login, loginComBiometria, logout, sessaoExpirada }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth deve ser usado dentro de AuthProvider.");
  return ctx;
}
