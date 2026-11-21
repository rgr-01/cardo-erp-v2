"use client";

import { Fragment } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  LabelList,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from "recharts";
import {
  estiloFonteTexto,
  fotoDeCapa,
  PAGINA_LARGURA,
  PAGINA_ALTURA,
  coresPorCategoria,
  ehBlocoAvulso,
  larguraDoBloco,
  montarLayout,
  quebrasDePagina,
  ROTULOS_DESTAQUE,
  tituloDaSecao,
  type Bloco,
  type BlocoAvulso,
  type BlocoGrafico,
  type BlocoTabela,
  type BlocoVisual,
  type MapaPaginas,
  type VarianteDestaque,
} from "@/lib/relatorio-conteudo";
import { AnotacoesFotoSvg, razaoDoQuadro } from "@/components/visitas/anotacoes-foto";
import { Logo } from "@/components/logo";

// Paleta alinhada ao tema escuro do app, começando pelo verde de destaque.
const CORES = ["#00dc4d", "#38bdf8", "#fbbf24", "#f472b6", "#a78bfa", "#fb923c"];

const TOOLTIP_PROPS = {
  contentStyle: {
    backgroundColor: "#19323b",
    border: "1px solid #34525d",
    borderRadius: 8,
    color: "#ecf1f3",
  },
  labelStyle: { color: "#8ea3ab" },
} as const;

// Converte as linhas do bloco no formato que o recharts espera:
// { rotulo, [serie1]: valor, [serie2]: valor, ... }
function dadosDoGrafico(bloco: BlocoGrafico) {
  return bloco.linhas.map((linha) => {
    const ponto: Record<string, string | number> = { rotulo: linha.rotulo };
    bloco.series.forEach((serie, i) => {
      const valor = linha.valores[i];
      if (valor !== null && valor !== undefined) ponto[serie] = valor;
    });
    return ponto;
  });
}

function corDoGrafico(bloco: BlocoGrafico, indice: number) {
  return bloco.cores?.[indice] ?? CORES[indice % CORES.length];
}

function LegendaCategorias({ rotulos, cores }: { rotulos: string[]; cores?: string[] }) {
  return (
    <ul className="flex flex-wrap justify-center gap-x-4 gap-y-1 pt-2 text-sm">
      {rotulos.map((rotulo, i) => (
        <li key={i} className="flex items-center gap-1.5" style={{ color: cores?.[i] ?? CORES[i % CORES.length] }}>
          <span className="inline-block h-2.5 w-2.5" style={{ backgroundColor: cores?.[i] ?? CORES[i % CORES.length] }} />
          {rotulo || i + 1}
        </li>
      ))}
    </ul>
  );
}

// Classes de tamanho, negrito e alinhamento de um texto curto (legenda, título).
export function classeTextoCurto(estilo: { negrito?: boolean; tamanho?: string; alinhamento?: string } | undefined, negritoPadrao: boolean): string {
  const negrito = estilo?.negrito ?? negritoPadrao;
  const tamanho = estilo?.tamanho === "pequeno" ? "text-xs" : estilo?.tamanho === "grande" ? "text-lg" : "text-sm";
  const alinhamento = estilo?.alinhamento === "centro" ? "text-center" : estilo?.alinhamento === "direita" ? "text-right" : "text-left";
  return `${tamanho} ${alinhamento} ${negrito ? "font-semibold" : "font-normal"}`;
}

export function GraficoBloco({
  bloco,
  alto = false,
  semTitulo = false,
}: {
  bloco: BlocoGrafico;
  alto?: boolean;
  // O editor mostra o título como campo editável, fora do gráfico.
  semTitulo?: boolean;
}) {
  const dados = dadosDoGrafico(bloco);
  const temDados = dados.length > 0 && bloco.series.length > 0;
  const porCategoria = coresPorCategoria(bloco);

  if (!temDados) {
    return (
      <div className="flex h-48 items-center justify-center rounded-lg border border-dashed border-surface-border text-sm text-muted">
        Gráfico sem dados ainda.
      </div>
    );
  }

  const formatarValor = (v: unknown) => typeof v === "number"
    ? `${v.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}${bloco.unidade ? ` ${bloco.unidade}` : ""}`
    : "";
  const legenda = porCategoria ? (
    <Legend content={() => <LegendaCategorias rotulos={bloco.linhas.map((l) => l.rotulo)} cores={bloco.cores} />} />
  ) : (
    <Legend />
  );

  function conteudoDoGrafico() {
    if (bloco.formato === "pizza" || bloco.formato === "rosca") {
      return (
        <PieChart>
          <Pie
            data={dados}
            dataKey={bloco.series[0]}
            nameKey="rotulo"
            outerRadius="80%"
            innerRadius={bloco.formato === "rosca" ? "52%" : 0}
            label
            isAnimationActive={false}
          >
            {dados.map((_, i) => (
              <Cell key={i} fill={corDoGrafico(bloco, i)} />
            ))}
          </Pie>
          <Tooltip {...TOOLTIP_PROPS} formatter={formatarValor} />
          <Legend />
        </PieChart>
      );
    }
    if (bloco.formato === "linha") {
      return (
        <LineChart data={dados}>
          <CartesianGrid strokeDasharray="3 3" stroke="#34525d" />
          <XAxis dataKey="rotulo" stroke="#8ea3ab" fontSize={12} label={bloco.eixoX ? { value: bloco.eixoX, position: "insideBottom", offset: -5 } : undefined} />
          <YAxis stroke="#8ea3ab" fontSize={12} label={bloco.eixoY ? { value: bloco.eixoY, angle: -90, position: "insideLeft" } : undefined} />
          <Tooltip {...TOOLTIP_PROPS} formatter={formatarValor} />
          <Legend />
          {bloco.series.map((serie, i) => (
            <Line key={serie} type="monotone" dataKey={serie} stroke={corDoGrafico(bloco, i)} strokeWidth={2} isAnimationActive={false} />
          ))}
        </LineChart>
      );
    }
    if (bloco.formato === "area") {
      return (
        <AreaChart data={dados}>
          <CartesianGrid strokeDasharray="3 3" stroke="#34525d" />
          <XAxis dataKey="rotulo" stroke="#8ea3ab" fontSize={12} label={bloco.eixoX ? { value: bloco.eixoX, position: "insideBottom", offset: -5 } : undefined} />
          <YAxis stroke="#8ea3ab" fontSize={12} label={bloco.eixoY ? { value: bloco.eixoY, angle: -90, position: "insideLeft" } : undefined} />
          <Tooltip {...TOOLTIP_PROPS} formatter={formatarValor} />
          <Legend />
          {bloco.series.map((serie, i) => (
            <Area
              key={serie}
              type="monotone"
              dataKey={serie}
              stroke={corDoGrafico(bloco, i)}
              fill={corDoGrafico(bloco, i)}
              fillOpacity={0.22}
              strokeWidth={2}
              isAnimationActive={false}
            />
          ))}
        </AreaChart>
      );
    }
    const deitada = bloco.formato === "barra_horizontal";
    const empilhada = bloco.formato === "barra_empilhada";
    return (
      <BarChart data={dados} layout={deitada ? "vertical" : "horizontal"}>
        <CartesianGrid strokeDasharray="3 3" stroke="#34525d" />
        {deitada ? (
          <>
            <XAxis type="number" stroke="#8ea3ab" fontSize={12} label={bloco.eixoX ? { value: bloco.eixoX, position: "insideBottom", offset: -5 } : undefined} />
            <YAxis type="category" dataKey="rotulo" stroke="#8ea3ab" fontSize={12} width={120} label={bloco.eixoY ? { value: bloco.eixoY, angle: -90, position: "insideLeft" } : undefined} />
          </>
        ) : (
          <>
            <XAxis dataKey="rotulo" stroke="#8ea3ab" fontSize={12} label={bloco.eixoX ? { value: bloco.eixoX, position: "insideBottom", offset: -5 } : undefined} />
            <YAxis stroke="#8ea3ab" fontSize={12} label={bloco.eixoY ? { value: bloco.eixoY, angle: -90, position: "insideLeft" } : undefined} />
          </>
        )}
        <Tooltip {...TOOLTIP_PROPS} formatter={formatarValor} />
        {legenda}
        {bloco.series.map((serie, i) => (
          <Bar key={serie} dataKey={serie} fill={corDoGrafico(bloco, i)} stackId={empilhada ? "total" : undefined} isAnimationActive={false}>
            {/* Série única: uma cor por barra (ver coresPorCategoria). */}
            {porCategoria && dados.map((_, li) => <Cell key={li} fill={corDoGrafico(bloco, li)} />)}
            {/* Valor na ponta da barra (empilhada: dentro de cada parte), como no PDF. */}
            <LabelList
              dataKey={serie}
              position={empilhada ? "center" : deitada ? "right" : "top"}
              fontSize={11}
              fill={empilhada ? "#ffffff" : "#19323b"}
              formatter={formatarValor}
            />
          </Bar>
        ))}
      </BarChart>
    );
  }

  return (
    <figure>
      {bloco.titulo && !semTitulo && (
        <figcaption className={`mb-3 text-zinc-800 ${classeTextoCurto(bloco.tituloEstilo, true)}`}>
          {bloco.titulo}
        </figcaption>
      )}
      <div className={alto ? "h-80 sm:h-96" : "h-64"}>
        <ResponsiveContainer width="100%" height="100%">
          {conteudoDoGrafico()}
        </ResponsiveContainer>
      </div>
    </figure>
  );
}

export function TabelaBloco({ bloco }: { bloco: BlocoTabela }) {
  return (
    <figure className="overflow-x-auto">
      {bloco.titulo && <figcaption className="mb-3 text-sm font-semibold text-marca-azul">{bloco.titulo}</figcaption>}
      <table className="w-full border-collapse text-left text-xs text-zinc-700">
        <thead><tr>{bloco.cabecalhos.map((cabecalho, indice) => <th key={indice} className="border border-zinc-200 bg-[#eaf3ed] px-2 py-2 font-semibold">{cabecalho || `Coluna ${indice + 1}`}</th>)}</tr></thead>
        <tbody>{bloco.linhas.map((linha, indiceLinha) => <tr key={indiceLinha}>{bloco.cabecalhos.map((_, indiceColuna) => <td key={indiceColuna} className="border border-zinc-200 px-2 py-2">{linha[indiceColuna] ?? ""}</td>)}</tr>)}</tbody>
      </table>
    </figure>
  );
}

// Endereços http(s) no texto viram link clicável (abre em nova aba).
function TextoComLinks({ texto }: { texto: string }) {
  return (
    <>
      {texto.split(/(https?:\/\/[^\s<>"']*[^\s<>"'.,;:!?)\]])/g).map((parte, i) =>
        i % 2 === 1 ? (
          <a
            key={i}
            href={parte}
            target="_blank"
            rel="noopener noreferrer"
            className="break-all text-emerald-700 underline underline-offset-2 hover:opacity-80 print:no-underline"
          >
            {parte}
          </a>
        ) : (
          <Fragment key={i}>{parte}</Fragment>
        )
      )}
    </>
  );
}

function BlocoConteudo({ bloco }: { bloco: Bloco }) {
  if (bloco.tipo === "texto") {
    return (
      <p className="h-full w-full overflow-hidden whitespace-pre-wrap p-2 text-[13px] leading-relaxed text-zinc-800">
        <TextoComLinks texto={bloco.texto} />
      </p>
    );
  }

  if (bloco.tipo === "foto") {
    return (
      <a href={bloco.url} target="_blank" rel="noreferrer" className="block h-full w-full">
        {/* eslint-disable-next-line @next/next/no-img-element -- fotos vêm do storage externo (Supabase), sem domínio fixo para next/image */}
        <img
          src={bloco.url}
          alt={bloco.legenda ?? "Foto da visita"}
          className="h-full w-full object-cover"
        />
      </a>
    );
  }

  if (bloco.tipo === "grafico") return (
    <div className="h-full w-full overflow-hidden bg-white p-1">
      <GraficoBloco bloco={bloco} />
    </div>
  );
  if (ehBlocoAvulso(bloco)) return <div className="h-full w-full overflow-auto bg-white p-2"><AvulsoLeitura bloco={bloco} /></div>;
  return <div className="h-full w-full overflow-auto bg-white p-2"><TabelaBloco bloco={bloco} /></div>;
}

export const ESTILO_DESTAQUE: Record<VarianteDestaque, { caixa: string; rotulo: string }> = {
  atencao: { caixa: "border-amber-500 bg-amber-50", rotulo: "text-amber-800" },
  resultado: { caixa: "border-emerald-600 bg-emerald-50", rotulo: "text-emerald-800" },
  dica: { caixa: "border-sky-500 bg-sky-50", rotulo: "text-sky-800" },
  info: { caixa: "border-zinc-400 bg-zinc-100", rotulo: "text-zinc-700" },
};

// Caixa de destaque, faixa de indicadores e divisor: blocos que ocupam a linha inteira.
export function AvulsoLeitura({ bloco }: { bloco: BlocoAvulso }) {
  if (bloco.tipo === "destaque") {
    const estilo = ESTILO_DESTAQUE[bloco.variante];
    return (
      <div className={`break-inside-avoid rounded-xl border-l-4 px-5 py-4 ${estilo.caixa}`}>
        <p className={`text-xs font-bold uppercase tracking-[0.14em] ${estilo.rotulo}`}>{bloco.titulo?.trim() || ROTULOS_DESTAQUE[bloco.variante]}</p>
        {bloco.texto.trim() && <p className="mt-1.5 whitespace-pre-wrap text-[15px] leading-7 text-zinc-800">{bloco.texto}</p>}
      </div>
    );
  }
  if (bloco.tipo === "indicadores") {
    return (
      <div className="grid break-inside-avoid gap-4" style={{ gridTemplateColumns: `repeat(${Math.min(4, Math.max(1, bloco.itens.length))}, minmax(0, 1fr))` }}>
        {bloco.itens.map((item, i) => (
          <div key={i} className="rounded-xl border border-zinc-200 bg-white px-4 py-4 text-center">
            <p className="text-3xl font-bold leading-tight text-marca-azul">{item.valor || "—"}</p>
            <p className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-muted">{item.rotulo}</p>
          </div>
        ))}
      </div>
    );
  }
  if (bloco.estilo === "espaco") return <div className="h-8" aria-hidden="true" />;
  return <hr className={`border-0 border-t-2 ${bloco.estilo === "pontilhada" ? "border-dotted border-zinc-400" : "border-zinc-300"}`} />;
}

// Renderiza cada página do relatório como uma "folha" com os blocos nas
// posições exatas salvas pelo editor em canvas — mesmo layout do PDF.
export function CanvasBlocosRender({ blocos }: { blocos: Bloco[] }) {
  const totalPaginas = Math.max(1, ...blocos.map((b) => b.pagina + 1));

  return (
    <div className="space-y-6">
      {Array.from({ length: totalPaginas }, (_, pagina) => {
        const daPagina = blocos.filter((b) => b.pagina === pagina);
        if (daPagina.length === 0) return null;
        return (
          <div
            key={pagina}
            className="relative mx-auto w-full rounded-lg border border-surface-border bg-white shadow"
            style={{ aspectRatio: `${PAGINA_LARGURA} / ${PAGINA_ALTURA}` }}
          >
            {daPagina.map((bloco) => (
              <div
                key={bloco.id}
                className="absolute overflow-hidden"
                style={{
                  left: `${(bloco.x / PAGINA_LARGURA) * 100}%`,
                  top: `${(bloco.y / PAGINA_ALTURA) * 100}%`,
                  width: `${(bloco.w / PAGINA_LARGURA) * 100}%`,
                  height: `${(bloco.h / PAGINA_ALTURA) * 100}%`,
                }}
              >
                <BlocoConteudo bloco={bloco} />
                {bloco.tipo === "foto" && bloco.legenda && (
                  <p className="absolute inset-x-0 bottom-0 bg-black/60 px-2 py-1 text-xs text-white">
                    {bloco.legenda}
                  </p>
                )}
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

// Divisória "Página N" onde o PDF quebra (só na tela; na impressão some).
export function QuebraPagina({
  numero,
  total,
  acao,
}: {
  numero: number;
  total: number;
  // Ex.: no editor, "Tirar quebra" quando o bloco de baixo está preso no topo.
  acao?: React.ReactNode;
}) {
  return (
    <div
      role="separator"
      aria-label={`Página ${numero} de ${total} do PDF`}
      className="flex items-center gap-3 print:hidden"
    >
      <span className="h-0 flex-1 border-t-2 border-dashed border-zinc-300" />
      <span className="whitespace-nowrap rounded-full border border-zinc-300 bg-white px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-muted">
        Página {numero} de {total} no PDF
      </span>
      <span className="h-0 flex-1 border-t-2 border-dashed border-zinc-300" />
      {acao}
    </div>
  );
}

// Card/quadro que não coube inteiro numa página: o PDF continua na próxima.
export function ContinuaNaPagina({ numero }: { numero?: number }) {
  if (!numero) return null;
  return (
    <p className="mt-1 text-right text-[11px] italic text-secondary print:hidden">
      continua na página {numero} do PDF ↓
    </p>
  );
}

type BlocosRenderProps = {
  blocos: Bloco[];
  tipo: "VISITA" | "TECNICO";
  clienteNome: string;
  fazendaNome?: string | null;
  titulo: string | null;
  dataVisita: string;
  consultorNome: string;
  // Paginação do PDF (só relatório técnico) — mostra onde cada página quebra.
  paginas?: MapaPaginas | null;
  // Logo do parceiro anexada no editor: fica à direita do cabeçalho.
  logoParceiroUrl?: string | null;
  // Página que o Chromium do servidor imprime em PDF: o mesmo visual da tela,
  // só sem a moldura arredondada/sombra do cartão (que não cabe numa folha).
  modoPdf?: boolean;
  // Escolhido na aba Capa: documento começa direto no conteúdo.
  semCapa?: boolean;
  safraNome?: string | null;
  // Texto acima da logo do parceiro; nulo = logo sem rótulo (programa da empresa).
  logoParceiroRotulo?: string | null;
  orientacao?: "PAISAGEM" | "RETRATO";
  // Logo da esquerda escolhida no editor; nulo = logo da empresa.
  logoPrincipalUrl?: string | null;
  // Tamanho das logos ajustado no editor (1 = padrão).
  escalaLogoPrincipal?: number;
  // Texto ao lado da logo da esquerda na capa (rótulo \n nome).
  logoPrincipalTexto?: string | null;
  escalaLogoPrincipalPaginas?: number;
  escalaLogoParceiro?: number;
  escalaLogoParceiroPaginas?: number;
  // Prévia do bot: número de cada item (id do bloco → número), mostrado num selo.
  numerosItens?: Record<string, number>;
  // PDF em duas impressões (relatorio-pdf-web.ts): "conteudo" = só o corpo,
  // sem cabeçalho/rodapé (o espaço deles vem da margem do @page); "so" = só o
  // cabeçalho e o rodapé numa folha transparente, carimbada em cada página.
  moldura?: "conteudo" | "so";
  // Relatório de trabalho: datas das visitas técnicas do trabalho a esse
  // cliente. Na capa entra no lugar do cliente, e a linha de subtítulo sai.
  visitasTrabalho?: string[];
};

// Selo da prévia do bot ("muda o 3"). Flutuante nos visuais (foto, gráfico),
// em linha nos textos.
function SeloItem({ numero, flutuante = false }: { numero?: number; flutuante?: boolean }) {
  if (!numero) return null;
  return (
    <span className={`${flutuante ? "absolute left-2 top-2 z-20" : "mr-2 align-middle"} inline-flex h-7 min-w-7 items-center justify-center rounded-full bg-rose-600 px-2 text-sm font-bold text-white shadow ring-2 ring-white`}>
      {numero}
    </span>
  );
}

// Logo do parceiro/programa: canto da capa e do rodapé das páginas internas.
function MarcaParceiro({ url, rotulo, grande = false, escala = 1 }: { url: string; rotulo: string | null | undefined; grande?: boolean; escala?: number }) {
  return (
    <div className="flex shrink-0 flex-col items-end gap-1">
      {rotulo && <span className={`font-semibold uppercase tracking-[0.18em] text-muted ${grande ? "text-xs" : "text-[10px]"}`}>{rotulo}</span>}
      {/* eslint-disable-next-line @next/next/no-img-element -- logo vem do storage externo */}
      <img src={url} alt={rotulo ? "Logo do parceiro" : "Logo do programa"} className="object-contain" style={{ maxHeight: (grande ? 44 : 52) * escala, maxWidth: (grande ? 150 : 190) * escala }} />
    </div>
  );
}

// "PROGRAMA / Difusão de Tecnologia / uma iniciativa <logo da empresa>" ao
// lado da logo da esquerda, separado por um traço vertical.
function TextoMarca({ texto }: { texto: string }) {
  const [rotulo, ...resto] = texto.split("\n").map((l) => l.trim()).filter(Boolean);
  const nome = resto.join(" ");
  return (
    <div className="min-w-0 border-l border-zinc-300 pl-6">
      {nome ? <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted">{rotulo}</p> : null}
      <p className="text-3xl font-semibold leading-tight text-marca-azul">{nome || rotulo}</p>
      <p className="mt-1 flex items-center gap-2 text-sm text-muted">uma iniciativa <Logo fundo="claro" className="h-5 w-auto" /></p>
    </div>
  );
}

function CampoCabecalho({ rotulo, valor }: { rotulo: string; valor?: string | null }) {
  if (!valor) return null;
  return (
    <p>
      <span className="block text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-700">{rotulo}</span>
      <span className="mt-1 block text-[17px] text-marca-azul">{valor}</span>
    </p>
  );
}

function Secao({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="break-after-avoid text-xs font-bold uppercase tracking-[0.16em] text-marca-azul">
      {children}
    </h2>
  );
}

function TextoLeitura({ bloco }: { bloco: Extract<Bloco, { tipo: "texto" }> }) {
  const alinhamento = bloco.alinhamento === "centro" ? "text-center" : bloco.alinhamento === "direita" ? "text-right" : bloco.alinhamento === "justificar" ? "text-justify" : "text-left";
  const tamanho = bloco.tamanho === "pequeno" ? "text-[13px]" : bloco.tamanho === "grande" ? "text-lg" : "text-[15px]";
  const entrelinhas = bloco.espacamentoLinha === "compacto" ? "leading-6" : bloco.espacamentoLinha === "amplo" ? "leading-9" : "leading-7";
  const destaque = bloco.destaque === "verde" ? "bg-emerald-50" : bloco.destaque === "azul" ? "bg-sky-50" : bloco.destaque === "amarelo" ? "bg-amber-50" : "";
  const cor = bloco.cor === "verde" ? "text-emerald-700" : bloco.cor === "azul" || bloco.subtitulo ? "text-marca-azul" : bloco.cor === "vermelho" ? "text-red-700" : "text-zinc-700";
  const classe = `rounded px-1 ${cor} ${alinhamento} ${tamanho} ${entrelinhas} ${bloco.negrito || bloco.subtitulo ? "font-semibold" : ""} ${bloco.italico ? "italic" : ""} ${bloco.sublinhado ? "underline underline-offset-4" : ""} ${destaque}`;
  const estilo = estiloFonteTexto(bloco, 1.38);
  if (bloco.lista) {
    return <ul style={estilo} className={`list-disc space-y-1 pl-5 ${classe}`}>{bloco.texto.split("\n").filter(Boolean).map((item, i) => <li key={i}><TextoComLinks texto={item} /></li>)}</ul>;
  }
  if (bloco.trechos?.length) return <p style={estilo} className={`whitespace-pre-wrap ${classe}`}>{bloco.trechos.map((trecho, i) => <span key={i} style={{ color: trecho.corHex, backgroundColor: trecho.fundoHex }} className={`${trecho.negrito ? "font-bold" : ""} ${trecho.italico ? "italic" : ""} ${trecho.sublinhado ? "underline underline-offset-4" : ""} ${trecho.cor === "verde" ? "text-emerald-700" : trecho.cor === "azul" ? "text-marca-azul" : trecho.cor === "vermelho" ? "text-red-700" : ""} ${trecho.destaque === "verde" ? "bg-emerald-100" : trecho.destaque === "azul" ? "bg-sky-100" : trecho.destaque === "amarelo" ? "bg-amber-200" : ""}`}><TextoComLinks texto={trecho.texto} /></span>)}</p>;
  return <p style={estilo} className={`whitespace-pre-wrap ${classe}`}><TextoComLinks texto={bloco.texto} /></p>;
}

function FotoLeitura({ bloco }: { bloco: Extract<Bloco, { tipo: "foto" }> }) {
  const proporcao = bloco.proporcao === "quadrada" ? "aspect-square" : bloco.proporcao === "retrato" ? "aspect-[3/4]" : bloco.proporcao === "panoramica" ? "aspect-[21/9]" : "aspect-[16/9]";
  return (
    <figure className="h-full overflow-hidden rounded-xl border border-zinc-200 bg-white p-2 shadow-sm">
      <a href={bloco.url} target="_blank" rel="noreferrer" className="relative block overflow-hidden rounded-lg bg-zinc-100">
        {/* eslint-disable-next-line @next/next/no-img-element -- fotos vêm do storage externo */}
        <img
          src={bloco.url}
          alt={bloco.legenda ?? "Foto da visita"}
          className={`${proporcao} w-full ${bloco.ajuste === "conter" ? "object-contain" : "object-cover"} transition duration-300 hover:scale-[1.02]`}
          style={{ objectPosition: `${bloco.focoX ?? 50}% ${bloco.focoY ?? 50}%`, transformOrigin: `${bloco.focoX ?? 50}% ${bloco.focoY ?? 50}%`, transform: `scale(${bloco.zoom ?? 1}) rotate(${bloco.rotacao ?? 0}deg)` }}
        />
        {bloco.anotacoes && bloco.anotacoes.length > 0 && <AnotacoesFotoSvg anotacoes={bloco.anotacoes} razao={razaoDoQuadro(bloco.proporcao)} />}
      </a>
      {bloco.legenda && <figcaption className={`px-2 pb-1 pt-3 leading-5 text-subtle ${classeTextoCurto(bloco.legendaEstilo, false)}`}>{bloco.legenda}</figcaption>}
    </figure>
  );
}

function VisualLeitura({ bloco }: { bloco: BlocoVisual }) {
  if (bloco.tipo === "foto") return <FotoLeitura bloco={bloco} />;
  if (bloco.tipo === "tabela") return <div className="h-full break-inside-avoid rounded-xl border border-zinc-200 bg-white p-5"><TabelaBloco bloco={bloco} /></div>;
  return (
    <div className="h-full break-inside-avoid rounded-xl border border-zinc-200 bg-white p-5">
      <GraficoBloco bloco={bloco} alto={larguraDoBloco(bloco) === "inteira"} />
    </div>
  );
}

// O canvas livre é ideal para editar. Na leitura, ele gerava folhas vazias
// para relatos curtos; esta composição editorial aproveita todo o conteúdo.
export function BlocosRender({
  blocos,
  tipo,
  clienteNome,
  fazendaNome,
  titulo,
  dataVisita,
  consultorNome,
  paginas,
  logoParceiroUrl,
  modoPdf = false,
  semCapa = false,
  safraNome,
  logoParceiroRotulo = "Em parceria com",
  orientacao = "RETRATO",
  logoPrincipalUrl,
  escalaLogoPrincipal = 1,
  logoPrincipalTexto,
  escalaLogoParceiro = 1,
  escalaLogoParceiroPaginas = 1,
  numerosItens,
  moldura,
  visitasTrabalho,
}: BlocosRenderProps) {
  const selo = (id: string, flutuante = false) => <SeloItem numero={numerosItens?.[id]} flutuante={flutuante} />;
  // Na leitura, parágrafo vazio não aparece (no editor ele existe pra ser escrito).
  const secoes = montarLayout(
    blocos.filter((b) => b.tipo !== "texto" || Boolean(b.texto.trim()))
  );
  const quebras = quebrasDePagina(secoes, paginas ?? null);
  const quebraAntes = (id: string) =>
    quebras.antesDoBloco[id] ? <QuebraPagina numero={quebras.antesDoBloco[id]} total={quebras.total} /> : null;
  const tecnico = tipo === "TECNICO";
  const fotoCapa = !semCapa
    ? fotoDeCapa(blocos.filter((bloco): bloco is Extract<Bloco, { tipo: "foto" }> => bloco.tipo === "foto"))
    : null;

  // Mesma proporção da folha A4 (o PDF é impresso com a largura do layout:
  // 1024px no retrato, 1448px na paisagem — ver relatorio-pdf-web.ts).
  const paisagem = orientacao === "PAISAGEM";
  const alturaFolhaPx = paisagem ? 1024 : 1448;
  const rotuloVisita = tecnico ? "Visita técnica" : "Data da visita";
  const rodapeFolha = (
    <div className="flex items-end gap-6 pb-5 pt-6">
      <div className="flex-1">
        <div className="h-2 bg-marca-verde" />
        <div className="h-2 bg-marca-azul" />
      </div>
      <div className="pr-7 sm:pr-12">
        {logoParceiroUrl
          ? <MarcaParceiro url={logoParceiroUrl} rotulo={logoParceiroRotulo} escala={escalaLogoParceiroPaginas} />
          // eslint-disable-next-line @next/next/no-img-element -- logo do storage externo
          : <div style={{ height: 36 * escalaLogoParceiroPaginas }} className="flex max-w-[220px] items-center">{logoPrincipalUrl ? <img src={logoPrincipalUrl} alt="Logo" className="h-full w-auto max-w-full object-contain" /> : <Logo fundo="claro" className="h-full w-auto max-w-full" />}</div>}
      </div>
    </div>
  );
  const subtitulo = [clienteNome, fazendaNome, safraNome ? `Safra ${safraNome}` : null].filter(Boolean).join(" · ");
  const cabecalhoFolha = (
    <>
      <div className="flex flex-wrap items-center justify-between gap-x-10 gap-y-4 px-7 py-6 sm:px-12">
        {/* eslint-disable-next-line @next/next/no-img-element -- logo do storage externo */}
        <div style={{ height: 48 * escalaLogoPrincipal }} className="flex max-w-[40%] items-center">{logoPrincipalUrl ? <img src={logoPrincipalUrl} alt="Logo" className="h-full w-auto max-w-full object-contain" /> : <Logo fundo="claro" className="h-full w-auto max-w-full" />}</div>
        <div className="flex flex-wrap gap-x-14 gap-y-3">
          <CampoCabecalho rotulo="Consultor" valor={consultorNome} />
          <CampoCabecalho rotulo="Safra" valor={safraNome} />
          <CampoCabecalho rotulo={rotuloVisita} valor={dataVisita} />
        </div>
      </div>
      <div className="h-2 bg-marca-verde" />
    </>
  );

  if (moldura === "so") {
    return (
      <div style={{ height: alturaFolhaPx - 2 }} className="flex flex-col justify-between">
        <div data-moldura="cabecalho" className="bg-white">{cabecalhoFolha}</div>
        <div data-moldura="rodape" className="bg-white">{rodapeFolha}</div>
      </div>
    );
  }
  const soConteudo = moldura === "conteudo";

  return (
    <div className="space-y-5">
    {!semCapa && (
      <section
        style={modoPdf ? { height: alturaFolhaPx - 2 } : undefined}
        className={`relative z-10 flex flex-col overflow-hidden bg-white text-marca-azul print:break-after-page print:rounded-none print:shadow-none ${modoPdf ? "break-after-page" : `rounded-2xl border border-zinc-200 shadow-[0_18px_50px_rgba(0,0,0,0.18)] ${paisagem ? "sm:aspect-[297/210]" : "sm:aspect-[210/297]"}`}`}
      >
        <div className="flex items-center justify-between gap-6 px-8 py-7 sm:px-12 sm:py-9">
          <div className="flex min-w-0 items-center gap-6">
          {/* eslint-disable-next-line @next/next/no-img-element -- logo do storage externo */}
          <div style={{ height: 64 * escalaLogoPrincipal }} className="flex max-w-[320px] items-center">{logoPrincipalUrl ? <img src={logoPrincipalUrl} alt="Logo" className="h-full w-auto max-w-full object-contain" /> : <Logo fundo="claro" className="h-full w-auto max-w-full" />}</div>
          {logoPrincipalTexto?.trim() && <TextoMarca texto={logoPrincipalTexto} />}
          </div>
          {logoParceiroUrl && <MarcaParceiro url={logoParceiroUrl} rotulo={logoParceiroRotulo} grande escala={escalaLogoParceiro} />}
        </div>
        <div className="h-3 bg-marca-verde" />
        <div className={`flex flex-1 gap-10 px-8 sm:px-12 ${paisagem ? "items-start pb-10 pt-24" : "flex-col justify-center py-10"}`}>
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-4 text-xs font-bold uppercase tracking-[0.22em] text-emerald-700 sm:text-sm">
              <span className="h-[3px] w-12 bg-marca-verde" />
              {tecnico ? "Dossiê técnico · Relatório de campo" : "Relatório de visita"}
            </p>
            <h1 className={`${paisagem ? "mt-40" : "mt-6"} text-4xl font-bold leading-[1.05] tracking-tight sm:text-6xl`}>
              {titulo || (tecnico ? "Relatório técnico" : "Visita de rotina")}
            </h1>
            {!visitasTrabalho && <p className="mt-6 text-lg text-subtle sm:text-2xl">{subtitulo}</p>}
          </div>
          {fotoCapa?.tipo === "foto" && (
            // eslint-disable-next-line @next/next/no-img-element -- foto do storage externo
            <img
              src={fotoCapa.url}
              alt={fotoCapa.legenda ?? "Foto de capa"}
              style={{ objectPosition: `${fotoCapa.focoX ?? 50}% ${fotoCapa.focoY ?? 50}%` }}
              className={`rounded-xl object-cover ${paisagem ? "aspect-[4/3] w-[42%]" : "aspect-[16/10] w-full"}`}
            />
          )}
        </div>
        <div className="h-3 bg-marca-verde" />
        <div className="h-3 bg-marca-azul" />
        <div className="grid gap-5 px-8 py-7 text-base sm:grid-cols-4 sm:px-12 sm:py-9">
          <CampoCabecalho rotulo="Consultor" valor={consultorNome} />
          <CampoCabecalho rotulo="Safra" valor={safraNome} />
          {visitasTrabalho ? (
            <div className="sm:col-span-2">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-700">Visitas técnicas</p>
              <p className="mt-2 text-lg font-medium text-marca-azul">{visitasTrabalho.length} {visitasTrabalho.length === 1 ? "visita" : "visitas"}</p>
              <p className="text-lg text-marca-azul">{visitasTrabalho.join(" - ")}</p>
            </div>
          ) : (
            <>
              <CampoCabecalho rotulo={rotuloVisita} valor={dataVisita} />
              <CampoCabecalho rotulo="Cliente" valor={clienteNome} />
            </>
          )}
        </div>
      </section>
    )}
    <div className={`overflow-hidden bg-white print:rounded-none print:border-0 print:shadow-none ${modoPdf ? "" : "rounded-2xl border border-zinc-200 shadow-[0_18px_50px_rgba(0,0,0,0.18)]"}`}>
      {/* Tabela só pro Chromium repetir o cabeçalho (thead) e o rodapé (tfoot)
          em toda página interna do PDF; na tela eles aparecem uma vez. */}
      <table className="w-full border-collapse">
        {!soConteudo && (
          <thead>
            <tr><td className="p-0">{cabecalhoFolha}</td></tr>
          </thead>
        )}
        {!soConteudo && (
          <tfoot>
            <tr><td className="p-0">
              {/* Sem moldura separada, o rodapé de verdade é o fixo lá embaixo;
                  este fica invisível só pra reservar o espaço. */}
              <div className={modoPdf ? "invisible" : undefined}>{rodapeFolha}</div>
            </td></tr>
          </tfoot>
        )}
        <tbody>
          <tr><td className="p-0 align-top">
      <div className={`space-y-9 px-7 sm:px-12 ${modoPdf ? (soConteudo ? "py-0" : "pb-2 pt-8") : "py-8 sm:py-10"}`}>
        {semCapa && (
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-marca-azul sm:text-4xl">{titulo || (tecnico ? "Relatório técnico" : "Visita de rotina")}</h1>
            <p className="mt-2 text-subtle">{subtitulo}</p>
          </div>
        )}
        {quebras.total > 1 && <QuebraPagina numero={1} total={quebras.total} />}
        {secoes.map((secao, indice) => (
          <Fragment key={indice}>
            {quebras.antesDaSecao[indice] && (
              <QuebraPagina numero={quebras.antesDaSecao[indice]} total={quebras.total} />
            )}
            {renderSecao(secao, indice)}
          </Fragment>
        ))}
      </div>
          </td></tr>
        </tbody>
      </table>
      {modoPdf && !soConteudo && <div className="fixed inset-x-0 bottom-0 bg-white">{rodapeFolha}</div>}
    </div>
    </div>
  );

  function renderSecao(secao: (typeof secoes)[number], indice: number) {
          if (secao.tipo === "sintese") {
            return (
              <section key="sintese" className={tecnico ? "rounded-xl border border-marca-verde/25 bg-marca-verde/[0.06] p-6" : ""}>
                <Secao>{tituloDaSecao(secao, tecnico)}</Secao>
                <div className="mt-4 space-y-4">
                  {secao.blocos.length > 0 ? secao.blocos.map((bloco) => <Fragment key={bloco.id}>{selo(bloco.id)}<TextoLeitura bloco={bloco} /></Fragment>) : <p className="text-sm italic text-muted">Nenhuma observação registrada.</p>}
                </div>
                <ContinuaNaPagina numero={quebras.continuaEm[secao.blocos.at(-1)?.id ?? ""]} />
              </section>
            );
          }
          if (secao.tipo === "texto") {
            return (
              <section key={indice} className="space-y-4">
                {secao.blocos.map((bloco) => (
                  <Fragment key={bloco.id}>
                    {quebraAntes(bloco.id)}
                    {selo(bloco.id)}
                    <TextoLeitura bloco={bloco} />
                    <ContinuaNaPagina numero={quebras.continuaEm[bloco.id]} />
                  </Fragment>
                ))}
              </section>
            );
          }
          if (secao.tipo === "secao_texto") {
            return (
              <section key={indice}>
                <Secao>{tituloDaSecao(secao, tecnico)}</Secao>
                {secao.secao === "encaminhamentos" ? (
                  <>
                  <ol className="mt-4 break-inside-avoid space-y-2 rounded-xl border border-zinc-200 bg-white p-5">
                    {secao.blocos.map((bloco, i) => (
                      <li key={bloco.id} className="flex gap-3 text-[15px] leading-7 text-zinc-700">
                        {selo(bloco.id)}<span className="font-bold text-marca-verde">{i + 1}.</span>{bloco.texto}
                      </li>
                    ))}
                  </ol>
                  <ContinuaNaPagina numero={quebras.continuaEm[secao.blocos.at(-1)?.id ?? ""]} />
                  </>
                ) : <div className="mt-4 space-y-3">
                  {secao.blocos.map((bloco) => (
                    <Fragment key={bloco.id}>
                      {quebraAntes(bloco.id)}
                      <div className="break-inside-avoid rounded-xl border border-zinc-200 bg-white p-5">
                        {selo(bloco.id)}
                        {bloco.titulo && <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-marca-azul">{bloco.titulo}</h3>}
                        <TextoLeitura bloco={bloco} />
                      </div>
                      <ContinuaNaPagina numero={quebras.continuaEm[bloco.id]} />
                    </Fragment>
                  ))}
                </div>}
              </section>
            );
          }
          if (secao.tipo === "avulso") {
            return (
              <section key={indice} style={{ ...(secao.bloco.margemSuperior ? { marginTop: secao.bloco.margemSuperior } : {}), ...(secao.bloco.margemInferior ? { marginBottom: secao.bloco.margemInferior } : {}) }}>
                {quebraAntes(secao.bloco.id)}
                {selo(secao.bloco.id)}
                <AvulsoLeitura bloco={secao.bloco} />
              </section>
            );
          }
          return (
            <section key={indice}>
              <Secao>{tituloDaSecao(secao, tecnico)}</Secao>
              <div className="mt-4 space-y-5">
                {secao.linhas.map((linha) => (
                  <Fragment key={linha[0].id}>
                    {quebraAntes(linha[0].id)}
                    <div className="grid break-inside-avoid gap-5 sm:grid-cols-6">
                      {linha.map((bloco) => <div key={bloco.id} className={`relative h-full break-inside-avoid ${larguraDoBloco(bloco) === "inteira" ? "sm:col-span-6" : larguraDoBloco(bloco) === "metade" ? "sm:col-span-3" : "sm:col-span-2"}`} style={{ marginTop: bloco.margemSuperior ?? 0, marginBottom: bloco.margemInferior ?? 0 }}>{selo(bloco.id, true)}<VisualLeitura bloco={bloco} /></div>)}
                    </div>
                  </Fragment>
                ))}
              </div>
            </section>
          );
  }
}
