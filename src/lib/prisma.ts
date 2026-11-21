import { Prisma, PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { contextoEmpresa } from "@/lib/empresa-contexto";

const globalForPrisma = globalThis as unknown as {
  prisma?: ReturnType<typeof createClient>;
  prismaSchema?: string;
};

// Após prisma generate, o hot reload precisa descartar o cliente antigo:
// ele ainda consulta apenas os campos do schema carregado anteriormente.
const schemaAtual = JSON.stringify(
  Object.entries(Prisma).filter(([nome]) => nome.endsWith("ScalarFieldEnum"))
);

function createClient() {
  // DATABASE_URL aponta pro pooler do Supabase no modo transação (porta
  // 6543): a conexão só ocupa uma vaga do banco enquanto a consulta roda.
  // No modo sessão (5432) cada cliente parado segurava uma das 15 vagas e o
  // limite estourava (EMAXCONNSESSION). O limite por instância fica baixo do
  // mesmo jeito, por segurança.
  // Conexão parada fica aberta por 5 min: no modo transação ela não segura vaga
  // do banco, e abrir outra (TLS + login, app nos EUA e banco em SP) custava
  // várias idas e voltas na primeira consulta de cada tela.
  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL,
    max: 5,
    idleTimeoutMillis: 300_000,
  });
  const base = new PrismaClient({ adapter });
  return base.$extends(filtroEmpresa(base));
}

// --- Multiempresa -----------------------------------------------------------
// Toda consulta a um model com empresaId é presa à empresa do usuário atual
// (ver src/lib/empresa-contexto.ts). Filhos criados dentro do pai (itens da
// proposta, fotos, versões...) recebem a empresa do pai por gatilho no banco.

const MODELOS_SEM_EMPRESA = new Set(["Empresa"]);
const OPS_COM_WHERE = new Set([
  "findMany",
  "findFirst",
  "findFirstOrThrow",
  "count",
  "aggregate",
  "groupBy",
  "updateMany",
  "updateManyAndReturn",
  "deleteMany",
]);
const OPS_WHERE_UNICO = new Set(["findUnique", "findUniqueOrThrow", "update", "delete", "upsert"]);

// Usuário nunca troca de empresa: o cache evita uma consulta por operação.
const empresaPorUsuario = new Map<string, string>();

async function empresaDoUsuario(base: PrismaClient, userId: string): Promise<string | undefined> {
  const cache = empresaPorUsuario.get(userId);
  if (cache) return cache;
  const usuario = await base.user.findUnique({ where: { id: userId }, select: { empresaId: true } });
  if (usuario) empresaPorUsuario.set(userId, usuario.empresaId);
  return usuario?.empresaId;
}

async function resolverEmpresa(base: PrismaClient): Promise<string | undefined> {
  const contexto = contextoEmpresa();
  if (contexto?.semFiltro) return undefined;
  if (contexto?.empresaId) return contexto.empresaId;
  let userId = contexto?.userId;
  if (!userId) {
    // Sessão web ou, sem ela, token do app mobile. Fora de requisição (cron,
    // script) headers() lança: segue sem filtro.
    try {
      const { auth } = await import("@/auth");
      userId = (await auth())?.user?.id;
      if (!userId) {
        const { headers } = await import("next/headers");
        const { userIdDoTokenMobile } = await import("@/lib/mobile-auth");
        userId = await userIdDoTokenMobile((await headers()).get("authorization"));
      }
    } catch {
      userId = undefined;
    }
  }
  return userId ? empresaDoUsuario(base, userId) : undefined;
}

type Dados = Record<string, unknown>;

// Create "checked" (com connect em relação) não aceita a FK escalar. Se já veio
// alguma FK escalar (ex.: safraId), o create é "unchecked" — connect em lista
// (ex.: clientes) é permitido nele — então vai empresaId.
function comEmpresaNosDados(dados: Dados, empresaId: string): Dados {
  if ("empresaId" in dados || "empresa" in dados) return dados;
  const temFkEscalar = Object.entries(dados).some(([k, v]) => k.endsWith("Id") && typeof v === "string");
  const usaRelacao = !temFkEscalar && Object.values(dados).some(
    (v) => v !== null && typeof v === "object" && ("connect" in v || "connectOrCreate" in v || "disconnect" in v)
  );
  return usaRelacao ? { ...dados, empresa: { connect: { id: empresaId } } } : { ...dados, empresaId };
}

function filtroEmpresa(base: PrismaClient) {
  return Prisma.defineExtension({
    name: "filtro-empresa",
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (MODELOS_SEM_EMPRESA.has(model)) return query(args);
          const empresaId = await resolverEmpresa(base);
          if (!empresaId) return query(args);
          const a = (args ?? {}) as Dados;

          if (OPS_COM_WHERE.has(operation)) {
            a.where = a.where ? { AND: [a.where, { empresaId }] } : { empresaId };
          } else if (OPS_WHERE_UNICO.has(operation)) {
            a.where = { ...(a.where as Dados), empresaId };
            if (operation === "upsert") a.create = comEmpresaNosDados(a.create as Dados, empresaId);
          } else if (operation === "create") {
            a.data = comEmpresaNosDados(a.data as Dados, empresaId);
          } else if (operation === "createMany" || operation === "createManyAndReturn") {
            const lista = Array.isArray(a.data) ? a.data : [a.data];
            a.data = lista.map((d) => ({ empresaId, ...(d as Dados) }));
          }
          return query(a as typeof args);
        },
      },
    },
  });
}

// Um cliente só por processo, também em produção: o Next empacota o servidor
// em vários chunks (páginas, rotas de API) e cada um carregava sua própria
// cópia deste módulo — cada cópia abria um pool, e juntas estouravam o limite
// do pooler (EMAXCONNSESSION), derrubando páginas e o PDF.
if (globalForPrisma.prisma && globalForPrisma.prismaSchema !== schemaAtual) {
  void globalForPrisma.prisma.$disconnect().catch(() => undefined);
  globalForPrisma.prisma = undefined;
}

export const prisma = globalForPrisma.prisma ?? createClient();

// Empresa do contexto atual (usuário logado, token do app, WhatsApp); undefined
// fora de requisição com usuário. Usado por PDFs e prompts com a marca da empresa.
export function empresaIdAtual(): Promise<string | undefined> {
  return resolverEmpresa(prisma as unknown as PrismaClient);
}
globalForPrisma.prisma = prisma;
globalForPrisma.prismaSchema = schemaAtual;
