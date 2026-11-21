import "dotenv/config";
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type StatusVenda } from "../src/generated/prisma/client";

// IDs estáveis e upserts sem atualização preservam registros e edições ao repetir.
async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("Configure DATABASE_URL.");
  const url = new URL(connectionString);
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || url.pathname !== "/cardo_erp") {
    throw new Error("Dados demonstrativos permitidos somente no banco local cardo_erp.");
  }
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  try {
    const admin = await prisma.user.findUnique({ where: { email: process.env.LOCAL_ADMIN_EMAIL?.trim().toLowerCase() ?? "" } });
    if (!admin || admin.empresaId !== "empresa_local" || admin.role !== "ADMIN") {
      throw new Error("Inicialize o administrador da empresa_local com npm run db:local.");
    }
    const empresaId = admin.empresaId;
    const id = (tipo: string, n: number) => `demo_local_${tipo}_${n}`;
    const agora = new Date();
    const dia = (deslocamento: number) => new Date(agora.getTime() + deslocamento * 86_400_000);
    const mes = (deslocamento: number, data = 15) => new Date(Date.UTC(agora.getFullYear(), agora.getMonth() + deslocamento, data, 15));
    if (!process.argv.includes("--verificar")) {
      const senhaHash = await bcrypt.hash(randomBytes(32).toString("hex"), 12);
      await prisma.$transaction(async (tx) => {
        const safra = await tx.safra.upsert({
          where: { empresaId_nome: { empresaId, nome: "26/27" } }, update: {},
          create: { empresaId, nome: "26/27" },
        });
        const safraId = safra.id;
        await tx.meta.upsert({ where: { safraId }, update: {}, create: { empresaId, safraId, valor: 4_000_000 } });
        const nomes = ["Ana Martins", "Bruno Oliveira", "Camila Santos", "Diego Almeida"];
        const cores = ["#2563eb", "#d97706", "#059669", "#dc2626"];
        for (let i = 0; i < nomes.length; i++) {
          await tx.user.upsert({ where: { id: id("consultor", i) }, update: {}, create: {
            id: id("consultor", i), empresaId, nome: `${nomes[i]} (Demo)`,
            email: `consultor${i + 1}@demo.cardo.invalid`, senhaHash, role: "CONSULTOR", corMapa: cores[i],
          } });
        }
        const cidades = [
          ["Rio Verde", "GO", -17.79, -50.92], ["Jataí", "GO", -17.88, -51.71],
          ["Rondonópolis", "MT", -16.47, -54.64], ["Sorriso", "MT", -12.54, -55.72],
          ["Uberlândia", "MG", -18.91, -48.27], ["Dourados", "MS", -22.22, -54.81],
        ] as const;
        const fazendas = ["Boa Vista", "Santa Helena", "Horizonte", "Bela Safra", "Primavera", "Sol Nascente", "Campo Verde", "Esperança", "Água Limpa", "Buritis", "Cedro", "Palmeiras", "Vale do Sol", "Santa Clara", "Ipê", "Santa Rita", "Três Lagoas", "Estrela", "Canaã", "São Bento"];
        for (let i = 0; i < fazendas.length; i++) {
          const [cidade, uf, lat, lng] = cidades[i % cidades.length];
          await tx.cliente.upsert({ where: { id: id("cliente", i) }, update: {}, create: {
            id: id("cliente", i), empresaId, nome: `Agro ${fazendas[i]} (Demo)`, cidade, uf,
            email: `cliente${i + 1}@demo.cardo.invalid`, consultorId: id("consultor", i % 4),
            areaPlantio: 350 + i * 85, areaTotal: 500 + i * 110, pctSoja: 60, pctMilho: 30, pctFeijao: 10,
            latitude: lat + (i % 5) * 0.025, longitude: lng + (i % 4) * 0.03,
          } });
          await tx.fazenda.upsert({ where: { id: id("fazenda", i) }, update: {}, create: {
            id: id("fazenda", i), empresaId, clienteId: id("cliente", i), nome: `Fazenda ${fazendas[i]} (Demo)`,
            cidade, uf, area: 350 + i * 85, latitude: lat + (i % 5) * 0.025, longitude: lng + (i % 4) * 0.03,
          } });
        }
        const fornecedores = ["Agro Horizonte", "BioCampo", "Sementes Aurora", "NutriSolo"];
        const produtos = ["Fertilizante NPK 08-28-16", "Bioestimulante Raiz", "Semente Soja 260", "Fertilizante Foliar", "Condicionador de Solo", "Inoculante Biológico", "Semente Milho 700", "Micronutrientes Mix", "Adjuvante Agrícola", "Controle Biológico", "Semente Sorgo 400", "Nutrição Potássica"];
        for (let i = 0; i < fornecedores.length; i++) {
          await tx.fornecedor.upsert({ where: { id: id("fornecedor", i) }, update: {}, create: {
            id: id("fornecedor", i), empresaId, nome: `${fornecedores[i]} (Demo)`,
          } });
        }
        for (let i = 0; i < produtos.length; i++) {
          const preco = 80 + i * 35;
          await tx.produto.upsert({ where: { id: id("produto", i) }, update: {}, create: {
            id: id("produto", i), empresaId, nome: `${produtos[i]} (Demo)`, fornecedorId: id("fornecedor", i % 4),
            custoCompra: preco * 0.68, custoAvista: preco, custoAprazo: preco * 1.08, margemPct: 0.32,
            embalagem: i % 3 === 0 ? "Saco 50 kg" : "Embalagem 5 L", recomendacao: "Produto fictício para demonstração.",
          } });
        }
        const status: StatusVenda[] = ["FATURADO", "FATURADO", "EM_CARTEIRA", "FECHADO", "NEGOCIACAO", "PROSPECCAO", "CANCELADO", "NEGOCIACAO"];
        const culturas = ["Soja", "Milho", "Algodão", "Feijão", "Sorgo"];
        for (let i = 0; i < 120; i++) {
          const produto = i % 12;
          const cliente = i % 20;
          const preco = 80 + produto * 35;
          const volume = 50 + (i * 37) % 350;
          const total = preco * volume;
          const st = status[Math.floor(i / 4) % status.length];
          const data = i >= 100 ? dia(-(i % 4)) : mes(-5 + Math.floor(i / 20), 2 + (i % 19));
          const encerrado = ["FATURADO", "EM_CARTEIRA", "FECHADO"].includes(st);
          await tx.venda.upsert({ where: { id: id("venda", i) }, update: {}, create: {
            id: id("venda", i), empresaId, safraId, clienteId: id("cliente", cliente), consultorId: id("consultor", cliente % 4),
            produtoId: id("produto", produto), cultura: culturas[i % 5], volume, valorUnitario: preco, valorTotal: total,
            status: st, dataFechamento: encerrado ? data : null, previsaoEntrega: dia(7 + i % 30),
            createdAt: data, updatedAt: data, observacoes: "DADOS FICTÍCIOS — demonstração local.",
          } });
          if (st === "PROSPECCAO" || st === "CANCELADO") continue;
          const propostaId = id("proposta", i);
          await tx.proposta.upsert({ where: { id: propostaId }, update: {}, create: {
            id: propostaId, empresaId, safraId, clienteId: id("cliente", cliente), consultorId: id("consultor", cliente % 4),
            tipo: encerrado ? "PEDIDO" : "PROPOSTA", status: encerrado ? "ACEITA" : "ENVIADA",
            subtotal: total, total, margemPct: 0.32, localEntrega: `Fazenda ${fazendas[cliente]} (Demo)`, frete: "CIF",
            condicaoPagamento: "30 dias", condicaoPagamentoTipo: "APRAZO", validade: dia(15),
            dataFaturamento: st === "FATURADO" ? data : null, autorizadoFaturarEm: st === "FATURADO" ? data : null,
            createdAt: data, updatedAt: data, observacoes: "DADOS FICTÍCIOS — sem emissão ou cobrança real.",
          } });
          await tx.propostaItem.upsert({ where: { id: id("item", i) }, update: {}, create: {
            id: id("item", i), empresaId, propostaId, produtoId: id("produto", produto), vendaId: id("venda", i),
            cultura: culturas[i % 5], volume, unidade: "UN", valorUnitario: preco, custoUnitario: preco * 0.68, total,
          } });
          if (st !== "FATURADO") continue;
          await tx.notaFiscal.upsert({ where: { propostaId }, update: {}, create: {
            id: id("nota", i), empresaId, propostaId, status: "EMITIDA", numero: `DEMO-${i + 1}`, valor: total,
            dataEmissao: data, ambiente: "HOMOLOGACAO", observacoes: "Registro fictício, sem validade fiscal.",
          } });
          const pago = Math.floor(i / 4) % 2 === 0;
          await tx.boleto.upsert({ where: { propostaId }, update: {}, create: {
            id: id("boleto", i), empresaId, propostaId, status: pago ? "PAGO" : "EMITIDO", valor: total,
            vencimento: new Date(data.getTime() + 30 * 86_400_000), dataPagamento: pago ? data : null,
            numeroDocumento: `DEMO-${i + 1}`, observacoes: "Simulação local, sem boleto bancário real.",
          } });
        }
        for (let i = 0; i < 48; i++) {
          // Quatro clientes sem visita e quatro sem visita recente, para os alertas.
          const cliente = i % 16;
          const agendada = i >= 40;
          const data = agendada ? dia(1 + i % 7) : dia(cliente >= 12 ? -45 - i % 15 : -(i % 14));
          await tx.relatorioVisita.upsert({ where: { id: id("visita", i) }, update: {}, create: {
            id: id("visita", i), empresaId, safraId, clienteId: id("cliente", cliente), fazendaId: id("fazenda", cliente),
            consultorId: id("consultor", cliente % 4), dataVisita: data, status: agendada ? "AGENDADA" : "FECHADA",
            categoria: ["COMERCIAL", "TECNICA", "POS_VENDA", "RELACIONAMENTO"][Math.floor(i / 4) % 4],
            titulo: `Acompanhamento de lavoura (Demo) ${i + 1}`, finalidade: "Acompanhamento da safra e planejamento comercial",
            texto: "Relatório fictício: avaliação da lavoura, alinhamento do manejo e levantamento das necessidades de insumos. Próxima visita prevista para acompanhamento dos resultados.",
            horaChegada: agendada ? null : data, horaSaida: agendada ? null : new Date(data.getTime() + 3_600_000),
          } });
        }
        await tx.grupoDespesa.upsert({ where: { id: id("grupo", 0) }, update: {}, create: {
          id: id("grupo", 0), empresaId, nome: "Operação Comercial (Demo)",
        } });
        const categorias = ["COMBUSTIVEL", "ALIMENTACAO", "HOSPEDAGEM", "MANUTENCAO_VEICULO"] as const;
        for (let i = 0; i < 4; i++) {
          await tx.contaDespesa.upsert({ where: { id: id("conta", i) }, update: {}, create: {
            id: id("conta", i), empresaId, grupoId: id("grupo", 0), codigo: `DEMO.${i + 1}`,
            nome: `${["Combustível", "Alimentação", "Hospedagem", "Manutenção"][i]} (Demo)`, orcamentoPadrao: 8000 + i * 2000,
          } });
          await tx.orcamentoContaDespesa.upsert({ where: { contaId_safraId: { contaId: id("conta", i), safraId } }, update: {}, create: {
            empresaId, safraId, contaId: id("conta", i), valorMensal: 8000 + i * 2000,
          } });
        }
        for (let i = 0; i < 60; i++) {
          const pago = i % 3 !== 0;
          await tx.despesa.upsert({ where: { id: id("despesa", i) }, update: {}, create: {
            id: id("despesa", i), empresaId, safraId, consultorId: id("consultor", i % 4),
            clienteId: id("cliente", i % 20), contaId: id("conta", i % 4), categoria: categorias[i % 4],
            valor: 120 + (i * 137) % 1800, data: i >= 40 ? dia(-i % 4) : mes(-2 + i % 3, 2 + i % 25),
            vencimento: dia(-10 + i % 50), situacao: pago ? "PAGO" : "A_PAGAR", filial: "Matriz (Demo)",
            estabelecimento: "Fornecedor Fictício (Demo)", descricao: "Despesa fictícia de atendimento comercial.", documento: `DEMO-${i + 1}`,
          } });
        }
        for (let i = 0; i < 24; i++) {
          const pago = Math.floor(i / 2) % 3 === 0;
          await tx.tituloFinanceiro.upsert({ where: { id: id("titulo", i) }, update: {}, create: {
            id: id("titulo", i), empresaId, tipo: i % 2 === 0 ? "RECEBER" : "PAGAR", status: pago ? "PAGO" : "ABERTO",
            descricao: `Lançamento demonstrativo ${i + 1}`, clienteId: i % 2 === 0 ? id("cliente", i % 20) : null,
            favorecido: "Empresa Fictícia (Demo)", valor: 2500 + i * 475, vencimento: mes(-2 + i % 6, 3 + i % 24),
            dataPagamento: pago ? mes(-2 + i % 3, 2 + i % 20) : null, observacoes: "DADOS FICTÍCIOS — sem cobrança real.",
          } });
        }
      }, { timeout: 120_000 });
    }
    const filtro = { empresaId };
    const safras = await prisma.safra.findMany({ where: filtro, select: { nome: true, id: true }, orderBy: { createdAt: "desc" } });
    const [vendas, visitas, despesas, titulos, clientes, consultores] = await Promise.all([
      prisma.venda.groupBy({ by: ["status"], where: filtro, _count: true, _sum: { valorTotal: true } }),
      prisma.relatorioVisita.count({ where: filtro }), prisma.despesa.count({ where: filtro }),
      prisma.tituloFinanceiro.count({ where: filtro }), prisma.cliente.count({ where: filtro }),
      prisma.user.count({ where: { ...filtro, role: "CONSULTOR" } }),
    ]);
    console.log(JSON.stringify({ empresa: empresaId, safras, clientes, consultores, vendas, visitas, despesas, titulos }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Falha ao popular demonstração.");
  process.exitCode = 1;
});
