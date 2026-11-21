import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("Configure DATABASE_URL.");
  const url = new URL(connectionString);
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || url.pathname !== "/cardo_erp") throw new Error("Verificação permitida apenas no banco local cardo_erp.");
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString, max: 10 }) });
  const empresas = [0, 1].map(n => `teste_numeracao_${randomUUID()}_${n}`);
  try {
    const [clientesExistentes, fornecedoresExistentes] = await Promise.all([
      prisma.cliente.findMany({ select: { empresaId: true, numero: true } }),
      prisma.fornecedor.findMany({ select: { empresaId: true, numero: true } }),
    ]);
    for (const registros of [clientesExistentes, fornecedoresExistentes]) {
      const vistos = new Set<string>();
      for (const registro of registros) {
        assert.ok(registro.numero > 0);
        const chave = `${registro.empresaId}:${registro.numero}`;
        assert.ok(!vistos.has(chave), "Número duplicado nos cadastros existentes.");
        vistos.add(chave);
      }
    }
    await prisma.empresa.createMany({ data: empresas.map(id => ({ id, nomeFantasia: "Teste temporário de numeração" })) });
    const [clientes, fornecedores] = await Promise.all([
      Promise.all(Array.from({ length: 12 }, (_, i) => prisma.cliente.create({ data: { nome: `Cliente concorrente ${i}`, empresaId: empresas[0] } }))),
      Promise.all(Array.from({ length: 8 }, (_, i) => prisma.fornecedor.create({ data: { nome: `Fornecedor concorrente ${i}`, empresaId: empresas[0] } }))),
    ]);
    assert.deepEqual(clientes.map(c => c.numero).sort((a, b) => a - b), Array.from({ length: 12 }, (_, i) => i + 1));
    assert.deepEqual(fornecedores.map(f => f.numero).sort((a, b) => a - b), Array.from({ length: 8 }, (_, i) => i + 1));
    const outroCliente = await prisma.cliente.create({ data: { nome: "Cliente de outra empresa", empresaId: empresas[1] } });
    const outroFornecedor = await prisma.fornecedor.create({ data: { nome: "Fornecedor de outra empresa", empresaId: empresas[1] } });
    assert.equal(outroCliente.numero, 1);
    assert.equal(outroFornecedor.numero, 1);

    const manual = await prisma.cliente.create({ data: { nome: "Número manual ignorado", numero: 99999, empresaId: empresas[0] } });
    assert.equal(manual.numero, 13);
    await prisma.cliente.delete({ where: { id: manual.id } });
    const seguinte = await prisma.cliente.create({ data: { nome: "Após exclusão", empresaId: empresas[0] } });
    assert.equal(seguinte.numero, 14, "A exclusão não deve reutilizar números.");
    const renomeado = await prisma.cliente.update({ where: { id: clientes[0].id }, data: { nome: "Cliente renomeado" } });
    assert.equal(renomeado.numero, clientes[0].numero);
    await assert.rejects(prisma.cliente.update({ where: { id: clientes[0].id }, data: { numero: 777 } }), /nao podem ser alterados/);
    await assert.rejects(prisma.fornecedor.update({ where: { id: fornecedores[0].id }, data: { numero: 777 } }), /nao podem ser alterados/);
    await assert.rejects(prisma.$transaction(async tx => {
      await tx.fornecedor.create({ data: { nome: "Transação revertida", empresaId: empresas[0] } });
      throw new Error("rollback-test");
    }), /rollback-test/);
    const aposRollback = await prisma.fornecedor.create({ data: { nome: "Após rollback", empresaId: empresas[0] } });
    assert.equal(aposRollback.numero, 9);
    console.log(JSON.stringify({ clientesExistentes: clientesExistentes.length, fornecedoresExistentes: fornecedoresExistentes.length, concorrencia: "12 clientes e 8 fornecedores sem duplicidade", empresasIndependentes: true, numeroImutavel: true, exclusaoSemReutilizacao: true, rollback: true }));
  } finally {
    try {
      await prisma.$transaction([
        prisma.cliente.deleteMany({ where: { empresaId: { in: empresas } } }),
        prisma.fornecedor.deleteMany({ where: { empresaId: { in: empresas } } }),
        prisma.empresa.deleteMany({ where: { id: { in: empresas } } }),
      ]);
    } finally { await prisma.$disconnect(); }
  }
}

main().catch(error => { console.error(error instanceof Error ? error.message : "Falha na verificação."); process.exitCode = 1; });
