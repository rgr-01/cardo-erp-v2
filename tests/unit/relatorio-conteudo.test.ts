import { describe, expect, it } from "vitest";
import {
  achatarPaginas,
  conteudoSchema,
  excluirPagina,
  fotoDeCapa,
  fotoEmPaginaExclusiva,
  lerConteudo,
  montarLayout,
  moverBlocosParaPagina,
  moverPagina,
  reposicionarBlocos,
  separarPaginas,
  textoDosBlocos,
  type Bloco,
} from "@/lib/relatorio-conteudo";

const geometria = { pagina: 0, x: 40, y: 40, w: 720, h: 120 };
const texto = (id: string, novaPagina = false): Bloco => ({
  ...geometria,
  id,
  tipo: "texto",
  texto: id,
  novaPagina,
});
const foto = (id: string, capa?: boolean): Extract<Bloco, { tipo: "foto" }> => ({
  ...geometria,
  id,
  tipo: "foto",
  url: `https://exemplo.test/${id}.jpg`,
  path: `${id}.jpg`,
  legenda: null,
  capa,
});

describe("lerConteudo", () => {
  it("substitui a URL salva pela URL temporaria da foto com mesmo path", () => {
    const blocos = lerConteudo(
      [{ id: "foto-1", tipo: "foto", url: "https://antiga", path: "visita/foto.jpg", pagina: 1, x: 0, y: 0, w: 1, h: 1 }],
      "",
      [{ url: "https://assinada", path: "visita/foto.jpg" }]
    );

    expect(blocos[0]).toMatchObject({ tipo: "foto", url: "https://assinada", path: "visita/foto.jpg" });
  });

  it("converte relatório antigo sem conteudo e posiciona blocos sem geometria", () => {
    const legado = lerConteudo(null, "Relato antigo", [{ url: "https://assinada", path: "foto.jpg" }]);
    expect(legado.map((bloco) => bloco.tipo)).toEqual(["texto", "foto"]);
    expect(legado.every((bloco) => bloco.w > 0 && bloco.h > 0)).toBe(true);

    const semGeometria = lerConteudo([{ id: "texto", tipo: "texto", texto: "Sem posição" }], "", []);
    expect(semGeometria[0]).toMatchObject({ pagina: 0, x: 40, y: 40 });
  });
});

describe("layout editorial", () => {
  it("agrupa três quadros de um terço na mesma linha", () => {
    const blocos = [0, 1, 2].map((indice) => ({
      id: `foto-${indice}`,
      tipo: "foto" as const,
      url: `https://exemplo.test/${indice}.jpg`,
      path: null,
      legenda: null,
      largura: "terco" as const,
      pagina: 0,
      x: 40,
      y: 40,
      w: 200,
      h: 200,
    })) satisfies Bloco[];

    const visual = montarLayout(blocos).find((secao) => secao.tipo === "visual");
    expect(visual?.tipo === "visual" ? visual.linhas[0] : []).toHaveLength(3);
  });

  it("aceita formatação e enquadramento novos sem invalidar o documento", () => {
    const resultado = conteudoSchema.safeParse([
      { id: "texto", tipo: "texto", texto: "Destaque", italico: true, subtitulo: true, destaque: "verde", margemSuperior: 12, pagina: 0, x: 40, y: 40, w: 720, h: 120 },
      { id: "foto", tipo: "foto", url: "https://exemplo.test/foto.jpg", path: null, legenda: "Legenda", largura: "terco", proporcao: "retrato", focoX: 25, focoY: 70, pagina: 0, x: 40, y: 180, w: 220, h: 300 },
    ]);
    expect(resultado.success).toBe(true);
  });
});

describe("páginas do editor", () => {
  it("separa e recompõe páginas preservando ordem, ids e uma quebra por página", () => {
    const original = [texto("a"), texto("b"), texto("c", true), texto("d")];
    const paginas = separarPaginas(original);

    expect(paginas.map((pagina) => pagina.map((bloco) => bloco.id))).toEqual([["a", "b"], ["c", "d"]]);
    expect(achatarPaginas(paginas).map((bloco) => [bloco.id, Boolean(bloco.novaPagina)])).toEqual([
      ["a", false], ["b", false], ["c", true], ["d", false],
    ]);
  });

  it("move um bloco e um grupo entre páginas sem levar a quebra antiga", () => {
    const original = [texto("a"), texto("b"), texto("c", true), texto("d")];
    const umBloco = reposicionarBlocos(original, ["b"], "d", true);
    expect(separarPaginas(umBloco).map((pagina) => pagina.map((bloco) => bloco.id))).toEqual([["a"], ["c", "d", "b"]]);

    const grupo = moverBlocosParaPagina(original, ["b", "d"], 0);
    expect(separarPaginas(grupo).map((pagina) => pagina.map((bloco) => bloco.id))).toEqual([["a", "b", "d"], ["c"]]);
  });

  it("reordena e exclui páginas, mantendo ao menos um bloco", () => {
    const original = [texto("a"), texto("b", true)];
    expect(moverPagina(original, 1, -1).map((bloco) => bloco.id)).toEqual(["b", "a"]);
    expect(excluirPagina(original, 0, () => texto("vazio")).map((bloco) => bloco.id)).toEqual(["b"]);
    expect(excluirPagina([texto("a")], 0, () => texto("vazio")).map((bloco) => bloco.id)).toEqual(["vazio"]);
  });

  it("isola uma foto e abre nova página para o bloco seguinte", () => {
    const resultado = fotoEmPaginaExclusiva([texto("a"), foto("f"), texto("b")], "f");
    expect(resultado[1]).toMatchObject({ id: "f", largura: "inteira", novaPagina: true });
    expect(resultado[2]).toMatchObject({ id: "b", novaPagina: true });
  });
});

describe("capa fotográfica", () => {
  it("mantem compatibilidade com documentos antigos e respeita escolha explicita", () => {
    expect(fotoDeCapa([foto("a"), foto("b")])?.id).toBe("a");
    expect(fotoDeCapa([foto("a", false), foto("b", true)])?.id).toBe("b");
  });

  it("permite desativar a capa", () => {
    expect(fotoDeCapa([foto("a", false), foto("b", false)])).toBeNull();
    expect(fotoDeCapa([])).toBeNull();
  });
});

describe("limites do documento", () => {
  it("rejeita foco, margens e quantidade de blocos fora dos limites", () => {
    expect(conteudoSchema.safeParse([{ ...foto("f"), focoX: 101 }]).success).toBe(false);
    expect(conteudoSchema.safeParse([{ ...texto("t"), margemSuperior: 65 }]).success).toBe(false);
    expect(conteudoSchema.safeParse(Array.from({ length: 201 }, (_, indice) => texto(String(indice)))).success).toBe(false);
  });
});

describe("anotações na foto e blocos de destaque", () => {
  const anotacao = { id: "a", forma: "seta" as const, x1: 10, y1: 20, x2: 80, y2: 60, cor: "#ef4444", espessura: 4 };
  const destaque = (id: string): Bloco => ({ ...geometria, id, tipo: "destaque", variante: "atencao", titulo: null, texto: "Cuidado com a ferrugem" });
  const indicadores: Bloco = { ...geometria, id: "i", tipo: "indicadores", itens: [{ valor: "+12 sc/ha", rotulo: "Produtividade" }] };
  const divisor: Bloco = { ...geometria, id: "d", tipo: "divisor", estilo: "linha" };

  it("aceita anotações dentro do quadro e recusa coordenada, cor ou espessura inválidas", () => {
    expect(conteudoSchema.safeParse([{ ...foto("f"), anotacoes: [anotacao] }]).success).toBe(true);
    expect(conteudoSchema.safeParse([{ ...foto("f"), anotacoes: [{ ...anotacao, x2: 101 }] }]).success).toBe(false);
    expect(conteudoSchema.safeParse([{ ...foto("f"), anotacoes: [{ ...anotacao, cor: "vermelho" }] }]).success).toBe(false);
    expect(conteudoSchema.safeParse([{ ...foto("f"), anotacoes: [{ ...anotacao, espessura: 11 }] }]).success).toBe(false);
  });

  it("aceita os blocos novos e limita os indicadores a quatro", () => {
    expect(conteudoSchema.safeParse([destaque("x"), indicadores, divisor]).success).toBe(true);
    const cinco = { ...indicadores, itens: Array.from({ length: 5 }, () => ({ valor: "1", rotulo: "a" })) };
    expect(conteudoSchema.safeParse([cinco]).success).toBe(false);
  });

  it("monta cada bloco novo como seção própria, sem misturar com fotos e gráficos", () => {
    const secoes = montarLayout([texto("t"), foto("f1"), destaque("d1"), foto("f2"), indicadores, divisor]);
    expect(secoes.map((secao) => secao.tipo)).toEqual(["sintese", "visual", "avulso", "visual", "avulso", "avulso"]);
  });

  it("entra no texto do relatório (busca e resumo)", () => {
    expect(textoDosBlocos([destaque("x"), indicadores, divisor])).toBe("Atenção: Cuidado com a ferrugem\n\nProdutividade: +12 sc/ha");
  });
});
