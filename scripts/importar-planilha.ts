/**
 * Importa os dados da planilha original (Google Sheets exportada como xlsx)
 * para o banco Postgres. Coloque o arquivo em data/redeagro.xlsx e rode:
 *
 *   npx tsx scripts/importar-planilha.ts
 *
 * O script é seguro contra re-execução: aborta se já houver vendas no banco.
 */
import "dotenv/config";
import * as XLSX from "xlsx";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";
import path from "path";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const ARQUIVO = path.join(process.cwd(), "data", "redeagro.xlsx");
const SAFRA = "24/27";

// Script de importação da planilha original: grava na Rede Agro.
const EMPRESA_ID = "empresa_redeagro";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

async function obterSafraId(): Promise<string> {
  const safra = await prisma.safra.upsert({
    where: { empresaId_nome: { empresaId: EMPRESA_ID, nome: SAFRA } },
    update: {},
    create: { nome: SAFRA },
  });
  return safra.id;
}

const STATUS_MAP: Record<string, "PROSPECCAO" | "NEGOCIACAO" | "EM_CARTEIRA" | "FATURADO" | "CANCELADO"> = {
  "prospecção": "PROSPECCAO",
  "prospeccao": "PROSPECCAO",
  "negociação": "NEGOCIACAO",
  "negociacao": "NEGOCIACAO",
  "em carteira": "EM_CARTEIRA",
  "faturado": "FATURADO",
  "cancelado": "CANCELADO",
};

const CULTURA_MAP: Record<string, string> = {
  soja: "Soja",
  milho: "Milho",
  sorgo: "Sorgo",
  "algodão": "Algodão",
  algodao: "Algodão",
  feijao: "Feijão",
  "feijão": "Feijão",
  "milho 2ºsafra": "Milho 2ªsafra",
  "milho 2ªsafra": "Milho 2ªsafra",
  "sorgo 2ºsafra": "Sorgo 2ªsafra",
  "sorgo 2ªsafra": "Sorgo 2ªsafra",
  soja_milho: "Soja_milho",
  arroz: "Arroz",
  trigo: "Trigo",
};

function normalizarCultura(v: unknown): string | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  return CULTURA_MAP[s.toLowerCase()] ?? s;
}

function num(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(",", "."));
  return isNaN(n) ? null : n;
}

function pct(v: unknown): number | null {
  const n = num(v);
  if (n == null) return null;
  // Planilha guarda 0.5 para 50%
  return n <= 1 ? n * 100 : n;
}

function data(v: unknown): Date | null {
  if (v == null || v === "") return null;
  if (v instanceof Date) return v;
  if (typeof v === "number") {
    // Serial de data do Excel
    const d = XLSX.SSF.parse_date_code(v);
    if (!d) return null;
    return new Date(Date.UTC(d.y, d.m - 1, d.d));
  }
  const s = String(v).trim();
  const br = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (br) {
    const ano = br[3].length === 2 ? 2000 + Number(br[3]) : Number(br[3]);
    return new Date(Date.UTC(ano, Number(br[2]) - 1, Number(br[1])));
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function senhaAleatoria(): string {
  return randomBytes(5).toString("base64url").slice(0, 8);
}

async function main() {
  const jaTem = await prisma.venda.count();
  if (jaTem > 0) {
    console.error(
      `O banco já possui ${jaTem} vendas. Importação abortada para evitar duplicidade.`
    );
    process.exit(1);
  }

  const wb = XLSX.readFile(ARQUIVO, { cellDates: true });

  // ---------- Usuários ----------
  const credenciais: { nome: string; email: string; senha: string; papel: string }[] = [];

  async function criarUsuario(nome: string, email: string, role: "ADMIN" | "CONSULTOR") {
    const senha = senhaAleatoria();
    const user = await prisma.user.upsert({
      where: { email },
      update: {},
      create: { nome, email, role, senhaHash: await bcrypt.hash(senha, 10) },
    });
    credenciais.push({ nome, email, senha, papel: role });
    return user;
  }

  const admin = await criarUsuario("Administrador", "admin@redeagro.com", "ADMIN");

  // ---------- Clientes ----------
  const wsClientes = wb.Sheets["Clientes"];
  const linhasClientes = XLSX.utils.sheet_to_json<unknown[]>(wsClientes, {
    header: 1,
  });
  let qtdClientes = 0;
  for (const linha of linhasClientes.slice(1)) {
    const nome = String(linha[1] ?? "").trim();
    if (!nome) continue;
    await prisma.cliente.upsert({
      where: { empresaId_nome: { empresaId: EMPRESA_ID, nome } },
      update: {},
      create: {
        nome,
        ctv: String(linha[0] ?? "").trim() || null,
        areaPlantio: num(linha[2]),
        areaTotal: num(linha[3]),
        pctIrrigada: pct(linha[4]),
        pctArroz: pct(linha[5]),
        pctSoja: pct(linha[6]),
        pctMilho: pct(linha[7]),
        pctAlgodao: pct(linha[8]),
        pctFeijao: pct(linha[9]),
        pctTrigo: pct(linha[10]),
        pctMilho2: pct(linha[11]),
        pctSorgo2: pct(linha[12]),
      },
    });
    qtdClientes++;
  }
  console.log(`Clientes importados: ${qtdClientes}`);

  // ---------- Fornecedores e produtos (aba Produtos_status) ----------
  const wsProdutos = wb.Sheets["Produtos_status"];
  const linhasProdutos = XLSX.utils.sheet_to_json<unknown[]>(wsProdutos, {
    header: 1,
  });
  const cabecalho = (linhasProdutos[0] ?? []) as unknown[];
  let qtdProdutos = 0;
  for (let col = 0; col < cabecalho.length; col++) {
    const fornecedorNome = String(cabecalho[col] ?? "").trim();
    if (
      !fornecedorNome ||
      fornecedorNome.toLowerCase().startsWith("empresa") ||
      fornecedorNome.toLowerCase() === "status"
    )
      continue;
    const fornecedor = await prisma.fornecedor.upsert({
      where: { empresaId_nome: { empresaId: EMPRESA_ID, nome: fornecedorNome } },
      update: {},
      create: { nome: fornecedorNome },
    });
    for (const linha of linhasProdutos.slice(1)) {
      const produtoNome = String((linha as unknown[])[col] ?? "").trim();
      if (!produtoNome) continue;
      await prisma.produto.upsert({
        where: {
          nome_fornecedorId: { nome: produtoNome, fornecedorId: fornecedor.id },
        },
        update: {},
        create: { nome: produtoNome, fornecedorId: fornecedor.id },
      });
      qtdProdutos++;
    }
  }
  console.log(`Produtos importados: ${qtdProdutos}`);

  // ---------- Vendas (aba Planejamento_vendas) ----------
  const wsVendas = wb.Sheets["Planejamento_vendas"];
  const linhasVendas = XLSX.utils.sheet_to_json<unknown[]>(wsVendas, {
    header: 1,
  });

  const consultoresCache = new Map<string, string>();
  const clientesCache = new Map<string, string>();
  const fornecedoresCache = new Map<string, string>();
  const produtosCache = new Map<string, string>();
  const safraId = await obterSafraId();

  let qtdVendas = 0;
  let ignoradas = 0;

  for (const linha of linhasVendas.slice(3)) {
    const consultorNome = String(linha[0] ?? "").trim();
    const clienteNome = String(linha[1] ?? "").trim();
    const fornecedorNome = String(linha[2] ?? "").trim();
    const produtoNome = String(linha[3] ?? "").trim();
    if (!clienteNome || !produtoNome || !fornecedorNome) {
      if (clienteNome || produtoNome) ignoradas++;
      continue;
    }

    // Consultor
    let consultorId = consultoresCache.get(consultorNome || "ADMIN");
    if (!consultorId) {
      if (consultorNome) {
        const nomeFormatado =
          consultorNome.charAt(0) + consultorNome.slice(1).toLowerCase();
        const email = `${consultorNome.toLowerCase().replace(/\s+/g, ".")}@redeagro.com`;
        const user =
          (await prisma.user.findUnique({ where: { email } })) ??
          (await criarUsuario(nomeFormatado, email, "CONSULTOR"));
        consultorId = user.id;
      } else {
        consultorId = admin.id;
      }
      consultoresCache.set(consultorNome || "ADMIN", consultorId);
    }

    // Cliente
    let clienteId = clientesCache.get(clienteNome);
    if (!clienteId) {
      const cliente = await prisma.cliente.upsert({
        where: { empresaId_nome: { empresaId: EMPRESA_ID, nome: clienteNome } },
        update: {},
        create: { nome: clienteNome },
      });
      clienteId = cliente.id;
      clientesCache.set(clienteNome, clienteId);
    }

    // Fornecedor
    let fornecedorId = fornecedoresCache.get(fornecedorNome);
    if (!fornecedorId) {
      const fornecedor = await prisma.fornecedor.upsert({
        where: { empresaId_nome: { empresaId: EMPRESA_ID, nome: fornecedorNome } },
        update: {},
        create: { nome: fornecedorNome },
      });
      fornecedorId = fornecedor.id;
      fornecedoresCache.set(fornecedorNome, fornecedorId);
    }

    // Produto
    const chaveProduto = `${fornecedorId}::${produtoNome}`;
    let produtoId = produtosCache.get(chaveProduto);
    if (!produtoId) {
      const produto = await prisma.produto.upsert({
        where: { nome_fornecedorId: { nome: produtoNome, fornecedorId } },
        update: {},
        create: { nome: produtoNome, fornecedorId },
      });
      produtoId = produto.id;
      produtosCache.set(chaveProduto, produtoId);
    }

    const volume = num(linha[5]);
    const valorUnitario = num(linha[6]);
    const valorTotal =
      volume != null && valorUnitario != null
        ? volume * valorUnitario
        : num(linha[7]) ?? 0;
    const statusBruto = String(linha[8] ?? "").trim().toLowerCase();
    const status = STATUS_MAP[statusBruto] ?? "PROSPECCAO";

    await prisma.venda.create({
      data: {
        consultorId,
        clienteId,
        produtoId,
        cultura: normalizarCultura(linha[4]),
        volume,
        valorUnitario,
        valorTotal,
        status,
        dataFechamento: data(linha[9]),
        previsaoEntrega: data(linha[10]),
        observacoes: String(linha[11] ?? "").trim() || null,
        safraId,
      },
    });
    qtdVendas++;
  }
  console.log(`Vendas importadas: ${qtdVendas} (ignoradas: ${ignoradas})`);

  // ---------- Meta ----------
  const totalPipeline = await prisma.venda.aggregate({
    _sum: { valorTotal: true },
    where: { status: { not: "CANCELADO" } },
  });
  const meta = totalPipeline._sum.valorTotal ?? 0;
  await prisma.meta.upsert({
    where: { safraId },
    update: {},
    create: { safraId, valor: meta },
  });
  console.log(
    `Meta da safra ${SAFRA} definida como o potencial total importado (ajuste em /metas).`
  );

  // ---------- Credenciais ----------
  if (credenciais.length > 0) {
    console.log("\n=== CREDENCIAIS GERADAS (anote e altere depois) ===");
    for (const c of credenciais) {
      console.log(`${c.papel.padEnd(10)} ${c.nome.padEnd(16)} ${c.email.padEnd(28)} senha: ${c.senha}`);
    }
    console.log("===================================================\n");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
