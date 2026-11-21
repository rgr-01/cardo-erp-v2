// banco.ts — banco SQLite local do app (uma conexão só, compartilhada).
//
// - registros: o que foi criado no aparelho (rascunho → enviado), ver registros.ts
// - cache_servidor: a última cópia de cada lista/detalhe que veio do servidor,
//   pra consultar sem sinal (ver servidor.ts). Editar exige estar online.

import * as SQLite from "expo-sqlite";

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

export function db() {
  if (!dbPromise) {
    dbPromise = SQLite.openDatabaseAsync("redeagro.db").then(async (d) => {
      await d.execAsync(`
        PRAGMA journal_mode = WAL;
        CREATE TABLE IF NOT EXISTS registros (
          id TEXT PRIMARY KEY NOT NULL,
          tipo TEXT NOT NULL,
          titulo TEXT NOT NULL,
          subtitulo TEXT NOT NULL,
          valor REAL,
          fotos INTEGER NOT NULL DEFAULT 0,
          dados TEXT NOT NULL,
          status TEXT NOT NULL,
          erro TEXT,
          criadoEm TEXT NOT NULL,
          atualizadoEm TEXT NOT NULL,
          enviadoEm TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_registros_tipo ON registros (tipo, atualizadoEm DESC);
        CREATE INDEX IF NOT EXISTS idx_registros_status ON registros (status);
        CREATE TABLE IF NOT EXISTS cache_servidor (
          chave TEXT PRIMARY KEY NOT NULL,
          dados TEXT NOT NULL,
          atualizadoEm TEXT NOT NULL
        );
      `);
      return d;
    });
  }
  return dbPromise;
}

// Cópia local da última resposta de cada consulta ao servidor.
export type Lido<T> = { dados: T; atualizadoEm: string };

export async function lerCache<T>(chave: string): Promise<Lido<T> | null> {
  const d = await db();
  const linha = await d.getFirstAsync<{ dados: string; atualizadoEm: string }>(
    `SELECT dados, atualizadoEm FROM cache_servidor WHERE chave = ?`,
    [chave]
  );
  return linha ? { dados: JSON.parse(linha.dados) as T, atualizadoEm: linha.atualizadoEm } : null;
}

export async function gravarCache<T>(chave: string, dados: T): Promise<string> {
  const d = await db();
  const agora = new Date().toISOString();
  await d.runAsync(
    `INSERT INTO cache_servidor (chave, dados, atualizadoEm) VALUES (?,?,?)
     ON CONFLICT(chave) DO UPDATE SET dados=excluded.dados, atualizadoEm=excluded.atualizadoEm`,
    [chave, JSON.stringify(dados), agora]
  );
  return agora;
}

/**
 * Busca no servidor e guarda a resposta; sem sinal (ou servidor fora), usa a
 * última cópia salva. Só relança o erro se nunca houve cópia.
 */
export async function comCache<T>(chave: string, buscar: () => Promise<T>): Promise<T> {
  try {
    const dados = await buscar();
    await gravarCache(chave, dados);
    return dados;
  } catch (e) {
    const salvo = await lerCache<T>(chave);
    if (salvo) return salvo.dados;
    throw e;
  }
}
