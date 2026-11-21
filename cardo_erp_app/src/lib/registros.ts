// registros.ts — persistência local dos registros (expo-sqlite) + sincronização.
//
// Substitui a antiga fila em AsyncStorage. A diferença de comportamento é
// deliberada: aqui o registro é salvo e CONTINUA na lista depois de enviado,
// com selo "Enviado", virando o histórico local do consultor. Antes ele
// desaparecia no momento em que o envio dava certo.

import NetInfo from "@react-native-community/netinfo";

import { db } from "@/lib/banco";

import {
  acordarServidor,
  apiCriarRelatorioVisita,
  apiCriarDespesa,
  apiCriarPedido,
  type CategoriaDespesa,
} from "@/lib/api";

export type TipoRegistro = "visita" | "despesa" | "pedido";
export type StatusRegistro = "rascunho" | "enviando" | "enviado" | "erro";

export type FotoArquivo = { uri: string; nome: string; tipo: string };

export type DadosVisita = {
  tipoItem: "visita";
  clienteId: string;
  clienteNome: string;
  fazendaId?: string;
  fazendaNome?: string;
  safraId: string;
  titulo?: string;
  texto: string;
  dataVisita: string;
  fotos: FotoArquivo[];
};

export type DadosDespesa = {
  tipoItem: "despesa";
  categoria: CategoriaDespesa;
  categoriaLabel: string;
  valor: number;
  safraId: string;
  data?: string;
  clienteId?: string;
  clienteNome?: string;
  estabelecimento?: string;
  descricao?: string;
  origemOcr?: boolean;
  fotos: FotoArquivo[];
};

export type DadosPedido = {
  tipoItem: "pedido";
  clienteId: string;
  clienteNome: string;
  safraId: string;
  produtoId: string;
  produtoNome: string;
  volume?: number;
  unidade?: string;
  valorUnitario?: number;
  observacoes?: string;
};

export type DadosRegistro = DadosVisita | DadosDespesa | DadosPedido;

export type Registro = {
  id: string;
  tipo: TipoRegistro;
  titulo: string;
  subtitulo: string;
  valor: number | null;
  fotos: number;
  dados: DadosRegistro;
  status: StatusRegistro;
  erro: string | null;
  criadoEm: string;
  atualizadoEm: string;
  enviadoEm: string | null;
};

type LinhaRegistro = Omit<Registro, "dados"> & { dados: string };

const agora = () => new Date().toISOString();
const novoId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

/** Resumo exibido na lista, derivado do tipo de registro. */
function resumir(dados: DadosRegistro): {
  titulo: string;
  subtitulo: string;
  valor: number | null;
  fotos: number;
} {
  if (dados.tipoItem === "visita") {
    return {
      titulo: dados.fazendaNome ? `${dados.clienteNome} · ${dados.fazendaNome}` : dados.clienteNome,
      subtitulo: dados.texto,
      valor: null,
      fotos: dados.fotos.length,
    };
  }
  if (dados.tipoItem === "despesa") {
    return {
      titulo: dados.categoriaLabel,
      subtitulo: dados.estabelecimento ?? "Sem estabelecimento",
      valor: dados.valor,
      fotos: dados.fotos.length,
    };
  }
  return {
    titulo: dados.produtoNome,
    subtitulo: dados.clienteNome,
    valor:
      dados.valorUnitario != null && dados.volume != null
        ? dados.valorUnitario * dados.volume
        : (dados.valorUnitario ?? null),
    fotos: 0,
  };
}

function converter(linha: LinhaRegistro): Registro {
  return { ...linha, dados: JSON.parse(linha.dados) as DadosRegistro };
}

/**
 * Cria ou atualiza um registro como rascunho. Um registro já enviado não é
 * editado — o servidor já tem aquela versão; duplique em vez disso.
 */
export async function salvarRegistro(dados: DadosRegistro, id?: string): Promise<string> {
  const d = await db();
  const existente = id ? await buscarRegistro(id) : null;
  if (existente?.status === "enviado") {
    throw new Error('Registro já enviado. Use "Duplicar" para criar um novo.');
  }

  const idFinal = id ?? novoId();
  const { titulo, subtitulo, valor, fotos } = resumir(dados);

  await d.runAsync(
    `INSERT INTO registros
       (id, tipo, titulo, subtitulo, valor, fotos, dados, status, erro, criadoEm, atualizadoEm, enviadoEm)
     VALUES (?,?,?,?,?,?,?,'rascunho',NULL,?,?,NULL)
     ON CONFLICT(id) DO UPDATE SET
       titulo=excluded.titulo, subtitulo=excluded.subtitulo, valor=excluded.valor,
       fotos=excluded.fotos, dados=excluded.dados, status='rascunho', erro=NULL,
       atualizadoEm=excluded.atualizadoEm`,
    [
      idFinal,
      dados.tipoItem,
      titulo,
      subtitulo,
      valor,
      fotos,
      JSON.stringify(dados),
      existente?.criadoEm ?? agora(),
      agora(),
    ]
  );
  return idFinal;
}

export async function listarPorTipo(tipo: TipoRegistro): Promise<Registro[]> {
  const d = await db();
  const linhas = await d.getAllAsync<LinhaRegistro>(
    `SELECT * FROM registros WHERE tipo = ? ORDER BY atualizadoEm DESC`,
    [tipo]
  );
  return linhas.map(converter);
}

export async function listarTodos(limite = 50): Promise<Registro[]> {
  const d = await db();
  const linhas = await d.getAllAsync<LinhaRegistro>(
    `SELECT * FROM registros ORDER BY atualizadoEm DESC LIMIT ?`,
    [limite]
  );
  return linhas.map(converter);
}

export async function buscarRegistro(id: string): Promise<Registro | null> {
  const d = await db();
  const linha = await d.getFirstAsync<LinhaRegistro>(`SELECT * FROM registros WHERE id = ?`, [id]);
  return linha ? converter(linha) : null;
}

export async function contagens(): Promise<{
  visita: number;
  despesa: number;
  pedido: number;
  pendentes: number;
}> {
  const d = await db();
  const porTipo = await d.getAllAsync<{ tipo: TipoRegistro; n: number }>(
    `SELECT tipo, COUNT(*) as n FROM registros GROUP BY tipo`
  );
  const pendentes = await d.getFirstAsync<{ n: number }>(
    `SELECT COUNT(*) as n FROM registros WHERE status IN ('rascunho','erro')`
  );

  const base = { visita: 0, despesa: 0, pedido: 0, pendentes: pendentes?.n ?? 0 };
  for (const linha of porTipo) base[linha.tipo] = linha.n;
  return base;
}

export async function excluirRegistro(id: string): Promise<void> {
  const d = await db();
  await d.runAsync(`DELETE FROM registros WHERE id = ? AND status <> 'enviado'`, [id]);
}

export async function duplicarRegistro(id: string): Promise<string> {
  const origem = await buscarRegistro(id);
  if (!origem) throw new Error("Registro não encontrado.");
  return salvarRegistro(origem.dados);
}

async function enviarDados(dados: DadosRegistro): Promise<void> {
  if (dados.tipoItem === "visita") {
    await apiCriarRelatorioVisita({
      clienteId: dados.clienteId,
      fazendaId: dados.fazendaId,
      safraId: dados.safraId,
      titulo: dados.titulo,
      texto: dados.texto,
      dataVisita: dados.dataVisita,
      fotos: dados.fotos,
    });
    return;
  }
  if (dados.tipoItem === "despesa") {
    await apiCriarDespesa({
      categoria: dados.categoria,
      valor: dados.valor,
      safraId: dados.safraId,
      data: dados.data,
      clienteId: dados.clienteId,
      estabelecimento: dados.estabelecimento,
      descricao: dados.descricao,
      origemOcr: dados.origemOcr,
      fotos: dados.fotos,
    });
    return;
  }
  await apiCriarPedido({
    clienteId: dados.clienteId,
    safraId: dados.safraId,
    itens: [
      {
        produtoId: dados.produtoId,
        volume: dados.volume,
        unidade: dados.unidade,
        valorUnitario: dados.valorUnitario,
      },
    ],
    observacoes: dados.observacoes,
  });
}

async function enviarRegistro(registro: Registro): Promise<void> {
  const d = await db();
  await d.runAsync(`UPDATE registros SET status='enviando', erro=NULL WHERE id=?`, [registro.id]);

  try {
    // Sem retry automático aqui: se a chamada falhar por timeout, a
    // requisição pode já ter chegado ao servidor e criado o registro —
    // reenviar às cegas duplica. `acordarServidor()` já é chamado antes,
    // então uma segunda tentativa exigiria confirmação do usuário
    // (botão "Tentar enviar" em cada registro), nunca automática.
    await enviarDados(registro.dados);
    await d.runAsync(
      `UPDATE registros SET status='enviado', erro=NULL, enviadoEm=?, atualizadoEm=? WHERE id=?`,
      [agora(), agora(), registro.id]
    );
  } catch (error) {
    await d.runAsync(`UPDATE registros SET status='erro', erro=?, atualizadoEm=? WHERE id=?`, [
      String(error instanceof Error ? error.message : error).slice(0, 300),
      agora(),
      registro.id,
    ]);
    throw error;
  }
}

/** Envia um único registro (botão "Tentar novamente"). */
export async function sincronizarUm(id: string): Promise<void> {
  const registro = await buscarRegistro(id);
  if (!registro || registro.status === "enviado") return;

  await acordarServidor();
  await enviarRegistro(registro);
}

/**
 * Envia tudo que ainda não foi para o servidor. Uma falha isolada não
 * interrompe os demais — cada registro guarda seu próprio erro.
 */
export async function sincronizarTudo(): Promise<{ enviados: number; falharam: number }> {
  const estado = await NetInfo.fetch();
  if (estado.isConnected === false) {
    throw new Error("Sem conexão. Conecte-se para sincronizar.");
  }

  const d = await db();
  const linhas = await d.getAllAsync<LinhaRegistro>(
    `SELECT * FROM registros WHERE status IN ('rascunho','erro') ORDER BY criadoEm ASC`
  );
  if (linhas.length === 0) return { enviados: 0, falharam: 0 };

  // O servidor pode estar "dormindo" (sem uso recente) — a primeira
  // chamada real falharia por timeout enquanto ele acorda.
  await acordarServidor();

  let enviados = 0;
  let falharam = 0;
  for (const linha of linhas) {
    try {
      await enviarRegistro(converter(linha));
      enviados++;
    } catch {
      falharam++;
    }
  }
  return { enviados, falharam };
}
