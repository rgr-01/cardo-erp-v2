import { PDFDocument, PDFFont, PDFPage, rgb, type RGB } from "pdf-lib";
import { desenharLogo, embutirFontesMarca } from "@/lib/marca/pdf";
import { dadosEmpresaAtual, prepararMarcaPdf, type DadosEmpresa } from "@/lib/empresa";
import type { PropostaPdf } from "@/lib/pdf";

// Versão econômica do PDF de orçamento/pedido: só preto, branco e cinza, sem
// faixas ou blocos preenchidos — pensada para imprimir sem gastar tinta.
// Segue o layout do pedido do ERP (linhas tracejadas, texto corrido).

const PRETO = rgb(0, 0, 0);
const CINZA = rgb(0.35, 0.35, 0.35);

const LARGURA = 595.28;
const ALTURA = 841.89;
const MARGEM = 36;
const DIREITA = LARGURA - MARGEM;
const LARGURA_UTIL = LARGURA - MARGEM * 2;
const RESERVA_RODAPE = 50;

function sanitizar(texto: string): string {
  return texto
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .normalize("NFC")
    .replace(/[^\x20-\x7E -ÿ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function quebrarLinhas(texto: string, fonte: PDFFont, tamanho: number, larguraMax: number) {
  const linhas: string[] = [];
  let atual = "";
  for (const palavra of sanitizar(texto).split(" ")) {
    const proxima = atual ? `${atual} ${palavra}` : palavra;
    if (atual && fonte.widthOfTextAtSize(proxima, tamanho) > larguraMax) {
      linhas.push(atual);
      atual = palavra;
    } else {
      atual = proxima;
    }
  }
  if (atual) linhas.push(atual);
  return linhas.length > 0 ? linhas : [""];
}

type Coluna = { titulo: string; largura: number; direita?: boolean };

class Doc {
  pagina!: PDFPage;
  y = 0;

  constructor(
    readonly pdf: PDFDocument,
    readonly regular: PDFFont,
    readonly bold: PDFFont,
    readonly tituloContinuacao: string
  ) {
    this.novaPagina(true);
  }

  novaPagina(primeira = false) {
    this.pagina = this.pdf.addPage([LARGURA, ALTURA]);
    if (primeira) {
      this.y = ALTURA - 36;
      return;
    }
    this.texto(this.tituloContinuacao, MARGEM, ALTURA - 34, { fonte: this.bold, tamanho: 9 });
    this.tracejada(ALTURA - 42);
    this.y = ALTURA - 60;
  }

  garantir(altura: number) {
    if (this.y - altura < RESERVA_RODAPE) this.novaPagina();
  }

  texto(
    t: string,
    x: number,
    y: number,
    o: { fonte?: PDFFont; tamanho?: number; cor?: RGB } = {}
  ) {
    this.pagina.drawText(sanitizar(t), {
      x,
      y,
      font: o.fonte ?? this.regular,
      size: o.tamanho ?? 8.5,
      color: o.cor ?? PRETO,
    });
  }

  textoDireita(t: string, xDireita: number, y: number, o: { fonte?: PDFFont; tamanho?: number; cor?: RGB } = {}) {
    const largura = (o.fonte ?? this.regular).widthOfTextAtSize(sanitizar(t), o.tamanho ?? 8.5);
    this.texto(t, xDireita - largura, y, o);
  }

  textoCentro(t: string, xCentro: number, y: number, o: { fonte?: PDFFont; tamanho?: number; cor?: RGB } = {}) {
    const largura = (o.fonte ?? this.regular).widthOfTextAtSize(sanitizar(t), o.tamanho ?? 8.5);
    this.texto(t, xCentro - largura / 2, y, o);
  }

  tracejada(y: number) {
    this.pagina.drawLine({
      start: { x: MARGEM, y },
      end: { x: DIREITA, y },
      color: PRETO,
      thickness: 0.7,
      dashArray: [3, 2],
    });
  }

  continua(y: number, x1 = MARGEM, x2 = DIREITA, cor = PRETO) {
    this.pagina.drawLine({ start: { x: x1, y }, end: { x: x2, y }, color: cor, thickness: 0.7 });
  }

  secao(titulo: string) {
    this.garantir(40);
    this.texto(titulo.toUpperCase(), MARGEM, this.y, { fonte: this.bold, tamanho: 9 });
    this.y -= 4;
    this.continua(this.y);
    this.y -= 12;
  }

  // Linha "Rótulo: valor   Rótulo: valor" em posições x fixas.
  campos(itens: { label: string; valor: string; x: number; larguraMax?: number }[]) {
    this.garantir(14);
    let linhasExtras = 0;
    for (const item of itens) {
      this.texto(`${item.label}:`, MARGEM + item.x, this.y, { fonte: this.bold, tamanho: 8 });
      const xValor = MARGEM + item.x + this.bold.widthOfTextAtSize(`${sanitizar(item.label)}:`, 8) + 4;
      const largura = (item.larguraMax ?? DIREITA - xValor) - 0;
      const linhas = quebrarLinhas(item.valor || "-", this.regular, 8.5, largura);
      linhas.forEach((linha, k) => this.texto(linha, xValor, this.y - k * 11));
      linhasExtras = Math.max(linhasExtras, linhas.length - 1);
    }
    this.y -= 12 + linhasExtras * 11;
  }

  tabela(colunas: Coluna[], linhas: string[][], subLinhas: (string | undefined)[] = []) {
    const cabecalho = () => {
      this.garantir(40);
      this.tracejada(this.y + 8);
      let x = MARGEM;
      for (const c of colunas) {
        if (c.direita) this.textoDireita(c.titulo, x + c.largura - 4, this.y - 3, { fonte: this.bold, tamanho: 8 });
        else this.texto(c.titulo, x + 4, this.y - 3, { fonte: this.bold, tamanho: 8 });
        x += c.largura;
      }
      this.tracejada(this.y - 8);
      this.y -= 20;
    };
    cabecalho();
    linhas.forEach((linha, i) => {
      const celulas = linha.map((valor, j) =>
        quebrarLinhas(valor, this.regular, 8.5, colunas[j].largura - 8)
      );
      const sub = subLinhas[i]
        ? quebrarLinhas(subLinhas[i]!, this.regular, 7.5, LARGURA_UTIL - 16)
        : [];
      const altura = Math.max(...celulas.map((c) => c.length)) * 11 + sub.length * 9 + 3;
      if (this.y - altura < RESERVA_RODAPE) {
        this.novaPagina();
        cabecalho();
      }
      let x = MARGEM;
      celulas.forEach((linhasCelula, j) => {
        const c = colunas[j];
        linhasCelula.forEach((l, k) => {
          if (c.direita) this.textoDireita(l, x + c.largura - 4, this.y - k * 11);
          else this.texto(l, x + 4, this.y - k * 11);
        });
        x += c.largura;
      });
      const nPrincipal = Math.max(...celulas.map((c) => c.length));
      sub.forEach((l, k) =>
        this.texto(l, MARGEM + colunas[0].largura + 4, this.y - nPrincipal * 11 - k * 9 + 1, {
          tamanho: 7.5,
          cor: CINZA,
        })
      );
      this.y -= altura;
    });
    this.tracejada(this.y + 4);
    this.y -= 6;
  }
}

function clausulas(p: PropostaPdf): { titulo: string; texto: string }[] {
  const semInfo = (v: string) => !v || v === "Não informado";
  const lista = [
    {
      titulo: "1. Objeto",
      texto:
        'O presente pedido tem por objeto a venda, pela CONTRATADA à CONTRATANTE, dos produtos nas quantidades e valores descritos na seção "Itens do pedido", conforme as condições comerciais aqui acordadas. Este documento reúne a proposta aceita e o contrato de compra e venda, não havendo outro instrumento.',
    },
    {
      titulo: "2. Preço e forma de pagamento",
      texto:
        `O valor total da presente contratação é de ${p.total}, ` +
        (semInfo(p.condicaoPagamento)
          ? "com condição de pagamento a combinar entre as partes. "
          : `a ser pago conforme a condição de pagamento: ${p.condicaoPagamento}. `) +
        "O não pagamento no vencimento sujeita a CONTRATANTE aos encargos de mora previstos na legislação vigente, sem prejuízo da cobrança do valor devido.",
    },
    {
      titulo: "3. Entrega e frete",
      texto:
        (p.previsaoEntrega
          ? `A entrega dos produtos está prevista para ${p.previsaoEntrega}, `
          : "A data de entrega dos produtos será combinada entre as partes, ") +
        (semInfo(p.localEntrega) ? "em local a combinar, " : `no local ${p.localEntrega}, `) +
        (semInfo(p.frete)
          ? "com condição de frete a combinar. "
          : `com a seguinte condição de frete: ${p.frete}. `) +
        "Qualquer alteração de data, local ou condição deverá ser formalizada por escrito entre as partes.",
    },
    {
      titulo: "4. Recebimento e conferência",
      texto:
        "A CONTRATANTE deve conferir os produtos no ato do recebimento, verificando quantidade, embalagem e integridade. Divergências ou avarias devem ser registradas no comprovante de entrega e comunicadas por escrito à CONTRATADA, para que possam ser apuradas e sanadas.",
    },
    {
      titulo: "5. Multa por atraso na entrega",
      texto:
        "Em caso de atraso na entrega não justificado por caso fortuito, força maior ou acordo entre as partes, será aplicada multa de 0,5% (zero vírgula cinco por cento) do valor total do pedido por dia de atraso, limitada a 10% (dez por cento) do valor total.",
    },
    {
      titulo: "6. Rescisão",
      texto:
        "O presente pedido poderá ser rescindido por qualquer das partes, mediante notificação por escrito com antecedência mínima de 15 (quinze) dias, ou imediatamente em caso de descumprimento de suas cláusulas pela parte contrária, respondendo a parte que der causa pelos prejuízos comprovados.",
    },
    {
      titulo: "7. Proteção de dados",
      texto:
        "As partes tratarão os dados pessoais envolvidos nesta contratação apenas para a execução do pedido e o cumprimento de obrigações legais, observada a Lei Geral de Proteção de Dados (Lei nº 13.709/2018).",
    },
    {
      titulo: "8. Assinatura eletrônica",
      texto:
        "As partes admitem a assinatura eletrônica deste pedido, desde que o processo permita comprovar a autoria, a integridade e o aceite do documento, tendo a assinatura eletrônica a mesma validade da assinatura em papel.",
    },
    {
      titulo: "9. Foro",
      texto:
        "Fica eleito o foro da comarca do domicílio da CONTRATADA para dirimir quaisquer controvérsias oriundas deste pedido, com renúncia a qualquer outro, por mais privilegiado que seja.",
    },
  ];
  if (p.termosCondicoes?.trim()) {
    lista.push({ titulo: "10. Condições adicionais", texto: p.termosCondicoes.trim() });
  }
  return lista;
}

// Campos de assinatura do pedido. Linha de cima: cliente e empresa; abaixo: vendedor e
// testemunha/outros. Os nomes vêm de quem foi indicado no envio para assinatura.
function slotsDeAssinatura(p: PropostaPdf, empresa: DadosEmpresa): { nome: string; papel: string }[] {
  const nomeDe = (papel: string) => p.assinantes?.find((a) => a.papel === papel)?.nome?.trim();
  const outros = (p.assinantes ?? []).filter((a) => a.papel === "OUTRO" && a.nome.trim());
  return [
    { nome: nomeDe("CLIENTE") || p.cliente.nome, papel: "Cliente" },
    { nome: nomeDe("EMPRESA") || empresa.razaoSocial, papel: "Empresa" },
    { nome: nomeDe("VENDEDOR") || p.consultor.nome, papel: "Vendedor" },
    ...(outros.length > 0
      ? outros.map((o) => ({ nome: o.nome, papel: o.rotulo || "Testemunha" }))
      : [{ nome: "", papel: "Testemunha / Outro" }]),
  ];
}

export async function gerarPdfPropostaSimples(p: PropostaPdf): Promise<Uint8Array> {
  const empresa = await dadosEmpresaAtual();
  const ehOrcamento = p.tipo === "PEDIDO"; // convenção do sistema: tipo PEDIDO = orçamento
  const nomeDoc = ehOrcamento ? "Orçamento" : "Pedido";
  // Grade de assinaturas ancorada no fim da última página (65pt por linha).
  const slots = ehOrcamento ? [] : slotsDeAssinatura(p, empresa);
  const linhasAssinatura = Math.max(1, Math.ceil(slots.length / 2));
  const espacoAssinaturas = 85 + (linhasAssinatura - 1) * 65 + 40;

  const pdf = await PDFDocument.create();
  await prepararMarcaPdf(pdf);
  pdf.setTitle(`${nomeDoc} ${p.numero} - ${empresa.nomeFantasia}`);
  pdf.setAuthor(empresa.nomeFantasia);
  const fontes = await embutirFontesMarca(pdf);
  const d = new Doc(pdf, fontes.regular, fontes.bold, `${nomeDoc} ${p.numero} - ${empresa.nomeFantasia}`);

  // Cabeçalho: logo em preto (traço fino) + dados da empresa.
  desenharLogo(d.pagina, { x: MARGEM, yTopo: d.y, altura: 22, cor: PRETO });
  const xEmpresa = MARGEM + 150;
  d.texto(`${empresa.razaoSocial}  -  CNPJ: ${empresa.cnpj}`, xEmpresa, d.y - 6, {
    tamanho: 8,
  });
  d.texto(`${empresa.endereco}`, xEmpresa, d.y - 17, { tamanho: 8 });
  d.texto(`${empresa.cidadeUfCep}`, xEmpresa, d.y - 28, { tamanho: 8 });
  d.y -= 52;

  // Linha de título do documento.
  d.tracejada(d.y + 6);
  d.texto(`${nomeDoc} Nr: ${p.numero}`, MARGEM, d.y - 6, { fonte: fontes.bold, tamanho: 10 });
  d.texto(`Safra: ${p.safra}`, MARGEM + (ehOrcamento ? 170 : 220), d.y - 6, { tamanho: 9 });
  if (ehOrcamento) {
    d.texto(`Validade: ${p.validade || "-"}`, MARGEM + 260, d.y - 6, { tamanho: 9 });
  }
  d.textoDireita(`Emissão: ${p.data}`, DIREITA, d.y - 6, { tamanho: 9 });
  d.tracejada(d.y - 14);
  d.y -= 32;

  d.secao("Dados do cliente");
  d.campos([
    { label: "Nome", valor: p.cliente.nome, x: 0, larguraMax: 230 },
    { label: "Razão social", valor: p.cliente.razaoSocial, x: 260 },
  ]);
  d.campos([
    { label: "CPF/CNPJ", valor: p.cliente.documento, x: 0, larguraMax: 230 },
    { label: "Insc. Estadual", valor: p.cliente.inscricaoEstadual, x: 260 },
  ]);
  d.campos([{ label: "Endereço", valor: `${p.cliente.endereco} - ${p.cliente.cidadeUfCep}`, x: 0 }]);
  d.campos([
    { label: "Telefone", valor: p.cliente.telefone, x: 0, larguraMax: 230 },
    { label: "E-mail", valor: p.cliente.email, x: 260 },
  ]);
  d.y -= 6;

  d.secao("Informações gerais");
  d.campos([
    { label: "Consultor", valor: p.consultor.nome, x: 0, larguraMax: 230 },
    { label: "E-mail", valor: p.consultor.email, x: 260 },
  ]);
  d.campos([
    { label: "Cond. pagamento", valor: p.condicaoPagamento, x: 0, larguraMax: 190 },
    { label: "Frete", valor: p.frete, x: 260 },
  ]);
  d.campos([
    { label: "Prev. entrega", valor: p.previsaoEntrega || "Não informada", x: 0, larguraMax: 190 },
    { label: "Local de entrega", valor: p.localEntrega, x: 260 },
  ]);
  if (!ehOrcamento) {
    d.campos([{ label: "Data de vencimento", valor: p.dataFaturamento || "Não informada", x: 0, larguraMax: 190 }]);
  }
  d.y -= 6;

  d.secao(ehOrcamento ? "Itens do orçamento" : "Itens do pedido");
  const temCultura = p.itens.some((i) => i.cultura.trim());
  // Cotado a vista e a prazo: unitario e total de cada um, lado a lado.
  const dupla = Boolean(p.totalAprazo);
  const colunas: Coluna[] = dupla
    ? [
        { titulo: "Seq", largura: 24 },
        { titulo: "Produto", largura: temCultura ? 85 : 109 },
        { titulo: "Fornecedor", largura: temCultura ? 55 : 65 },
        ...(temCultura ? [{ titulo: "Cultura", largura: 34 }] : []),
        { titulo: "Quantidade", largura: 60, direita: true },
        { titulo: "Unit. à vista", largura: 62, direita: true },
        { titulo: "Total à vista", largura: 70.64, direita: true },
        { titulo: "Unit. a prazo", largura: 62, direita: true },
        { titulo: "Total a prazo", largura: 70.64, direita: true },
      ]
    : [
        { titulo: "Seq", largura: 24 },
        { titulo: "Produto", largura: temCultura ? 145 : 175 },
        { titulo: "Fornecedor", largura: 80 },
        ...(temCultura ? [{ titulo: "Cultura", largura: 45 }] : []),
        { titulo: "Quantidade", largura: 70, direita: true },
        { titulo: "Valor unit.", largura: 70, direita: true },
        { titulo: "Valor total", largura: temCultura ? 89.28 : 104.28, direita: true },
      ];
  // Subtítulos (ingrediente ativo, embalagem, recomendação) ficam abaixo do produto.
  const linhas = p.itens.map((i, idx) => [
    String(idx + 1),
    i.produto,
    i.fornecedor,
    ...(temCultura ? [i.cultura] : []),
    i.unidade ? `${i.volume} ${i.unidade}` : i.volume,
    i.valorUnitario,
    i.total,
    ...(dupla ? [i.valorUnitarioAprazo ?? "", i.totalAprazo ?? ""] : []),
  ]);
  const sub = p.itens.map((i) => {
    const partes = [
      [i.ingredienteAtivo, i.embalagem].filter(Boolean).join(" · "),
      i.recomendacao ? `Recomendação: ${i.recomendacao}` : "",
    ].filter(Boolean);
    return partes.length ? partes.join("  |  ") : undefined;
  });
  d.tabela(colunas, linhas, sub);

  // Totais em texto simples; só o total final ganha uma moldura fina.
  d.garantir(70);
  const xRotulo = DIREITA - 190;
  d.texto("Subtotal", xRotulo, d.y - 4);
  d.textoDireita(p.subtotal, DIREITA - 4, d.y - 4);
  d.texto("Desconto", xRotulo, d.y - 16);
  d.textoDireita(p.desconto, DIREITA - 4, d.y - 16);
  d.pagina.drawRectangle({
    x: xRotulo - 6,
    y: d.y - 44,
    width: 196,
    height: 20,
    borderColor: PRETO,
    borderWidth: 0.9,
  });
  d.texto(dupla ? "TOTAL À VISTA" : "TOTAL", xRotulo, d.y - 38, { fonte: fontes.bold, tamanho: 10 });
  d.textoDireita(p.total, DIREITA - 4, d.y - 38, { fonte: fontes.bold, tamanho: 11 });
  if (dupla) {
    d.pagina.drawRectangle({
      x: xRotulo - 6,
      y: d.y - 68,
      width: 196,
      height: 20,
      borderColor: PRETO,
      borderWidth: 0.9,
    });
    d.texto("TOTAL A PRAZO", xRotulo, d.y - 62, { fonte: fontes.bold, tamanho: 10 });
    d.textoDireita(p.totalAprazo!, DIREITA - 4, d.y - 62, { fonte: fontes.bold, tamanho: 11 });
    d.y -= 24;
  }
  d.y -= 62;

  // Pedido: parcelas a partir da data de faturamento (1ª parcela na própria data).
  if (!ehOrcamento && p.parcelas && p.parcelas.length > 0) {
    d.garantir(40 + p.parcelas.length * 12);
    d.secao("Parcelas");
    d.texto("Parcela", MARGEM, d.y, { fonte: fontes.bold, tamanho: 8.5 });
    d.texto("Vencimento", MARGEM + 90, d.y, { fonte: fontes.bold, tamanho: 8.5 });
    d.textoDireita("Valor", MARGEM + 260, d.y, { fonte: fontes.bold, tamanho: 8.5 });
    d.y -= 12;
    for (const parcela of p.parcelas) {
      d.garantir(12);
      d.texto(`${parcela.numero}ª`, MARGEM, d.y);
      d.texto(parcela.data, MARGEM + 90, d.y);
      d.textoDireita(parcela.valor, MARGEM + 260, d.y);
      d.y -= 11.5;
    }
    d.y -= 8;
  }

  if (p.observacoes?.trim()) {
    d.secao("Observações");
    for (const l of quebrarLinhas(p.observacoes, fontes.regular, 8.5, LARGURA_UTIL)) {
      d.garantir(12);
      d.texto(l, MARGEM, d.y);
      d.y -= 11;
    }
    d.y -= 6;
  }

  if (!ehOrcamento) {
    // As cláusulas começam logo depois das observações (sem pular de página).
    d.garantir(70);
    d.secao("Cláusulas");
    const partes = [
      `CONTRATADA: ${empresa.razaoSocial}, CNPJ ${empresa.cnpj}, com sede em ${empresa.endereco}, ${empresa.cidadeUfCep}.`,
      `CONTRATANTE: ${p.cliente.razaoSocial || p.cliente.nome}, CPF/CNPJ ${p.cliente.documento || "não informado"}, ${p.cliente.endereco}, ${p.cliente.cidadeUfCep}.`,
    ];
    for (const parte of partes) {
      for (const l of quebrarLinhas(parte, fontes.regular, 8, LARGURA_UTIL)) {
        d.garantir(11);
        d.texto(l, MARGEM, d.y, { tamanho: 8 });
        d.y -= 10.5;
      }
    }
    d.y -= 6;
    const desenharClausula = (c: { titulo: string; texto: string }) => {
      d.garantir(30);
      d.texto(c.titulo, MARGEM, d.y, { fonte: fontes.bold, tamanho: 8.5 });
      d.y -= 11;
      for (const l of quebrarLinhas(c.texto, fontes.regular, 8, LARGURA_UTIL)) {
        d.garantir(11);
        d.texto(l, MARGEM, d.y, { tamanho: 8 });
        d.y -= 10.5;
      }
      d.y -= 5;
    };
    const lista = clausulas(p);
    lista.slice(0, -1).forEach(desenharClausula);
    // A assinatura nunca fica sozinha na última página: se a última cláusula
    // invadiria o espaço reservado às assinaturas, ela vai junto para a página nova.
    const ultima = lista[lista.length - 1];
    if (ultima) {
      const altura = 11 + quebrarLinhas(ultima.texto, fontes.regular, 8, LARGURA_UTIL).length * 10.5 + 5;
      if (d.y - altura < espacoAssinaturas) d.novaPagina();
      desenharClausula(ultima);
    }
  }

  // Assinaturas: só no pedido (o orçamento não é assinado).
  if (!ehOrcamento) {
    if (d.y < espacoAssinaturas) d.novaPagina();
    const gap = 40;
    const larguraLinha = (LARGURA_UTIL - gap) / 2;
    slots.forEach((b, i) => {
      const x = MARGEM + (i % 2) * (larguraLinha + gap);
      const y = 85 + (linhasAssinatura - 1 - Math.floor(i / 2)) * 65;
      d.pagina.drawLine({
        start: { x, y },
        end: { x: x + larguraLinha, y },
        color: PRETO,
        thickness: 0.7,
        dashArray: [3, 2],
      });
      const centro = x + larguraLinha / 2;
      const linhasNome = b.nome ? quebrarLinhas(b.nome, fontes.regular, 8, larguraLinha) : [];
      linhasNome.forEach((l, k) => d.textoCentro(l, centro, y - 11 - k * 10, { tamanho: 8 }));
      d.textoCentro(b.papel, centro, y - 11 - Math.max(linhasNome.length, 1) * 10, {
        tamanho: 7.5,
        cor: CINZA,
      });
    });
  }

  // Rodapé com paginação.
  const paginas = pdf.getPages();
  paginas.forEach((pagina, i) => {
    pagina.drawText(sanitizar(`Documento gerado pelo sistema Cardo AI em ${p.data}.`), {
      x: MARGEM,
      y: 28,
      font: fontes.regular,
      size: 7,
      color: CINZA,
    });
    const t = sanitizar(`Página ${i + 1} de ${paginas.length}`);
    pagina.drawText(t, {
      x: DIREITA - fontes.regular.widthOfTextAtSize(t, 7),
      y: 28,
      font: fontes.regular,
      size: 7,
      color: CINZA,
    });
  });

  return pdf.save();
}
