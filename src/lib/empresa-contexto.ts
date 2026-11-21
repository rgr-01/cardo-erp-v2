import { AsyncLocalStorage } from "node:async_hooks";

// Contexto de empresa (tenant) da requisição atual. O cliente Prisma
// (src/lib/prisma.ts) lê daqui para filtrar toda consulta pela empresa do
// usuário. Sem contexto explícito, ele tenta a sessão web (auth()) e o token
// do app mobile; fora de uma requisição com usuário (cron, webhook, link
// público) não há filtro.
type Contexto = {
  empresaId?: string;
  userId?: string;
  semFiltro?: boolean;
};

const armazenamento = new AsyncLocalStorage<Contexto>();

export function contextoEmpresa(): Contexto | undefined {
  return armazenamento.getStore();
}

// As consultas do Prisma só rodam quando aguardadas (PrismaPromise é
// preguiçosa): o `await` dentro do run() garante que rodem com o contexto.

// Roda `fn` com todas as consultas presas à empresa informada.
export function comEmpresa<T>(empresaId: string, fn: () => T | Promise<T>): Promise<T> {
  return armazenamento.run({ empresaId }, async () => await fn());
}

// Roda `fn` sem filtro de empresa (painel Cardo AI, login, rotinas globais).
export function semFiltroEmpresa<T>(fn: () => T | Promise<T>): Promise<T> {
  return armazenamento.run({ semFiltro: true }, async () => await fn());
}

// Roda `fn` como o usuário informado, sem sessão web (ex.: mensagem do
// WhatsApp). A empresa é descoberta pelo usuário na 1ª consulta.
export function comUsuario<T>(userId: string, fn: () => T | Promise<T>): Promise<T> {
  return armazenamento.run({ userId }, async () => await fn());
}
