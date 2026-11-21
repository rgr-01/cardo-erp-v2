// Documento de blocos do relatório de visita.
//
// O `texto` do relatório continua sendo a fonte simples (é o que o bot do
// WhatsApp grava e o que a busca usa). O `conteudo` é o documento rico que o
// editor web manipula — um canvas livre, com página, posição (x, y) e
// tamanho (w, h) por bloco, nas mesmas unidades usadas pelo editor, pela
// visualização e pela geração do PDF (ver PAGINA_LARGURA/PAGINA_ALTURA).
// Relatórios antigos não têm `conteudo`: são convertidos sob demanda por
// `conteudoInicial` + `autoLayout`, sem migration de dados.

import { z } from "zod";

// Unidades virtuais da página (proporção A4). O editor exibe isso escalado
// pra caber na tela; o export de PDF mapeia linearmente pra pontos.
export const PAGINA_LARGURA = 800;
export const PAGINA_ALTURA = 1131;
const MARGEM = 40;

export type Geometria = {
  pagina: number;
  x: number;
  y: number;
  w: number;
  h: number;
};

// Título da seção escrito pelo consultor ("Encaminhamentos" → "Próximos
// passos"). Fica no PRIMEIRO bloco da seção; nos outros é ignorado. Vazio =
// título padrão.
type ComTituloSecao = { tituloSecao?: string | null };

// "card" desenha o bloco com moldura arredondada, fundo e título (visual
// AgroVisão); "simples" (ou ausente, nos relatórios antigos) é só o conteúdo
// cru, como sempre foi.
export type EstiloBloco = "card" | "simples";

// Quanto da largura do documento a foto/gráfico ocupa. Sem valor (relatórios
// antigos), vale o padrão: gráfico em largura inteira, foto em meia largura.
export type LarguraBloco = "terco" | "metade" | "inteira";
export type AlinhamentoTexto = "esquerda" | "centro" | "direita" | "justificar";
export type AlinhamentoTextoCurto = "esquerda" | "centro" | "direita";
export type TamanhoTexto = "pequeno" | "normal" | "grande";

// Fontes dos blocos de texto (carregadas no layout raiz). "padrao" = fonte da marca.
export const FONTES_TEXTO = [
  { id: "padrao", nome: "Space Grotesk (padrão)", css: "var(--font-space-grotesk), Arial, sans-serif" },
  { id: "inter", nome: "Inter", css: "var(--font-inter), Arial, sans-serif" },
  { id: "roboto", nome: "Roboto", css: "var(--font-roboto), Arial, sans-serif" },
  { id: "montserrat", nome: "Montserrat", css: "var(--font-montserrat), Arial, sans-serif" },
  { id: "merriweather", nome: "Merriweather", css: "var(--font-merriweather), Georgia, serif" },
  { id: "lora", nome: "Lora", css: "var(--font-lora), Georgia, serif" },
] as const;
export type FonteTexto = (typeof FONTES_TEXTO)[number]["id"];
export const TAMANHOS_PT = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 60, 72];

// Estilo inline do texto quando o usuário escolheu fonte/tamanho em pontos.
// `pxPorPt` muda conforme a escala da tela (editor em mm reais, leitura em 1024px).
export function estiloFonteTexto(
  bloco: { fonte?: FonteTexto; tamanhoPt?: number; espacamentoLinha?: "compacto" | "normal" | "amplo" },
  pxPorPt: number
): React.CSSProperties {
  const estilo: React.CSSProperties = {};
  const fonte = FONTES_TEXTO.find((f) => f.id === bloco.fonte);
  if (fonte && fonte.id !== "padrao") estilo.fontFamily = fonte.css;
  if (bloco.tamanhoPt) {
    estilo.fontSize = `${bloco.tamanhoPt * pxPorPt}px`;
    estilo.lineHeight = bloco.espacamentoLinha === "compacto" ? 1.25 : bloco.espacamentoLinha === "amplo" ? 2 : 1.6;
  }
  return estilo;
}
// Formatação de textos curtos (legenda da foto, título do gráfico).
export type EstiloTextoCurto = { negrito?: boolean; tamanho?: TamanhoTexto; alinhamento?: AlinhamentoTextoCurto };
export type AjusteFoto = "cobrir" | "conter";
export type ProporcaoFoto = "paisagem" | "quadrada" | "retrato" | "panoramica";
export type TrechoTexto = { texto: string; negrito?: boolean; italico?: boolean; sublinhado?: boolean; cor?: "padrao" | "verde" | "azul" | "vermelho"; corHex?: string; destaque?: "nenhum" | "verde" | "azul" | "amarelo"; fundoHex?: string };

export type BlocoTexto = Geometria & ComTituloSecao & {
  id: string;
  tipo: "texto";
  texto: string;
  // Formatação por seleção. `texto` permanece íntegro para busca e integrações.
  trechos?: TrechoTexto[];
  estilo?: EstiloBloco;
  // Título do card (ex: "OBSERVAÇÕES DA VISITA"). Ignorado quando estilo !== "card".
  titulo?: string | null;
  secao?: "sintese" | "observacoes" | "analise" | "encaminhamentos";
  alinhamento?: AlinhamentoTexto;
  tamanho?: TamanhoTexto;
  // Tamanho em pontos e fonte escolhidos como no Word; quando há tamanhoPt ele
  // vale no lugar de `tamanho`.
  tamanhoPt?: number;
  fonte?: FonteTexto;
  negrito?: boolean;
  italico?: boolean;
  sublinhado?: boolean;
  cor?: "padrao" | "verde" | "azul" | "vermelho";
  espacamentoLinha?: "compacto" | "normal" | "amplo";
  destaque?: "nenhum" | "verde" | "azul" | "amarelo";
  subtitulo?: boolean;
  lista?: boolean;
  margemSuperior?: number;
  margemInferior?: number;
  // No PDF, este bloco (e o que vem depois) começa no topo de uma página nova.
  novaPagina?: boolean;
};

// Marcação desenhada sobre a foto (círculo, retângulo, linha, seta, texto ou etiqueta), como
// num slide. Coordenadas em % do quadro da foto (0–100 em x e em y), então a
// marcação acompanha o quadro em qualquer tamanho: editor, leitura e PDF.
export type FormaAnotacao = "elipse" | "retangulo" | "linha" | "seta" | "texto" | "etiqueta";

export type AnotacaoFoto = {
  id: string;
  forma: FormaAnotacao;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  cor: string;
  espessura: number;
  // Só nas formas "texto" e "etiqueta" (texto sobre tarja colorida, em destaque).
  texto?: string | null;
};

// Medidas de texto e etiqueta nas unidades do quadro (altura 100), iguais no SVG
// da página e no desenho da prévia do WhatsApp (foto-anotada.ts). A etiqueta
// começa em (x1, y1): borda esquerda, no meio da altura. Largura estimada pela
// quantidade de letras (negrito ~0,55 da altura da fonte).
export function tamanhoFonteAnotacao(espessura: number): number {
  return 3.4 + espessura * 0.55;
}

export function medidasEtiqueta(texto: string, espessura: number) {
  const fonte = tamanhoFonteAnotacao(espessura);
  const folgaX = fonte * 0.5;
  const folgaY = fonte * 0.38;
  return { fonte, folgaX, largura: texto.length * fonte * 0.55 + folgaX * 2, altura: fonte + folgaY * 2 };
}

// Cor do texto sobre a tarja: escuro nas cores claras (amarelo, branco), branco nas demais.
export function corTextoEtiqueta(fundo: string): string {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(fundo.slice(i, i + 2), 16));
  return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? "#111827" : "#ffffff";
}

export type BlocoFoto = Geometria & ComTituloSecao & {
  id: string;
  tipo: "foto";
  anotacoes?: AnotacaoFoto[];
  url: string;
  path: string | null;
  legenda: string | null;
  legendaEstilo?: EstiloTextoCurto;
  estilo?: EstiloBloco;
  // Título do card (ex: "REGISTRO FOTOGRÁFICO"). Ignorado quando estilo !== "card".
  titulo?: string | null;
  largura?: LarguraBloco;
  ajuste?: AjusteFoto;
  proporcao?: ProporcaoFoto;
  focoX?: number;
  focoY?: number;
  // Zoom + ponto focal formam o recorte manual não destrutivo da foto.
  zoom?: number;
  grupo?: string | null;
  // Rotação em quartos de volta: mantém a renderização previsível no PDF.
  rotacao?: 0 | 90 | 180 | 270;
  margemSuperior?: number;
  margemInferior?: number;
  capa?: boolean;
  novaPagina?: boolean;
};

// Formatos de gráfico — mesma lista no editor, na tela, no PDF e no bot.
export const FORMATOS_GRAFICO = [
  "barra",
  "barra_horizontal",
  "barra_empilhada",
  "linha",
  "area",
  "pizza",
  "rosca",
] as const;

export type FormatoGrafico = (typeof FORMATOS_GRAFICO)[number];

export const ROTULOS_FORMATO: Record<FormatoGrafico, string> = {
  barra: "Barras",
  barra_horizontal: "Barras deitadas",
  barra_empilhada: "Barras empilhadas",
  linha: "Linhas",
  area: "Área",
  pizza: "Pizza",
  rosca: "Rosca",
};

// Pizza e rosca usam só a primeira série (cada linha vira uma fatia).
export function usaSerieUnica(formato: FormatoGrafico): boolean {
  return formato === "pizza" || formato === "rosca";
}

export type BlocoGrafico = Geometria & ComTituloSecao & {
  id: string;
  tipo: "grafico";
  titulo: string;
  tituloEstilo?: EstiloTextoCurto;
  formato: FormatoGrafico;
  // Nomes das séries = colunas da tabela que o consultor preenche.
  series: string[];
  // Cada linha é uma categoria do eixo X com um valor por série.
  linhas: { rotulo: string; valores: (number | null)[] }[];
  unidade?: string;
  eixoX?: string;
  eixoY?: string;
  cores?: string[];
  largura?: LarguraBloco;
  margemSuperior?: number;
  margemInferior?: number;
  novaPagina?: boolean;
};

// Tabela leve, própria para indicadores de campo. Mantemos células como texto
// para aceitar unidades, observações e números sem perder a edição no PDF.
export type BlocoTabela = Geometria & ComTituloSecao & {
  id: string;
  tipo: "tabela";
  titulo: string;
  cabecalhos: string[];
  linhas: string[][];
  largura?: LarguraBloco;
  margemSuperior?: number;
  margemInferior?: number;
  novaPagina?: boolean;
};

// Caixa de destaque (atenção, resultado, dica, informação): chama a atenção
// para um ponto do relatório.
export type VarianteDestaque = "atencao" | "resultado" | "dica" | "info";

export const ROTULOS_DESTAQUE: Record<VarianteDestaque, string> = {
  atencao: "Atenção",
  resultado: "Resultado",
  dica: "Dica",
  info: "Informação",
};

export type BlocoDestaque = Geometria & ComTituloSecao & {
  id: string;
  tipo: "destaque";
  variante: VarianteDestaque;
  titulo?: string | null;
  texto: string;
  margemSuperior?: number;
  margemInferior?: number;
  novaPagina?: boolean;
};

// Faixa de números grandes ("+12 sc/ha", "98%"), cada um com seu rótulo.
export type BlocoIndicadores = Geometria & ComTituloSecao & {
  id: string;
  tipo: "indicadores";
  itens: { valor: string; rotulo: string }[];
  margemSuperior?: number;
  margemInferior?: number;
  novaPagina?: boolean;
};

// Separador entre partes do relatório.
export type EstiloDivisor = "linha" | "pontilhada" | "espaco";

export type BlocoDivisor = Geometria & ComTituloSecao & {
  id: string;
  tipo: "divisor";
  estilo: EstiloDivisor;
  margemSuperior?: number;
  margemInferior?: number;
  novaPagina?: boolean;
};

// Blocos que ocupam a linha inteira sozinhos, fora dos grupos de texto e de
// fotos/gráficos/tabelas.
export type BlocoAvulso = BlocoDestaque | BlocoIndicadores | BlocoDivisor;

export type Bloco = BlocoTexto | BlocoFoto | BlocoGrafico | BlocoTabela | BlocoAvulso;

export function ehBlocoAvulso(bloco: Bloco): bloco is BlocoAvulso {
  return bloco.tipo === "destaque" || bloco.tipo === "indicadores" || bloco.tipo === "divisor";
}

// Regra única de capa para editor, leitura, listagens e PDF: a capa sai SEM
// foto por padrão; só leva a foto escolhida (`capa: true`, no editor ou pelo
// bot com ajustar_capa_relatorio).
export function fotoDeCapa(fotos: readonly BlocoFoto[]): BlocoFoto | null {
  return fotos.find((foto) => foto.capa === true) ?? null;
}

// As quebras pertencem às páginas, não aos blocos. Estas transformações são
// puras para que drag-and-drop, seleção múltipla e controles de página usem a
// mesma regra e possam ser testados fora do componente React.
export function separarPaginas(blocos: readonly Bloco[]): Bloco[][] {
  const paginas: Bloco[][] = [[]];
  for (const bloco of blocos) {
    if (bloco.novaPagina && paginas.at(-1)!.length > 0) paginas.push([]);
    paginas.at(-1)!.push(bloco);
  }
  return paginas.filter((pagina) => pagina.length > 0);
}

export function achatarPaginas(paginas: readonly (readonly Bloco[])[]): Bloco[] {
  return paginas.filter((pagina) => pagina.length > 0).flatMap((pagina, paginaIndice) =>
    pagina.map((bloco, indice) => ({
      ...bloco,
      novaPagina: paginaIndice > 0 && indice === 0,
    } as Bloco)),
  );
}

export function reposicionarBlocos(
  blocos: readonly Bloco[],
  origemIds: readonly string[],
  alvoId: string,
  depois: boolean,
): Bloco[] {
  const ids = new Set(origemIds);
  if (ids.has(alvoId)) return [...blocos];
  const paginas = separarPaginas(blocos).map((pagina) => [...pagina]);
  const origens = blocos.filter((bloco) => ids.has(bloco.id));
  if (!origens.length) return [...blocos];
  for (const pagina of paginas) {
    pagina.splice(0, pagina.length, ...pagina.filter((bloco) => !ids.has(bloco.id)));
  }

  const paginasAtivas = paginas.filter((pagina) => pagina.length > 0);
  const paginaDestino = paginasAtivas.find((pagina) => pagina.some((bloco) => bloco.id === alvoId));
  if (!paginaDestino) return [...blocos];
  const indiceDestino = paginaDestino.findIndex((bloco) => bloco.id === alvoId) + (depois ? 1 : 0);
  paginaDestino.splice(indiceDestino, 0, ...origens);
  return achatarPaginas(paginasAtivas);
}

export function moverBlocosParaPagina(
  blocos: readonly Bloco[],
  origemIds: readonly string[],
  indicePagina: number,
): Bloco[] {
  const paginas = separarPaginas(blocos).map((pagina) => [...pagina]);
  const paginaDestino = paginas[indicePagina];
  if (!paginaDestino) return [...blocos];
  const ids = new Set(origemIds);
  const movidos = blocos.filter((bloco) => ids.has(bloco.id));
  if (!movidos.length) return [...blocos];
  for (const pagina of paginas) {
    pagina.splice(0, pagina.length, ...pagina.filter((bloco) => !ids.has(bloco.id)));
  }
  paginaDestino.push(...movidos);
  return achatarPaginas(paginas.filter((pagina) => pagina.length > 0));
}

export function moverPagina(blocos: readonly Bloco[], indicePagina: number, direcao: -1 | 1): Bloco[] {
  const paginas = separarPaginas(blocos).map((pagina) => [...pagina]);
  const destino = indicePagina + direcao;
  if (!paginas[indicePagina] || destino < 0 || destino >= paginas.length) return [...blocos];
  [paginas[indicePagina], paginas[destino]] = [paginas[destino], paginas[indicePagina]];
  return achatarPaginas(paginas);
}

export function excluirPagina(
  blocos: readonly Bloco[],
  indicePagina: number,
  blocoVazio: () => Bloco,
): Bloco[] {
  const paginas = separarPaginas(blocos).map((pagina) => [...pagina]);
  if (!paginas[indicePagina]) return [...blocos];
  paginas.splice(indicePagina, 1);
  return achatarPaginas(paginas.length ? paginas : [[blocoVazio()]]);
}

export function fotoEmPaginaExclusiva(blocos: readonly Bloco[], id: string): Bloco[] {
  return blocos.map((bloco, indice) => {
    if (bloco.id === id && bloco.tipo === "foto") {
      return { ...bloco, largura: "inteira", novaPagina: indice > 0 };
    }
    if (indice > 0 && blocos[indice - 1]?.id === id) return { ...bloco, novaPagina: true } as Bloco;
    return bloco;
  });
}

// Barras com uma série só (ex.: produtividade da testemunha x tratamento):
// cada barra ganha a sua cor e a legenda lista as categorias — com a cor da
// série, todas saíam iguais e a legenda repetia o nome da série. Mesma regra
// na tela e no PDF.
export function coresPorCategoria(bloco: Pick<BlocoGrafico, "formato" | "series" | "linhas">): boolean {
  return (
    (bloco.formato === "barra" || bloco.formato === "barra_horizontal") &&
    bloco.series.length === 1 &&
    bloco.linhas.length > 1
  );
}

export function tipoEfetivoRelatorio(tipo: string, blocos: Bloco[]): "VISITA" | "TECNICO" {
  return tipo === "TECNICO" || blocos.some((b) => b.tipo === "foto") ? "TECNICO" : "VISITA";
}

// Omit distribuído sobre a união: preserva o discriminante `tipo` de cada
// variante, diferente do Omit padrão (que colapsa a união pelas chaves em
// comum antes de subtrair).
export type SemGeometria<T> = T extends Geometria & { id: string }
  ? Omit<T, keyof Geometria>
  : never;

const geometriaSchema = {
  pagina: z.number().int().min(0).max(200).default(0),
  x: z.number().default(MARGEM),
  y: z.number().default(MARGEM),
  w: z.number().min(20).default(PAGINA_LARGURA - MARGEM * 2),
  h: z.number().min(20).default(120),
};

const estiloBlocoSchema = z.enum(["card", "simples"]).optional();

const estiloTextoCurtoSchema = z
  .object({
    negrito: z.boolean().optional(),
    tamanho: z.enum(["pequeno", "normal", "grande"]).optional(),
    alinhamento: z.enum(["esquerda", "centro", "direita"]).optional(),
  })
  .optional();

const blocoTextoSchema = z.object({
  id: z.string().min(1),
  tipo: z.literal("texto"),
  texto: z.string(),
  trechos: z.array(z.object({ texto: z.string(), negrito: z.boolean().optional(), italico: z.boolean().optional(), sublinhado: z.boolean().optional(), cor: z.enum(["padrao", "verde", "azul", "vermelho"]).optional(), corHex: z.string().regex(/^#[0-9a-f]{6}$/i).optional(), destaque: z.enum(["nenhum", "verde", "azul", "amarelo"]).optional(), fundoHex: z.string().regex(/^#[0-9a-f]{6}$/i).optional() })).max(500).optional(),
  estilo: estiloBlocoSchema,
  titulo: z.string().nullable().optional(),
  secao: z.enum(["sintese", "observacoes", "analise", "encaminhamentos"]).optional(),
  alinhamento: z.enum(["esquerda", "centro", "direita", "justificar"]).optional(),
  tamanho: z.enum(["pequeno", "normal", "grande"]).optional(),
  tamanhoPt: z.number().min(6).max(96).optional(),
  fonte: z.enum(["padrao", "inter", "roboto", "montserrat", "merriweather", "lora"]).optional(),
  negrito: z.boolean().optional(),
  italico: z.boolean().optional(),
  sublinhado: z.boolean().optional(),
  cor: z.enum(["padrao", "verde", "azul", "vermelho"]).optional(),
  espacamentoLinha: z.enum(["compacto", "normal", "amplo"]).optional(),
  destaque: z.enum(["nenhum", "verde", "azul", "amarelo"]).optional(),
  subtitulo: z.boolean().optional(),
  lista: z.boolean().optional(),
  margemSuperior: z.number().min(0).max(600).optional(),
  margemInferior: z.number().min(0).max(64).optional(),
  novaPagina: z.boolean().optional(),
  tituloSecao: z.string().max(80).nullable().optional(),
  ...geometriaSchema,
});

const anotacaoSchema = z.object({
  id: z.string().min(1),
  forma: z.enum(["elipse", "retangulo", "linha", "seta", "texto", "etiqueta"]),
  x1: z.number().min(0).max(100),
  y1: z.number().min(0).max(100),
  x2: z.number().min(0).max(100),
  y2: z.number().min(0).max(100),
  cor: z.string().regex(/^#[0-9a-f]{6}$/i),
  espessura: z.number().min(1).max(10),
  texto: z.string().max(120).nullable().optional(),
});

const blocoFotoSchema = z.object({
  id: z.string().min(1),
  tipo: z.literal("foto"),
  anotacoes: z.array(anotacaoSchema).max(40).optional(),
  url: z.string().min(1),
  path: z.string().nullable(),
  legenda: z.string().nullable(),
  legendaEstilo: estiloTextoCurtoSchema,
  estilo: estiloBlocoSchema,
  titulo: z.string().nullable().optional(),
  largura: z.enum(["terco", "metade", "inteira"]).optional(),
  ajuste: z.enum(["cobrir", "conter"]).optional(),
  proporcao: z.enum(["paisagem", "quadrada", "retrato", "panoramica"]).optional(),
  focoX: z.number().min(0).max(100).optional(),
  focoY: z.number().min(0).max(100).optional(),
  zoom: z.number().min(1).max(2.5).optional(),
  grupo: z.string().max(60).nullable().optional(),
  rotacao: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]).optional(),
  margemSuperior: z.number().min(0).max(600).optional(),
  margemInferior: z.number().min(0).max(64).optional(),
  capa: z.boolean().optional(),
  novaPagina: z.boolean().optional(),
  tituloSecao: z.string().max(80).nullable().optional(),
  ...geometriaSchema,
});

const blocoGraficoSchema = z.object({
  id: z.string().min(1),
  tipo: z.literal("grafico"),
  titulo: z.string(),
  tituloEstilo: estiloTextoCurtoSchema,
  formato: z.enum(FORMATOS_GRAFICO),
  series: z.array(z.string()).min(1).max(6),
  linhas: z
    .array(
      z.object({
        rotulo: z.string(),
        valores: z.array(z.number().nullable()),
      })
    )
    .max(60),
  unidade: z.string().max(20).optional(),
  eixoX: z.string().max(40).optional(),
  eixoY: z.string().max(40).optional(),
  // Séries usam no máximo seis cores; barra de série única, pizza e rosca
  // usam uma cor por categoria/fatia (até sessenta linhas).
  cores: z.array(z.string().regex(/^#[0-9a-f]{6}$/i)).max(60).optional(),
  largura: z.enum(["terco", "metade", "inteira"]).optional(),
  margemSuperior: z.number().min(0).max(600).optional(),
  margemInferior: z.number().min(0).max(64).optional(),
  novaPagina: z.boolean().optional(),
  tituloSecao: z.string().max(80).nullable().optional(),
  ...geometriaSchema,
});

const blocoTabelaSchema = z.object({
  id: z.string().min(1),
  tipo: z.literal("tabela"),
  titulo: z.string().max(120),
  cabecalhos: z.array(z.string().max(80)).min(1).max(8),
  linhas: z.array(z.array(z.string().max(500)).max(8)).max(60),
  largura: z.enum(["terco", "metade", "inteira"]).optional(),
  margemSuperior: z.number().min(0).max(600).optional(),
  margemInferior: z.number().min(0).max(64).optional(),
  novaPagina: z.boolean().optional(),
  tituloSecao: z.string().max(80).nullable().optional(),
  ...geometriaSchema,
});

const blocoDestaqueSchema = z.object({
  id: z.string().min(1),
  tipo: z.literal("destaque"),
  variante: z.enum(["atencao", "resultado", "dica", "info"]),
  titulo: z.string().max(120).nullable().optional(),
  texto: z.string().max(2000),
  margemSuperior: z.number().min(0).max(600).optional(),
  margemInferior: z.number().min(0).max(64).optional(),
  novaPagina: z.boolean().optional(),
  tituloSecao: z.string().max(80).nullable().optional(),
  ...geometriaSchema,
});

const blocoIndicadoresSchema = z.object({
  id: z.string().min(1),
  tipo: z.literal("indicadores"),
  itens: z.array(z.object({ valor: z.string().max(40), rotulo: z.string().max(80) })).min(1).max(4),
  margemSuperior: z.number().min(0).max(600).optional(),
  margemInferior: z.number().min(0).max(64).optional(),
  novaPagina: z.boolean().optional(),
  tituloSecao: z.string().max(80).nullable().optional(),
  ...geometriaSchema,
});

const blocoDivisorSchema = z.object({
  id: z.string().min(1),
  tipo: z.literal("divisor"),
  estilo: z.enum(["linha", "pontilhada", "espaco"]),
  margemSuperior: z.number().min(0).max(600).optional(),
  margemInferior: z.number().min(0).max(64).optional(),
  novaPagina: z.boolean().optional(),
  tituloSecao: z.string().max(80).nullable().optional(),
  ...geometriaSchema,
});

export const blocoSchema = z.discriminatedUnion("tipo", [
  blocoTextoSchema,
  blocoFotoSchema,
  blocoGraficoSchema,
  blocoTabelaSchema,
  blocoDestaqueSchema,
  blocoIndicadoresSchema,
  blocoDivisorSchema,
]);

export const conteudoSchema = z.array(blocoSchema).max(200);

export function novoId(): string {
  // crypto.randomUUID existe no browser e no Node 19+; o fallback cobre o resto.
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `b-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

// Altura estimada pra empilhar um bloco recém-criado (sem o consultor ainda
// ter redimensionado nada). Só usada pelo auto-layout inicial.
function alturaEstimada(bloco: SemGeometria<Bloco>): number {
  if (bloco.tipo === "foto") return 420;
  if (bloco.tipo === "grafico") return 340;
  if (bloco.tipo === "tabela") return 260;
  return 140;
}

// Empilha blocos sem geometria verticalmente, quebrando pra próxima página
// quando não cabe mais. Usado tanto pro legado (relatório nunca aberto no
// canvas) quanto por qualquer bloco novo criado sem posição explícita.
export function autoLayout(
  blocosSemGeometria: SemGeometria<Bloco>[]
): Bloco[] {
  const largura = PAGINA_LARGURA - MARGEM * 2;
  let pagina = 0;
  let y = MARGEM;

  return blocosSemGeometria.map((base) => {
    const h = alturaEstimada(base);
    if (y + h > PAGINA_ALTURA - MARGEM && y > MARGEM) {
      pagina += 1;
      y = MARGEM;
    }
    const bloco = { ...base, pagina, x: MARGEM, y, w: largura, h } as Bloco;
    y += h + 24;
    return bloco;
  });
}

// Acrescenta blocos novos depois do último bloco existente (ex.: texto ou
// fotos que chegaram pelo WhatsApp num relatório já montado no editor),
// empilhando e quebrando página como o autoLayout.
export function acrescentarBlocos(
  existentes: Bloco[],
  novos: SemGeometria<Bloco>[]
): Bloco[] {
  const largura = PAGINA_LARGURA - MARGEM * 2;
  let pagina = 0;
  let y = MARGEM;
  for (const b of existentes) {
    const fim = b.y + b.h + 24;
    if (b.pagina > pagina || (b.pagina === pagina && fim > y)) {
      if (b.pagina > pagina) y = MARGEM;
      pagina = b.pagina;
      y = Math.max(y, fim);
    }
  }

  const adicionados = novos.map((base) => {
    const h = alturaEstimada(base);
    if (y + h > PAGINA_ALTURA - MARGEM && y > MARGEM) {
      pagina += 1;
      y = MARGEM;
    }
    const bloco = { ...base, pagina, x: MARGEM, y, w: largura, h } as Bloco;
    y += h + 24;
    return bloco;
  });

  return [...existentes, ...adicionados];
}

// Converte um relatório que ainda não passou pelo editor: o relato vira um
// bloco de texto e cada foto anexada vira um bloco de foto, na ordem original.
export function conteudoInicial(
  texto: string,
  fotos: { url: string; path?: string | null; legenda?: string | null }[]
): Bloco[] {
  const base: SemGeometria<Bloco>[] = [];
  if (texto.trim()) {
    base.push({ id: novoId(), tipo: "texto", texto });
  }
  for (const foto of fotos) {
    base.push({
      id: novoId(),
      tipo: "foto",
      url: foto.url,
      path: foto.path ?? null,
      legenda: foto.legenda ?? null,
    });
  }
  if (base.length === 0) {
    base.push({ id: novoId(), tipo: "texto", texto: "" });
  }
  return autoLayout(base);
}

export type EstruturaRelatorio = {
  sintese: string;
  observacoes: { area: string; texto: string }[];
  analise: string | null;
  encaminhamentos: string[];
};

// O bot produz conteúdo sem coordenadas; web, API mobile e PDF usam os mesmos blocos.
export function blocosDaEstrutura(estrutura: EstruturaRelatorio): Bloco[] {
  const bases: SemGeometria<Bloco>[] = [];
  const adicionar = (secao: NonNullable<BlocoTexto["secao"]>, texto: string, titulo?: string) => {
    if (texto.trim()) bases.push({ id: novoId(), tipo: "texto", secao, texto: texto.trim(), titulo: titulo?.trim() || null });
  };
  adicionar("sintese", estrutura.sintese);
  for (const observacao of estrutura.observacoes) adicionar("observacoes", observacao.texto, observacao.area);
  adicionar("analise", estrutura.analise ?? "");
  for (const encaminhamento of estrutura.encaminhamentos) adicionar("encaminhamentos", encaminhamento);
  return autoLayout(bases);
}

// Lê o `conteudo` vindo do banco (Json), caindo para a conversão do legado
// quando ele ainda não existe ou está corrompido. Blocos salvos antes da
// geometria existir ganham posição via zod .default(...) no parse, mas
// continuam empilhados na ordem em que foram salvos (o valor default é
// sempre o mesmo x/y) — por isso ainda passamos pelo autoLayout quando
// detectamos que nenhum bloco tem geometria própria.
export function lerConteudo(
  conteudo: unknown,
  texto: string,
  fotos: { url: string; path?: string | null; legenda?: string | null }[]
): Bloco[] {
  if (conteudo == null) return hidratarUrlsFotos(conteudoInicial(texto, fotos), fotos);
  const parsed = conteudoSchema.safeParse(conteudo);
  if (!parsed.success || parsed.data.length === 0) {
    return hidratarUrlsFotos(conteudoInicial(texto, fotos), fotos);
  }

  const bruto = conteudo as { x?: unknown }[];
  const semGeometriaPropria = bruto.every((b) => b?.x === undefined);
  const resultado = semGeometriaPropria
    ? autoLayout(
      parsed.data.map(({ pagina, x, y, w, h, ...resto }) => {
        void pagina;
        void x;
        void y;
        void w;
        void h;
        return resto as SemGeometria<Bloco>;
      })
    )
    : parsed.data;

  return hidratarUrlsFotos(resultado, fotos);
}

function hidratarUrlsFotos(blocos: Bloco[], fotos: { url: string; path?: string | null; legenda?: string | null }[]) {
  return blocos.map((bloco) => {
    if (bloco.tipo !== "foto") return bloco;
    const foto = fotos.find((item) =>
      (bloco.path && item.path === bloco.path) || item.url === bloco.url
    );
    return foto ? { ...bloco, url: foto.url, path: foto.path ?? bloco.path } : bloco;
  });
}

// Texto puro derivado dos blocos — mantém `texto` útil para busca, PDF simples
// e para o resumo que o WhatsApp mostra.
export function textoDosBlocos(blocos: Bloco[]): string {
  return blocos
    .map((b) => {
      if (b.tipo === "texto") return [b.titulo?.trim(), b.texto.trim()].filter(Boolean).join(": ");
      if (b.tipo === "grafico") return `[gráfico] ${b.titulo}`.trim();
      if (b.tipo === "tabela") return [b.titulo, b.cabecalhos.join(" | "), ...b.linhas.map((linha) => linha.join(" | "))].filter(Boolean).join("\n");
      if (b.tipo === "destaque") return [b.titulo?.trim() || ROTULOS_DESTAQUE[b.variante], b.texto.trim()].filter(Boolean).join(": ");
      if (b.tipo === "indicadores") return b.itens.map((item) => [item.rotulo, item.valor].filter(Boolean).join(": ")).join("; ");
      if (b.tipo === "divisor") return "";
      return b.legenda ? `[foto] ${b.legenda}` : "";
    })
    .filter(Boolean)
    .join("\n\n");
}

// ---------------------------------------------------------------------------
// Layout em fluxo: tela, editor e PDF montam o documento seguindo a ORDEM dos
// blocos (o consultor reposiciona com as setas no editor). Textos do começo
// vão pro quadro de síntese; textos mais abaixo viram parágrafos ali mesmo;
// fotos/gráficos em sequência formam linhas de 2 colunas, e um bloco em
// largura inteira ocupa a linha sozinho.
// ---------------------------------------------------------------------------

export type BlocoVisual = BlocoFoto | BlocoGrafico | BlocoTabela;

// novaPagina: a seção começa com um bloco marcado "nova página" — no PDF ela
// vai pro topo de uma página nova (um bloco marcado sempre abre seção nova).
export type SecaoLayout = { novaPagina?: boolean; titulo?: string | null } & (
  | { tipo: "sintese"; blocos: BlocoTexto[] }
  | { tipo: "texto"; blocos: BlocoTexto[] }
  | { tipo: "secao_texto"; secao: NonNullable<BlocoTexto["secao"]>; blocos: BlocoTexto[] }
  | { tipo: "visual"; conteudo: "fotos" | "graficos" | "tabelas" | "misto"; linhas: BlocoVisual[][] }
  | { tipo: "avulso"; bloco: BlocoAvulso }
);

export function larguraDoBloco(bloco: BlocoVisual): LarguraBloco {
  return bloco.largura ?? (bloco.tipo === "foto" ? "metade" : "inteira");
}

export function montarLayout(blocos: Bloco[]): SecaoLayout[] {
  const secoes: SecaoLayout[] = [];
  let i = 0;

  // Síntese: sempre existe (pode vir vazia), com os textos do começo.
  const sintese: BlocoTexto[] = [];
  while (
    i < blocos.length && blocos[i].tipo === "texto" &&
    (!(blocos[i] as BlocoTexto).secao || (blocos[i] as BlocoTexto).secao === "sintese") &&
    !(sintese.length > 0 && blocos[i].novaPagina)
  ) sintese.push(blocos[i++] as BlocoTexto);
  secoes.push({ tipo: "sintese", blocos: sintese, titulo: sintese[0]?.tituloSecao });

  while (i < blocos.length) {
    const novaPagina = Boolean(blocos[i].novaPagina);
    const titulo = blocos[i].tituloSecao;
    const atual = blocos[i];
    if (ehBlocoAvulso(atual)) {
      secoes.push({ tipo: "avulso", bloco: atual, novaPagina });
      i++;
      continue;
    }
    if (blocos[i].tipo === "texto") {
      const secao = (blocos[i] as BlocoTexto).secao;
      const textos: BlocoTexto[] = [];
      while (
        i < blocos.length && blocos[i].tipo === "texto" && (blocos[i] as BlocoTexto).secao === secao &&
        (textos.length === 0 || !blocos[i].novaPagina)
      )
        textos.push(blocos[i++] as BlocoTexto);
      if (secao) secoes.push({ tipo: "secao_texto", secao, blocos: textos, novaPagina, titulo });
      else secoes.push({ tipo: "texto", blocos: textos, novaPagina });
      continue;
    }

    const linhas: BlocoVisual[][] = [];
    let pendente: BlocoVisual[] = [];
    let unidadesPendentes = 0;
    const tipos = new Set<string>();
    const unidades = (bloco: BlocoVisual) => larguraDoBloco(bloco) === "inteira" ? 6 : larguraDoBloco(bloco) === "metade" ? 3 : 2;
    const fecharLinha = () => {
      if (pendente.length) linhas.push(pendente);
      pendente = [];
      unidadesPendentes = 0;
    };
    while (i < blocos.length && blocos[i].tipo !== "texto" && !ehBlocoAvulso(blocos[i]) && (tipos.size === 0 || !blocos[i].novaPagina)) {
      const bloco = blocos[i++] as BlocoVisual;
      tipos.add(bloco.tipo);
      if (larguraDoBloco(bloco) === "inteira") {
        fecharLinha();
        linhas.push([bloco]);
      } else {
        const ocupacao = unidades(bloco);
        if (unidadesPendentes + ocupacao > 6) fecharLinha();
        pendente.push(bloco);
        unidadesPendentes += ocupacao;
        if (unidadesPendentes === 6) fecharLinha();
      }
    }
    fecharLinha();
    const conteudo = tipos.size > 1 ? "misto" : tipos.has("foto") ? "fotos" : tipos.has("tabela") ? "tabelas" : "graficos";
    secoes.push({ tipo: "visual", conteudo, linhas, novaPagina, titulo });
  }

  return secoes;
}

export function tituloSecaoVisual(conteudo: "fotos" | "graficos" | "tabelas" | "misto", tecnico: boolean): string {
  if (conteudo === "graficos") return "Análises e indicadores";
  if (conteudo === "tabelas") return "Dados e indicadores";
  if (conteudo === "fotos") return tecnico ? "Evidências fotográficas" : "Registros da visita";
  return "Evidências e análises";
}

// Título que a seção mostra (tela, editor e PDF): o escrito pelo consultor,
// ou o padrão. Parágrafo solto não tem título ("").
export function tituloPadraoDaSecao(secao: SecaoLayout, tecnico: boolean): string {
  if (secao.tipo === "sintese") return tecnico ? "Síntese da avaliação" : "Relato da visita";
  if (secao.tipo === "secao_texto") return tituloSecaoTexto(secao.secao);
  if (secao.tipo === "visual") return tituloSecaoVisual(secao.conteudo, tecnico);
  return "";
}

export function tituloDaSecao(secao: SecaoLayout, tecnico: boolean): string {
  return secao.titulo?.trim() || tituloPadraoDaSecao(secao, tecnico);
}

export function tituloSecaoTexto(secao: NonNullable<BlocoTexto["secao"]>): string {
  return {
    sintese: "Síntese da avaliação",
    observacoes: "Observações por área",
    analise: "Análise e indicadores",
    encaminhamentos: "Encaminhamentos",
  }[secao];
}

// ---------------------------------------------------------------------------
// Paginação do PDF mostrada na tela. O PDF (relatorio-pdf.ts, dossiê técnico)
// devolve em que página cada bloco começa e termina; aqui isso vira "onde
// desenhar a divisória Página N" na leitura e no editor, que seguem as
// mesmas seções de montarLayout.

// Página de cada bloco no PDF, na numeração do rodapé (a capa não conta).
export type MapaPaginas = {
  temCapa: boolean;
  totalPaginas: number;
  blocos: Record<string, { inicio: number; fim: number }>;
};

export type QuebrasDePagina = {
  total: number;
  // Índice da seção → página que começa antes dela (o título vai junto).
  antesDaSecao: Record<number, number>;
  // Id do primeiro bloco da unidade (card, parágrafo, linha de fotos) →
  // página que começa antes dele.
  antesDoBloco: Record<string, number>;
  // Id do último bloco de uma unidade que não coube inteira → página onde
  // ela termina.
  continuaEm: Record<string, number>;
};

export function quebrasDePagina(secoes: SecaoLayout[], mapa: MapaPaginas | null): QuebrasDePagina {
  const quebras: QuebrasDePagina = {
    total: mapa?.totalPaginas ?? 0,
    antesDaSecao: {},
    antesDoBloco: {},
    continuaEm: {},
  };
  if (!mapa || mapa.totalPaginas < 2) return quebras;

  let atual = 1;
  secoes.forEach((secao, indice) => {
    // O que o PDF desenha como uma peça só: a síntese inteira, o card de
    // encaminhamentos, cada card/parágrafo, cada linha de fotos/gráficos.
    const unidades: string[][] =
      secao.tipo === "avulso"
        ? [[secao.bloco.id]]
        : secao.tipo === "sintese" ||
      (secao.tipo === "secao_texto" && secao.secao === "encaminhamentos")
        ? [secao.blocos.map((b) => b.id)]
        : secao.tipo === "visual"
          ? secao.linhas.map((linha) => linha.map((b) => b.id))
          : secao.blocos.map((b) => [b.id]);

    let primeira = true;
    for (const ids of unidades) {
      const marcas = ids.map((id) => mapa.blocos[id]).filter(Boolean);
      if (marcas.length === 0) continue; // texto vazio: não entra no PDF
      const inicio = Math.min(...marcas.map((m) => m.inicio));
      const fim = Math.max(...marcas.map((m) => m.fim));
      if (inicio > atual) {
        if (primeira) quebras.antesDaSecao[indice] = inicio;
        else quebras.antesDoBloco[ids[0]] = inicio;
      }
      if (fim > inicio) quebras.continuaEm[ids[ids.length - 1]] = fim;
      atual = Math.max(atual, fim);
      primeira = false;
    }
  });
  return quebras;
}

// Folha A4 do PDF. Qualquer valor desconhecido vira paisagem (o padrão novo).
export type OrientacaoRelatorio = "PAISAGEM" | "RETRATO";
export function orientacaoDe(valor: string | null | undefined): OrientacaoRelatorio {
  return valor === "RETRATO" ? "RETRATO" : "PAISAGEM";
}
