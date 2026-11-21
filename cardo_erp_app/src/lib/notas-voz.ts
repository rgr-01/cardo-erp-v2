// notas-voz.ts — gravação offline, armazenamento permanente e fila de transcrição.
//
// A gravação nunca depende de internet: o áudio é salvo no aparelho na hora.
// Só a transcrição precisa de rede, e ela roda depois, quando der. Se a
// transcrição falhar para sempre, o áudio continua lá para ser ouvido.

import * as SQLite from "expo-sqlite";
import { Directory, File, Paths } from "expo-file-system";

import { getToken } from "@/lib/auth-storage";

const API_URL = process.env.EXPO_PUBLIC_API_URL;
const MAX_TENTATIVAS = 4;

export type StatusTranscricao = "pendente" | "transcrevendo" | "pronta" | "erro";

export type NotaVoz = {
  id: string;
  registroId: string;
  arquivo: string;
  duracaoMs: number;
  transcricao: string | null;
  editadaManualmente: 0 | 1;
  status: StatusTranscricao;
  erro: string | null;
  tentativas: number;
  criadaEm: string;
};

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

function db() {
  if (!dbPromise) {
    dbPromise = SQLite.openDatabaseAsync("redeagro.db").then(async (d) => {
      await d.execAsync(`
        CREATE TABLE IF NOT EXISTS notas_voz (
          id TEXT PRIMARY KEY NOT NULL,
          registroId TEXT NOT NULL,
          arquivo TEXT NOT NULL,
          duracaoMs INTEGER NOT NULL DEFAULT 0,
          transcricao TEXT,
          editadaManualmente INTEGER NOT NULL DEFAULT 0,
          status TEXT NOT NULL DEFAULT 'pendente',
          erro TEXT,
          tentativas INTEGER NOT NULL DEFAULT 0,
          criadaEm TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_notas_registro ON notas_voz (registroId);
        CREATE INDEX IF NOT EXISTS idx_notas_status ON notas_voz (status);
      `);
      return d;
    });
  }
  return dbPromise;
}

const novoId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

function pastaAudio(): Directory {
  const pasta = new Directory(Paths.document, "audio");
  if (!pasta.exists) pasta.create({ intermediates: true });
  return pasta;
}

/**
 * Move o arquivo do cache (onde o gravador escreve) para o diretório
 * permanente. O sistema limpa o cache sem aviso quando o armazenamento
 * aperta — e áudio de campo ainda não transcrito é insubstituível.
 */
export async function salvarNota(
  registroId: string,
  uriCache: string,
  duracaoMs: number
): Promise<NotaVoz> {
  const id = novoId();
  const extensao = uriCache.split(".").pop() || "m4a";
  const destino = new File(pastaAudio(), `${id}.${extensao}`);

  // move() atualiza o uri do próprio objeto de origem — é ele que passa a
  // apontar para o destino final.
  const origem = new File(uriCache);
  origem.move(destino);

  const nota: NotaVoz = {
    id,
    registroId,
    arquivo: origem.uri,
    duracaoMs,
    transcricao: null,
    editadaManualmente: 0,
    status: "pendente",
    erro: null,
    tentativas: 0,
    criadaEm: new Date().toISOString(),
  };

  const d = await db();
  await d.runAsync(
    `INSERT INTO notas_voz
       (id, registroId, arquivo, duracaoMs, transcricao, editadaManualmente, status, erro, tentativas, criadaEm)
     VALUES (?,?,?,?,NULL,0,'pendente',NULL,0,?)`,
    [id, registroId, nota.arquivo, duracaoMs, nota.criadaEm]
  );
  return nota;
}

export async function listarNotas(registroId: string): Promise<NotaVoz[]> {
  const d = await db();
  return d.getAllAsync<NotaVoz>(
    `SELECT * FROM notas_voz WHERE registroId = ? ORDER BY criadaEm ASC`,
    [registroId]
  );
}

export async function excluirNota(id: string): Promise<void> {
  const d = await db();
  const nota = await d.getFirstAsync<NotaVoz>(`SELECT * FROM notas_voz WHERE id = ?`, [id]);
  if (nota) {
    const arquivo = new File(nota.arquivo);
    if (arquivo.exists) arquivo.delete();
  }
  await d.runAsync(`DELETE FROM notas_voz WHERE id = ?`, [id]);
}

/** Correção manual do texto — trava a sobrescrita por uma nova transcrição. */
export async function editarTranscricao(id: string, texto: string): Promise<void> {
  const d = await db();
  await d.runAsync(
    `UPDATE notas_voz SET transcricao=?, editadaManualmente=1, status='pronta' WHERE id=?`,
    [texto, id]
  );
}

/** Move as notas de um rascunho temporário para o registro definitivo. */
export async function reassociarNotas(deId: string, paraId: string): Promise<void> {
  const d = await db();
  await d.runAsync(`UPDATE notas_voz SET registroId=? WHERE registroId=?`, [paraId, deId]);
}

/**
 * Envia o áudio ao backend, que fala com a API de transcrição. A chave da
 * IA nunca vem para o app — ela iria no bundle e qualquer um extrairia.
 */
async function transcrever(nota: NotaVoz): Promise<string> {
  const token = await getToken();
  if (!token) throw new Error("Sessão expirada.");

  const form = new FormData();
  form.append("audio", new File(nota.arquivo) as unknown as Blob);
  form.append("registroId", nota.registroId);
  form.append("idioma", "pt");

  const resposta = await fetch(`${API_URL}/api/mobile/transcrever`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });

  if (!resposta.ok) {
    throw new Error(`Transcrição indisponível (HTTP ${resposta.status}).`);
  }
  const json = await resposta.json();
  const texto = String(json?.texto ?? json?.text ?? "").trim();
  if (!texto) throw new Error("Transcrição vazia.");
  return texto;
}

/**
 * Processa a fila de transcrição. Chamar quando a conexão voltar e ao abrir
 * o app. Notas corrigidas à mão são ignoradas.
 */
export async function sincronizarTranscricoes(): Promise<{ prontas: number; falharam: number }> {
  const d = await db();
  const pendentes = await d.getAllAsync<NotaVoz>(
    `SELECT * FROM notas_voz
      WHERE status IN ('pendente','erro') AND tentativas < ? AND editadaManualmente = 0
      ORDER BY criadaEm ASC`,
    [MAX_TENTATIVAS]
  );

  let prontas = 0;
  let falharam = 0;
  for (const nota of pendentes) {
    await d.runAsync(`UPDATE notas_voz SET status='transcrevendo' WHERE id=?`, [nota.id]);
    try {
      const texto = await transcrever(nota);
      await d.runAsync(
        `UPDATE notas_voz SET transcricao=?, status='pronta', erro=NULL WHERE id=?`,
        [texto, nota.id]
      );
      prontas++;
    } catch (error) {
      await d.runAsync(
        `UPDATE notas_voz SET status='erro', erro=?, tentativas=tentativas+1 WHERE id=?`,
        [String(error instanceof Error ? error.message : error).slice(0, 300), nota.id]
      );
      falharam++;
    }
  }
  return { prontas, falharam };
}

export function formatarDuracao(ms: number): string {
  const total = Math.round(ms / 1000);
  const minutos = Math.floor(total / 60);
  const segundos = total % 60;
  return `${minutos}:${String(segundos).padStart(2, "0")}`;
}
