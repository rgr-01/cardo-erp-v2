/**
 * Confere a extração revisada do PDF com o catálogo existente.
 * npx tsx scripts/importar-detalhes-produtos.ts           # simulação
 * npx tsx scripts/importar-detalhes-produtos.ts --aplicar # só preenche campos vazios
 * Não cria produtos, renomeia, altera preços ou sobrescreve dados existentes.
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { z } from "zod";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { detalhesProdutoSchema } from "../src/lib/produtos";

const fonteSchema = z.object({
  fonte: z.string(), sha256: z.string(), duplicatasIgnoradas: z.array(z.string()),
  produtos: z.array(detalhesProdutoSchema.extend({
    fornecedor: z.string(), produto: z.string(), textoOriginal: z.string(), observacao: z.string().nullable(),
  })),
});
const fonte = fonteSchema.parse(JSON.parse(readFileSync("scripts/dados/produtos-tabela-2026-27-v4.json", "utf8")));
const normalizar = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
// Correspondências confirmadas pelo usuário; nenhuma aproximação por prefixo.
const aliases: Record<string, string> = {
  "brandt:manniplexbmoly": "MANNI-PLEX B-MOLY 23.24",
  "redeagro:nbattbrady": "N-batt",
};
const campos = ["ingredienteAtivo", "embalagem", "recomendacao"] as const;
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL, max: 1 }) });

async function main() {
  const produtos = await prisma.produto.findMany({ include: { fornecedor: { select: { nome: true } } } });
  const ausentes: string[] = [];
  const preservados: string[] = [];
  const ids = new Set<string>();
  const plano: { id: string; produto: string; data: Partial<Record<typeof campos[number], string>> }[] = [];
  for (const registro of fonte.produtos) {
    const fornecedor = normalizar(registro.fornecedor);
    const nome = normalizar(aliases[`${fornecedor}:${normalizar(registro.produto)}`] ?? registro.produto);
    const candidatos = produtos.filter((p) => normalizar(p.fornecedor.nome) === fornecedor && normalizar(p.nome) === nome);
    if (!candidatos.length) {
      ausentes.push(`${registro.fornecedor} / ${registro.produto}${registro.embalagem ? ` (${registro.embalagem})` : ""}`);
      continue;
    }
    if (candidatos.length !== 1) throw new Error(`Correspondência ambígua: ${registro.produto}`);
    const produto = candidatos[0];
    if (ids.has(produto.id)) throw new Error(`Mais de uma embalagem do PDF corresponde a ${produto.nome}; revisar manualmente.`);
    ids.add(produto.id);
    const data: Partial<Record<typeof campos[number], string>> = {};
    for (const campo of campos) {
      const valor = registro[campo];
      if (!valor) continue;
      if (!produto[campo]?.trim()) data[campo] = valor;
      else if (produto[campo] !== valor) preservados.push(`${produto.nome}: ${campo}`);
    }
    if (Object.keys(data).length) plano.push({ id: produto.id, produto: `${registro.fornecedor} / ${produto.nome}`, data });
  }
  console.log(JSON.stringify({ fonte: fonte.fonte, encontrados: ids.size, atualizar: plano.length,
    ausentes, preservados, duplicatasIgnoradas: fonte.duplicatasIgnoradas,
    observacoes: fonte.produtos.filter((p) => p.observacao).map((p) => ({ produto: p.produto, observacao: p.observacao })),
    plano }, null, 2));
  if (!process.argv.includes("--aplicar")) return;
  await prisma.$transaction(async (tx) => {
    for (const item of plano) {
      for (const campo of campos) {
        const valor = item.data[campo];
        if (valor == null) continue;
        const atualizado = await tx.produto.updateMany({
          where: { id: item.id, [campo]: produtos.find((p) => p.id === item.id)![campo] },
          data: { [campo]: valor },
        });
        if (atualizado.count !== 1) throw new Error(`O cadastro mudou durante a importação: ${item.produto}. Tente novamente.`);
      }
    }
  }, { timeout: 60000 });
  const conferidos = await prisma.produto.findMany({ where: { id: { in: plano.map((p) => p.id) } } });
  for (const item of plano) {
    const salvo = conferidos.find((p) => p.id === item.id);
    if (!salvo || campos.some((c) => item.data[c] != null && salvo[c] !== item.data[c])) throw new Error(`Falha na conferência: ${item.produto}`);
  }
  console.log(`Importação concluída e conferida: ${plano.length} produtos atualizados.`);
}
main().catch((erro) => { console.error(erro instanceof Error ? erro.message : "Falha na importação"); process.exitCode = 1; }).finally(() => prisma.$disconnect());
