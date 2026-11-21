"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { enviarBufferLogoRelatorio, enviarBufferMarcaEmpresa, excluirArquivo } from "@/lib/storage";
import { exigirAdmin, comErro, type ResultadoAcao } from "@/app/actions/helpers";

// Configurações da empresa do ADM logado (a empresa vem do usuário, nunca do
// formulário).
async function empresaDoAdmin(): Promise<string> {
  const sessao = await exigirAdmin();
  const usuario = await prisma.user.findUnique({ where: { id: sessao.id }, select: { empresaId: true } });
  if (!usuario) throw new Error("Usuário não encontrado.");
  return usuario.empresaId;
}

function revalidar() {
  revalidatePath("/", "layout");
}

const textoOpcional = z
  .string()
  .trim()
  .optional()
  .transform((v) => v || null);

const dadosSchema = z.object({
  nomeFantasia: z.string().trim().min(1, "Nome da empresa é obrigatório"),
  razaoSocial: textoOpcional,
  cnpj: textoOpcional,
  regimeTributario: textoOpcional,
  endereco: textoOpcional,
  cidadeUfCep: textoOpcional,
  corPrimaria: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, "Cor inválida (use #rrggbb)")
    .optional()
    .or(z.literal(""))
    .transform((v) => v || null),
});

export type DadosEmpresaInput = z.input<typeof dadosSchema>;

export async function salvarDadosEmpresa(input: DadosEmpresaInput): Promise<ResultadoAcao> {
  try {
    const empresaId = await empresaDoAdmin();
    const dados = dadosSchema.parse(input);
    await prisma.empresa.update({ where: { id: empresaId }, data: dados });
    revalidar();
    return { ok: true };
  } catch (error) {
    return comErro(error);
  }
}

const CAMPO_DO_TIPO = {
  logo: "logoPath",
  "logo-escuro": "logoEscuroPath",
  icone: "iconePath",
} as const;
type TipoMarca = keyof typeof CAMPO_DO_TIPO;

function tipoValido(tipo: unknown): TipoMarca {
  if (tipo === "logo" || tipo === "logo-escuro" || tipo === "icone") return tipo;
  throw new Error("Tipo de imagem inválido.");
}

// Arquivo antigo no storage sai junto; os de public/ ("/marca/...") ficam.
async function apagarAnterior(path: string | null) {
  if (path && !path.startsWith("/")) await excluirArquivo(path).catch(() => undefined);
}

export async function enviarMarcaEmpresa(formData: FormData): Promise<ResultadoAcao> {
  try {
    const empresaId = await empresaDoAdmin();
    const tipo = tipoValido(formData.get("tipo"));
    const arquivo = formData.get("arquivo");
    if (!(arquivo instanceof File) || arquivo.size === 0) throw new Error("Escolha uma imagem.");
    const buffer = Buffer.from(await arquivo.arrayBuffer());
    const enviado = await enviarBufferMarcaEmpresa(buffer, arquivo.type, arquivo.name, empresaId, tipo);

    const campo = CAMPO_DO_TIPO[tipo];
    const atual = await prisma.empresa.findUnique({ where: { id: empresaId }, select: { [campo]: true } });
    await prisma.empresa.update({ where: { id: empresaId }, data: { [campo]: enviado.path } });
    await apagarAnterior((atual as Record<string, string | null> | null)?.[campo] ?? null);
    revalidar();
    return { ok: true };
  } catch (error) {
    return comErro(error);
  }
}

export async function removerMarcaEmpresa(tipoBruto: string): Promise<ResultadoAcao> {
  try {
    const empresaId = await empresaDoAdmin();
    const campo = CAMPO_DO_TIPO[tipoValido(tipoBruto)];
    const atual = await prisma.empresa.findUnique({ where: { id: empresaId }, select: { [campo]: true } });
    await prisma.empresa.update({ where: { id: empresaId }, data: { [campo]: null } });
    await apagarAnterior((atual as Record<string, string | null> | null)?.[campo] ?? null);
    revalidar();
    return { ok: true };
  } catch (error) {
    return comErro(error);
  }
}

// Biblioteca de logos dos relatórios: parceiros e programas da empresa.
export async function enviarLogoRelatorio(formData: FormData): Promise<ResultadoAcao> {
  try {
    const empresaId = await empresaDoAdmin();
    const nome = String(formData.get("nome") ?? "").trim();
    if (!nome) throw new Error("Dê um nome à logo.");
    const tipo = formData.get("tipo") === "PROGRAMA" ? "PROGRAMA" : "PARCEIRO";
    const arquivo = formData.get("arquivo");
    if (!(arquivo instanceof File) || arquivo.size === 0) throw new Error("Escolha uma imagem.");
    const buffer = Buffer.from(await arquivo.arrayBuffer());
    const enviado = await enviarBufferLogoRelatorio(buffer, arquivo.type, arquivo.name, empresaId);
    await prisma.logoRelatorio.create({ data: { nome, tipo, path: enviado.path } });
    revalidar();
    return { ok: true };
  } catch (error) {
    return comErro(error);
  }
}

// O arquivo só sai do storage se nenhum relatório ainda usa a logo.
export async function removerLogoRelatorio(id: string): Promise<ResultadoAcao> {
  try {
    await empresaDoAdmin();
    const logo = await prisma.logoRelatorio.findFirstOrThrow({ where: { id } });
    await prisma.logoRelatorio.delete({ where: { id } });
    const emUso = await prisma.relatorioVisita.count({ where: { OR: [{ logoParceiroPath: logo.path }, { logoPrincipalPath: logo.path }] } });
    if (!emUso) await excluirArquivo(logo.path).catch(() => undefined);
    revalidar();
    return { ok: true };
  } catch (error) {
    return comErro(error);
  }
}
