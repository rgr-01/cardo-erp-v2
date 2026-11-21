import type { PDFDocument, PDFImage } from "pdf-lib";
import { prisma, empresaIdAtual } from "@/lib/prisma";
import { criarUrlAssinada, storageConfigurado } from "@/lib/storage";
import { registrarLogoEmpresa } from "@/lib/marca/pdf";

// Dados da empresa vendedora usados nos documentos comerciais (Configurações).
export type DadosEmpresa = {
  id: string;
  // Cor da marca (#rrggbb) escolhida em Configurações; nula = cores padrão.
  cor: string | null;
  razaoSocial: string;
  nomeFantasia: string;
  cnpj: string;
  regimeTributario: string;
  endereco: string;
  cidadeUfCep: string;
};

export async function dadosEmpresaAtual(): Promise<DadosEmpresa> {
  const id = await empresaIdAtual();
  const e = id ? await prisma.empresa.findUnique({ where: { id } }) : null;
  return {
    id: e?.id ?? "",
    cor: e?.corPrimaria ?? null,
    razaoSocial: e?.razaoSocial || e?.nomeFantasia || "",
    nomeFantasia: e?.nomeFantasia || "",
    cnpj: e?.cnpj || "",
    regimeTributario: e?.regimeTributario || "",
    endereco: e?.endereco || "",
    cidadeUfCep: e?.cidadeUfCep || "",
  };
}

async function embutirDoStorage(pdf: PDFDocument, path: string | null): Promise<PDFImage | null> {
  if (!path || path.startsWith("/") || !storageConfigurado()) return null;
  try {
    const resposta = await fetch(await criarUrlAssinada(path, 300));
    if (!resposta.ok) return null;
    const bytes = new Uint8Array(await resposta.arrayBuffer());
    // pdf-lib só embute PNG e JPEG (WebP fica sem logo).
    if (bytes[0] === 0x89 && bytes[1] === 0x50) return await pdf.embedPng(bytes);
    if (bytes[0] === 0xff && bytes[1] === 0xd8) return await pdf.embedJpg(bytes);
    return null;
  } catch {
    return null;
  }
}

// Põe no PDF a logo da empresa atual. A Rede Agro (logo em public/marca) e
// documentos fora de contexto (link público) seguem com a logo vetorial.
export async function prepararMarcaPdf(pdf: PDFDocument): Promise<void> {
  const id = await empresaIdAtual();
  if (!id) return;
  const e = await prisma.empresa.findUnique({ where: { id }, select: { logoPath: true, logoEscuroPath: true } });
  if (!e || e.logoPath?.startsWith("/marca/")) return;
  const [claro, escuro] = await Promise.all([embutirDoStorage(pdf, e.logoPath), embutirDoStorage(pdf, e.logoEscuroPath)]);
  registrarLogoEmpresa(pdf, claro || escuro ? { claro, escuro } : null);
}
