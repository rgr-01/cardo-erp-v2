// Testes de conversa do bot do WhatsApp: roda o modelo de verdade (mesmo
// prompt e ferramentas da produção) com ferramentas FALSAS — nada toca o
// banco nem manda WhatsApp — e confere se ele chamou as ferramentas certas.
// Rode antes de mexer no prompt (agente.ts) ou nas descrições das ferramentas:
//
//   npx tsx --env-file=.env scripts/testar-bot.mts            (todos)
//   npx tsx --env-file=.env scripts/testar-bot.mts capa logo  (só os que têm esses nomes)
//
// Precisa de OPENAI_API_KEY válida (e OPENAI_MODEL, senão usa o padrão).
import { responderComAgente, type ModoTeste } from "@/lib/whatsapp/agente";
import type { TurnoAgente } from "@/lib/whatsapp/vinculo";

type Chamada = { nome: string; argumentos: Record<string, unknown> };

type Caso = {
  nome: string;
  // Conversa anterior, em texto (o que o consultor e o bot disseram).
  antes?: { consultor: string; bot: string }[];
  mensagem: string;
  fotoPendente?: boolean;
  // Ferramentas que precisam ser chamadas (com conferência opcional dos argumentos).
  espera: { nome: string; confere?: (args: Record<string, unknown>) => boolean }[];
  // Ferramentas que não podem ser chamadas.
  proibe?: string[];
  // Conferência da resposta final.
  resposta?: (texto: string) => string | null;
};

const RELATORIO_EM_REVISAO = {
  consultor: "faz o relatório técnico do plantio da WONTROBA 10",
  bot: "Montei a prévia do relatório técnico \"Plantio Safra 26/27\" (relatorio_id: rel_teste) para o WONTROBA 10 (cliente_id: cli_teste) com 4 fotos. Itens: 1. texto (sintese) 2. texto (observacoes) 3. gráfico barra Produtividade 4. foto Plantio talhão 9. Se quiser mudar algo, me diga ou rabisque na imagem. Se estiver bom, é só dizer pode aprovar.",
};

const semTabelaMarkdown = (t: string) => (/\|\s*-{2,}/.test(t) ? "usou tabela markdown" : null);
const naoPergunta = (t: string) => (/posso (adicionar|fazer|seguir)\?|quer que eu/i.test(t) ? "perguntou em vez de fazer" : null);

const CASOS: Caso[] = [
  {
    nome: "grafico-no-relatorio-em-revisao",
    antes: [RELATORIO_EM_REVISAO],
    mensagem: "contagem de plantas por metro no talhão 11: plantadeira JD 20 linhas deu 8 plantas/m, JD 16 linhas deu 7 plantas/m. faz um gráfico com isso",
    espera: [
      { nome: "adicionar_grafico_ao_relatorio", confere: (a) => JSON.stringify(a.linhas).includes("8") && JSON.stringify(a.linhas).includes("7") },
    ],
    proibe: ["enviar_grafico", "previa_relatorio"],
    resposta: (t) => semTabelaMarkdown(t) ?? naoPergunta(t),
  },
  {
    nome: "capa-sem-foto",
    proibe: ["previa_relatorio", "enviar_pdf_relatorio_visita"],
    antes: [RELATORIO_EM_REVISAO],
    mensagem: "sem foto na capa",
    espera: [{ nome: "ajustar_capa_relatorio", confere: (a) => a.acao === "sem_foto" }],
    resposta: (t) => (/não consigo|não dá/i.test(t) ? "disse que não consegue" : null),
  },
  {
    nome: "capa-sem-capa",
    antes: [RELATORIO_EM_REVISAO],
    mensagem: "gera sem capa",
    espera: [{ nome: "ajustar_capa_relatorio", confere: (a) => a.acao === "sem_capa" }],
  },
  {
    nome: "muda-item-numerado",
    proibe: ["previa_relatorio", "enviar_pdf_relatorio_visita"],
    antes: [RELATORIO_EM_REVISAO],
    mensagem: "muda o 2: plantio uniforme, sem falhas visíveis no talhão 9",
    espera: [{ nome: "editar_item_relatorio", confere: (a) => a.item_numero === 2 && a.acao === "texto" }],
  },
  {
    nome: "desfazer",
    proibe: ["previa_relatorio", "enviar_pdf_relatorio_visita"],
    antes: [RELATORIO_EM_REVISAO, { consultor: "muda o 2 pra 'plantio desuniforme'", bot: "Pronto, troquei o item 2. Te mandei a prévia." }],
    mensagem: "não, volta como estava",
    espera: [{ nome: "desfazer_ultima_mudanca", confere: (a) => a.relatorio_id === "rel_teste" }],
  },
  {
    nome: "melhora-grafico-avulso",
    antes: [{
      consultor: "faz um gráfico da produtividade: testemunha 58, tratamento A 64, tratamento B 61 sc/ha",
      bot: "Pronto, mandei o gráfico (grafico_enviado: barra, séries ['Produtividade'], linhas Testemunha 58, Tratamento A 64, Tratamento B 61).",
    }],
    mensagem: "melhora esse gráfico",
    espera: [{
      nome: "enviar_grafico",
      confere: (a) => {
        const s = JSON.stringify(a.linhas);
        return s.includes("58") && s.includes("64") && s.includes("61") && (a.unidade != null || a.ordenar != null || a.cores != null);
      },
    }],
    resposta: naoPergunta,
  },
  {
    nome: "chuva-do-cliente",
    mensagem: "como tá a chuva esse ano na wontroba 10?",
    espera: [{ nome: "buscar_clientes" }, { nome: "historico_chuva", confere: (a) => a.cliente_id === "cli_teste" && a.modo !== "anual" }],
  },
  {
    nome: "visita-com-combinado",
    mensagem: "visitei a wontroba 10 hoje, soja em V4 bem uniforme, sem praga. volto quinta pra avaliar a aplicação de herbicida",
    espera: [
      { nome: "buscar_clientes" },
      { nome: "contexto_cliente" },
      { nome: "registrar_combinado", confere: (a) => typeof a.data === "string" && /herbicida|aplica/i.test(String(a.texto)) },
    ],
  },
  {
    nome: "logo-enviada-no-rodape",
    antes: [RELATORIO_EM_REVISAO],
    fotoPendente: true,
    mensagem: "usa esta logomarca no rodapé",
    espera: [{ nome: "definir_logo_relatorio", confere: (a) => a.posicao === "rodape" && a.usar_imagem_enviada === true }],
  },
  {
    nome: "foto-grande",
    proibe: ["previa_relatorio", "enviar_pdf_relatorio_visita"],
    antes: [RELATORIO_EM_REVISAO],
    mensagem: "a foto 4 fica tamanho grande",
    espera: [{ nome: "editar_item_relatorio", confere: (a) => a.item_numero === 4 && a.acao === "tamanho" && a.largura === "inteira" }],
    resposta: (t) => (/não consigo|só (dá|no site)/i.test(t) ? "disse que não consegue" : null),
  },
  {
    nome: "legenda-que-e-pedido",
    antes: [{
      ...RELATORIO_EM_REVISAO,
      bot: RELATORIO_EM_REVISAO.bot + " Anexei a foto nova como item 5, com a legenda: 'coloca dentro da foto o comparativo de produtos a direita aonde circulei, e Trat. SeedFlow a esquerda Trat. 1 na direita sistema radicular com 15cm, ja o da esquerda ficou com 10cm colocar essa observacao abaixo da planta dentro da foto'.",
    }],
    mensagem: "não era pra aparecer isso, cria um texto explicativo, isso era pra você fazer",
    espera: [
      { nome: "marcar_foto_relatorio", confere: (a) => a.foto_numero != null || a.instrucao != null },
      { nome: "editar_item_relatorio", confere: (a) => a.acao === "texto" && !/coloca|colocar/i.test(String(a.texto)) },
    ],
  },
  {
    nome: "previa-rabiscada-nao-e-foto",
    antes: [RELATORIO_EM_REVISAO],
    fotoPendente: true,
    mensagem: "[o consultor enviou 1 foto com legenda \"cadê a foto daqui, e só gera pdf quando eu pedir\"; fotos aguardando uso na conversa: 1]",
    espera: [{ nome: "ler_correcao_previa" }],
    proibe: ["enviar_pdf_relatorio_visita"],
  },
  {
    nome: "previa-so-quando-pede",
    antes: [RELATORIO_EM_REVISAO],
    mensagem: "como ficou?",
    espera: [{ nome: "previa_relatorio" }],
    proibe: ["enviar_pdf_relatorio_visita"],
  },
  {
    nome: "previa-de-uma-pagina",
    antes: [RELATORIO_EM_REVISAO],
    mensagem: "manda a prévia da pag 4",
    espera: [{ nome: "previa_relatorio", confere: (a) => Array.isArray(a.paginas) && a.paginas.length === 1 && a.paginas[0] === 4 }],
    resposta: (t) => (/não consigo/i.test(t) ? "disse que não consegue" : null),
  },
  {
    nome: "relatorio-de-trabalho",
    mensagem: "fiz a avaliação do ensaio de produtos X e Y na wontroba 10 hoje, o produto X tá com melhor vigor",
    espera: [
      { nome: "contexto_cliente" },
      { nome: "criar_relatorio_visita" },
      { nome: "vincular_trabalho", confere: (a) => a.trabalho_id === "trab_teste" },
    ],
  },
  {
    nome: "relato-novo-sem-sugerir-antigos",
    mensagem: "quero fazer um relato de experimento com parceiro na wontroba 10",
    espera: [{ nome: "buscar_clientes" }],
    proibe: ["listar_meus_registros"],
    resposta: (t) => (/SeedFlow|Plantio Safra/i.test(t) ? "sugeriu relatório antigo" : null),
  },
  {
    nome: "resposta-citando-a-propria-mensagem",
    antes: [{ consultor: "quero fazer um relato de experimento com parceiro na wontroba 10", bot: "Beleza, será um novo experimento. Me conte o que foi avaliado." }],
    mensagem: '👆\n[respondendo à mensagem: "roundup wg no pre plantio x sem roundup, foi aplicado 2l/ha na area A e 0 lt no lado B"]',
    espera: [{ nome: "criar_relatorio_visita", confere: (a) => /roundup/i.test(String(a.texto)) && /2/.test(String(a.texto)) }],
  },
  {
    nome: "visita-finalizada-aprova",
    antes: [RELATORIO_EM_REVISAO, { consultor: "manda prévia", bot: "Prévia completa enviada (páginas 1 a 3)." }],
    mensagem: "ok, visita finalizada",
    espera: [{ nome: "aprovar_relatorio", confere: (a) => a.relatorio_id === "rel_teste" }],
    proibe: ["fechar_visita_fazenda"],
    resposta: (t) => (/check-?in|KM/i.test(t) ? "falou de check-in/KM" : null),
  },
  {
    nome: "trocar-logo-lista",
    antes: [RELATORIO_EM_REVISAO],
    mensagem: "quero trocar a logo do cabeçalho",
    espera: [{ nome: "listar_logos", confere: (a) => a.mostrar_imagem !== true }, { nome: "enviar_enquete", confere: (a) => a.multipla === false }],
  },
  {
    nome: "enquete-marcou-parceiro-e-chuva",
    antes: [RELATORIO_EM_REVISAO],
    mensagem: "[o consultor marcou na enquete: Parceiro, Gráfico de chuva da fazenda]",
    espera: [
      { nome: "adicionar_clima_ao_relatorio" },
      { nome: "listar_logos", confere: (a) => a.mostrar_imagem !== true },
      { nome: "enviar_enquete", confere: (a) => a.multipla === false && JSON.stringify(a.opcoes).includes("Koppert") },
    ],
  },
  {
    nome: "enquete-escolheu-parceiro",
    antes: [RELATORIO_EM_REVISAO, { consultor: "[o consultor marcou na enquete: Parceiro]", bot: "Mandei a enquete 'Qual parceiro?' com as logos cadastradas (logo_1 = Rede Agro, logo_2 = Koppert)." }],
    mensagem: "[o consultor marcou na enquete: Koppert]",
    espera: [{ nome: "definir_logo_relatorio", confere: (a) => a.posicao === "rodape" && a.logo_id === "logo_2" }],
  },
];

// Respostas falsas das ferramentas — o suficiente pro modelo seguir a conversa.
function respostaFalsa(nome: string, args: Record<string, unknown>): Record<string, unknown> {
  switch (nome) {
    case "buscar_clientes":
      return { clientes: [{ id: "cli_teste", nome: "WONTROBA 10", fazendas: [{ id: "faz_teste", nome: "Fazenda Wontroba" }] }], correspondencia_exata: true };
    case "contexto_cliente":
      return { cliente: "WONTROBA 10", ultimas_visitas: [{ relatorio_id: "rel_antigo", data: "12/10/2026", dias_atras: 17, relato: "Plantio da soja no talhão 9 concluído." }], combinados_pendentes: [], trabalhos_da_safra: [{ id: "trab_teste", nome: "Teste de produtos X e Y", tipo: "ENSAIO", status: "EM_ANDAMENTO" }], vendas_em_aberto: [] };
    case "vincular_trabalho":
      return { ok: true, trabalho: "Teste de produtos X e Y", copiou_capa_do_trabalho: false, tem_parceiro: false };
    case "criar_relatorio_visita":
      return { ok: true, relatorio_id: "rel_novo" };
    case "previa_relatorio":
      return { previa_enviada: true, paginas: 2, itens: [{ numero: 1, tipo: "texto (sintese)", resumo: "..." }] };
    case "listar_logos":
      return { logos: [{ numero: 1, logo_id: "logo_1", nome: "Rede Agro", tipo: "programa" }, { numero: 2, logo_id: "logo_2", nome: "Koppert", tipo: "parceiro" }] };
    case "enviar_enquete":
      return { enviado: true, aguardando_voto: true };
    case "historico_chuva":
      return { enviado: true, local: "WONTROBA 10", ano: 2026, ultimoMes: 10, meses: [] };
    case "registrar_combinado":
      return { registrado: true, combinado_id: "comb_1", texto: args.texto, data: args.data };
    case "anexar_foto_ao_relatorio":
      return { anexado: false, motivo: "A imagem é um print/página do relatório (a prévia rabiscada), não foto de campo — NÃO foi anexada. Leia a correção com ler_correcao_previa." };
    case "ler_correcao_previa":
      return { e_previa: true, correcoes: [{ item_numero: 10, marcacao: "circulou um espaço vazio abaixo do gráfico", pedido: "cadê a foto daqui" }] };
    case "enviar_grafico":
      return { enviado: true, grafico_enviado: args };
    default:
      return { ok: true };
  }
}

const filtro = process.argv.slice(2);
const casos = CASOS.filter((c) => filtro.length === 0 || filtro.some((f) => c.nome.includes(f)));
if (!process.env.OPENAI_API_KEY) {
  console.error("Defina OPENAI_API_KEY (ex.: --env-file=.env).");
  process.exit(1);
}

let falhas = 0;
for (const caso of casos) {
  const chamadas: Chamada[] = [];
  const teste: ModoTeste = {
    empresa: { id: "empresa_teste", nome: "Rede Agro" },
    modulos: ["VENDAS", "ERP", "VISITAS"],
    executor: async (nome, argumentos) => {
      chamadas.push({ nome, argumentos });
      return respostaFalsa(nome, argumentos);
    },
  };
  const historico: TurnoAgente[] = (caso.antes ?? []).map((t) => [
    { role: "user", content: t.consultor },
    { role: "assistant", content: t.bot },
  ] as unknown as TurnoAgente);

  const inicio = Date.now();
  let resposta = "";
  try {
    const r = await responderComAgente({
      teste,
      consultorId: "user_teste",
      consultorNome: "João Teste",
      role: "CONSULTOR",
      waId: "5500000000000",
      // Igual ao avisoDeFotos (conversa.ts): a foto chega como linha no texto.
      mensagem: caso.fotoPendente && !caso.mensagem.startsWith("[")
        ? `[o consultor enviou 1 foto; fotos aguardando uso na conversa: 1]
${caso.mensagem}`
        : caso.mensagem,
      historico,
      fotosPendentes: caso.fotoPendente ? [{ ref: { id: "midia_teste" } as never, recebidaEm: Date.now() }] : [],
      fotosAnexadas: [],
      respostaEmAudio: false,
    });
    resposta = r.resposta;
  } catch (e) {
    resposta = `ERRO: ${e instanceof Error ? e.message : e}`;
  }

  const problemas: string[] = [];
  for (const esperado of caso.espera) {
    const feitas = chamadas.filter((c) => c.nome === esperado.nome);
    if (feitas.length === 0) problemas.push(`não chamou ${esperado.nome}`);
    else if (esperado.confere && !feitas.some((c) => esperado.confere!(c.argumentos))) {
      problemas.push(`${esperado.nome} com argumentos errados: ${JSON.stringify(feitas.at(-1)!.argumentos)}`);
    }
  }
  for (const proibida of caso.proibe ?? []) {
    if (chamadas.some((c) => c.nome === proibida)) problemas.push(`chamou ${proibida} (não devia)`);
  }
  const ruimNaResposta = caso.resposta?.(resposta);
  if (ruimNaResposta) problemas.push(ruimNaResposta);

  const segundos = ((Date.now() - inicio) / 1000).toFixed(1);
  if (problemas.length === 0) {
    console.log(`✅ ${caso.nome} (${segundos}s) — ${chamadas.map((c) => c.nome).join(" → ")}`);
  } else {
    falhas++;
    console.log(`❌ ${caso.nome} (${segundos}s)`);
    for (const p of problemas) console.log(`   • ${p}`);
    console.log(`   ferramentas: ${chamadas.map((c) => c.nome).join(" → ") || "(nenhuma)"}`);
    console.log(`   resposta: ${resposta.replace(/\n/g, " ").slice(0, 300)}`);
  }
}
console.log(`\n${casos.length - falhas}/${casos.length} passaram.`);
process.exit(falhas ? 1 : 0);
