import {
  PDFDocument,
  PDFFont,
  PDFPage,
  rgb,
  type RGB,
} from "pdf-lib";
import { MARCA_AZUL, MARCA_VERDE, desenharLogo, embutirFontesMarca } from "@/lib/marca/pdf";
import { dadosEmpresaAtual, prepararMarcaPdf, type DadosEmpresa } from "@/lib/empresa";

export type ItemPropostaPdf = {
  fornecedor: string;
  produto: string;
  // So aparecem no PDF quando informados — string vazia/"Não informado" omite
  // a linha inteira em vez de imprimir o rotulo sem valor.
  ingredienteAtivo?: string;
  embalagem?: string;
  recomendacao?: string;
  cultura: string;
  volume: string;
  unidade: string;
  valorUnitario: string;
  // So no orcamento cotado a vista e a prazo (valorUnitario/total = a vista).
  valorUnitarioAprazo?: string;
  totalAprazo?: string;
  // Ex.: "5%"; vazio quando o item nao tem desconto.
  desconto?: string;
  total: string;
};

export type PropostaPdf = {
  numero: string;
  tipo?: "PEDIDO" | "PROPOSTA";
  status: string;
  safra: string;
  data: string;
  validade: string;
  // Só no pedido: data de faturamento e as parcelas dela (1ª parcela na própria data).
  // Quem assina (nomes nos campos de assinatura); sem isso usa cliente, empresa e consultor.
  assinantes?: { papel: "CLIENTE" | "EMPRESA" | "VENDEDOR" | "OUTRO"; nome: string; rotulo?: string }[];
  dataFaturamento?: string;
  parcelas?: { numero: number; data: string; valor: string }[];
  previsaoEntrega: string;
  localEntrega: string;
  frete: string;
  cliente: {
    nome: string;
    razaoSocial: string;
    documento: string;
    inscricaoEstadual: string;
    endereco: string;
    cidadeUfCep: string;
    telefone: string;
    email: string;
  };
  consultor: { nome: string; email: string };
  itens: ItemPropostaPdf[];
  subtotal: string;
  desconto: string;
  total: string;
  // Orcamento cotado a vista e a prazo: total a prazo (total = a vista).
  totalAprazo?: string;
  condicaoPagamento: string;
  observacoes: string;
  termosCondicoes: string;
};

// Texto fixo em toda PROPOSTA, antes do complemento opcional do consultor
// (proposta.termosCondicoes). Ver conversa sobre deixar a proposta com mais
// "cara" de documento formal sem virar um contrato — este parágrafo cobre
// validade da oferta e a natureza jurídica da assinatura eletrônica.
// Modelo generico de partida, redigido sem acompanhamento juridico —
// precisa de revisao de advogado antes de uso real com clientes (combinado
// explicitamente com o usuario). Documento unico: nao existe mais um
// "Contrato" separado gerado depois da assinatura — essas clausulas ja vao
// no PDF do Pedido, apos os itens, antes do bloco de assinaturas.
const CLAUSULAS_PEDIDO: { titulo: string; texto: (p: PropostaPdf) => string }[] = [
  {
    titulo: "1. Objeto",
    texto: () =>
      "O presente pedido tem por objeto a venda dos produtos e quantidades descritos " +
      `na seção "Itens do pedido" acima, conforme condições comerciais aqui acordadas.`,
  },
  {
    titulo: "2. Preço e forma de pagamento",
    texto: (p) =>
      `O valor total da presente contratação é de ${p.total}, ` +
      (p.condicaoPagamento && p.condicaoPagamento !== "Não informado"
        ? `a ser pago conforme condição de pagamento: ${p.condicaoPagamento}.`
        : "com condição de pagamento a combinar entre as partes."),
  },
  {
    titulo: "3. Entrega e frete",
    texto: (p) =>
      (p.previsaoEntrega
        ? `A entrega dos produtos está prevista para ${p.previsaoEntrega}, `
        : "A data de entrega dos produtos será combinada entre as partes, ") +
      (p.localEntrega && p.localEntrega !== "Não informado"
        ? `no local ${p.localEntrega}, `
        : "em local a combinar, ") +
      (p.frete && p.frete !== "Não informado"
        ? `com a seguinte condição de frete: ${p.frete}. `
        : "com condição de frete a combinar. ") +
      "Qualquer alteração deverá ser formalizada por escrito entre as partes.",
  },
  {
    titulo: "4. Multa por atraso",
    texto: () =>
      "Em caso de atraso na entrega não justificado por caso fortuito, força maior ou " +
      "acordo entre as partes, será aplicada multa de 0,5% (zero vírgula cinco por " +
      "cento) do valor total do pedido por dia de atraso, limitada a 10% (dez por " +
      "cento) do valor total.",
  },
  {
    titulo: "5. Rescisão",
    texto: () =>
      "O presente pedido poderá ser rescindido por qualquer das partes, mediante " +
      "notificação por escrito com antecedência mínima de 15 (quinze) dias, ou " +
      "imediatamente em caso de descumprimento de suas cláusulas pela parte contrária.",
  },
  {
    titulo: "6. Foro",
    texto: () =>
      "Fica eleito o foro da comarca do domicílio da CONTRATADA para dirimir quaisquer " +
      "controvérsias oriundas deste pedido, com renúncia a qualquer outro, por mais " +
      "privilegiado que seja.",
  },
  {
    titulo: "7. Assinatura eletrônica",
    texto: () =>
      "As partes admitem a assinatura eletrônica deste pedido, desde que o processo " +
      "permita comprovar a autoria, a integridade e o aceite do documento.",
  },
];

// Cores da marca (azul #19323b + verde #00DC4D) e tons derivados do azul.
const VERDE_ESCURO = MARCA_AZUL;
const VERDE = MARCA_VERDE;
const PRETO = MARCA_AZUL;
const CINZA_TEXTO = rgb(52 / 255, 82 / 255, 93 / 255); // #34525d
const CINZA_LABEL = rgb(103 / 255, 129 / 255, 138 / 255); // #67818a
const CINZA_FUNDO = rgb(243 / 255, 246 / 255, 247 / 255); // #f3f6f7
const CINZA_BORDA = rgb(221 / 255, 228 / 255, 231 / 255); // #dde4e7
const BRANCO = rgb(1, 1, 1);
const VERDE_PALIDO = rgb(214 / 255, 223 / 255, 226 / 255); // #d6dfe2, texto claro sobre o azul

const LARGURA = 595.28;
const ALTURA = 841.89;
const MARGEM = 40;
const LARGURA_UTIL = LARGURA - MARGEM * 2;
const DIREITA = LARGURA - MARGEM;
const RESERVA_RODAPE = 60;

function sanitizar(texto: string): string {
  return texto
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .normalize("NFC")
    .replace(/[^\x20-\x7E -ÿ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

type Fontes = { regular: PDFFont; bold: PDFFont };

function quebrarLinhas(
  texto: string,
  fonte: PDFFont,
  tamanho: number,
  larguraMax: number
): string[] {
  const palavras = sanitizar(texto).split(" ");
  const linhas: string[] = [];
  let atual = "";
  for (let palavra of palavras) {
    while (fonte.widthOfTextAtSize(palavra, tamanho) > larguraMax) {
      let corte = palavra.length - 1;
      while (
        corte > 1 &&
        fonte.widthOfTextAtSize(palavra.slice(0, corte), tamanho) > larguraMax
      ) {
        corte--;
      }
      if (atual) {
        linhas.push(atual);
        atual = "";
      }
      linhas.push(palavra.slice(0, corte));
      palavra = palavra.slice(corte);
    }
    const proxima = atual ? `${atual} ${palavra}` : palavra;
    if (fonte.widthOfTextAtSize(proxima, tamanho) > larguraMax && atual) {
      linhas.push(atual);
      atual = palavra;
    } else {
      atual = proxima;
    }
  }
  if (atual) linhas.push(atual);
  return linhas.length > 0 ? linhas : [""];
}

function encaixar(
  texto: string,
  fonte: PDFFont,
  tamanho: number,
  larguraMax: number
): string {
  let t = sanitizar(texto);
  if (fonte.widthOfTextAtSize(t, tamanho) <= larguraMax) return t;
  while (t.length > 1 && fonte.widthOfTextAtSize(`${t}...`, tamanho) > larguraMax) {
    t = t.slice(0, -1);
  }
  return `${t}...`;
}

type CoresDocumento = { primaria: RGB; destaque: RGB };

function rgbDeHex(hex: string): RGB {
  const n = parseInt(hex.slice(1), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

// Faixas e títulos na cor da empresa (Configurações). A Rede Agro, ou empresa
// sem cor, fica com o azul + verde do manual; o destaque das demais é a
// própria cor clareada.
function coresDaEmpresa(empresa: DadosEmpresa): CoresDocumento {
  if (!empresa.cor || empresa.id === "empresa_redeagro") return { primaria: VERDE_ESCURO, destaque: VERDE };
  const base = rgbDeHex(empresa.cor);
  const clarear = (c: number) => c + (1 - c) * 0.45;
  return { primaria: base, destaque: rgb(clarear(base.red), clarear(base.green), clarear(base.blue)) };
}

class Documento {
  pagina!: PDFPage;
  y = 0;

  constructor(
    readonly pdf: PDFDocument,
    readonly fontes: Fontes,
    readonly titulo: string,
    readonly cores: CoresDocumento = { primaria: VERDE_ESCURO, destaque: VERDE }
  ) {
    this.novaPagina(true);
  }

  novaPagina(primeira = false) {
    this.pagina = this.pdf.addPage([LARGURA, ALTURA]);
    if (primeira) {
      this.y = ALTURA;
    } else {
      desenharLogo(this.pagina, { x: MARGEM, yTopo: ALTURA - 32, altura: 12 });
      this.textoDireita(this.titulo, DIREITA, ALTURA - 42, {
        tamanho: 9,
        cor: CINZA_LABEL,
      });
      this.linha(MARGEM, ALTURA - 50, DIREITA, ALTURA - 50);
      this.y = ALTURA - 68;
    }
  }

  garantir(altura: number) {
    if (this.y - altura < RESERVA_RODAPE) this.novaPagina();
  }

  texto(
    texto: string,
    x: number,
    y: number,
    opcoes: { fonte?: PDFFont; tamanho?: number; cor?: RGB } = {}
  ) {
    this.pagina.drawText(sanitizar(texto), {
      x,
      y,
      font: opcoes.fonte ?? this.fontes.regular,
      size: opcoes.tamanho ?? 10,
      color: opcoes.cor ?? CINZA_TEXTO,
    });
  }

  textoDireita(
    texto: string,
    xDireita: number,
    y: number,
    opcoes: { fonte?: PDFFont; tamanho?: number; cor?: RGB } = {}
  ) {
    const fonte = opcoes.fonte ?? this.fontes.regular;
    const tamanho = opcoes.tamanho ?? 10;
    const largura = fonte.widthOfTextAtSize(sanitizar(texto), tamanho);
    this.texto(texto, xDireita - largura, y, opcoes);
  }

  retangulo(x: number, y: number, largura: number, altura: number, cor: RGB) {
    this.pagina.drawRectangle({ x, y, width: largura, height: altura, color: cor });
  }

  linha(x1: number, y1: number, x2: number, y2: number, cor = CINZA_BORDA, espessura = 0.7) {
    this.pagina.drawLine({
      start: { x: x1, y: y1 },
      end: { x: x2, y: y2 },
      color: cor,
      thickness: espessura,
    });
  }

  secao(titulo: string) {
    this.garantir(40);
    this.retangulo(MARGEM, this.y - 1, 3.5, 11, this.cores.destaque);
    this.texto(titulo.toUpperCase(), MARGEM + 10, this.y, {
      fonte: this.fontes.bold,
      tamanho: 10.5,
      cor: this.cores.primaria,
    });
    const larguraTitulo = this.fontes.bold.widthOfTextAtSize(
      sanitizar(titulo.toUpperCase()),
      10.5
    );
    this.linha(MARGEM + 18 + larguraTitulo, this.y + 3.5, DIREITA, this.y + 3.5);
    this.y -= 20;
  }

  grade(pares: { label: string; valor: string }[], colunas = 2) {
    const larguraColuna = LARGURA_UTIL / colunas;
    for (let i = 0; i < pares.length; i += colunas) {
      const linhaPares = pares.slice(i, i + colunas);
      const linhasValor = linhaPares.map((par) =>
        quebrarLinhas(par.valor || "-", this.fontes.bold, 9.5, larguraColuna - 16)
      );
      const alturaLinha =
        12 + Math.max(...linhasValor.map((l) => l.length)) * 12 + 7;
      this.garantir(alturaLinha);
      linhaPares.forEach((par, j) => {
        const x = MARGEM + j * larguraColuna;
        this.texto(par.label.toUpperCase(), x, this.y, {
          tamanho: 7,
          cor: CINZA_LABEL,
          fonte: this.fontes.bold,
        });
        linhasValor[j].forEach((linha, k) => {
          this.texto(linha, x, this.y - 12 - k * 12, {
            tamanho: 9.5,
            cor: PRETO,
            fonte: this.fontes.bold,
          });
        });
      });
      this.y -= alturaLinha;
    }
  }
}

type Coluna = {
  chave: "fornecedor" | "produto" | "cultura" | "volume" | "valorUnitario" | "desconto" | "total";
  titulo: string;
  largura: number;
  direita?: boolean;
};

const COLUNAS_COM_CULTURA: Coluna[] = [
  { chave: "fornecedor", titulo: "Fornecedor", largura: 90 },
  { chave: "produto", titulo: "Produto", largura: 145 },
  { chave: "cultura", titulo: "Cultura", largura: 70 },
  { chave: "volume", titulo: "Volume", largura: 60, direita: true },
  { chave: "valorUnitario", titulo: "Valor unit.", largura: 75, direita: true },
  { chave: "desconto", titulo: "Desc.", largura: 45, direita: true },
  { chave: "total", titulo: "Total", largura: 75, direita: true },
];

function colunasDosItens(itens: ItemPropostaPdf[]): Coluna[] {
  const temCultura = itens.some((item) => item.cultura.trim());
  const temDesconto = itens.some((item) => item.desconto?.trim());

  // Sem nenhuma cultura/desconto preenchido, a coluna some por completo e o
  // espaço volta para Produto. Assim o PDF não exibe um campo não definido.
  let sobra = 0;
  const colunas = COLUNAS_COM_CULTURA.filter((coluna) => {
    if (coluna.chave === "cultura" && !temCultura) {
      sobra += coluna.largura;
      return false;
    }
    if (coluna.chave === "desconto" && !temDesconto) {
      sobra += coluna.largura;
      return false;
    }
    return true;
  });
  return colunas.map((coluna) =>
    coluna.chave === "produto" ? { ...coluna, largura: coluna.largura + sobra } : coluna
  );
}

function desenharCabecalhoTabela(doc: Documento, colunas: Coluna[]) {
  doc.garantir(50);
  doc.retangulo(MARGEM, doc.y - 20, LARGURA_UTIL, 20, doc.cores.primaria);
  let x = MARGEM;
  for (const coluna of colunas) {
    const opcoes = { fonte: doc.fontes.bold, tamanho: 8, cor: BRANCO };
    if (coluna.direita) {
      doc.textoDireita(coluna.titulo.toUpperCase(), x + coluna.largura - 7, doc.y - 13.5, opcoes);
    } else {
      doc.texto(coluna.titulo.toUpperCase(), x + 7, doc.y - 13.5, opcoes);
    }
    x += coluna.largura;
  }
  doc.y -= 20;
}

function desenharTabela(doc: Documento, itens: ItemPropostaPdf[]) {
  const colunas = colunasDosItens(itens);
  desenharCabecalhoTabela(doc, colunas);
  itens.forEach((item, indice) => {
    const valoresPorColuna: Record<Coluna["chave"], string> = {
      fornecedor: item.fornecedor,
      produto: item.produto,
      cultura: item.cultura,
      volume: item.unidade ? `${item.volume} ${item.unidade}` : item.volume,
      valorUnitario: item.valorUnitario,
      desconto: item.desconto ?? "",
      total: item.total,
    };
    const valores = colunas.map((coluna) => valoresPorColuna[coluna.chave]);
    const celulas = valores.map((valor, i) =>
      quebrarLinhas(valor, doc.fontes.regular, 9, colunas[i].largura - 14)
    );

    // Ingrediente ativo/embalagem viram um subtitulo compacto so na celula
    // do produto; recomendacao vira uma observacao na largura toda da linha.
    // So entram se informados — sem isso o PDF ficaria com "Não informado"
    // poluindo cada item.
    const indiceProduto = colunas.findIndex((coluna) => coluna.chave === "produto");
    const larguraProduto = colunas[indiceProduto].largura - 14;
    const subtitulo = [item.ingredienteAtivo, item.embalagem].filter(Boolean).join(" · ");
    const linhasSubtitulo = subtitulo
      ? quebrarLinhas(subtitulo, doc.fontes.regular, 7.5, larguraProduto)
      : [];
    const linhasObservacao = item.recomendacao
      ? quebrarLinhas(`Recomendação: ${item.recomendacao}`, doc.fontes.regular, 7.5, LARGURA_UTIL - 14)
      : [];

    const linhasPrincipais = Math.max(...celulas.map((c) => c.length));
    const alturaPrincipal = linhasPrincipais * 11 + 9;
    const alturaSubtitulo = linhasSubtitulo.length * 9;
    const alturaObservacao = linhasObservacao.length * 9 + (linhasObservacao.length ? 4 : 0);
    const alturaLinha = alturaPrincipal + alturaSubtitulo + alturaObservacao;

    if (doc.y - alturaLinha < RESERVA_RODAPE) {
      doc.novaPagina();
      desenharCabecalhoTabela(doc, colunas);
    }
    if (indice % 2 === 1) {
      doc.retangulo(MARGEM, doc.y - alturaLinha, LARGURA_UTIL, alturaLinha, CINZA_FUNDO);
    }
    let x = MARGEM;
    celulas.forEach((linhasCelula, i) => {
      const coluna = colunas[i];
      linhasCelula.forEach((linha, k) => {
        const yLinha = doc.y - 13 - k * 11;
        if (coluna.direita) {
          doc.textoDireita(linha, x + coluna.largura - 7, yLinha, { tamanho: 9 });
        } else {
          doc.texto(linha, x + 7, yLinha, { tamanho: 9 });
        }
      });
      x += coluna.largura;
    });
    if (linhasSubtitulo.length > 0) {
      const xProduto =
        MARGEM + colunas.slice(0, indiceProduto).reduce((soma, coluna) => soma + coluna.largura, 0);
      const yBase = doc.y - alturaPrincipal - 7;
      linhasSubtitulo.forEach((linha, k) => {
        doc.texto(linha, xProduto + 7, yBase - k * 9, { tamanho: 7.5, cor: CINZA_LABEL });
      });
    }
    if (linhasObservacao.length > 0) {
      const yBase = doc.y - alturaPrincipal - alturaSubtitulo - 7;
      linhasObservacao.forEach((linha, k) => {
        doc.texto(linha, MARGEM + 7, yBase - k * 9, { tamanho: 7.5, cor: CINZA_LABEL });
      });
    }
    doc.y -= alturaLinha;
    doc.linha(MARGEM, doc.y, DIREITA, doc.y);
  });
}

function desenharTotais(doc: Documento, proposta: PropostaPdf) {
  const larguraCaixa = 230;
  const x0 = DIREITA - larguraCaixa;
  doc.garantir(90);
  doc.y -= 12;

  const linhaTotal = (label: string, valor: string) => {
    doc.texto(label, x0 + 10, doc.y, { tamanho: 9.5, cor: CINZA_LABEL });
    doc.textoDireita(valor, DIREITA - 10, doc.y, {
      tamanho: 9.5,
      cor: PRETO,
      fonte: doc.fontes.bold,
    });
    doc.y -= 17;
  };

  linhaTotal("Subtotal", proposta.subtotal);
  linhaTotal("Desconto", proposta.desconto);

  doc.retangulo(x0, doc.y - 20, larguraCaixa, 27, doc.cores.primaria);
  doc.texto("TOTAL", x0 + 10, doc.y - 11, {
    fonte: doc.fontes.bold,
    tamanho: 10,
    cor: doc.cores.destaque,
  });
  doc.textoDireita(proposta.total, DIREITA - 10, doc.y - 12, {
    fonte: doc.fontes.bold,
    tamanho: 13,
    cor: BRANCO,
  });
  doc.y -= 38;
}

function desenharCabecalho(doc: Documento, proposta: PropostaPdf) {
  const alturaFaixa = 92;
  doc.retangulo(0, ALTURA - alturaFaixa, LARGURA, alturaFaixa, doc.cores.primaria);
  doc.retangulo(0, ALTURA - alturaFaixa - 4, LARGURA, 4, doc.cores.destaque);

  desenharLogo(doc.pagina, { x: MARGEM, yTopo: ALTURA - 26, altura: 24, fundo: "escuro" });
  doc.texto(proposta.tipo === "PEDIDO" ? "Orçamento" : "Pedido comercial", MARGEM, ALTURA - 68, {
    tamanho: 10,
    cor: VERDE_PALIDO,
  });

  doc.textoDireita(proposta.numero, DIREITA, ALTURA - 48, {
    fonte: doc.fontes.bold,
    tamanho: 19,
    cor: BRANCO,
  });
  doc.textoDireita(`Emitida em ${proposta.data}`, DIREITA, ALTURA - 68, {
    tamanho: 9,
    cor: VERDE_PALIDO,
  });

  const topoBarra = ALTURA - alturaFaixa - 4;
  const alturaBarra = 40;
  doc.retangulo(0, topoBarra - alturaBarra, LARGURA, alturaBarra, CINZA_FUNDO);
  doc.linha(0, topoBarra - alturaBarra, LARGURA, topoBarra - alturaBarra);

  const celulas = [
    { label: "Status", valor: proposta.status },
    { label: "Safra", valor: proposta.safra },
    // Pedido (PROPOSTA) nao tem validade — so o orcamento.
    ...(proposta.tipo === "PROPOSTA"
      ? []
      : [{ label: "Validade", valor: proposta.validade || "Não informada" }]),
    { label: "Previsão de entrega", valor: proposta.previsaoEntrega || "Não informada" },
  ];
  const larguraCelula = LARGURA_UTIL / celulas.length;
  celulas.forEach((celula, i) => {
    const x = MARGEM + i * larguraCelula;
    doc.texto(celula.label.toUpperCase(), x, topoBarra - 15, {
      tamanho: 7,
      cor: CINZA_LABEL,
      fonte: doc.fontes.bold,
    });
    doc.texto(
      encaixar(celula.valor, doc.fontes.bold, 9.5, larguraCelula - 12),
      x,
      topoBarra - 29,
      { tamanho: 9.5, cor: PRETO, fonte: doc.fontes.bold }
    );
  });

  doc.y = topoBarra - alturaBarra - 26;
}

function clausula(doc: Documento, titulo: string, texto: string) {
  doc.garantir(28);
  doc.texto(titulo, MARGEM, doc.y, { fonte: doc.fontes.bold, tamanho: 9, cor: PRETO });
  doc.y -= 13;
  const linhas = quebrarLinhas(texto, doc.fontes.regular, 8.5, LARGURA_UTIL);
  for (const linha of linhas) {
    doc.garantir(12);
    doc.texto(linha, MARGEM, doc.y, { tamanho: 8.5, cor: CINZA_TEXTO });
    doc.y -= 12;
  }
  doc.y -= 6;
}

function desenharClausulas(doc: Documento, proposta: PropostaPdf) {
  doc.novaPagina();
  doc.secao("Cláusulas");
  for (const { titulo, texto } of CLAUSULAS_PEDIDO) {
    clausula(doc, titulo, texto(proposta));
  }
  if (proposta.termosCondicoes?.trim()) {
    clausula(doc, "8. Condições adicionais", proposta.termosCondicoes.trim());
  }
}

function desenharAssinaturas(doc: Documento, proposta: PropostaPdf, empresa: DadosEmpresa) {
  doc.garantir(96);
  doc.y -= 14;
  doc.texto(
    "Documento preparado para assinatura eletrônica; a plataforma registrará as evidências do aceite.",
    MARGEM,
    doc.y,
    { tamanho: 7.5, cor: CINZA_LABEL, fonte: doc.fontes.bold }
  );
  doc.y -= 24;

  const larguraLinha = 210;
  const blocos = [
    { x: MARGEM, nome: proposta.consultor.nome, papel: `Consultor - ${empresa.nomeFantasia}` },
    { x: DIREITA - larguraLinha, nome: proposta.cliente.nome, papel: "Cliente" },
  ];
  for (const bloco of blocos) {
    doc.linha(bloco.x, doc.y, bloco.x + larguraLinha, doc.y, CINZA_LABEL, 0.8);
    const centro = bloco.x + larguraLinha / 2;
    const larguraNome = doc.fontes.bold.widthOfTextAtSize(sanitizar(bloco.nome), 9);
    doc.texto(bloco.nome, centro - larguraNome / 2, doc.y - 13, {
      fonte: doc.fontes.bold,
      tamanho: 9,
      cor: PRETO,
    });
    const larguraPapel = doc.fontes.regular.widthOfTextAtSize(sanitizar(bloco.papel), 7.5);
    doc.texto(bloco.papel, centro - larguraPapel / 2, doc.y - 24, {
      tamanho: 7.5,
      cor: CINZA_LABEL,
    });
  }
  doc.y -= 40;
}

function desenharRodapes(doc: Documento, proposta: PropostaPdf) {
  const paginas = doc.pdf.getPages();
  paginas.forEach((pagina, indice) => {
    pagina.drawLine({
      start: { x: MARGEM, y: 42 },
      end: { x: DIREITA, y: 42 },
      color: CINZA_BORDA,
      thickness: 0.7,
    });
    pagina.drawText(
      sanitizar(`Documento gerado pelo sistema Cardo AI em ${proposta.data}.`),
      { x: MARGEM, y: 31, font: doc.fontes.regular, size: 7.5, color: CINZA_LABEL }
    );
    const textoPagina = `Página ${indice + 1} de ${paginas.length}`;
    const largura = doc.fontes.regular.widthOfTextAtSize(sanitizar(textoPagina), 7.5);
    pagina.drawText(sanitizar(textoPagina), {
      x: DIREITA - largura,
      y: 31,
      font: doc.fontes.regular,
      size: 7.5,
      color: CINZA_LABEL,
    });
  });
}

export async function gerarPdfProposta(proposta: PropostaPdf): Promise<Uint8Array> {
  const ehPedido = proposta.tipo === "PEDIDO";
  const pdf = await PDFDocument.create();
  await prepararMarcaPdf(pdf);
  const empresa = await dadosEmpresaAtual();
  pdf.setTitle(`${ehPedido ? "Orçamento" : "Pedido comercial"} ${proposta.numero} - ${empresa.nomeFantasia}`);
  pdf.setAuthor(empresa.nomeFantasia);

  const fontes: Fontes = await embutirFontesMarca(pdf);
  const doc = new Documento(pdf, fontes, `${ehPedido ? "Orçamento" : "Pedido"} ${proposta.numero}`, coresDaEmpresa(empresa));

  desenharCabecalho(doc, proposta);

  doc.secao("Vendedora");
  doc.grade([
    { label: "Razão social", valor: empresa.razaoSocial },
    { label: "CNPJ", valor: empresa.cnpj },
  ]);
  doc.grade([
    {
      label: "Endereço",
      valor: `${empresa.endereco} - ${empresa.cidadeUfCep}`,
    },
  ], 1);
  doc.y -= 8;

  doc.secao("Cliente");
  doc.grade([
    { label: "Nome", valor: proposta.cliente.nome },
    { label: "Razão social", valor: proposta.cliente.razaoSocial },
    { label: "CPF/CNPJ", valor: proposta.cliente.documento },
    { label: "Inscrição estadual", valor: proposta.cliente.inscricaoEstadual },
    { label: "Endereço", valor: proposta.cliente.endereco },
    { label: "Cidade/UF/CEP", valor: proposta.cliente.cidadeUfCep },
    { label: "Telefone", valor: proposta.cliente.telefone },
    { label: "E-mail", valor: proposta.cliente.email },
  ]);
  doc.y -= 8;

  doc.secao("Consultor responsável");
  doc.grade([
    { label: "Nome", valor: proposta.consultor.nome },
    { label: "E-mail", valor: proposta.consultor.email },
  ]);
  doc.y -= 8;

  doc.secao(ehPedido ? "Itens do orçamento" : "Itens do pedido");
  desenharTabela(doc, proposta.itens);
  desenharTotais(doc, proposta);

  doc.secao("Condições comerciais");
  doc.grade([
    { label: "Condição de pagamento", valor: proposta.condicaoPagamento },
    { label: "Frete", valor: proposta.frete },
  ]);
  doc.grade([{ label: "Local de entrega", valor: proposta.localEntrega }], 1);
  doc.grade([{ label: "Observações", valor: proposta.observacoes }], 1);

  if (!ehPedido) {
    desenharClausulas(doc, proposta);
    desenharAssinaturas(doc, proposta, empresa);
  }

  desenharRodapes(doc, proposta);

  return pdf.save();
}

// ─── Relatório Gerencial ──────────────────────────────────────────────────

export type RelatorioGerencialPdf = {
  // PNG do resumo do dashboard (tema claro), capturado na tela; entra logo após a capa.
  imagemDashboard?: Uint8Array;
  dataGeracao: string;
  safra: string;
  escopo: string;
  meta: string;
  metaValor: number;
  pctMeta: string;
  pctMetaValor: number;
  totalPipeline: string;
  totalPipelineValor: number;
  faturado: string;
  faturadoValor: number;
  emAndamento: string;
  emAndamentoValor: number;
  clientesAtivos: string;
  fornecedoresAtivos: string;
  mediaPorCliente: string;
  ticketMedio: string;
  qtdVendas: string;
  porStatus: {
    status: string;
    label: string;
    total: string;
    totalValor: number;
    qtd: string;
    pct: string;
    pctValor: number;
  }[];
  porCultura: {
    cultura: string;
    total: string;
    totalValor: number;
    pct: string;
    pctValor: number;
  }[];
  evolucao: { mes: string; total: string; totalValor: number }[];
  ranking: {
    consultor: string;
    total: string;
    totalValor: number;
    faturado: string;
    faturadoValor: number;
    pct: string;
  }[];
  temMeta: boolean;
  temRanking: boolean;
};

function cabecalhoTabelaR(doc: Documento, cols: { t: string; w: number; dir?: boolean }[]) {
  doc.garantir(26);
  doc.retangulo(MARGEM, doc.y - 20, LARGURA_UTIL, 20, doc.cores.primaria);
  let x = MARGEM;
  for (const c of cols) {
    const op = { fonte: doc.fontes.bold, tamanho: 8, cor: BRANCO };
    if (c.dir) doc.textoDireita(c.t.toUpperCase(), x + c.w - 8, doc.y - 13.5, op);
    else doc.texto(c.t.toUpperCase(), x + 8, doc.y - 13.5, op);
    x += c.w;
  }
  doc.y -= 20;
}

function tabelaR(
  doc: Documento,
  cols: { t: string; w: number; dir?: boolean }[],
  linhas: string[][]
) {
  cabecalhoTabelaR(doc, cols);
  for (let i = 0; i < linhas.length; i++) {
    const H = 18;
    if (doc.y - H < RESERVA_RODAPE) {
      doc.novaPagina();
      cabecalhoTabelaR(doc, cols);
    }
    if (i % 2 === 1) doc.retangulo(MARGEM, doc.y - H, LARGURA_UTIL, H, CINZA_FUNDO);
    let x = MARGEM;
    for (let j = 0; j < cols.length; j++) {
      const v = encaixar(linhas[i][j] ?? "", doc.fontes.regular, 9, cols[j].w - 16);
      if (cols[j].dir) doc.textoDireita(v, x + cols[j].w - 8, doc.y - 12, { tamanho: 9 });
      else doc.texto(v, x + 8, doc.y - 12, { tamanho: 9 });
      x += cols[j].w;
    }
    doc.y -= H;
    doc.linha(MARGEM, doc.y, DIREITA, doc.y);
  }
  doc.y -= 10;
}

function kpiBoxes(
  doc: Documento,
  items: { label: string; valor: string; detalhe?: string }[]
) {
  const cols = 3;
  const gap = 8;
  const bW = (LARGURA_UTIL - gap * (cols - 1)) / cols;
  const bH = 56;

  for (let i = 0; i < items.length; i += cols) {
    doc.garantir(bH + 8);
    items.slice(i, i + cols).forEach((it, j) => {
      const x = MARGEM + j * (bW + gap);
      const y = doc.y - bH;
      doc.pagina.drawRectangle({
        x, y, width: bW, height: bH,
        color: CINZA_FUNDO,
        borderColor: CINZA_BORDA,
        borderWidth: 0.7,
      });
      doc.texto(it.label.toUpperCase(), x + 10, y + bH - 15, {
        tamanho: 7, cor: CINZA_LABEL, fonte: doc.fontes.bold,
      });
      doc.texto(
        encaixar(it.valor, doc.fontes.bold, 13, bW - 20),
        x + 10, y + bH - 33,
        { tamanho: 13, cor: PRETO, fonte: doc.fontes.bold }
      );
      if (it.detalhe) {
        doc.texto(it.detalhe, x + 10, y + 10, { tamanho: 7.5, cor: CINZA_LABEL });
      }
    });
    doc.y -= bH + 8;
  }
}

function desenharCabecalhoRelatorio(
  doc: Documento,
  opts: { titulo: string; dataGeracao: string }
) {
  const alturaFaixa = 72;
  doc.retangulo(0, ALTURA - alturaFaixa, LARGURA, alturaFaixa, doc.cores.primaria);
  doc.retangulo(0, ALTURA - alturaFaixa - 4, LARGURA, 4, doc.cores.destaque);

  desenharLogo(doc.pagina, { x: MARGEM, yTopo: ALTURA - 20, altura: 20, fundo: "escuro" });
  doc.texto(opts.titulo, MARGEM, ALTURA - 57, { tamanho: 9, cor: VERDE_PALIDO });

  doc.textoDireita(opts.titulo, DIREITA, ALTURA - 38, {
    fonte: doc.fontes.bold, tamanho: 14, cor: BRANCO,
  });
  doc.textoDireita(`Gerado em ${opts.dataGeracao}`, DIREITA, ALTURA - 57, {
    tamanho: 8.5, cor: VERDE_PALIDO,
  });

  doc.y = ALTURA - alturaFaixa - 4 - 22;
}

const AZUL_GRAFICO = rgb(59 / 255, 130 / 255, 246 / 255);
const AMARELO_GRAFICO = rgb(240 / 255, 180 / 255, 0);
const VERDE_GRAFICO = rgb(126 / 255, 226 / 255, 166 / 255);
const CIANO_GRAFICO = rgb(34 / 255, 211 / 255, 238 / 255);
const LARANJA_GRAFICO = rgb(249 / 255, 115 / 255, 22 / 255);
const VERMELHO_GRAFICO = rgb(242 / 255, 72 / 255, 78 / 255);
const CINZA_GRAFICO = rgb(148 / 255, 163 / 255, 184 / 255);

const CORES_STATUS: Record<string, RGB> = {
  PROSPECCAO: AMARELO_GRAFICO,
  NEGOCIACAO: AZUL_GRAFICO,
  FECHADO: CIANO_GRAFICO,
  EM_CARTEIRA: VERDE_GRAFICO,
  FATURADO: VERDE,
  CANCELADO: VERMELHO_GRAFICO,
};

function pctGerencial(valor: number): string {
  return `${(valor * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}

function faixaContextoGerencial(doc: Documento, rel: RelatorioGerencialPdf) {
  const h = 30;
  doc.retangulo(MARGEM, doc.y - h, LARGURA_UTIL, h, CINZA_FUNDO);
  doc.texto("SAFRA", MARGEM + 10, doc.y - 11, {
    tamanho: 6.5,
    cor: CINZA_LABEL,
    fonte: doc.fontes.bold,
  });
  doc.texto(rel.safra, MARGEM + 10, doc.y - 23, {
    tamanho: 9,
    cor: PRETO,
    fonte: doc.fontes.bold,
  });
  doc.texto("ESCOPO", MARGEM + 180, doc.y - 11, {
    tamanho: 6.5,
    cor: CINZA_LABEL,
    fonte: doc.fontes.bold,
  });
  doc.texto(rel.escopo, MARGEM + 180, doc.y - 23, {
    tamanho: 9,
    cor: PRETO,
    fonte: doc.fontes.bold,
  });
  doc.textoDireita(`Atualizado em ${rel.dataGeracao}`, DIREITA - 10, doc.y - 20, {
    tamanho: 7.5,
    cor: CINZA_LABEL,
  });
  doc.y -= h + 12;
}

function secaoGerencial(doc: Documento, titulo: string, espaco = 10) {
  doc.garantir(40 + espaco);
  doc.y -= espaco;
  doc.secao(titulo);
}

function cartoesMeta(doc: Documento, rel: RelatorioGerencialPdf) {
  const gap = 10;
  const largura = (LARGURA_UTIL - gap) / 2;
  const altura = 68;
  const cobertura = rel.metaValor > 0 ? rel.totalPipelineValor / rel.metaValor : 0;
  const cartoes = [
    {
      titulo: "Realização da meta",
      valor: rel.pctMeta,
      detalhe: `${rel.faturado} faturados de ${rel.meta}`,
      pct: rel.pctMetaValor,
      cor: VERDE,
    },
    {
      titulo: "Cobertura da meta pelo pipeline",
      valor: pctGerencial(cobertura),
      detalhe: `${rel.totalPipeline} em pipeline para ${rel.meta}`,
      pct: cobertura,
      cor: AZUL_GRAFICO,
    },
  ];

  cartoes.forEach((cartao, i) => {
    const x = MARGEM + i * (largura + gap);
    const y = doc.y - altura;
    doc.pagina.drawRectangle({
      x,
      y,
      width: largura,
      height: altura,
      color: CINZA_FUNDO,
      borderColor: CINZA_BORDA,
      borderWidth: 0.7,
    });
    doc.texto(cartao.titulo.toUpperCase(), x + 10, y + altura - 15, {
      tamanho: 7,
      cor: CINZA_LABEL,
      fonte: doc.fontes.bold,
    });
    doc.texto(cartao.valor, x + 10, y + altura - 34, {
      tamanho: 14,
      cor: PRETO,
      fonte: doc.fontes.bold,
    });
    doc.texto(encaixar(cartao.detalhe, doc.fontes.regular, 7.5, largura - 20), x + 10, y + 10, {
      tamanho: 7.5,
      cor: CINZA_LABEL,
    });
    const barraX = x + 92;
    const barraY = y + altura - 31;
    const barraW = largura - 104;
    doc.retangulo(barraX, barraY, barraW, 6, CINZA_BORDA);
    doc.retangulo(barraX, barraY, barraW * Math.min(1, Math.max(0, cartao.pct)), 6, cartao.cor);
  });
  doc.y -= altura + 10;
}

function leiturasExecutivas(rel: RelatorioGerencialPdf): string[] {
  const maiorStatus = [...rel.porStatus].sort((a, b) => b.totalValor - a.totalValor)[0];
  const maiorCultura = rel.porCultura[0];
  const cobertura = rel.metaValor > 0 ? rel.totalPipelineValor / rel.metaValor : 0;
  const leituras: string[] = [];

  if (rel.temMeta) {
    leituras.push(
      `O pipeline cobre ${pctGerencial(cobertura)} da meta da safra; o faturamento realizado representa ${rel.pctMeta}.`
    );
  }
  if (maiorStatus) {
    leituras.push(
      `${maiorStatus.label} concentra ${maiorStatus.pct} do pipeline (${maiorStatus.total}, ${maiorStatus.qtd} lançamentos).`
    );
  }
  if (maiorCultura) {
    leituras.push(
      `${maiorCultura.cultura} é a principal cultura, com ${maiorCultura.pct} do valor total (${maiorCultura.total}).`
    );
  }
  if (rel.faturadoValor === 0) {
    leituras.push("Não há faturamento registrado; revisar datas de fechamento e avanço das oportunidades maduras.");
  }
  return leituras.slice(0, 5);
}

function desenharLeituras(doc: Documento, leituras: string[]) {
  if (leituras.length === 0) return;
  for (let i = 0; i < leituras.length; i++) {
    const linhas = quebrarLinhas(leituras[i], doc.fontes.regular, 8.5, LARGURA_UTIL - 38);
    const h = Math.max(30, 16 + linhas.length * 10);
    doc.garantir(h + 5);
    const y = doc.y - h;
    doc.pagina.drawRectangle({
      x: MARGEM,
      y,
      width: LARGURA_UTIL,
      height: h,
      color: i % 2 === 0 ? CINZA_FUNDO : BRANCO,
      borderColor: CINZA_BORDA,
      borderWidth: 0.5,
    });
    doc.retangulo(MARGEM, y, 4, h, i === leituras.length - 1 ? AMARELO_GRAFICO : VERDE);
    doc.texto(String(i + 1).padStart(2, "0"), MARGEM + 12, y + h - 19, {
      tamanho: 8,
      cor: CINZA_LABEL,
      fonte: doc.fontes.bold,
    });
    linhas.forEach((linha, indice) => {
      doc.texto(linha, MARGEM + 34, y + h - 16 - indice * 10, { tamanho: 8.5, cor: CINZA_TEXTO });
    });
    doc.y -= h + 5;
  }
}

type ItemGraficoGerencial = {
  label: string;
  valor: number;
  valorTexto: string;
  detalhe?: string;
  cor?: RGB;
};

function graficoBarrasGerencial(
  doc: Documento,
  itens: ItemGraficoGerencial[],
  opcoes: { escalaMax?: number; limite?: number } = {}
) {
  const exibidos = itens.slice(0, opcoes.limite ?? itens.length);
  if (exibidos.length === 0) {
    doc.texto("Sem dados disponíveis para este recorte.", MARGEM, doc.y - 6, {
      tamanho: 9,
      cor: CINZA_LABEL,
    });
    doc.y -= 28;
    return;
  }

  const alturaLinha = 31;
  const altura = exibidos.length * alturaLinha + 8;
  doc.garantir(altura);
  const labelW = 135;
  const barraX = MARGEM + labelW;
  const barraW = 220;
  const maximo = opcoes.escalaMax ?? Math.max(...exibidos.map((item) => item.valor), 1);

  exibidos.forEach((item, indice) => {
    const topo = doc.y - indice * alturaLinha;
    doc.texto(encaixar(item.label, doc.fontes.bold, 8.5, labelW - 10), MARGEM, topo - 10, {
      tamanho: 8.5,
      cor: PRETO,
      fonte: doc.fontes.bold,
    });
    doc.retangulo(barraX, topo - 16, barraW, 8, CINZA_FUNDO);
    doc.retangulo(
      barraX,
      topo - 16,
      barraW * Math.min(1, Math.max(0, item.valor / Math.max(maximo, 1))),
      8,
      item.cor ?? AZUL_GRAFICO
    );
    doc.textoDireita(item.valorTexto, DIREITA, topo - 10, {
      tamanho: 8.5,
      cor: PRETO,
      fonte: doc.fontes.bold,
    });
    if (item.detalhe) {
      doc.textoDireita(item.detalhe, DIREITA, topo - 23, { tamanho: 7, cor: CINZA_LABEL });
    }
  });
  doc.y -= altura;
}

function barraComposicaoStatus(doc: Documento, rel: RelatorioGerencialPdf) {
  if (rel.totalPipelineValor <= 0 || rel.porStatus.length === 0) return;
  const y = doc.y - 15;
  let x = MARGEM;
  for (const item of rel.porStatus) {
    const largura = LARGURA_UTIL * item.pctValor;
    if (largura > 0) doc.retangulo(x, y, largura, 12, CORES_STATUS[item.status] ?? CINZA_GRAFICO);
    x += largura;
  }
  doc.y -= 28;

  const larguraLegenda = LARGURA_UTIL / 3;
  rel.porStatus.forEach((item, indice) => {
    const coluna = indice % 3;
    const linha = Math.floor(indice / 3);
    const lx = MARGEM + coluna * larguraLegenda;
    const ly = doc.y - linha * 15;
    doc.retangulo(lx, ly - 2, 7, 7, CORES_STATUS[item.status] ?? CINZA_GRAFICO);
    doc.texto(`${item.label}: ${item.pct}`, lx + 11, ly - 1, { tamanho: 7.5, cor: CINZA_TEXTO });
  });
  doc.y -= Math.ceil(rel.porStatus.length / 3) * 15 + 8;
}

export async function gerarPdfRelatorioGerencial(
  rel: RelatorioGerencialPdf
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  await prepararMarcaPdf(pdf);
  const empresa = await dadosEmpresaAtual();
  pdf.setTitle(`Relatório Gerencial - ${empresa.nomeFantasia}`);
  pdf.setAuthor(empresa.nomeFantasia);

  const fontes: Fontes = await embutirFontesMarca(pdf);
  const doc = new Documento(pdf, fontes, "Relatório Gerencial", coresDaEmpresa(empresa));
  desenharCabecalhoRelatorio(doc, { titulo: "Relatório Gerencial", dataGeracao: rel.dataGeracao });
  faixaContextoGerencial(doc, rel);

  // Resumo do dashboard (imagem da tela) ou, sem ele, os KPIs em texto
  if (rel.imagemDashboard) {
    const imagem = await pdf.embedPng(rel.imagemDashboard);
    const largura = LARGURA_UTIL;
    const altura = (imagem.height / imagem.width) * largura;
    doc.garantir(altura + 10);
    doc.pagina.drawImage(imagem, { x: MARGEM, y: doc.y - altura, width: largura, height: altura });
    doc.y -= altura + 10;
  } else {
    secaoGerencial(doc, "Visão executiva");
    kpiBoxes(doc, [
      { label: "Pipeline total", valor: rel.totalPipeline, detalhe: `${rel.qtdVendas} lançamentos` },
      { label: "Faturado", valor: rel.faturado, detalhe: rel.temMeta ? `${rel.pctMeta} da meta` : undefined },
      { label: "Em andamento", valor: rel.emAndamento },
      { label: "Clientes ativos", valor: rel.clientesAtivos, detalhe: `${rel.fornecedoresAtivos} fornecedores` },
      { label: "Média por cliente", valor: rel.mediaPorCliente },
      { label: "Ticket médio", valor: rel.ticketMedio },
    ]);
  }

  if (rel.temMeta) {
    secaoGerencial(doc, "Meta e cobertura");
    cartoesMeta(doc, rel);
  }

  secaoGerencial(doc, "Leituras executivas");
  desenharLeituras(doc, leiturasExecutivas(rel));

  if (rel.porStatus.length > 0) {
    secaoGerencial(doc, "Composição resumida do pipeline");
    barraComposicaoStatus(doc, rel);
  }

  // Página 2 — composição e tendência
  doc.novaPagina();
  secaoGerencial(doc, "Pipeline por estágio");
  graficoBarrasGerencial(
    doc,
    rel.porStatus.map((item) => ({
      label: item.label,
      valor: item.totalValor,
      valorTexto: item.total,
      detalhe: `${item.qtd} lançamentos · ${item.pct}`,
      cor: CORES_STATUS[item.status] ?? CINZA_GRAFICO,
    })),
    { escalaMax: rel.totalPipelineValor }
  );

  secaoGerencial(doc, "Composição por cultura");
  graficoBarrasGerencial(
    doc,
    rel.porCultura.map((item, indice) => ({
      label: item.cultura,
      valor: item.totalValor,
      valorTexto: item.total,
      detalhe: item.pct,
      cor: [VERDE, AZUL_GRAFICO, AMARELO_GRAFICO, LARANJA_GRAFICO, CINZA_GRAFICO][indice % 5],
    })),
    { escalaMax: rel.totalPipelineValor, limite: 8 }
  );

  secaoGerencial(doc, "Evolução do faturamento");
  if (rel.evolucao.length > 0) {
    graficoBarrasGerencial(
      doc,
      rel.evolucao.map((item) => ({
        label: item.mes,
        valor: item.totalValor,
        valorTexto: item.total,
        cor: VERDE,
      })),
      { limite: 12 }
    );
  } else {
    doc.texto(
      "Ainda não há faturamento com data de fechamento registrada para construir a série histórica.",
      MARGEM,
      doc.y - 6,
      { tamanho: 9, cor: CINZA_LABEL }
    );
    doc.y -= 30;
  }

  if (rel.temRanking && rel.ranking.length > 0) {
    const itensRanking = rel.ranking.map((item, indice) => ({
        label: item.consultor,
        valor: item.totalValor,
        valorTexto: item.total,
        detalhe: `${item.pct} do pipeline · faturado ${item.faturado}`,
        cor: indice === 0 ? AMARELO_GRAFICO : VERDE_GRAFICO,
      }));
    const escalaRanking = Math.max(...rel.ranking.map((item) => item.totalValor), 1);
    for (let inicio = 0; inicio < itensRanking.length; inicio += 10) {
      const paginaRanking = itensRanking.slice(inicio, inicio + 10);
      if (inicio > 0) doc.novaPagina();
      doc.garantir(48 + paginaRanking.length * 31);
      secaoGerencial(
        doc,
        inicio === 0 ? "Ranking da equipe comercial" : "Ranking da equipe comercial — continuação"
      );
      graficoBarrasGerencial(doc, paginaRanking, { escalaMax: escalaRanking });
    }
  } else {
    secaoGerencial(doc, "Desempenho do recorte");
    doc.texto(
      "O relatório está filtrado para um único consultor; por isso o ranking da equipe não é exibido.",
      MARGEM,
      doc.y - 6,
      { tamanho: 9, cor: CINZA_LABEL }
    );
    doc.y -= 30;
  }

  // ── Rodapés
  const paginas = pdf.getPages();
  paginas.forEach((pagina, indice) => {
    pagina.drawLine({
      start: { x: MARGEM, y: 42 },
      end: { x: DIREITA, y: 42 },
      color: CINZA_BORDA,
      thickness: 0.7,
    });
    pagina.drawText(
      sanitizar(`Documento gerado pelo sistema Cardo AI em ${rel.dataGeracao}.`),
      { x: MARGEM, y: 31, font: fontes.regular, size: 7.5, color: CINZA_LABEL }
    );
    const textoPagina = `Página ${indice + 1} de ${paginas.length}`;
    const lPag = fontes.regular.widthOfTextAtSize(sanitizar(textoPagina), 7.5);
    pagina.drawText(sanitizar(textoPagina), {
      x: DIREITA - lPag, y: 31, font: fontes.regular, size: 7.5, color: CINZA_LABEL,
    });
  });

  return pdf.save();
}

export type RelatorioDespesasPdf = {
  dataGeracao: string;
  filtroConsultor?: string;
  filtroPeriodo?: string;
  total: string;
  qtd: string;
  ticketMedio: string;
  porCategoria: { categoria: string; total: string; qtd: string }[];
  porConsultor: { consultor: string; total: string; qtd: string }[];
  evolucao: { mes: string; total: string }[];
  detalhe: {
    data: string;
    categoria: string;
    estabelecimento: string;
    cliente: string;
    consultor: string;
    valor: string;
  }[];
};

export async function gerarPdfRelatorioDespesas(
  rel: RelatorioDespesasPdf
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  await prepararMarcaPdf(pdf);
  const empresa = await dadosEmpresaAtual();
  pdf.setTitle(`Relatorio de Despesas - ${empresa.nomeFantasia}`);
  pdf.setAuthor(empresa.nomeFantasia);

  const fontes: Fontes = await embutirFontesMarca(pdf);
  const doc = new Documento(pdf, fontes, "Relatorio de Despesas", coresDaEmpresa(empresa));
  desenharCabecalhoRelatorio(doc, {
    titulo: "Relatorio de Despesas",
    dataGeracao: rel.dataGeracao,
  });

  if (rel.filtroConsultor || rel.filtroPeriodo) {
    doc.garantir(20);
    const partes = [rel.filtroConsultor, rel.filtroPeriodo].filter(Boolean);
    doc.texto(partes.join("   |   "), MARGEM, doc.y - 4, {
      tamanho: 8.5,
      cor: CINZA_LABEL,
    });
    doc.y -= 18;
  }

  doc.secao("Visao Geral");
  kpiBoxes(doc, [
    { label: "Total de Despesas", valor: rel.total, detalhe: `${rel.qtd} lancamentos` },
    { label: "Ticket Medio", valor: rel.ticketMedio },
  ]);

  if (rel.porCategoria.length > 0) {
    doc.secao("Por Categoria");
    tabelaR(doc,
      [
        { t: "Categoria", w: 270 },
        { t: "Total", w: 140, dir: true },
        { t: "Qtd", w: 105, dir: true },
      ],
      rel.porCategoria.map((c) => [c.categoria, c.total, c.qtd])
    );
  }

  if (rel.porConsultor.length > 0) {
    doc.secao("Por Consultor");
    tabelaR(doc,
      [
        { t: "Consultor", w: 270 },
        { t: "Total", w: 140, dir: true },
        { t: "Qtd", w: 105, dir: true },
      ],
      rel.porConsultor.map((c) => [c.consultor, c.total, c.qtd])
    );
  }

  if (rel.evolucao.length > 0) {
    doc.secao("Evolucao Mensal");
    tabelaR(doc,
      [
        { t: "Mes", w: 270 },
        { t: "Total", w: 245, dir: true },
      ],
      rel.evolucao.map((e) => [e.mes, e.total])
    );
  }

  if (rel.detalhe.length > 0) {
    doc.secao("Detalhe");
    tabelaR(doc,
      [
        { t: "Data", w: 65 },
        { t: "Categoria", w: 100 },
        { t: "Estabelecimento", w: 120 },
        { t: "Consultor", w: 100 },
        { t: "Valor", w: 130, dir: true },
      ],
      rel.detalhe.map((d) => [d.data, d.categoria, d.estabelecimento, d.consultor, d.valor])
    );
  }

  const paginas = pdf.getPages();
  paginas.forEach((pagina, indice) => {
    pagina.drawLine({
      start: { x: MARGEM, y: 42 },
      end: { x: DIREITA, y: 42 },
      color: CINZA_BORDA,
      thickness: 0.7,
    });
    pagina.drawText(
      sanitizar(`Documento gerado pelo sistema Cardo AI em ${rel.dataGeracao}.`),
      { x: MARGEM, y: 31, font: fontes.regular, size: 7.5, color: CINZA_LABEL }
    );
    const textoPagina = `Pagina ${indice + 1} de ${paginas.length}`;
    const lPag = fontes.regular.widthOfTextAtSize(sanitizar(textoPagina), 7.5);
    pagina.drawText(sanitizar(textoPagina), {
      x: DIREITA - lPag, y: 31, font: fontes.regular, size: 7.5, color: CINZA_LABEL,
    });
  });

  return pdf.save();
}

export type RelatorioMensalVisitasPdf = {
  periodo: string;
  dataGeracao: string;
  totais: { visitas: string; tecnicos: string; clientes: string; km: string; horas: string };
  consultores: {
    nome: string;
    visitas: string;
    tecnicos: string;
    clientes: string;
    km: string;
    horas: string;
    semVisita30: string;
    resumo: string | null;
    detalhe: { data: string; cliente: string; tipo: string; km: string; tempo: string }[];
    clientesSemVisita: { cliente: string; dias: string }[];
  }[];
};

function paragrafo(doc: Documento, texto: string, tamanho = 9.5) {
  const linhas = quebrarLinhas(texto, doc.fontes.regular, tamanho, LARGURA_UTIL - 20);
  for (const linha of linhas) {
    doc.garantir(tamanho * 1.5);
    doc.texto(linha, MARGEM + 10, doc.y - tamanho, { tamanho, cor: CINZA_TEXTO });
    doc.y -= tamanho * 1.5;
  }
  doc.y -= 6;
}

export async function gerarPdfRelatorioMensalVisitas(
  rel: RelatorioMensalVisitasPdf
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  await prepararMarcaPdf(pdf);
  const empresa = await dadosEmpresaAtual();
  pdf.setTitle(`Relatorio Mensal de Visitas - ${rel.periodo}`);
  pdf.setAuthor(empresa.nomeFantasia);

  const fontes: Fontes = await embutirFontesMarca(pdf);
  const titulo = "Relatorio Mensal de Visitas";
  const doc = new Documento(pdf, fontes, titulo, coresDaEmpresa(empresa));
  desenharCabecalhoRelatorio(doc, { titulo, dataGeracao: rel.dataGeracao });

  doc.texto(`Periodo: ${rel.periodo}`, MARGEM, doc.y - 4, { tamanho: 9, cor: CINZA_LABEL });
  doc.y -= 18;

  doc.secao("Visao Geral da Equipe");
  kpiBoxes(doc, [
    { label: "Visitas", valor: rel.totais.visitas, detalhe: `${rel.totais.tecnicos} tecnicas` },
    { label: "Clientes visitados", valor: rel.totais.clientes },
    { label: "Em campo", valor: rel.totais.horas, detalhe: `${rel.totais.km} rodados` },
  ]);

  doc.secao("Por Consultor");
  tabelaR(
    doc,
    [
      { t: "Consultor", w: 135 },
      { t: "Visitas", w: 60, dir: true },
      { t: "Tecnicas", w: 62, dir: true },
      { t: "Clientes", w: 62, dir: true },
      { t: "KM", w: 64, dir: true },
      { t: "Horas", w: 58, dir: true },
      { t: "Sem visita 30d+", w: 74.28, dir: true },
    ],
    rel.consultores.map((c) => [c.nome, c.visitas, c.tecnicos, c.clientes, c.km, c.horas, c.semVisita30])
  );

  for (const c of rel.consultores) {
    // Título do consultor não fica sozinho no pé da página.
    doc.garantir(130);
    doc.secao(c.nome);
    if (c.resumo) paragrafo(doc, c.resumo);

    if (c.detalhe.length > 0) {
      tabelaR(
        doc,
        [
          { t: "Data", w: 75 },
          { t: "Cliente", w: 210 },
          { t: "Tipo", w: 70 },
          { t: "KM", w: 70, dir: true },
          { t: "Tempo", w: 90.28, dir: true },
        ],
        c.detalhe.map((d) => [d.data, d.cliente, d.tipo, d.km, d.tempo])
      );
    } else {
      paragrafo(doc, "Nenhuma visita registrada no periodo.");
    }

    if (c.clientesSemVisita.length > 0) {
      // Rótulo + cabeçalho + ao menos duas linhas da tabela juntos.
      doc.garantir(18 + 20 + 18 * 2 + 10);
      doc.texto("Clientes da carteira ha mais tempo sem visita", MARGEM, doc.y - 10, {
        fonte: doc.fontes.bold,
        tamanho: 8.5,
        cor: CINZA_LABEL,
      });
      doc.y -= 18;
      tabelaR(
        doc,
        [
          { t: "Cliente", w: 380 },
          { t: "Sem visita", w: 135.28, dir: true },
        ],
        c.clientesSemVisita.map((s) => [s.cliente, s.dias])
      );
    }
  }

  const paginas = pdf.getPages();
  paginas.forEach((pagina, indice) => {
    pagina.drawLine({
      start: { x: MARGEM, y: 42 },
      end: { x: DIREITA, y: 42 },
      color: CINZA_BORDA,
      thickness: 0.7,
    });
    pagina.drawText(
      sanitizar(`Documento gerado pelo sistema Cardo AI em ${rel.dataGeracao}.`),
      { x: MARGEM, y: 31, font: fontes.regular, size: 7.5, color: CINZA_LABEL }
    );
    const textoPagina = `Pagina ${indice + 1} de ${paginas.length}`;
    const lPag = fontes.regular.widthOfTextAtSize(sanitizar(textoPagina), 7.5);
    pagina.drawText(sanitizar(textoPagina), {
      x: DIREITA - lPag, y: 31, font: fontes.regular, size: 7.5, color: CINZA_LABEL,
    });
  });

  return pdf.save();
}
