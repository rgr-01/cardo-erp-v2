/**
 * Importa o backup de visitas do TBDC (xlsx, aba "visitas") como RelatorioVisita.
 *
 *   npx tsx scripts/importar-visitas-tbdc.ts <arquivo.xlsx>            # simulação
 *   npx tsx scripts/importar-visitas-tbdc.ts <arquivo.xlsx> --aplicar  # grava
 *   ... --aplicar --apagar-testes   # antes, apaga relatórios sem idExterno
 *   ... --aplicar --cadastrar-pendentes   # antes, cria clientes/consultor que faltavam
 *
 * Seguro contra re-execução: cada visita tem idExterno (hash) e é pulada se já
 * existir. Visitas de proprietário sem cliente ou de consultor sem usuário não
 * são criadas; ficam listadas no final.
 */
import "dotenv/config";
import * as XLSX from "xlsx";
import bcrypt from "bcryptjs";
import { createHash, randomBytes } from "crypto";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { excluirFotoVisita } from "../src/lib/storage";
import { categoriaDoTipoTbdc, safraDaData } from "../src/lib/visitas-categoria";

const arquivo = process.argv[2];
const APLICAR = process.argv.includes("--aplicar");
const APAGAR_TESTES = process.argv.includes("--apagar-testes");
const CADASTRAR_PENDENTES = process.argv.includes("--cadastrar-pendentes");
if (!arquivo) throw new Error("Informe o caminho do xlsx.");

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const norm = (s: unknown) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
const texto = (v: unknown) => (v == null || String(v).trim() === "" ? null : String(v).trim());
const num = (v: unknown) => {
  if (v == null || String(v).trim() === "") return null;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

// O TBDC grava no horário de Brasília, sem fuso.
function data(v: unknown): Date | null {
  if (v == null || v === "") return null;
  if (v instanceof Date) return v;
  const m = String(v).match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})/);
  const d = new Date(m ? `${m[1]}T${m[2]}-03:00` : String(v));
  return Number.isNaN(d.getTime()) ? null : d;
}

// Proprietário do TBDC -> cliente que já existe no sistema com outro nome
// (conferido à mão contra as fazendas de cada cadastro). Chaves e valores sem
// acento e em maiúsculas. Quem não está aqui nem em NOVOS_CLIENTES fica de fora.
const ALIAS_CLIENTE: Record<string, string> = {
  "ADIR PARIZZI": "GRUPO ADIR PARIZZI",
  "ZERO ROGLIN": "ZENO JOSE ROGLIN",
  "EVANDRO STREIT": "EVANDRO LUIS STREIT",
  "GRUPO TALISMA": "TALISMA SEMENTES",
  // Confirmados pelo Claudio (eram ambíguos).
  EVANDRO: "EVANDRO GERMINIANI",
  "GRUPO PIVETTA": "JOSE ADIR PIVETTA",
};

// Clientes que faltavam no cadastro: proprietário do TBDC (como veio) -> nome
// do cliente a criar. "HERBERT CONSULTOR" visitou a Fazenda Caraíbas, a mesma
// do Agro Sponchiado, e entra nele.
const NOVOS_CLIENTES: Record<string, string> = {
  "ANTONIO / ADOMAR / ELOIR ZADINELLO": "Antônio / Adomar / Eloir Zadinello",
  "AGRO SPONCHIADO": "Agro Sponchiado",
  "FAZENDA UNIAO": "Fazenda União",
  "FAZENDA MIAMI": "Fazenda Miami",
  "JEFERSON VICENZI": "Jeferson Vicenzi",
  "JOANA JONER": "Joana Joner",
};
const ALIAS_PARA_NOVO: Record<string, string> = { "HERBERT CONSULTOR": "AGRO SPONCHIADO" };

// Consultores do TBDC sem usuário no sistema: criados inativos (sem acesso),
// só para guardar o histórico de visitas.
const NOVOS_CONSULTORES = [{ primeiroNome: "GABRIELA", nome: "Gabriela Lopes", email: "gabriela.lopes@importado.redeagro.invalid" }];

type Preparada = {
  idExterno: string;
  cId: string;
  uId: string;
  fazendaNome: string;
  lat: number | null;
  lng: number | null;
  safraNome: string;
  dataVisita: Date;
  chegada: Date | null;
  saida: Date | null;
  tipo: "VISITA";
  categoria: string;
  finalidade: string | null;
  titulo: string;
  texto: string;
  linkExterno: string | null;
};

async function main() {
  const wb = XLSX.readFile(arquivo, { raw: true });
  const linhas = XLSX.utils
    .sheet_to_json<unknown[]>(wb.Sheets["visitas"], { header: 1, raw: true, defval: null })
    .slice(1);
  console.log(`Linhas na planilha: ${linhas.length}`);

  const [clientes, usuarios, safras, existentes] = await Promise.all([
    prisma.cliente.findMany({ select: { id: true, nome: true } }),
    prisma.user.findMany({ select: { id: true, nome: true } }),
    prisma.safra.findMany(),
    prisma.relatorioVisita.findMany({ where: { idExterno: { not: null } }, select: { idExterno: true } }),
  ]);
  const primeiro = (s: string) => norm(s).split(" ")[0];
  const indexarUsuarios = () => {
    const mapa = new Map<string, string[]>();
    for (const u of usuarios) {
      const k = primeiro(u.nome);
      mapa.set(k, [...(mapa.get(k) ?? []), u.id]);
    }
    return mapa;
  };

  if (CADASTRAR_PENDENTES) {
    // Consultores primeiro: os clientes novos ficam na carteira de quem os visitou.
    for (const n of NOVOS_CONSULTORES) {
      if (usuarios.some((u) => primeiro(u.nome) === n.primeiroNome)) continue;
      console.log(`${APLICAR ? "Criando" : "Criaria"} consultor inativo: ${n.nome}`);
      if (APLICAR) {
        const senhaHash = await bcrypt.hash(randomBytes(24).toString("hex"), 10);
        const u = await prisma.user.create({
          data: { nome: n.nome, email: n.email, senhaHash, role: "CONSULTOR", ativo: false },
        });
        usuarios.push({ id: u.id, nome: u.nome });
      } else usuarios.push({ id: `simulado:${n.nome}`, nome: n.nome });
    }
    const porPrimeiroNome = indexarUsuarios();
    const visitantes = new Map<string, Set<string>>();
    for (const l of linhas) {
      const dono = norm(l[2]);
      const chave = ALIAS_PARA_NOVO[dono] ?? dono;
      if (NOVOS_CLIENTES[chave]) visitantes.set(chave, (visitantes.get(chave) ?? new Set()).add(primeiro(String(l[7] ?? ""))));
    }
    for (const [chave, nome] of Object.entries(NOVOS_CLIENTES)) {
      if (clientes.some((c) => norm(c.nome) === norm(nome))) continue;
      const quem = [...(visitantes.get(chave) ?? [])];
      const ids = quem.length === 1 ? porPrimeiroNome.get(quem[0]) : undefined;
      const consultorId = ids?.length === 1 && !ids[0].startsWith("simulado:") ? ids[0] : null;
      console.log(`${APLICAR ? "Criando" : "Criaria"} cliente: ${nome} (consultor: ${quem.join(", ") || "-"})`);
      if (APLICAR) {
        const c = await prisma.cliente.create({ data: { nome, consultorId } });
        clientes.push({ id: c.id, nome });
      } else clientes.push({ id: `simulado:${nome}`, nome });
    }
  }

  const clientePorNome = new Map(clientes.map((c) => [norm(c.nome), c.id]));
  const usuarioPorPrimeiroNome = indexarUsuarios();
  const jaImportados = new Set(existentes.map((e) => e.idExterno));
  const safraId = new Map(safras.map((s) => [s.nome, s.id]));

  const semCliente = new Map<string, number>();
  const semConsultor = new Map<string, number>();
  let repetidas = 0;
  const preparadas = new Map<string, Preparada>();

  for (const l of linhas) {
    const [idFaz, fazenda, prop, , , chk, chkOut, consultor, lat, lng, visita, tipoTbdc, obs, , , url] = l;
    const dono = norm(prop);
    const cId =
      clientePorNome.get(dono) ??
      clientePorNome.get(norm(fazenda)) ??
      // Cadastro por fazenda: "Marcelino Flores - Selo Verde".
      clientePorNome.get(norm(`${prop} - ${fazenda}`)) ??
      clientePorNome.get(norm(ALIAS_CLIENTE[dono] ?? "")) ??
      clientePorNome.get(norm(NOVOS_CLIENTES[ALIAS_PARA_NOVO[dono] ?? dono] ?? ""));
    if (!cId) {
      const k = String(prop);
      semCliente.set(k, (semCliente.get(k) ?? 0) + 1);
      continue;
    }
    const uIds = usuarioPorPrimeiroNome.get(primeiro(String(consultor ?? ""))) ?? [];
    if (uIds.length !== 1) {
      const k = `${consultor} (${uIds.length} usuários)`;
      semConsultor.set(k, (semConsultor.get(k) ?? 0) + 1);
      continue;
    }
    const chegada = data(chk);
    const dataVisita = data(visita) ?? chegada;
    if (!dataVisita) continue;
    const saida = data(chkOut);
    const chave = `${idFaz}|${dataVisita.toISOString()}|${norm(consultor)}|${norm(tipoTbdc)}`;
    const idExterno = createHash("sha1").update(chave).digest("hex");
    if (preparadas.has(idExterno)) {
      repetidas++;
      continue;
    }
    const link = texto(url);
    preparadas.set(idExterno, {
      idExterno,
      cId,
      uId: uIds[0],
      fazendaNome: String(fazenda).trim(),
      lat: num(lat),
      lng: num(lng),
      // A safra é o ano da visita (a coluna "Safra" do TBDC não é usada).
      safraNome: safraDaData(dataVisita),
      dataVisita,
      chegada,
      saida: saida && chegada && saida >= chegada ? saida : null,
      // "Visita técnica" do TBDC é uma visita (categoria Técnica), não um laudo:
      // TECNICO é só pra relatório com capa/ensaio próprio.
      tipo: "VISITA",
      categoria: categoriaDoTipoTbdc(texto(tipoTbdc)),
      finalidade: texto(tipoTbdc),
      titulo: texto(tipoTbdc) ?? "Visita",
      texto: [texto(obs) ?? "Importado do TBDC.", link ? `Relatório original: ${link}` : null]
        .filter(Boolean)
        .join("\n\n"),
      linkExterno: link,
    });
  }

  const novas = [...preparadas.values()].filter((p) => !jaImportados.has(p.idExterno));
  const porSafra = new Map<string, number>();
  for (const p of novas) porSafra.set(p.safraNome, (porSafra.get(p.safraNome) ?? 0) + 1);
  const total = (m: Map<string, number>) => [...m.values()].reduce((a, b) => a + b, 0);

  console.log(
    `\nVisitas a criar: ${novas.length} (já importadas: ${preparadas.size - novas.length}, repetidas na planilha: ${repetidas})`,
  );
  console.log("Por safra:", Object.fromEntries(porSafra));
  console.log(`Fazendas distintas: ${new Set(novas.map((p) => `${p.cId}|${norm(p.fazendaNome)}`)).size}`);
  console.log(`\nSem cliente (${total(semCliente)} visitas):`);
  console.table([...semCliente].sort((a, b) => b[1] - a[1]).map(([nome, n]) => ({ proprietario: nome, visitas: n })));
  console.log(`Sem consultor (${total(semConsultor)} visitas):`, Object.fromEntries(semConsultor));

  const testes = await prisma.relatorioVisita.findMany({
    where: { idExterno: null },
    select: { id: true, fotos: { select: { id: true, path: true } } },
  });
  console.log(
    `\nRelatórios existentes sem idExterno (testes): ${testes.length}, com ${testes.reduce((a, t) => a + t.fotos.length, 0)} fotos`,
  );

  if (!APLICAR) return console.log("\nSimulação: nada foi gravado. Use --aplicar.");

  if (APAGAR_TESTES && testes.length) {
    for (const f of testes.flatMap((t) => t.fotos)) {
      await excluirFotoVisita(f.path).catch((e) => console.warn(`Foto ${f.path} não removida do storage:`, e?.message));
    }
    const r = await prisma.relatorioVisita.deleteMany({ where: { idExterno: null } });
    console.log(`Apagados ${r.count} relatórios de teste.`);
  }
  for (const s of porSafra.keys()) {
    // createdAt no início da safra: o app usa a data de criação pra achar a "mais recente".
    if (!safraId.has(s)) {
      const criada = await prisma.safra.create({ data: { nome: s, createdAt: new Date(`20${s.slice(0, 2)}-01-01T12:00:00Z`) } });
      safraId.set(s, criada.id);
    }
  }
  const fazendaId = new Map<string, string>();
  let feitas = 0;
  for (const p of novas) {
    const k = `${p.cId}|${norm(p.fazendaNome)}`;
    if (!fazendaId.has(k)) {
      const f = await prisma.fazenda.upsert({
        where: { clienteId_nome: { clienteId: p.cId, nome: p.fazendaNome } },
        update: {},
        create: { clienteId: p.cId, nome: p.fazendaNome, latitude: p.lat, longitude: p.lng },
      });
      fazendaId.set(k, f.id);
    }
    await prisma.relatorioVisita.create({
      data: {
        idExterno: p.idExterno,
        clienteId: p.cId,
        fazendaId: fazendaId.get(k),
        consultorId: p.uId,
        safraId: safraId.get(p.safraNome)!,
        dataVisita: p.dataVisita,
        horaChegada: p.chegada,
        horaSaida: p.saida,
        latitude: p.lat,
        longitude: p.lng,
        tipo: p.tipo,
        categoria: p.categoria,
        finalidade: p.finalidade,
        titulo: p.titulo,
        texto: p.texto,
        linkExterno: p.linkExterno,
        status: "FECHADA",
      },
    });
    if (++feitas % 250 === 0) console.log(`  ${feitas}/${novas.length}`);
  }
  console.log(`Criadas ${feitas} visitas.`);
}

main().finally(() => prisma.$disconnect());
