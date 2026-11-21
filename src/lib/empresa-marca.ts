import { prisma } from "@/lib/prisma";
import { criarUrlAssinada, storageConfigurado } from "@/lib/storage";
import { normalizarModulos, type Modulo } from "@/lib/modulos";
import { EMPRESA_CARDO_AI } from "@/lib/master";

// Última empresa que entrou neste aparelho: a tela de login mostra a marca dela.
export const COOKIE_EMPRESA_LOGIN = "empresa_login";

export const ICONE_CARDO = "/cardo/icone.svg";

export type MarcaEmpresa = {
  id: string;
  nome: string;
  logoClaro: string | null;
  logoEscuro: string | null;
  icone: string;
  cor: string | null;
  modulos: Modulo[];
};

// Logo começando com "/" é arquivo de public/ (ex.: Rede Agro); o resto é
// caminho no storage e vira URL assinada.
async function urlLogo(path: string | null): Promise<string | null> {
  if (!path) return null;
  if (path.startsWith("/")) return path;
  if (!storageConfigurado()) return null;
  try {
    return await criarUrlAssinada(path, 60 * 60 * 6);
  } catch {
    return null;
  }
}

// Marca para <Logo>/<NomeEmpresa> (MarcaEmpresaProvider) de páginas sem área
// logada, como o link público e a página que o Chromium imprime em PDF.
export async function marcaVisualDaEmpresa(id: string): Promise<{ nome: string; claro: string | null; escuro: string | null } | null> {
  const marca = await marcaDaEmpresa(id);
  return marca ? { nome: marca.nome, claro: marca.logoClaro, escuro: marca.logoEscuro } : null;
}

// Ícone da aba para a empresa do usuário logado (ou do aparelho, no login).
export async function iconeDaEmpresa(id: string | undefined): Promise<string> {
  return (await marcaDaEmpresa(id))?.icone ?? ICONE_CARDO;
}

export async function marcaDaEmpresa(id: string | undefined): Promise<MarcaEmpresa | null> {
  if (!id) return null;
  const empresa = await prisma.empresa.findUnique({ where: { id } });
  if (!empresa?.ativo) return null;
  const [logoClaro, logoEscuro, icone] = await Promise.all([
    urlLogo(empresa.logoPath),
    urlLogo(empresa.logoEscuroPath),
    urlLogo(empresa.iconePath),
  ]);
  return {
    id: empresa.id,
    nome: empresa.nomeFantasia,
    logoClaro,
    logoEscuro,
    icone: icone ?? ICONE_CARDO,
    cor: empresa.corPrimaria,
    modulos: normalizarModulos(empresa.modulos),
  };
}

// Marca para o app: a Cardo AI (equipe interna) fica com a marca padrão do app.
// Logo de public/ vira URL completa; as do storage já vêm assinadas.
export type MarcaApp = { id: string; nome: string; cor: string; destaque: string; logoClaro: string | null; logoEscuro: string | null };

export async function marcaParaApp(empresaId: string, origem: string): Promise<MarcaApp | null> {
  if (empresaId === EMPRESA_CARDO_AI) return null;
  const marca = await marcaDaEmpresa(empresaId);
  if (!marca) return null;
  const absoluta = (url: string | null) => (url?.startsWith("/") ? `${origem}${url}` : url);
  return {
    id: marca.id,
    nome: marca.nome,
    cor: marca.cor ?? "#0F1F4D",
    // Mesmo destaque do login do web: verde na Rede Agro, azul da Cardo nas demais.
    destaque: marca.id === "empresa_redeagro" ? "#00dc4d" : "#2447E6",
    logoClaro: absoluta(marca.logoClaro),
    logoEscuro: absoluta(marca.logoEscuro),
  };
}
