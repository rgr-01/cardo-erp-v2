"use client";
import { usePointerDrag } from "@/components/ui/use-pointer-drag";
import { DialogFrame } from "@/components/ui/dialog-frame";
/* eslint-disable @next/next/no-img-element -- prévias locais usam URLs blob, incompatíveis com next/image */

import { useCallback, useEffect, useId, useMemo, useRef, useState, useTransition } from "react";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useRouter } from "next/navigation";
import { AlignCenter, AlignJustify, AlignLeft, AlignRight, ArrowDown, ArrowUp, ArrowUpRight, BarChart3, Bold, Circle, Copy, Heading, ImagePlus, Italic, List, Minus, Move, Plus, Save, Slash, Sparkles, Square, Table2, Tag, Trash2, Type, Underline, X , Maximize2 , ChevronDown } from "lucide-react";
import { removerLogoRelatorio } from "@/app/actions/configuracoes";
import { atualizarRelatorioVisita, atualizarStatusEditorialRelatorio, criarRelatorioVisita, enviarFotoDoEditor, escolherLogoDaBibliotecaDoEditor, escolherLogoPrincipalDoEditor, importarLogoBiblioteca, listarLogosBiblioteca, removerLogoParceiroDoEditor, restaurarVersaoRelatorio, revisarRelatorioComIa , type RevisaoRelatorio } from "@/app/actions/relatorios-visita";
import { Logo } from "@/components/logo";
import { ComboBox, type ComboBoxOpcao } from "@/components/ui/combo-box";
import { AvulsoLeitura, ESTILO_DESTAQUE, GraficoBloco, classeTextoCurto } from "@/components/visitas/blocos-render";
import { AnotacoesFotoSvg, CamadaAnotar, CORES_ANOTACAO, ESPESSURAS_ANOTACAO, ROTULOS_FORMA, razaoDoQuadro } from "@/components/visitas/anotacoes-foto";
import { dentroDeIframe, fecharJanelaEmbutida, registrarBloqueioDeSaida } from "@/components/visitas/botao-voltar-relatorio";
import { useEmbutido } from "@/components/embutido";
import {
  achatarPaginas, autoLayout, ehBlocoAvulso, excluirPagina as excluirPaginaDoDocumento, fotoDeCapa,
  fotoEmPaginaExclusiva as colocarFotoEmPaginaExclusiva, larguraDoBloco,
  moverBlocosParaPagina, moverPagina as moverPaginaDoDocumento, novoId, reposicionarBlocos,
  separarPaginas, textoDosBlocos, FORMATOS_GRAFICO, ROTULOS_DESTAQUE, ROTULOS_FORMATO, coresPorCategoria,
  type AnotacaoFoto, type Bloco, type BlocoDestaque, type BlocoDivisor, type BlocoGrafico, type BlocoIndicadores, type BlocoTabela,
  type EstiloDivisor, type FormaAnotacao, type FormatoGrafico, type LarguraBloco, type SemGeometria, type TrechoTexto, type VarianteDestaque,
  estiloFonteTexto, FONTES_TEXTO, TAMANHOS_PT, type FonteTexto } from "@/lib/relatorio-conteudo";
import { CATEGORIAS_VISITA } from "@/lib/visitas-categoria";
import { DateInput } from "@/components/ui/date-input";

type Cliente = { id: string; nome: string; fazendas: { id: string; nome: string }[] };
type Rascunho = { tipo: "VISITA" | "TECNICO"; categoria: string; clienteId: string; fazendaId: string; trabalhoId: string; titulo: string; dataVisita: string; mostrarLocalizacao: boolean; mostrarHorarios: boolean; semCapa: boolean; orientacao: "PAISAGEM" | "RETRATO"; escalaLogoPrincipal: number; escalaLogoParceiro: number; escalaLogoPrincipalPaginas: number; escalaLogoParceiroPaginas: number; logoPrincipalTexto: string };
type Aba = "propriedades" | "capa" | "pagina" | "bloco";
type ModoEditor = "padrao" | "ajuste" | "avancado";
type Snapshot = { rascunho: Rascunho; blocos: Bloco[] };
const assinaturaDoSnapshot = (snapshot: Snapshot) => JSON.stringify(snapshot);
// Relatório já salvo aberto para edição: mesmo editor da criação.
export type RelatorioEmEdicao = { id: string; versao: string; rascunho: Rascunho; blocos: Bloco[]; statusDocumento: "RASCUNHO" | "EM_REVISAO" | "APROVADO"; podeAprovar: boolean; versoes: { numero: number; criadoEm: string }[]; logoParceiroUrl: string | null; logoParceiroRotulo: string | null; logoPrincipalUrl: string | null; logosBiblioteca: LogoBiblioteca[] };

// A geometria não é usada na exibição, mas o schema do conteúdo a exige:
// empilha tudo na ordem atual ao salvar.
function comGeometria(blocos: Bloco[]): Bloco[] {
  return autoLayout(blocos.map(({ pagina, x, y, w, h, ...resto }) => { void pagina; void x; void y; void w; void h; return resto as SemGeometria<Bloco>; }));
}

const CHAVE_RASCUNHO = "rede-agro:novo-relatorio:v3";
const CHAVE_LARGURA_PAINEL = "rede-agro:editor-relatorio:painel";
const PAINEL_MIN = 260;
const PAINEL_MAX = 640;
// Espaço acima máximo ao soltar um bloco no vazio (mesmo limite do conteúdo).
const MARGEM_LIVRE_MAX = 600;
const CHAVE_LARGURA_LATERAL = "rede-agro:editor-relatorio:lateral";
const LATERAL_MIN = 110;
const LATERAL_MAX = 320;
const BANCO_RASCUNHO = "rede-agro-relatorios";
const LOJA_FOTOS = "fotos-rascunho";
const campo = "w-full rounded-lg border border-white/10 bg-[#14252d] px-3 py-2 text-sm text-white outline-none focus:border-accent";
const botao = "flex items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-semibold text-zinc-300 hover:border-accent/50 hover:text-white disabled:opacity-40";

function abrirBancoFotos(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const pedido = indexedDB.open(BANCO_RASCUNHO, 1);
    pedido.onupgradeneeded = () => pedido.result.createObjectStore(LOJA_FOTOS, { keyPath: "id" });
    pedido.onsuccess = () => resolve(pedido.result);
    pedido.onerror = () => reject(pedido.error);
  });
}

async function carregarFotosLocais(): Promise<Record<string, File>> {
  const banco = await abrirBancoFotos();
  return new Promise<Record<string, File>>((resolve, reject) => {
    const pedido = banco.transaction(LOJA_FOTOS).objectStore(LOJA_FOTOS).getAll();
    pedido.onsuccess = () => resolve(Object.fromEntries((pedido.result as { id: string; arquivo: File }[]).map((item) => [item.id, item.arquivo])));
    pedido.onerror = () => reject(pedido.error);
  }).finally(() => banco.close());
}

async function salvarFotosLocais(fotos: Record<string, File>) {
  const banco = await abrirBancoFotos();
  await new Promise<void>((resolve, reject) => {
    const transacao = banco.transaction(LOJA_FOTOS, "readwrite");
    const loja = transacao.objectStore(LOJA_FOTOS);
    loja.clear();
    Object.entries(fotos).forEach(([id, arquivo]) => loja.put({ id, arquivo }));
    transacao.oncomplete = () => resolve();
    transacao.onerror = () => reject(transacao.error);
  });
  banco.close();
}

function novoTexto(novaPagina = false): Bloco {
  return autoLayout([{ id: novoId(), tipo: "texto", texto: "", novaPagina } as SemGeometria<Bloco>])[0];
}

function novoGrafico(): BlocoGrafico {
  return autoLayout([{ id: novoId(), tipo: "grafico", titulo: "Novo gráfico", formato: "barra", series: ["Valor"], linhas: [{ rotulo: "Item 1", valores: [0] }, { rotulo: "Item 2", valores: [0] }] } as SemGeometria<Bloco>])[0] as BlocoGrafico;
}

function novaTabela(): BlocoTabela {
  return autoLayout([{ id: novoId(), tipo: "tabela", titulo: "Tabela de indicadores", cabecalhos: ["Indicador", "Valor", "Unidade"], linhas: [["", "", ""], ["", "", ""]] } as SemGeometria<Bloco>])[0] as BlocoTabela;
}

function novoDestaque(variante: VarianteDestaque): BlocoDestaque {
  return autoLayout([{ id: novoId(), tipo: "destaque", variante, titulo: null, texto: "" } as SemGeometria<Bloco>])[0] as BlocoDestaque;
}

function novosIndicadores(): BlocoIndicadores {
  return autoLayout([{ id: novoId(), tipo: "indicadores", itens: [{ valor: "", rotulo: "Indicador 1" }, { valor: "", rotulo: "Indicador 2" }, { valor: "", rotulo: "Indicador 3" }] } as SemGeometria<Bloco>])[0] as BlocoIndicadores;
}

function novoDivisor(estilo: EstiloDivisor): BlocoDivisor {
  return autoLayout([{ id: novoId(), tipo: "divisor", estilo } as SemGeometria<Bloco>])[0] as BlocoDivisor;
}

type ModeloDocumento = "vistoria" | "acompanhamento" | "resultado";
function blocosDoModelo(modelo: ModeloDocumento): Bloco[] {
  const textos: Record<ModeloDocumento, string[]> = {
    vistoria: ["Objetivo da visita", "Condições observadas", "Recomendações e próximos passos"],
    acompanhamento: ["Resumo do acompanhamento", "Desenvolvimento da cultura", "Riscos, manejo e próximos passos"],
    resultado: ["Objetivo e método", "Resultados e indicadores", "Conclusão técnica"],
  };
  return autoLayout(textos[modelo].map((texto, indice) => ({
    id: novoId(), tipo: "texto", texto: indice === 0 ? texto : `${texto}\n`, subtitulo: indice === 0,
    ...(indice === 1 && modelo === "resultado" ? { novaPagina: true } : {}),
  } as SemGeometria<Bloco>)));
}

// Reordena sem levar a quebra junto com o quadro. A quebra pertence à página:
// ao atravessar uma divisória, o quadro entra na folha de destino e as demais
// folhas continuam existindo com os seus conteúdos.
function classeLargura(bloco: Bloco): string {
  if (bloco.tipo === "texto" || ehBlocoAvulso(bloco) || larguraDoBloco(bloco) === "inteira") return "col-span-6";
  return larguraDoBloco(bloco) === "metade" ? "col-span-3" : "col-span-2";
}

function proporcaoFoto(bloco: Extract<Bloco, { tipo: "foto" }>): string {
  if (bloco.proporcao === "quadrada") return "aspect-square";
  if (bloco.proporcao === "retrato") return "aspect-[3/4]";
  if (bloco.proporcao === "panoramica") return "aspect-[21/9]";
  return "aspect-[16/9]";
}

export function NovoRelatorioEditor({ clientes, trabalhos, consultorNome, safraNome, hoje, tipoInicial, trabalhoInicial, storageConfigurado, edicao }: {
  clientes: Cliente[]; trabalhos: { id: string; nome: string }[]; consultorNome: string; safraNome?: string | null; hoje: string;
  tipoInicial: "VISITA" | "TECNICO"; trabalhoInicial: string; storageConfigurado: boolean; edicao?: RelatorioEmEdicao;
}) {
  const { confirmar, avisar } = useConfirm();
  const router = useRouter();
  const gestoEditor = usePointerDrag();
  const embutido = useEmbutido();
  // Conta quantas vezes a IA revisou cada bloco: remonta o editor de texto (que
  // é contentEditable e não acompanha mudanças de fora) pra mostrar o texto novo.
  const [revisoes] = useState<Record<string, number>>({});
  const [revisaoAberta, setRevisaoAberta] = useState(false);
  // Anotações sobre a foto selecionada (círculo, seta, linha...): forma em uso, cor, espessura e a marcação escolhida.
  const [ferramentaAnotar, setFerramentaAnotar] = useState<FormaAnotacao | null>(null);
  const [corAnotar, setCorAnotar] = useState(CORES_ANOTACAO[0].cor);
  const [espessuraAnotar, setEspessuraAnotar] = useState(4);
  const [anotacaoSelecionada, setAnotacaoSelecionada] = useState<string | null>(null);
  const [donoAnotar, setDonoAnotar] = useState<string | null>(null);
  const [rascunho, setRascunho] = useState<Rascunho>(edicao?.rascunho ?? { tipo: tipoInicial, categoria: tipoInicial === "TECNICO" ? "TECNICA" : "COMERCIAL", clienteId: "", fazendaId: "", trabalhoId: trabalhoInicial, titulo: "", dataVisita: hoje, mostrarLocalizacao: true, mostrarHorarios: true, semCapa: false, orientacao: "PAISAGEM", escalaLogoPrincipal: 1, escalaLogoParceiro: 1, escalaLogoPrincipalPaginas: 1, escalaLogoParceiroPaginas: 1, logoPrincipalTexto: "" });
  const blocoInicialId = useId().replaceAll(":", "_");
  const [blocos, setBlocos] = useState<Bloco[]>(() => edicao?.blocos ?? autoLayout([{ id: `bloco-${blocoInicialId}`, tipo: "texto", texto: "", novaPagina: false } as SemGeometria<Bloco>]));
  const [selecionadoId, setSelecionadoId] = useState<string | null>(null);
  const [selecionadosIds, setSelecionadosIds] = useState<string[]>([]);
  const [aba, setAba] = useState<Aba>("capa");
  // O documento nasce organizado. Os modos seguintes liberam ajustes sem
  // retirar as margens e a grade que protegem a fidelidade do PDF.
  const [modoEditor, setModoEditor] = useState<ModoEditor>("padrao");
  const [statusDocumento, setStatusDocumento] = useState(edicao?.statusDocumento ?? "RASCUNHO");
  const [alterandoStatus, setAlterandoStatus] = useState(false);
  const [redimensionamento, setRedimensionamento] = useState<{ id: string; largura: LarguraBloco } | null>(null);
  const [arquivosFotos, setArquivosFotos] = useState<Record<string, File>>({});
  const [arrastandoId, setArrastandoId] = useState<string | null>(null);
  // Arraste livre pelo puxador ✥: deslocamento vertical do bloco enquanto segura.
  const [arrasteLivre, setArrasteLivre] = useState<{ id: string; dy: number } | null>(null);
  const [destinoArraste, setDestinoArraste] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [salvoLocalmente, setSalvoLocalmente] = useState(!!edicao);
  const [rascunhoCarregado, setRascunhoCarregado] = useState(!!edicao);
  const [enviandoFotos, setEnviandoFotos] = useState(0);
  const [larguraPainel, setLarguraPainel] = useState(280);
  const [larguraLateral, setLarguraLateral] = useState(132);
  // Miniatura sendo arrastada na lateral e onde ela vai cair.
  const [paginaArrastada, setPaginaArrastada] = useState<number | null>(null);
  const [destinoPagina, setDestinoPagina] = useState<number | null>(null);
  const [gerandoPrevia, setGerandoPrevia] = useState(false);
  const [urlPrevia, setUrlPrevia] = useState<string | null>(null);
  const [previaAproximada, setPreviaAproximada] = useState(false);
  const [estadoSalvamento, setEstadoSalvamento] = useState<"salvo" | "alterado" | "salvando" | "erro" | "conflito">("salvo");
  const [pendente, startTransition] = useTransition();
  const desfazer = useRef<Snapshot[]>([]);
  const refazer = useRef<Snapshot[]>([]);
  const ultimaEntradaHistorico = useRef<{ chave: string; timer: number } | null>(null);
  const urlsTemporarias = useRef<string[]>([]);
  const inputFotos = useRef<HTMLInputElement>(null);
  const versaoServidor = useRef<string | null>(edicao?.versao ?? null);
  const assinaturaSalva = useRef(edicao ? assinaturaDoSnapshot({ rascunho: edicao.rascunho, blocos: edicao.blocos }) : "");
  const estadoAtual = useRef<Snapshot>({ rascunho, blocos });
  const filaSalvamento = useRef<Promise<void>>(Promise.resolve());
  const salvamentosPorAssinatura = useRef(new Map<string, Promise<boolean>>());
  const gravacoesPendentes = useRef(0);
  const salvamentoBloqueado = useRef(false);
  const falhaSalvamento = useRef(false);
  useEffect(() => { estadoAtual.current = { rascunho, blocos }; }, [rascunho, blocos]);

  useEffect(() => {
    if (edicao) return;
    try {
      const salvo = localStorage.getItem(CHAVE_RASCUNHO);
      if (!salvo) {
        window.setTimeout(() => setRascunhoCarregado(true), 0);
        return;
      }
      const valor = JSON.parse(salvo) as { rascunho?: Partial<Rascunho>; blocos?: Bloco[] };
      carregarFotosLocais().then((fotosSalvas) => window.setTimeout(() => {
        const rascunhoSalvo = valor.rascunho;
        if (rascunhoSalvo) setRascunho((atual) => ({ ...atual, ...rascunhoSalvo, categoria: CATEGORIAS_VISITA.some((item) => item.id === rascunhoSalvo.categoria) ? rascunhoSalvo.categoria! : atual.categoria }));
        if (valor.blocos?.length) {
          const hidratados: Bloco[] = [];
          for (const bloco of valor.blocos) {
            if (bloco.tipo !== "foto") {
              hidratados.push(bloco);
              continue;
            }
            const arquivo = fotosSalvas[bloco.id];
            if (!arquivo) continue;
            const url = URL.createObjectURL(arquivo);
            urlsTemporarias.current.push(url);
            hidratados.push({ ...bloco, url, path: null });
          }
          setBlocos(hidratados);
          setArquivosFotos(fotosSalvas);
        }
        setRascunhoCarregado(true);
      }, 0)).catch(() => window.setTimeout(() => setRascunhoCarregado(true), 0));
    } catch {
      window.setTimeout(() => setRascunhoCarregado(true), 0);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- lê o rascunho local só na montagem
  }, []);

  useEffect(() => {
    if (!rascunhoCarregado || edicao) return;
    const timer = window.setTimeout(() => {
      localStorage.setItem(CHAVE_RASCUNHO, JSON.stringify({
        rascunho,
        blocos: blocos.map((bloco) => bloco.tipo === "foto" ? { ...bloco, url: `rascunho:${bloco.id}`, path: null } : bloco),
      }));
      setSalvoLocalmente(true);
    }, 600);
    return () => window.clearTimeout(timer);
  }, [rascunho, blocos, rascunhoCarregado, edicao]);
  useEffect(() => {
    if (!rascunhoCarregado || edicao) return;
    const timer = window.setTimeout(() => {
      const idsAtivos = new Set(blocos.filter((bloco) => bloco.tipo === "foto").map((bloco) => bloco.id));
      salvarFotosLocais(Object.fromEntries(Object.entries(arquivosFotos).filter(([id]) => idsAtivos.has(id)))).catch(() => {});
    }, 600);
    return () => window.clearTimeout(timer);
  }, [arquivosFotos, blocos, rascunhoCarregado, edicao]);
  useEffect(() => {
    try {
      const salva = Number(localStorage.getItem(CHAVE_LARGURA_PAINEL));
      if (salva >= PAINEL_MIN && salva <= PAINEL_MAX) window.setTimeout(() => setLarguraPainel(salva), 0);
      const lateral = Number(localStorage.getItem(CHAVE_LARGURA_LATERAL));
      if (lateral >= LATERAL_MIN && lateral <= LATERAL_MAX) window.setTimeout(() => setLarguraLateral(lateral), 0);
    } catch { /* sem armazenamento: fica no padrão */ }
  }, []);
  function arrastarPainel(evento: React.PointerEvent<HTMLDivElement>) {
    evento.preventDefault();
    const inicioX = evento.clientX;
    const inicioLargura = larguraPainel;
    let atual = inicioLargura;
    gestoEditor.iniciar(evento, {
      mover: e => {
        atual = Math.min(PAINEL_MAX, Math.max(PAINEL_MIN, inicioLargura + inicioX - e.clientX));
        setLarguraPainel(atual);
      },
      concluir: () => { try { localStorage.setItem(CHAVE_LARGURA_PAINEL, String(atual)); } catch { /* armazenamento indisponível */ } },
      cancelar: () => setLarguraPainel(inicioLargura),
    });
  }
  function arrastarLateral(evento: React.PointerEvent<HTMLDivElement>) {
    evento.preventDefault();
    const inicioX = evento.clientX;
    const inicioLargura = larguraLateral;
    let atual = inicioLargura;
    gestoEditor.iniciar(evento, {
      mover: e => {
        atual = Math.min(LATERAL_MAX, Math.max(LATERAL_MIN, inicioLargura + e.clientX - inicioX));
        setLarguraLateral(atual);
      },
      concluir: () => { try { localStorage.setItem(CHAVE_LARGURA_LATERAL, String(atual)); } catch { /* armazenamento indisponível */ } },
      cancelar: () => setLarguraLateral(inicioLargura),
    });
  }
  // Solta a página arrastada na posição `destino` (passo a passo, reaproveitando
  // a mesma regra de mover uma página pra cima/baixo).
  function soltarPagina(origem: number, destino: number) {
    if (origem === destino) return;
    mudarBlocos((atuais) => {
      let resultado = atuais;
      const passo = destino > origem ? 1 : -1;
      for (let i = origem; i !== destino; i += passo) resultado = moverPaginaDoDocumento(resultado, i, passo);
      return resultado;
    });
  }
  useEffect(() => () => urlsTemporarias.current.forEach((url) => URL.revokeObjectURL(url)), []);
  useEffect(() => () => { if (urlPrevia) URL.revokeObjectURL(urlPrevia); }, [urlPrevia]);

  const cliente = clientes.find((item) => item.id === rascunho.clienteId);
  const fazendas = cliente?.fazendas ?? [];
  const fazenda = fazendas.find((item) => item.id === rascunho.fazendaId);
  const selecionado = blocos.find((bloco) => bloco.id === selecionadoId) ?? null;
  // A forma e a marcação escolhidas valem só para a foto em que foram escolhidas:
  // trocar de bloco encerra o modo de desenho (sem precisar zerar o estado).
  const anotarValeAqui = donoAnotar === selecionadoId;
  const ferramentaAtiva = anotarValeAqui ? ferramentaAnotar : null;
  const anotacaoAtiva = anotarValeAqui ? anotacaoSelecionada : null;
  const definirFerramenta = (forma: FormaAnotacao | null) => { setDonoAnotar(selecionadoId); setFerramentaAnotar(forma); };
  const definirAnotacao = (id: string | null) => { setDonoAnotar(selecionadoId); setAnotacaoSelecionada(id); };
  const fotosDocumento = blocos.filter((bloco): bloco is Extract<Bloco, { tipo: "foto" }> => bloco.tipo === "foto");
  const fotoCapa = fotoDeCapa(fotosDocumento);
  const capaSemFoto = fotosDocumento.length > 0 && fotoCapa === null;
  const opcoesClientes: ComboBoxOpcao[] = useMemo(() => clientes.map((item) => ({ id: item.id, label: item.nome })), [clientes]);
  const opcoesFazendas: ComboBoxOpcao[] = [{ id: "", label: "Sem fazenda" }, ...fazendas.map((item) => ({ id: item.id, label: item.nome }))];
  const [logoParceiro, setLogoParceiro] = useState<{ url: string; rotulo: string | null } | null>(
    edicao?.logoParceiroUrl ? { url: edicao.logoParceiroUrl, rotulo: edicao.logoParceiroRotulo } : null
  );
  const paisagem = rascunho.orientacao === "PAISAGEM";
  const [seletorLogo, setSeletorLogo] = useState<"principal" | "parceiro" | null>(null);
  const [logoPrincipal, setLogoPrincipal] = useState<string | null>(edicao?.logoPrincipalUrl ?? null);
  const [biblioteca, setBiblioteca] = useState<LogoBiblioteca[]>(edicao?.logosBiblioteca ?? []);
  // Relatório ainda não salvo: a escolha fica aqui e vai junto na criação.
  const logosPendentes = useRef<{ parceiro?: string; principal?: string }>({});
  // Relatório novo não traz a biblioteca do servidor: busca ao abrir.
  useEffect(() => {
    if (!edicao) listarLogosBiblioteca().then(setBiblioteca).catch(() => {});
  }, [edicao]);
  async function excluirDaBiblioteca(logo: LogoBiblioteca) {
    if (!(await confirmar({ mensagem: `Apagar "${logo.nome}" da lista de logos? Os relatórios que já usam continuam com ela.`, confirmarLabel: "Apagar", variante: "perigo" }))) return;
    const resultado = await removerLogoRelatorio(logo.id);
    if (!resultado.ok) return void avisar(resultado.erro);
    setBiblioteca((atuais) => atuais.filter((item) => item.id !== logo.id));
  }
  const aoImportarLogo = (logo: LogoBiblioteca) => setBiblioteca((atuais) => [...atuais, logo].sort((a, b) => a.nome.localeCompare(b.nome)));
  const paginasEditor = useMemo(() => {
    const paginas = separarPaginas(blocos);
    return paginas.length > 0 ? paginas : [[]];
  }, [blocos]);
  const paginaSelecionada = Math.max(0, paginasEditor.findIndex((pagina) => pagina.some((bloco) => bloco.id === selecionadoId)));

  function guardarHistorico(chaveContinua?: string) {
    const ultima = ultimaEntradaHistorico.current;
    const agrupar = Boolean(chaveContinua && ultima?.chave === chaveContinua);
    if (!agrupar) {
      desfazer.current.push({ rascunho, blocos });
      if (desfazer.current.length > 80) desfazer.current.shift();
    }
    if (ultima) window.clearTimeout(ultima.timer);
    if (chaveContinua) {
      const entrada = {
        chave: chaveContinua,
        timer: window.setTimeout(() => {
          if (ultimaEntradaHistorico.current === entrada) ultimaEntradaHistorico.current = null;
        }, 750),
      };
      ultimaEntradaHistorico.current = entrada;
    } else {
      ultimaEntradaHistorico.current = null;
    }
    refazer.current = [];
    setSalvoLocalmente(false);
    if (edicao && !salvamentoBloqueado.current) setEstadoSalvamento("alterado");
  }
  function alterar(mudanca: Partial<Rascunho>) { guardarHistorico(`rascunho:${Object.keys(mudanca).sort().join(",")}`); setRascunho((atual) => ({ ...atual, ...mudanca })); }
  async function aplicarModelo(modelo: ModeloDocumento) {
    if (blocos.length && !(await confirmar({ mensagem: "Aplicar este modelo substitui os blocos atuais do relatório. Deseja continuar?", confirmarLabel: "Substituir conteúdo" }))) return;
    guardarHistorico();
    setBlocos(blocosDoModelo(modelo));
    setSelecionadoId(null); setSelecionadosIds([]); setAba("bloco");
  }
  async function alterarStatusDocumento(proximo: "RASCUNHO" | "EM_REVISAO" | "APROVADO") {
    if (!edicao || proximo === statusDocumento) return;
    setAlterandoStatus(true); setErro(null);
    const resultado = await atualizarStatusEditorialRelatorio(edicao.id, proximo);
    setAlterandoStatus(false);
    if (!resultado.ok) { setErro(resultado.erro); return; }
    setStatusDocumento(proximo);
  }
  function mudarBlocos(fn: (atuais: Bloco[]) => Bloco[], chaveContinua?: string) { guardarHistorico(chaveContinua); setBlocos(fn); }
  function restaurar(snapshot: Snapshot) { ultimaEntradaHistorico.current = null; setRascunho(snapshot.rascunho); setBlocos(snapshot.blocos); setSelecionadoId(null); setSelecionadosIds([]); setSalvoLocalmente(false); if (edicao && !salvamentoBloqueado.current) setEstadoSalvamento("alterado"); }
  function voltarHistorico() { const anterior = desfazer.current.pop(); if (!anterior) return; refazer.current.push({ rascunho, blocos }); restaurar(anterior); }
  function avancarHistorico() { const proximo = refazer.current.pop(); if (!proximo) return; desfazer.current.push({ rascunho, blocos }); restaurar(proximo); }
  useEffect(() => {
    function aplicarAtalho(evento: KeyboardEvent) {
      if (!(evento.ctrlKey || evento.metaKey) || evento.altKey) return;
      const alvo = evento.target;
      if (alvo instanceof HTMLElement && (alvo.isContentEditable || alvo.matches("input, textarea, select"))) return;
      const tecla = evento.key.toLowerCase();
      const querDesfazer = tecla === "z" && !evento.shiftKey;
      const querRefazer = tecla === "y" || (tecla === "z" && evento.shiftKey);
      if (!querDesfazer && !querRefazer) return;

      const atual = estadoAtual.current;
      const destino = querDesfazer ? desfazer.current.pop() : refazer.current.pop();
      if (!destino) return;
      evento.preventDefault();
      ultimaEntradaHistorico.current = null;
      if (querDesfazer) refazer.current.push(atual);
      else desfazer.current.push(atual);
      setRascunho(destino.rascunho);
      setBlocos(destino.blocos);
      setSelecionadoId(null);
      setSelecionadosIds([]);
      setSalvoLocalmente(false);
    }
    window.addEventListener("keydown", aplicarAtalho);
    return () => window.removeEventListener("keydown", aplicarAtalho);
  }, []);
  function atualizarBloco(novo: Bloco) { mudarBlocos((atuais) => atuais.map((bloco) => bloco.id === novo.id ? novo : bloco), `bloco:${novo.id}`); }
  function inserir(bloco: Bloco) {
    mudarBlocos((atuais) => { const indice = selecionadoId ? atuais.findIndex((item) => item.id === selecionadoId) : atuais.length - 1; return [...atuais.slice(0, indice + 1), bloco, ...atuais.slice(indice + 1)]; });
    setSelecionadoId(bloco.id); setAba("bloco");
  }
  function inserirDepois(alvoId: string, bloco: Bloco) {
    mudarBlocos((atuais) => {
      const indice = atuais.findIndex((item) => item.id === alvoId);
      return [...atuais.slice(0, indice + 1), bloco, ...atuais.slice(indice + 1)];
    });
    setSelecionadoId(bloco.id); setAba("bloco");
  }
  function mover(id: string, direcao: -1 | 1) {
    mudarBlocos((atuais) => {
      const indice = atuais.findIndex((bloco) => bloco.id === id);
      const alvo = atuais[indice + direcao];
      return indice < 0 || !alvo ? atuais : reposicionarBlocos(atuais, [id], alvo.id, direcao > 0);
    });
  }
  function remover(id: string) { mudarBlocos((atuais) => atuais.filter((bloco) => bloco.id !== id)); setSelecionadoId(null); setSelecionadosIds((ids) => ids.filter((item) => item !== id)); }
  function duplicar(bloco: Bloco) {
    const copia = { ...bloco, id: novoId(), novaPagina: false } as Bloco;
    if (bloco.tipo === "foto" && arquivosFotos[bloco.id]) {
      setArquivosFotos((atuais) => ({ ...atuais, [copia.id]: arquivosFotos[bloco.id] }));
    }
    inserirDepois(bloco.id, copia);
  }
  function aplicarLayoutGaleria(quantidade: 1 | 2 | 3 | 4 | 6) {
    const fotos = blocos.filter((bloco): bloco is Extract<Bloco, { tipo: "foto" }> => selecionadosIds.includes(bloco.id) && bloco.tipo === "foto");
    if (!fotos.length) return;
    const ids = new Set(fotos.slice(0, quantidade).map((foto) => foto.id));
    const largura: LarguraBloco = quantidade === 1 ? "inteira" : quantidade === 2 || quantidade === 4 ? "metade" : "terco";
    mudarBlocos((atuais) => atuais.map((bloco) => ids.has(bloco.id) && bloco.tipo === "foto" ? { ...bloco, largura } : bloco));
  }
  function fotoEmPaginaExclusiva(id: string) {
    mudarBlocos((atuais) => colocarFotoEmPaginaExclusiva(atuais, id));
  }
  function duplicarPagina(indicePagina: number) {
    const origem = paginasEditor[indicePagina];
    if (!origem?.length) return;
    const copias = origem.map((bloco) => ({ ...bloco, id: novoId(), novaPagina: false, ...(bloco.tipo === "foto" ? { capa: false } : {}) } as Bloco));
    setArquivosFotos((atuais) => {
      const proximos = { ...atuais };
      origem.forEach((bloco, indice) => {
        if (bloco.tipo === "foto" && atuais[bloco.id]) proximos[copias[indice].id] = atuais[bloco.id];
      });
      return proximos;
    });
    mudarBlocos((atuais) => {
      const paginas = separarPaginas(atuais).map((pagina) => [...pagina]);
      paginas.splice(indicePagina + 1, 0, copias);
      return achatarPaginas(paginas);
    });
    setSelecionadoId(copias[0].id);
    setSelecionadosIds([copias[0].id]);
  }
  function excluirPagina(indicePagina: number) {
    mudarBlocos((atuais) => excluirPaginaDoDocumento(atuais, indicePagina, novoTexto));
    setSelecionadoId(null);
    setSelecionadosIds([]);
  }
  function moverPagina(indicePagina: number, direcao: -1 | 1) {
    mudarBlocos((atuais) => moverPaginaDoDocumento(atuais, indicePagina, direcao));
  }
  function organizarDocumento() {
    // Mantém o conteúdo e as páginas que o consultor criou, mas remove os
    // espaçamentos manuais. A grade volta a preencher cada página na ordem do
    // documento, sem alterar dados nem o conteúdo do PDF.
    mudarBlocos((atuais) => achatarPaginas(
      separarPaginas(atuais).map((pagina) => pagina.map((bloco) => ({
        ...bloco,
        margemSuperior: undefined,
        margemInferior: undefined,
      } as Bloco))),
    ));
  }
  function iniciarRedimensionamento(evento: React.PointerEvent<HTMLButtonElement>, bloco: Extract<Bloco, { tipo: "foto" | "grafico" | "tabela" }>) {
    if (modoEditor === "padrao") return;
    evento.preventDefault();
    evento.stopPropagation();
    const inicioX = evento.clientX;
    const larguraInicial = larguraDoBloco(bloco);
    const niveis: LarguraBloco[] = ["terco", "metade", "inteira"];
    const indiceInicial = niveis.indexOf(larguraInicial);
    let proposta = larguraInicial;
    const iniciado = gestoEditor.iniciar(evento, {
      mover: movimento => {
        const passos = Math.max(-1, Math.min(1, Math.round((movimento.clientX - inicioX) / 130)));
        proposta = niveis[Math.max(0, Math.min(niveis.length - 1, indiceInicial + passos))];
        setRedimensionamento(atual => atual?.id === bloco.id && atual.largura === proposta ? atual : { id: bloco.id, largura: proposta });
      },
      concluir: () => {
        setRedimensionamento(null);
        if (proposta !== larguraInicial) atualizarBloco({ ...bloco, largura: proposta });
      },
      cancelar: () => setRedimensionamento(null),
    });
    if (iniciado) setRedimensionamento({ id: bloco.id, largura: proposta });
  }
  // Segurar o ✥ e arrastar: o bloco acompanha o mouse. Solto sobre outro bloco,
  // entra antes/depois dele; solto no vazio, fica ali (vira espaço acima).
  function iniciarArrasteLivre(evento: React.PointerEvent, bloco: Bloco) {
    evento.preventDefault();
    evento.stopPropagation();
    const inicioY = evento.clientY;
    const margemInicial = bloco.margemSuperior ?? 0;
    let dy = 0;
    const limpar = () => {
      document.documentElement.classList.remove("arrastando-livre");
      setArrasteLivre(null);
    };
    const iniciado = gestoEditor.iniciar(evento, {
      mover: e => { dy = e.clientY - inicioY; setArrasteLivre({ id: bloco.id, dy }); },
      concluir: e => {
        limpar();
        if (Math.abs(dy) < 4) return;
        const alvo = document.elementsFromPoint(e.clientX, e.clientY)
          .map(el => el.closest<HTMLElement>("[data-bloco-relatorio]"))
          .find(el => el && el.dataset.blocoRelatorio !== bloco.id);
        if (alvo?.dataset.blocoRelatorio) {
          const area = alvo.getBoundingClientRect();
          mudarBlocos(atuais => reposicionarBlocos(atuais, [bloco.id], alvo.dataset.blocoRelatorio!, e.clientY > area.top + area.height / 2));
        } else {
          atualizarBloco({ ...bloco, margemSuperior: Math.round(Math.min(MARGEM_LIVRE_MAX, Math.max(0, margemInicial + dy))) } as Bloco);
        }
      },
      cancelar: limpar,
    });
    if (iniciado) {
      setSelecionadoId(bloco.id);
      document.documentElement.classList.add("arrastando-livre");
    }
  }
  function soltarNoAlvo(alvoId: string, depois: boolean) {
    if (arrastandoId && arrastandoId !== alvoId) {
      const grupo = selecionadosIds.includes(arrastandoId) ? selecionadosIds : [arrastandoId];
      mudarBlocos((atuais) => reposicionarBlocos(atuais, grupo, alvoId, depois));
    }
    setArrastandoId(null);
    setDestinoArraste(null);
  }
  function soltarNaPagina(indicePagina: number) {
    if (arrastandoId) {
      const grupo = selecionadosIds.includes(arrastandoId) ? selecionadosIds : [arrastandoId];
      mudarBlocos((atuais) => moverBlocosParaPagina(atuais, grupo, indicePagina));
    }
    setArrastandoId(null);
    setDestinoArraste(null);
  }
  function alvoHorizontalNaPagina(areaPagina: HTMLDivElement, x: number, y: number) {
    const idsArrastados = new Set(arrastandoId && selecionadosIds.includes(arrastandoId) ? selecionadosIds : arrastandoId ? [arrastandoId] : []);
    const candidatos = Array.from(areaPagina.querySelectorAll<HTMLElement>("[data-bloco-relatorio]"))
      .map((elemento) => ({ id: elemento.dataset.blocoRelatorio!, area: elemento.getBoundingClientRect() }))
      .filter((item) => y >= item.area.top - 12 && y <= item.area.bottom + 12 && !idsArrastados.has(item.id));
    if (!candidatos.length) return null;
    const maisProximo = candidatos.reduce((melhor, item) =>
      Math.abs(x - (item.area.left + item.area.width / 2)) < Math.abs(x - (melhor.area.left + melhor.area.width / 2)) ? item : melhor,
    );
    return { id: maisProximo.id, depois: x >= maisProximo.area.left + maisProximo.area.width / 2 };
  }
  function selecionarBloco(evento: React.MouseEvent, id: string) {
    if (evento.ctrlKey || evento.metaKey || evento.shiftKey) {
      setSelecionadosIds((atuais) => atuais.includes(id) ? atuais.filter((item) => item !== id) : [...atuais, id]);
    } else {
      setSelecionadosIds([id]);
    }
    setSelecionadoId(id);
    setAba("bloco");
  }
  function excluirSelecionados() {
    const ids = new Set(selecionadosIds);
    if (!ids.size) return;
    mudarBlocos((atuais) => atuais.filter((bloco) => !ids.has(bloco.id)));
    setSelecionadoId(null);
    setSelecionadosIds([]);
  }
  async function enviarFotosDaEdicao(lista: FileList) {
    if (!edicao) return;
    setErro(null);
    const arquivos = Array.from(lista);
    setEnviandoFotos(arquivos.length);
    const novas: Bloco[] = [];
    for (const arquivo of arquivos) {
      const fd = new FormData();
      fd.append("foto", arquivo);
      const resultado = await enviarFotoDoEditor(edicao.id, fd);
      if (resultado.ok) novas.push(autoLayout([{ id: novoId(), tipo: "foto", url: resultado.url, path: resultado.path, legenda: null, largura: "metade", ajuste: "cobrir" } as SemGeometria<Bloco>])[0]);
      else setErro(resultado.erro);
      setEnviandoFotos((n) => n - 1);
    }
    if (novas.length) {
      guardarHistorico();
      setBlocos((atuais) => { const indice = selecionadoId ? atuais.findIndex((item) => item.id === selecionadoId) : atuais.length - 1; return [...atuais.slice(0, indice + 1), ...novas, ...atuais.slice(indice + 1)]; });
      setSelecionadoId(novas[0].id); setAba("bloco");
    }
    if (inputFotos.current) inputFotos.current.value = "";
  }
  function adicionarFotos(lista: FileList) {
    if (edicao) { void enviarFotosDaEdicao(lista); return; }
    const novas: Bloco[] = []; const novosArquivos: Record<string, File> = {};
    for (const arquivo of Array.from(lista).slice(0, 8 - Object.keys(arquivosFotos).length)) {
      const id = novoId(); const url = URL.createObjectURL(arquivo); urlsTemporarias.current.push(url); novosArquivos[id] = arquivo;
      novas.push(autoLayout([{ id, tipo: "foto", url, path: null, legenda: null, largura: "metade", ajuste: "cobrir" } as SemGeometria<Bloco>])[0]);
    }
    if (!novas.length) return;
    guardarHistorico(); setArquivosFotos((atuais) => ({ ...atuais, ...novosArquivos }));
    setBlocos((atuais) => { const indice = selecionadoId ? atuais.findIndex((item) => item.id === selecionadoId) : atuais.length - 1; return [...atuais.slice(0, indice + 1), ...novas, ...atuais.slice(indice + 1)]; });
    setSelecionadoId(novas[0].id); setAba("bloco");
  }
  function dadosDoDocumento() {
    const fotos = blocos.filter((bloco) => bloco.tipo === "foto");
    if (!edicao && fotos.some((foto) => !arquivosFotos[foto.id])) throw new Error("Adicione novamente uma foto que não está mais disponível.");
    const fd = new FormData();
    Object.entries(rascunho).forEach(([chave, valor]) => fd.set(chave, typeof valor === "boolean" ? (valor ? "1" : "0") : String(valor)));
    if (logosPendentes.current.parceiro) fd.set("logoParceiroId", logosPendentes.current.parceiro);
    if (logosPendentes.current.principal) fd.set("logoPrincipalId", logosPendentes.current.principal);
    fd.set("texto", textoDosBlocos(blocos));
    fd.set("conteudo", JSON.stringify(blocos));
    fd.set("clienteNome", cliente?.nome ?? "Cliente não selecionado");
    fd.set("fazendaNome", fazenda?.nome ?? "");
    if (edicao) fd.set("relatorioId", edicao.id);
    fotos.filter((foto) => arquivosFotos[foto.id]).forEach((foto) => fd.append("fotos", arquivosFotos[foto.id]));
    return fd;
  }
  async function abrirPrevia() {
    setErro(null); setGerandoPrevia(true);
    try {
      let resposta: Response;
      if (edicao) {
        // Relatório já criado: grava as alterações atuais (sem criar versão) e
        // mostra o MESMO PDF que será baixado, impresso da página web.
        const snapshot = { rascunho, blocos };
        if (assinaturaDoSnapshot(snapshot) !== assinaturaSalva.current || gravacoesPendentes.current > 0) {
          if (!(await enfileirarSalvamento(snapshot))) throw new Error("Não foi possível salvar as alterações para gerar a prévia.");
        }
        resposta = await fetch(`/api/relatorios/visitas/${edicao.id}/pdf`);
        setPreviaAproximada(false);
      } else {
        // Documento ainda não criado: só existe no navegador, então a prévia vem do gerador interno.
        resposta = await fetch("/api/relatorios/visitas/preview", { method: "POST", body: dadosDoDocumento() });
        setPreviaAproximada(true);
      }
      if (!resposta.ok) {
        const retorno = await resposta.json().catch(() => null) as { erro?: string } | null;
        throw new Error(retorno?.erro || "Não foi possível gerar a prévia.");
      }
      const url = URL.createObjectURL(await resposta.blob());
      setUrlPrevia(url);
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Não foi possível gerar a prévia.");
    } finally {
      setGerandoPrevia(false);
    }
  }
  const enfileirarSalvamento = useCallback((snapshot: Snapshot, finalizar = false) => {
    if (!edicao || salvamentoBloqueado.current) return Promise.resolve(false);
    const assinatura = assinaturaDoSnapshot(snapshot);
    const chaveSalvamento = `${assinatura}:${finalizar ? "final" : "automatico"}`;
    const jaEnfileirado = salvamentosPorAssinatura.current.get(chaveSalvamento);
    if (jaEnfileirado) return jaEnfileirado;
    gravacoesPendentes.current += 1;
    setEstadoSalvamento("salvando");

    const executar = async () => {
      if (salvamentoBloqueado.current) return false;
      falhaSalvamento.current = false;
      try {
        const versaoEsperada = versaoServidor.current;
        if (!versaoEsperada) throw new Error("A versão atual do relatório não está disponível.");
        const resultado = await atualizarRelatorioVisita(edicao.id, {
          titulo: snapshot.rascunho.titulo || null,
          tipo: snapshot.rascunho.tipo,
          categoria: snapshot.rascunho.categoria as "COMERCIAL" | "TECNICA" | "POS_VENDA" | "RELACIONAMENTO",
          clienteId: snapshot.rascunho.clienteId,
          mostrarLocalizacao: snapshot.rascunho.mostrarLocalizacao,
          mostrarHorarios: snapshot.rascunho.mostrarHorarios,
          semCapa: snapshot.rascunho.semCapa,
          orientacao: snapshot.rascunho.orientacao,
          escalaLogoPrincipal: snapshot.rascunho.escalaLogoPrincipal,
          logoPrincipalTexto: snapshot.rascunho.logoPrincipalTexto || null,
          escalaLogoPrincipalPaginas: snapshot.rascunho.escalaLogoPrincipalPaginas,
          escalaLogoParceiro: snapshot.rascunho.escalaLogoParceiro,
          escalaLogoParceiroPaginas: snapshot.rascunho.escalaLogoParceiroPaginas,
          dataVisita: snapshot.rascunho.dataVisita,
          fazendaId: snapshot.rascunho.fazendaId || null,
          versaoEsperada,
          // O autosave preserva a foto para permitir desfazer. O botão Salvar
          // encerra esse período e remove referência e objeto definitivamente.
          adiarLimpezaFotos: !finalizar,
          criarVersao: finalizar,
          conteudo: comGeometria(snapshot.blocos),
        });
        if (!resultado.ok) {
          const conflito = resultado.erro.includes("CONFLITO_EDICAO");
          salvamentoBloqueado.current = conflito;
          falhaSalvamento.current = true;
          setEstadoSalvamento(conflito ? "conflito" : "erro");
          setErro(resultado.erro.replace("CONFLITO_EDICAO: ", ""));
          return false;
        }
        versaoServidor.current = resultado.versao;
        assinaturaSalva.current = assinatura;
        const atualFoiSalvo = assinaturaDoSnapshot(estadoAtual.current) === assinatura;
        setSalvoLocalmente(atualFoiSalvo);
        return true;
      } catch (error) {
        falhaSalvamento.current = true;
        setEstadoSalvamento("erro");
        setErro(error instanceof Error ? error.message : "Não foi possível salvar o relatório.");
        return false;
      }
    };

    const tarefa = filaSalvamento.current.then(executar, executar);
    salvamentosPorAssinatura.current.set(chaveSalvamento, tarefa);
    filaSalvamento.current = tarefa.then(() => undefined, () => undefined).finally(() => {
      salvamentosPorAssinatura.current.delete(chaveSalvamento);
      gravacoesPendentes.current -= 1;
      if (gravacoesPendentes.current === 0 && !salvamentoBloqueado.current && !falhaSalvamento.current) {
        const atualFoiSalvo = assinaturaDoSnapshot(estadoAtual.current) === assinaturaSalva.current;
        setSalvoLocalmente(atualFoiSalvo);
        setEstadoSalvamento(atualFoiSalvo ? "salvo" : "alterado");
      }
    });
    return tarefa;
  }, [edicao]);

  useEffect(() => {
    if (!edicao || salvamentoBloqueado.current || !rascunho.clienteId || !rascunho.categoria || !textoDosBlocos(blocos).trim()) return;
    const snapshot = { rascunho, blocos };
    const assinatura = assinaturaDoSnapshot(snapshot);
    if (assinatura === assinaturaSalva.current) return;
    const timer = window.setTimeout(() => { void enfileirarSalvamento(snapshot); }, 1500);
    return () => window.clearTimeout(timer);
  }, [rascunho, blocos, edicao, enfileirarSalvamento]);

  useEffect(() => {
    if (!edicao) return;
    const avisarSaida = (evento: BeforeUnloadEvent) => {
      const temAlteracoes = assinaturaDoSnapshot(estadoAtual.current) !== assinaturaSalva.current;
      if (!temAlteracoes && gravacoesPendentes.current === 0) return;
      evento.preventDefault();
      evento.returnValue = "";
    };
    window.addEventListener("beforeunload", avisarSaida);
    return () => window.removeEventListener("beforeunload", avisarSaida);
  }, [edicao]);

  // "Fechar" da janela sobreposta (Trabalhos da safra) pergunta antes de descartar.
  useEffect(() => {
    if (!edicao) return;
    registrarBloqueioDeSaida(() => assinaturaDoSnapshot(estadoAtual.current) !== assinaturaSalva.current || gravacoesPendentes.current > 0);
    return () => registrarBloqueioDeSaida(null);
  }, [edicao]);
  function salvar() {
    setErro(null);
    if (!rascunho.categoria) return setErro("Selecione a categoria da visita.");
    if (!rascunho.clienteId) return setErro("Selecione o cliente do relatório.");
    if (!textoDosBlocos(blocos).trim()) return setErro("Adicione algum conteúdo ao relatório.");
    if (edicao) {
      startTransition(async () => {
        await enfileirarSalvamento({ rascunho, blocos }, true);
      });
      return;
    }
    let fd: FormData;
    try { fd = dadosDoDocumento(); } catch (error) { return setErro(error instanceof Error ? error.message : "Fotos indisponíveis."); }
    startTransition(async () => { const resultado = await criarRelatorioVisita(fd); if (!resultado.ok) return setErro(resultado.erro); localStorage.removeItem(CHAVE_RASCUNHO); await salvarFotosLocais({}).catch(() => {}); router.replace(`/relatorios/visitas/${resultado.id}/editar`); });
  }

  async function voltar() {
    const temAlteracoes = edicao && assinaturaDoSnapshot(estadoAtual.current) !== assinaturaSalva.current;
    if (temAlteracoes && !(await confirmar({ mensagem: "Há alterações que ainda não foram salvas no servidor. Deseja sair mesmo assim?", confirmarLabel: "Sair sem salvar", variante: "perigo" }))) return;
    // Na janela sobreposta de Trabalhos da safra, fecha a janela em vez de
    // voltar no histórico do iframe.
    if (dentroDeIframe()) return fecharJanelaEmbutida();
    router.back();
  }

  return <div className="editor-relatorio -m-4 min-h-dvh bg-[#071014] xl:flex xl:h-dvh xl:flex-col xl:overflow-hidden">
    <header className="sticky top-0 z-30 flex flex-wrap items-center gap-2 border-b border-white/10 bg-[#0b171c]/95 px-4 py-3 backdrop-blur xl:px-6">
      {!embutido && <button onClick={voltar} title="Fechar o editor" className="editor-top-btn hover:!border-red-400/40 hover:!text-red-400"><X size={15} /> Fechar</button>}
      <button onClick={voltarHistorico} title="Desfazer (Ctrl+Z)" className="editor-top-btn">↶ Desfazer</button>
      <button onClick={avancarHistorico} title="Refazer (Ctrl+Y ou Ctrl+Shift+Z)" className="editor-top-btn">↷ Refazer</button>
      <button type="button" onClick={() => setRevisaoAberta(true)} className="ml-auto editor-top-btn !border-accent/40 !text-accent"><Sparkles size={15} /> Revisar com IA</button>
      <button onClick={abrirPrevia} disabled={gerandoPrevia} className="editor-top-btn">{gerandoPrevia ? "Gerando PDF..." : "Prévia PDF"}</button>
      <span className={`hidden text-xs md:block ${estadoSalvamento === "erro" || estadoSalvamento === "conflito" ? "text-red-300" : estadoSalvamento === "alterado" ? "text-amber-300" : "text-secondary"}`}>{edicao ? (enviandoFotos > 0 ? "Enviando fotos..." : estadoSalvamento === "conflito" ? "Outra versão foi salva. Confira o aviso antes de continuar." : estadoSalvamento === "erro" ? "Alterações não salvas. Tente salvar novamente." : estadoSalvamento === "salvando" ? "Salvando no servidor..." : estadoSalvamento === "alterado" ? "Alterações ainda não salvas no servidor" : salvoLocalmente ? "Relatório salvo no servidor" : "Aguardando salvamento...") : salvoLocalmente ? "Rascunho salvo neste navegador" : "Salvando rascunho..."}</span>
      <button onClick={salvar} disabled={pendente || estadoSalvamento === "conflito"} className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-bold text-accent-foreground disabled:opacity-50 md:ml-2"><Save size={17} />{pendente ? "Salvando..." : "Salvar relatório"}</button>
    </header>
    <div style={{ "--painel": `${larguraPainel}px`, "--lateral": `${larguraLateral}px` } as React.CSSProperties} className="grid items-start gap-2 p-2 xl:min-h-0 xl:flex-1 xl:grid-cols-[var(--lateral)_minmax(0,1fr)_var(--painel)] xl:grid-rows-[minmax(0,1fr)] xl:items-stretch xl:p-3">
      <aside className="relative hidden overflow-y-auto rounded-xl border border-white/10 bg-[#0d1a20] p-3 xl:block">
        <div onPointerDown={arrastarLateral} onDoubleClick={() => { setLarguraLateral(132); try { localStorage.removeItem(CHAVE_LARGURA_LATERAL); } catch { /* ignora */ } }} title="Arraste para alargar as miniaturas (duplo clique restaura)" className="absolute inset-y-0 right-0 z-10 w-2 cursor-col-resize touch-none hover:bg-accent/40" />
        <div className="mb-3"><strong className="text-xs text-white">Páginas</strong></div>
        <div className="space-y-3">
          {!rascunho.semCapa && <button type="button" onClick={() => { setAba("capa"); document.getElementById("editor-capa")?.scrollIntoView({ behavior: "smooth", block: "start" }); }} title="Capa" className={`relative ${paisagem ? "aspect-[297/210]" : "aspect-[210/297]"} flex w-full flex-col overflow-hidden rounded border bg-white text-left shadow-sm transition ${aba === "capa" ? "border-accent ring-2 ring-accent/30" : "border-white/10 hover:border-zinc-500"}`}>
            <MiniaturaEspelho alvoId="editor-capa" />
            <span className="absolute bottom-1 right-1 rounded bg-[#19323b]/85 px-1 text-[8px] font-bold uppercase text-white">Capa</span>
          </button>}
          {paginasEditor.map((blocosPagina, paginaIndice) => {
            const ativa = paginaSelecionada === paginaIndice;
            return <div key={paginaIndice} draggable onDragStart={(e) => { e.dataTransfer.effectAllowed = "move"; setPaginaArrastada(paginaIndice); }} onDragOver={(e) => { if (paginaArrastada === null) return; e.preventDefault(); setDestinoPagina(paginaIndice); }} onDrop={(e) => { e.preventDefault(); if (paginaArrastada !== null) soltarPagina(paginaArrastada, paginaIndice); setPaginaArrastada(null); setDestinoPagina(null); }} onDragEnd={() => { setPaginaArrastada(null); setDestinoPagina(null); }} title="Arraste para mudar a ordem" className={`group/pag relative cursor-grab active:cursor-grabbing ${paginaArrastada === paginaIndice ? "opacity-40" : ""} ${destinoPagina === paginaIndice && paginaArrastada !== paginaIndice ? (paginaArrastada !== null && paginaArrastada < paginaIndice ? "after:absolute after:inset-x-0 after:-bottom-1.5 after:h-1 after:rounded after:bg-accent" : "before:absolute before:inset-x-0 before:-top-1.5 before:h-1 before:rounded before:bg-accent") : ""}`}><button type="button" onClick={() => { setAba("bloco"); document.getElementById(`editor-pagina-${paginaIndice}`)?.scrollIntoView({ behavior: "smooth", block: "start" }); }} className={`relative ${paisagem ? "aspect-[297/210]" : "aspect-[210/297]"} w-full overflow-hidden rounded border bg-white text-left shadow-sm transition ${ativa ? "border-accent ring-2 ring-accent/30" : "border-white/10 hover:border-zinc-500"}`}>
              <MiniaturaEspelho alvoId={`editor-pagina-${paginaIndice}`} />
              <span className="absolute bottom-1 right-1 rounded bg-[#19323b]/85 px-1 text-[8px] font-bold text-white">{paginaIndice + 1}</span>
            </button>
              <div className="absolute left-1 top-1 flex gap-0.5 rounded-md bg-[#14252d]/95 p-0.5 opacity-0 shadow transition group-hover/pag:opacity-100">
                <AcaoMiniatura titulo="Página para cima" desabilitado={paginaIndice === 0} onClick={() => moverPagina(paginaIndice, -1)}><ArrowUp size={11} /></AcaoMiniatura>
                <AcaoMiniatura titulo="Página para baixo" desabilitado={paginaIndice === paginasEditor.length - 1} onClick={() => moverPagina(paginaIndice, 1)}><ArrowDown size={11} /></AcaoMiniatura>
                <AcaoMiniatura titulo="Duplicar página" onClick={() => duplicarPagina(paginaIndice)}><Copy size={11} /></AcaoMiniatura>
                <AcaoMiniatura titulo="Excluir página" perigo onClick={() => excluirPagina(paginaIndice)}><Trash2 size={11} /></AcaoMiniatura>
              </div>
            </div>;
          })}
          <button type="button" onClick={() => inserir(novoTexto(true))} title="Nova página" className={`flex ${paisagem ? "aspect-[297/210]" : "aspect-[210/297]"} w-full flex-col items-center justify-center gap-1 rounded border-2 border-dashed border-white/15 text-muted transition hover:border-accent hover:text-accent`}><Plus size={22} /><span className="text-[10px] font-semibold">Nova página</span></button>
        </div>
      </aside>
      <main className="min-w-0 overflow-x-auto xl:h-full xl:overflow-y-auto rounded-xl border border-white/[0.06] bg-[#0a151a] px-3 py-6 sm:px-6">
        <div className={`mx-auto max-w-full space-y-7 ${paisagem ? "w-[297mm]" : "w-[210mm]"}`}>
        {!rascunho.semCapa && <article id="editor-capa" className={`relative flex w-full flex-col bg-white text-marca-azul shadow-[0_22px_70px_rgba(0,0,0,.45)] ${paisagem ? "min-h-[210mm]" : "min-h-[297mm]"}`}>
          <div className="absolute -top-5 left-1/2 -translate-x-1/2 rounded-full border border-white/10 bg-[#14252d] px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-zinc-300">Capa</div>
          <div className="relative flex items-center justify-between gap-4 px-[5%] py-7">
            <div className="group/tam relative -m-2">
            <button type="button" onClick={() => setSeletorLogo((aberto) => aberto === "principal" ? null : "principal")} className="group relative rounded-lg p-2 outline-dashed outline-1 outline-transparent hover:outline-zinc-300">
              <div style={{ height: 48 * rascunho.escalaLogoPrincipal }} className="flex max-w-[420px] items-center">{logoPrincipal ? <img src={logoPrincipal} alt="Logo" className="h-full w-auto max-w-full object-contain" /> : <Logo fundo="claro" className="h-full w-auto max-w-full" />}</div>
              <DicaTrocarLogo />
            </button>
            <AjusteTamanhoLogo valor={rascunho.escalaLogoPrincipal} aoMudar={(escalaLogoPrincipal) => alterar({ escalaLogoPrincipal })} />
            </div>
            {rascunho.logoPrincipalTexto.trim() && <TextoMarcaEditor texto={rascunho.logoPrincipalTexto} />}
            <div className="group/tam relative">
            <button type="button" onClick={() => setSeletorLogo((aberto) => aberto === "parceiro" ? null : "parceiro")} className={`group relative rounded-lg p-2 transition ${logoParceiro ? "-m-2 outline-dashed outline-1 outline-transparent hover:outline-zinc-300" : "flex h-16 w-52 items-center justify-center border-2 border-dashed border-zinc-300 text-xs font-semibold text-secondary hover:border-accent hover:text-emerald-700"}`}>
              {logoParceiro ? <MarcaParceiroEditor {...logoParceiro} grande escala={rascunho.escalaLogoParceiro} /> : <span className="flex items-center gap-1"><Plus size={14} /> Logo do parceiro</span>}
              <DicaTrocarLogo direita />
            </button>
            {logoParceiro && <AjusteTamanhoLogo direita valor={rascunho.escalaLogoParceiro} aoMudar={(escalaLogoParceiro) => alterar({ escalaLogoParceiro })} />}
            </div>
            {seletorLogo && <DialogFrame onClose={() => setSeletorLogo(null)} label={"Escolher logo"} className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4">
              <div onClick={(e) => e.stopPropagation()} className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#0f1d23] p-5 text-left shadow-2xl">
              <div className="mb-2 flex items-center justify-between"><span className="text-xs font-bold uppercase tracking-wider text-secondary">{seletorLogo === "principal" ? "Logo da esquerda" : "Logo da direita"}</span><button type="button" onClick={() => setSeletorLogo(null)} aria-label="Fechar" className="rounded-md px-2 py-1 text-sm text-secondary hover:bg-white/10 hover:text-white">✕</button></div>
              {seletorLogo === "principal"
                ? <><SeletorLogoPrincipal relatorioId={edicao?.id ?? null} biblioteca={biblioteca} aoImportar={aoImportarLogo} aoExcluir={excluirDaBiblioteca} aoEscolherPendente={(id) => { logosPendentes.current.principal = id ?? undefined; }} aoMudar={(url) => { setLogoPrincipal(url); setSeletorLogo(null); }} /><label className="mt-4 block border-t border-white/10 pt-4 text-xs text-secondary">Texto ao lado da logo (opcional)<textarea rows={2} value={rascunho.logoPrincipalTexto} onChange={(e) => alterar({ logoPrincipalTexto: e.target.value })} placeholder={"PROGRAMA\nDifusão de Tecnologia"} className="mt-1 w-full resize-none rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-zinc-200 outline-none focus:border-accent" /><span className="mt-1 block text-[11px] text-muted">1ª linha: rótulo pequeno. 2ª linha: nome. Sai na capa com &quot;uma iniciativa&quot; e a logo da empresa.</span></label></>
                : <LogoParceiroCampo relatorioId={edicao?.id ?? null} url={logoParceiro?.url ?? null} aoMudar={(logo) => { setLogoParceiro(logo); setSeletorLogo(null); }} biblioteca={biblioteca} aoImportar={aoImportarLogo} aoExcluir={excluirDaBiblioteca} aoEscolherPendente={(id) => { logosPendentes.current.parceiro = id ?? undefined; }} />}
              </div>
            </DialogFrame>}
          </div>
          <div className="h-2.5 bg-marca-verde" />
          <div className={`flex flex-1 gap-8 px-[5%] py-8 ${paisagem ? "items-center" : "flex-col justify-center"}`}>
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-3 text-[11px] font-bold uppercase tracking-[.22em] text-emerald-700"><span className="h-[3px] w-10 bg-marca-verde" />{rascunho.tipo === "TECNICO" ? "Dossiê técnico · Relatório de campo" : "Relatório de visita"}</p>
              <textarea rows={2} value={rascunho.titulo} onChange={(e) => alterar({ titulo: e.target.value })} placeholder="Título do relatório" className="mt-5 w-full resize-none bg-transparent text-5xl font-bold leading-[1.05] tracking-tight text-marca-azul outline-none placeholder:text-zinc-300" />
              <p className="mt-4 text-lg text-subtle">{[cliente?.nome || "Selecione o cliente ao lado", fazenda?.nome, safraNome ? `Safra ${safraNome}` : null].filter(Boolean).join(" · ")}</p>
            </div>
            {fotoCapa && <img src={fotoCapa.url} alt="Foto escolhida para a capa" style={{ objectPosition: `${fotoCapa.focoX ?? 50}% ${fotoCapa.focoY ?? 50}%` }} className={`rounded-xl object-cover ${paisagem ? "aspect-[4/3] w-[42%]" : "aspect-[16/10] w-full"}`} />}
          </div>
          <div className="h-2.5 bg-marca-verde" />
          <div className="h-2.5 bg-marca-azul" />
          <div className="grid grid-cols-4 gap-4 px-[5%] py-6 text-sm"><CampoFolha rotulo="Consultor" valor={consultorNome} /><CampoFolha rotulo="Safra" valor={safraNome || "—"} /><CampoFolha rotulo={rascunho.tipo === "TECNICO" ? "Visita técnica" : "Data da visita"} valor={rascunho.dataVisita.split("-").reverse().join("/")} /><CampoFolha rotulo="Cliente" valor={cliente?.nome || "—"} /></div>
        </article>}
        {paginasEditor.map((blocosPagina, paginaIndice) => <article id={`editor-pagina-${paginaIndice}`} key={paginaIndice} className={`relative flex w-full flex-col bg-white text-zinc-800 ${paisagem ? "min-h-[210mm]" : "min-h-[297mm]"} shadow-[0_22px_70px_rgba(0,0,0,.45)] ${modoEditor === "avancado" ? "bg-[linear-gradient(rgba(0,220,77,.045)_1px,transparent_1px),linear-gradient(90deg,rgba(0,220,77,.045)_1px,transparent_1px)] bg-[size:20px_20px]" : ""}`}>
          <div className="absolute -top-5 left-1/2 -translate-x-1/2 rounded-full border border-white/10 bg-[#14252d] px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-zinc-300">Página {paginaIndice + 1}</div>
          <MarcasQuebraFolha paisagem={paisagem} />
          <div className="flex items-center justify-between gap-6 px-[5%] py-5"><div className="group/tam relative -m-2 max-w-[40%]"><button type="button" onClick={() => setSeletorLogo("principal")} className="group relative rounded-lg p-2 outline-dashed outline-1 outline-transparent hover:outline-zinc-300"><div style={{ height: 40 * rascunho.escalaLogoPrincipal }} className="flex items-center">{logoPrincipal ? <img src={logoPrincipal} alt="Logo" className="h-full w-auto max-w-full object-contain" /> : <Logo fundo="claro" className="h-full w-auto max-w-full" />}</div><DicaTrocarLogo /></button><AjusteTamanhoLogo valor={rascunho.escalaLogoPrincipal} aoMudar={(escalaLogoPrincipal) => alterar({ escalaLogoPrincipal })} /></div><div className="flex gap-10"><CampoFolha rotulo="Consultor" valor={consultorNome} />{safraNome && <CampoFolha rotulo="Safra" valor={safraNome} />}<CampoFolha rotulo={rascunho.tipo === "TECNICO" ? "Visita técnica" : "Data da visita"} valor={rascunho.dataVisita.split("-").reverse().join("/")} /></div></div>
          <div className="h-2 bg-marca-verde" />
          <div
            onDragEnter={(e) => { if (arrastandoId && e.target === e.currentTarget) setDestinoArraste(`pagina:${paginaIndice}`); }}
            onDragOver={(e) => { if (!arrastandoId) return; e.preventDefault(); e.dataTransfer.dropEffect = "move"; if (e.target === e.currentTarget) { const alvo = alvoHorizontalNaPagina(e.currentTarget, e.clientX, e.clientY); setDestinoArraste(alvo ? `${alvo.id}:${alvo.depois ? "depois" : "antes"}` : `pagina:${paginaIndice}`); } }}
            onDrop={(e) => { if (!arrastandoId || e.target !== e.currentTarget) return; e.preventDefault(); e.stopPropagation(); const alvo = alvoHorizontalNaPagina(e.currentTarget, e.clientX, e.clientY); if (alvo) soltarNoAlvo(alvo.id, alvo.depois); else soltarNaPagina(paginaIndice); }}
            className={`relative grid flex-1 grid-cols-6 content-start gap-4 px-[7%] py-8 transition ${modoEditor !== "padrao" ? "outline outline-1 outline-inset outline-emerald-500/15" : ""} ${destinoArraste === `pagina:${paginaIndice}` ? "bg-accent/[0.06] ring-2 ring-inset ring-accent" : ""}`}
          >
            {arrastandoId && destinoArraste === `pagina:${paginaIndice}` && <div className="pointer-events-none absolute inset-5 z-40 flex items-center justify-center rounded-xl border-2 border-dashed border-accent bg-accent/10 text-sm font-bold text-emerald-700">Solte o quadro nesta página</div>}
            {blocosPagina.map((bloco) => {
              const blocoVisual = redimensionamento?.id === bloco.id ? { ...bloco, largura: redimensionamento.largura } as Bloco : bloco;
              return <div key={bloco.id} className={`${classeLargura(blocoVisual)} flex h-full flex-col ${arrasteLivre?.id === bloco.id ? "relative z-50 opacity-80 shadow-2xl" : ""}`} style={{ marginTop: bloco.margemSuperior ?? 0, marginBottom: bloco.margemInferior ?? 0, ...(arrasteLivre?.id === bloco.id ? { transform: `translateY(${arrasteLivre.dy}px)` } : {}) }}>
              <section
                data-bloco-relatorio={bloco.id}
                onDragOver={(e) => {
                  if (!arrastandoId) return;
                  e.preventDefault();
                  e.stopPropagation();
                  e.dataTransfer.dropEffect = "move";
                  const area = e.currentTarget.getBoundingClientRect();
                  setDestinoArraste(`${bloco.id}:${e.clientX >= area.left + area.width / 2 ? "depois" : "antes"}`);
                }}
                onDrop={(e) => {
                  if (!arrastandoId) return;
                  e.preventDefault();
                  e.stopPropagation();
                  const area = e.currentTarget.getBoundingClientRect();
                  soltarNoAlvo(bloco.id, e.clientX >= area.left + area.width / 2);
                }}
                onClick={(e) => selecionarBloco(e, bloco.id)}
                className={`group relative flex-1 rounded-xl border bg-white p-4 transition ${selecionadosIds.includes(bloco.id) ? "border-accent ring-2 ring-accent/20" : "border-zinc-200 hover:border-zinc-300"} ${arrastandoId === bloco.id ? "opacity-40" : ""} ${destinoArraste === `${bloco.id}:antes` || destinoArraste === `${bloco.id}:depois` ? "ring-2 ring-accent" : ""}`}
              >
                {arrastandoId && destinoArraste === `${bloco.id}:antes` && <span className="pointer-events-none absolute -left-2 inset-y-2 z-40 w-1 rounded-full bg-accent shadow-[0_0_12px_rgba(0,220,77,.75)]" />}
                {arrastandoId && destinoArraste === `${bloco.id}:depois` && <span className="pointer-events-none absolute -right-2 inset-y-2 z-40 w-1 rounded-full bg-accent shadow-[0_0_12px_rgba(0,220,77,.75)]" />}
                <div className={`absolute -right-2 -top-3 z-30 rounded-full bg-[#0d1a20] p-1 shadow-lg ${selecionadoId === bloco.id ? "flex" : "hidden group-hover:flex"}`}>
                  <button
                    type="button"
                    onPointerDown={(e) => iniciarArrasteLivre(e, bloco)}
                    onClick={(e) => e.stopPropagation()}
                    className="cursor-grab touch-none rounded-full p-1.5 text-accent hover:bg-white/10 active:cursor-grabbing"
                    title="Segure e arraste para cima ou para baixo"
                    aria-label="Arrastar quadro"
                  ><Move size={15} /></button>
                  <button type="button" onClick={(e) => { e.stopPropagation(); remover(bloco.id); }} title="Excluir bloco" aria-label="Excluir bloco" className="rounded-full p-1.5 text-red-400 hover:bg-red-500/20"><Trash2 size={15} /></button>
                </div>
                {selecionadosIds.length > 1 && selecionadosIds.includes(bloco.id) && <span className="absolute -left-2 -top-2 z-20 flex h-5 w-5 items-center justify-center rounded-full bg-accent text-[10px] font-bold text-[#07150d]">✓</span>}
                {bloco.tipo === "texto" && <EditorTextoParcial key={`${bloco.id}:${revisoes[bloco.id] ?? 0}`} bloco={bloco} aoMudar={atualizarBloco} />}
                {bloco.tipo === "foto" && <figure><div className={`relative overflow-hidden rounded-lg bg-zinc-100 ${proporcaoFoto(bloco)}`}><img src={bloco.url} alt="Foto do relatório" style={{ objectPosition: `${bloco.focoX ?? 50}% ${bloco.focoY ?? 50}%`, transformOrigin: `${bloco.focoX ?? 50}% ${bloco.focoY ?? 50}%`, transform: `scale(${bloco.zoom ?? 1}) rotate(${bloco.rotacao ?? 0}deg)` }} className={`h-full w-full bg-zinc-100 ${bloco.ajuste === "conter" ? "object-contain" : "object-cover"}`} />{selecionadoId === bloco.id
                  ? <CamadaAnotar anotacoes={bloco.anotacoes ?? []} razao={razaoDoQuadro(bloco.proporcao)} ferramenta={ferramentaAtiva} cor={corAnotar} espessura={espessuraAnotar} selecionadaId={anotacaoAtiva} aoSelecionar={definirAnotacao} aoCriar={(anotacao) => { atualizarBloco({ ...bloco, anotacoes: [...(bloco.anotacoes ?? []), anotacao] }); definirAnotacao(anotacao.id); }} />
                  : bloco.anotacoes && bloco.anotacoes.length > 0 ? <AnotacoesFotoSvg anotacoes={bloco.anotacoes} razao={razaoDoQuadro(bloco.proporcao)} /> : null}</div><input value={bloco.legenda ?? ""} onChange={(e) => atualizarBloco({ ...bloco, legenda: e.target.value || null })} placeholder="Escreva a legenda da foto..." className={`mt-2 w-full bg-transparent px-1 text-subtle outline-none placeholder:italic placeholder:font-normal ${classeTextoCurto(bloco.legendaEstilo, false)}`} /></figure>}
                {bloco.tipo === "tabela" && <div><input value={bloco.titulo} onChange={(e) => atualizarBloco({ ...bloco, titulo: e.target.value })} placeholder="Título da tabela" className="mb-3 w-full rounded bg-transparent px-1 text-sm font-semibold text-marca-azul outline-none hover:bg-zinc-100 focus:bg-zinc-100" /><table className="w-full border-collapse text-xs"><thead><tr>{bloco.cabecalhos.map((cabecalho, indice) => <th key={indice} className="border border-zinc-200 bg-emerald-50 p-1"><input value={cabecalho} onChange={(e) => atualizarBloco({ ...bloco, cabecalhos: bloco.cabecalhos.map((item, i) => i === indice ? e.target.value : item) })} className="w-full bg-transparent text-center font-semibold outline-none" /></th>)}</tr></thead><tbody>{bloco.linhas.map((linha, indiceLinha) => <tr key={indiceLinha}>{bloco.cabecalhos.map((_, indiceColuna) => <td key={indiceColuna} className="border border-zinc-200 p-1"><input value={linha[indiceColuna] ?? ""} onChange={(e) => atualizarBloco({ ...bloco, linhas: bloco.linhas.map((atual, i) => i === indiceLinha ? atual.map((celula, j) => j === indiceColuna ? e.target.value : celula) : atual) })} className="w-full bg-transparent outline-none" /></td>)}</tr>)}</tbody></table></div>}
                {bloco.tipo === "grafico" && <div><input value={bloco.titulo} onChange={(e) => atualizarBloco({ ...bloco, titulo: e.target.value })} onFocus={(e) => e.currentTarget.select()} placeholder="Nome do gráfico" aria-label="Nome do gráfico" draggable={false} className={`-mx-2 mb-3 w-full rounded-md bg-transparent px-2 py-1 text-marca-azul outline-none transition ${classeTextoCurto(bloco.tituloEstilo, true)} placeholder:font-normal placeholder:italic placeholder:text-secondary hover:bg-zinc-100 focus:bg-zinc-100 focus:ring-2 focus:ring-accent/30`} /><GraficoBloco bloco={bloco} alto={bloco.largura !== "metade"} semTitulo /></div>}
                {bloco.tipo === "destaque" && <DestaqueEditavel bloco={bloco} aoMudar={atualizarBloco} />}
                {bloco.tipo === "indicadores" && <IndicadoresEditaveis bloco={bloco} aoMudar={atualizarBloco} />}
                {bloco.tipo === "divisor" && <div className="py-3"><AvulsoLeitura bloco={bloco} /></div>}
                {bloco.tipo !== "texto" && !ehBlocoAvulso(bloco) && modoEditor !== "padrao" && <button type="button" onPointerDown={(evento) => iniciarRedimensionamento(evento, bloco)} onClick={(evento) => evento.stopPropagation()} className="absolute -bottom-2 -right-2 z-30 flex h-5 w-5 cursor-ew-resize items-center justify-center rounded-sm border border-white/70 bg-[#19323b] text-[10px] font-bold text-white shadow" title="Arraste para ajustar à grade" aria-label="Redimensionar bloco">↔</button>}
              </section>
              <button
                type="button"
                onClick={() => inserirDepois(bloco.id, novoTexto())}
                onDragEnter={() => arrastandoId && setDestinoArraste(`${bloco.id}:depois`)}
                onDragOver={(e) => { if (!arrastandoId) return; e.preventDefault(); e.dataTransfer.dropEffect = "move"; }}
                onDrop={(e) => { if (!arrastandoId) return; e.preventDefault(); e.stopPropagation(); soltarNoAlvo(bloco.id, true); }}
                className={`mt-2 flex w-full items-center justify-center gap-1 rounded border border-dashed py-1 text-[10px] font-semibold transition ${destinoArraste === `${bloco.id}:depois` ? "border-accent bg-accent/10 text-accent" : "border-zinc-300 text-secondary hover:border-accent"}`}
              ><Plus size={11} /> {arrastandoId ? "Soltar quadro aqui" : "Adicionar bloco aqui"}</button>
            </div>;
            })}
          </div>
          <footer className="mt-auto flex items-end gap-5 pb-4 pt-5"><div className="flex-1"><div className="h-2 bg-marca-verde" /><div className="h-2 bg-marca-azul" /></div><div className="pr-[5%]"><div className="group/tam relative"><button type="button" onClick={() => setSeletorLogo("parceiro")} className={`group relative rounded-lg p-1.5 ${logoParceiro ? "outline-dashed outline-1 outline-transparent hover:outline-zinc-300" : "flex h-10 w-36 items-center justify-center border-2 border-dashed border-zinc-300 text-[10px] font-semibold text-secondary hover:border-accent hover:text-emerald-700"}`}>{logoParceiro ? <MarcaParceiroEditor {...logoParceiro} escala={rascunho.escalaLogoParceiroPaginas} /> : <span className="flex items-center gap-1"><Plus size={12} /> Logo do parceiro</span>}<span className="pointer-events-none absolute bottom-full right-0 z-40 mb-1 whitespace-nowrap rounded bg-[#14252d] px-2 py-1 text-[10px] font-semibold text-zinc-200 opacity-0 shadow transition group-hover:opacity-100">Clique para mudar a logo</span></button>{logoParceiro && <AjusteTamanhoLogo direita acima valor={rascunho.escalaLogoParceiroPaginas} aoMudar={(escalaLogoParceiroPaginas) => alterar({ escalaLogoParceiroPaginas })} />}</div></div><span className="absolute bottom-1 right-2 text-[8px] font-medium text-secondary">{paginaIndice + 1}/{paginasEditor.length}</span></footer>
        </article>)}
        </div>
      </main>
      <aside className="relative overflow-hidden xl:h-full xl:overflow-y-auto rounded-xl border border-white/10 bg-[#0d1a20] text-zinc-200">
        <div onPointerDown={arrastarPainel} onDoubleClick={() => { setLarguraPainel(280); try { localStorage.removeItem(CHAVE_LARGURA_PAINEL); } catch { /* ignora */ } }} title="Arraste para alargar o painel (duplo clique restaura)" className="absolute inset-y-0 left-0 z-10 hidden w-2 cursor-col-resize touch-none hover:bg-accent/40 xl:block" />
        <label className="mx-5 mt-4 flex items-center justify-between gap-2 text-[11px] font-medium text-secondary">Modo do editor
          <select value={modoEditor} onChange={(e) => setModoEditor(e.target.value as ModoEditor)} className="rounded border border-white/10 bg-[#223b46] px-2 py-1.5 text-xs font-semibold text-white outline-none focus:border-accent">
            <option value="padrao">Padrão automático</option><option value="ajuste">Ajuste guiado</option><option value="avancado">Avançado</option>
          </select>
        </label>
        {modoEditor !== "padrao" && <button type="button" onClick={organizarDocumento} className="mx-5 mt-3 flex w-[calc(100%-2.5rem)] items-center justify-center gap-1.5 rounded-lg border border-accent/30 bg-accent/10 px-3 py-2 text-xs font-semibold text-accent hover:bg-accent/15"><Move size={14} /> Organizar documento</button>}
        <div className="grid grid-cols-3 border-b border-white/10">{(["capa", "propriedades", "bloco"] as Aba[]).map((item) => <button key={item} onClick={() => setAba(item)} className={`px-1 py-3 text-[11px] font-semibold ${aba === item ? "border-b-2 border-accent text-accent" : "text-secondary"}`}>{item === "pagina" ? "Página" : item === "propriedades" ? "Propriedades" : item === "capa" ? "Capa" : "Bloco"}</button>)}</div>
        <div className="space-y-4 p-5">
          {aba === "propriedades" && <><Propriedades rascunho={rascunho} alterar={alterar} opcoesClientes={opcoesClientes} opcoesFazendas={opcoesFazendas} trabalhos={edicao ? [] : trabalhos} />{edicao && <ControleDocumento id={edicao.id} status={statusDocumento} podeAprovar={edicao.podeAprovar} alterando={alterandoStatus} aoMudar={alterarStatusDocumento} versoes={edicao.versoes} />}</>}
          {aba === "capa" && <><PainelCapa titulo={rascunho.titulo} alterarTitulo={(titulo) => alterar({ titulo })} semCapa={rascunho.semCapa} alterarSemCapa={(semCapa) => alterar({ semCapa })} orientacao={rascunho.orientacao} alterarOrientacao={(orientacao) => alterar({ orientacao })} fotos={fotosDocumento} semFoto={capaSemFoto || fotosDocumento.length === 0} mudarBlocos={mudarBlocos} aplicarModelo={aplicarModelo} /><LogoParceiroCampo relatorioId={edicao?.id ?? null} url={logoParceiro?.url ?? null} aoMudar={setLogoParceiro} biblioteca={biblioteca} aoImportar={aoImportarLogo} aoExcluir={excluirDaBiblioteca} aoEscolherPendente={(id) => { logosPendentes.current.parceiro = id ?? undefined; }} /></>}
          {aba === "bloco" && <>{selecionadosIds.length > 1 && <div className="rounded-lg border border-accent/30 bg-accent/10 p-3"><strong className="text-sm text-accent">{selecionadosIds.length} quadros selecionados</strong><p className="mt-1 text-[11px] leading-4 text-secondary">Arraste pela alça de qualquer selecionado para mover o grupo. Ctrl/Cmd ou Shift + clique adiciona e remove quadros.</p>{selecionadosIds.every((id) => blocos.find((bloco) => bloco.id === id)?.tipo === "foto") && <div className="mt-3"><span className="mb-2 block text-[11px] font-semibold text-zinc-300">Layout de galeria</span><div className="grid grid-cols-3 gap-1">{([1, 2, 3, 4, 6] as const).map((quantidade) => <button type="button" key={quantidade} onClick={() => aplicarLayoutGaleria(quantidade)} disabled={selecionadosIds.length < quantidade} className={botao}>{quantidade} foto{quantidade > 1 ? "s" : ""}</button>)}</div></div>}<button type="button" onClick={excluirSelecionados} className={`${botao} mt-3 w-full !text-red-400`}><Trash2 size={14} /> Excluir selecionados</button></div>}<PainelBloco anotar={{ ferramenta: ferramentaAtiva, setFerramenta: definirFerramenta, cor: corAnotar, setCor: setCorAnotar, espessura: espessuraAnotar, setEspessura: setEspessuraAnotar, selecionada: anotacaoAtiva, setSelecionada: definirAnotacao }} selecionado={selecionado} inserir={inserir} atualizar={atualizarBloco} mudarBlocos={mudarBlocos} mover={mover} duplicar={duplicar} remover={remover} fotoEmPaginaExclusiva={fotoEmPaginaExclusiva} inputFotos={inputFotos} storageConfigurado={storageConfigurado} adicionarFotos={adicionarFotos} /></>}
          {erro && <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">{erro}</p>}
        </div>
      </aside>
      {revisaoAberta && <RevisaoIa
        blocos={blocos}
        titulo={rascunho.titulo}
        aoFechar={() => setRevisaoAberta(false)}
        aoAplicar={(aplicados, novoTitulo) => {
          if (novoTitulo !== null) alterar({ titulo: novoTitulo });
          if (Object.keys(aplicados).length) mudarBlocos((atuais) => atuais.map((bloco) => aplicados[bloco.id] ?? bloco));
        }}
      />}
      <ImportadorTabela selecionado={selecionado?.tipo === "tabela" ? selecionado : null} aoAplicar={atualizarBloco} />
    </div>
    {urlPrevia && <DialogFrame onClose={() => setUrlPrevia(null)} label={"Prévia do relatório"} className="fixed inset-0 z-[100] flex flex-col bg-black/85 p-3 sm:p-6">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between rounded-t-xl border border-white/10 bg-[#0d1a20] px-4 py-3 text-white"><strong>{previaAproximada ? "Prévia aproximada — salve o relatório para ver o PDF final" : "Prévia real do PDF"}</strong><div className="flex gap-2"><a href={urlPrevia} download="previa-relatorio.pdf" className="editor-top-btn">Baixar</a><button onClick={() => setUrlPrevia(null)} className="editor-top-btn">Fechar</button></div></div>
      <iframe src={urlPrevia} title="Prévia PDF do relatório" className="mx-auto min-h-0 w-full max-w-6xl flex-1 rounded-b-xl border border-t-0 border-white/10 bg-white" />
    </DialogFrame>}
  </div>;
}

function EditorTextoParcial({ bloco, aoMudar }: { bloco: Extract<Bloco, { tipo: "texto" }>; aoMudar: (bloco: Bloco) => void }) {
  const area = useRef<HTMLDivElement>(null);
  const intervalo = useRef<Range | null>(null);
  const [selecionando, setSelecionando] = useState(false);
  const corClasse = (cor?: TrechoTexto["cor"]) => cor === "verde" ? "text-emerald-700" : cor === "azul" ? "text-marca-azul" : cor === "vermelho" ? "text-red-700" : "";
  const hexDoCss = (css: string) => { const partes = css.match(/\d+/g) ?? []; return partes.length >= 3 ? `#${partes.slice(0, 3).map((n) => Number(n).toString(16).padStart(2, "0")).join("")}` : undefined; };
  // O navegador é dono do conteúdo enquanto a pessoa digita: o React só
  // desenha os trechos de novo quando o texto muda por fora (desfazer, IA...).
  // Redesenhar a cada tecla fazia o React remover <span> que o navegador já
  // tinha apagado ("Failed to execute 'removeChild'").
  const [textoEmitido, setTextoEmitido] = useState(bloco.texto);
  const [conteudo, setConteudo] = useState(() => ({ versao: 0, trechos: bloco.trechos?.length ? bloco.trechos : [{ texto: bloco.texto }] }));
  if (bloco.texto !== textoEmitido) {
    setTextoEmitido(bloco.texto);
    setConteudo({ versao: conteudo.versao + 1, trechos: bloco.trechos?.length ? bloco.trechos : [{ texto: bloco.texto }] });
  }
  useEffect(() => {
    const manterSelecaoAoEscolherCor = (evento: MouseEvent) => {
      const alvo = evento.target;
      if (alvo instanceof HTMLInputElement && alvo.type === "color" && area.current?.parentElement?.contains(alvo)) evento.preventDefault();
    };
    document.addEventListener("mousedown", manterSelecaoAoEscolherCor, true);
    return () => document.removeEventListener("mousedown", manterSelecaoAoEscolherCor, true);
  }, []);
  useEffect(() => {
    const elemento = area.current; if (!elemento) return;
    elemento.style.textAlign = bloco.alinhamento === "centro" ? "center" : bloco.alinhamento === "direita" ? "right" : bloco.alinhamento === "justificar" ? "justify" : "left";
    elemento.style.lineHeight = bloco.espacamentoLinha === "compacto" ? "1.25rem" : bloco.espacamentoLinha === "amplo" ? "2.25rem" : "1.75rem";
    elemento.style.backgroundColor = bloco.destaque === "verde" ? "#ecfdf5" : bloco.destaque === "azul" ? "#f0f9ff" : bloco.destaque === "amarelo" ? "#fffbeb" : "";
  }, [bloco.alinhamento, bloco.espacamentoLinha, bloco.destaque]);
  function salvar() {
    const raiz = area.current; if (!raiz) return;
    const trechos: TrechoTexto[] = [];
    const visitar = (no: Node, estilo: Omit<TrechoTexto, "texto"> = {}) => {
      if (no.nodeType === Node.TEXT_NODE) { if (no.textContent) trechos.push({ texto: no.textContent, ...estilo }); return; }
      if (!(no instanceof HTMLElement)) return;
      const tag = no.tagName;
      // execCommand("foreColor") gera <font color="#..."></font> no Chrome,
      // enquanto o fundo vira style. Ler ambos evita perder a cor ao salvar.
      const corCss = no.style.color || no.getAttribute("color") || "";
      const fundoCss = no.style.backgroundColor || "";
      const cor = corCss.includes("185") ? "vermelho" : corCss.includes("128") ? "verde" : corCss.includes("78") ? "azul" : estilo.cor;
      const destaque = fundoCss.includes("254") ? "amarelo" : fundoCss.includes("219") ? "azul" : fundoCss.includes("220") ? "verde" : estilo.destaque;
      const corHex = corCss.startsWith("#") ? corCss : hexDoCss(corCss); const fundoHex = fundoCss.startsWith("#") ? fundoCss : hexDoCss(fundoCss);
      const proximo = { ...estilo, negrito: estilo.negrito || tag === "B" || tag === "STRONG", italico: estilo.italico || tag === "I" || tag === "EM", sublinhado: estilo.sublinhado || tag === "U", cor, destaque, ...(corHex ? { corHex } : {}), ...(fundoHex ? { fundoHex } : {}) } as Omit<TrechoTexto, "texto">;
      if (tag === "DIV" || tag === "BR") trechos.push({ texto: "\n", ...estilo }); else no.childNodes.forEach((filho) => visitar(filho, proximo));
    };
    raiz.childNodes.forEach((no) => visitar(no));
    const texto = trechos.map((trecho) => trecho.texto).join("").replace(/\n{3,}/g, "\n\n");
    setTextoEmitido(texto);
    aoMudar({ ...bloco, texto, trechos: trechos.filter((trecho) => trecho.texto) } as Bloco);
  }
  function formatar(comando: "bold" | "italic" | "underline" | "foreColor" | "hiliteColor", valor?: string) {
    area.current?.focus();
    if (intervalo.current) { const selecao = window.getSelection(); selecao?.removeAllRanges(); selecao?.addRange(intervalo.current); }
    document.execCommand(comando, false, valor); salvar();
  }
  const corFundo = (destaque?: TrechoTexto["destaque"]) => destaque === "verde" ? "bg-emerald-100" : destaque === "azul" ? "bg-sky-100" : destaque === "amarelo" ? "bg-amber-200" : "";
  const botao = "rounded px-2 py-1 hover:bg-white/10";
  return <div className="relative"><div key={conteudo.versao} contentEditable suppressContentEditableWarning style={estiloFonteTexto(bloco, 1.333)} onInput={salvar} onSelect={() => { const selecao = window.getSelection(); intervalo.current = selecao?.rangeCount ? selecao.getRangeAt(0).cloneRange() : null; setSelecionando(Boolean(selecao?.toString())); }} onBlur={() => setSelecionando(false)} className={`min-h-28 w-full whitespace-pre-wrap rounded bg-transparent px-1 outline-none ${bloco.negrito || bloco.subtitulo ? "font-bold" : ""} ${bloco.italico ? "italic" : ""} ${bloco.sublinhado ? "underline underline-offset-4" : ""} ${corClasse(bloco.cor)} ${bloco.tamanho === "grande" ? "text-lg" : bloco.tamanho === "pequeno" ? "text-xs" : "text-sm"}`} ref={area}>{conteudo.trechos.map((trecho, i) => <span key={i} style={{ color: trecho.corHex, backgroundColor: trecho.fundoHex }} className={`${trecho.negrito ? "font-bold" : ""} ${trecho.italico ? "italic" : ""} ${trecho.sublinhado ? "underline" : ""} ${corClasse(trecho.cor)} ${corFundo(trecho.destaque)}`}>{trecho.texto}</span>)}</div>{selecionando && <div className="mt-2 flex flex-wrap items-center gap-1 rounded-lg border border-zinc-200 bg-white p-2 text-zinc-700 shadow-sm"><button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => formatar("bold")} className={`${botao} font-bold`}>B</button><button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => formatar("italic")} className={`${botao} italic`}>I</button><button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => formatar("underline")} className={`${botao} underline`}>U</button><span className="mx-1 h-5 border-l border-zinc-200" /><label className="flex items-center gap-1 text-[10px] text-muted">Texto<input type="color" defaultValue="#1f2937" onInput={(e) => formatar("foreColor", e.currentTarget.value)} className="h-6 w-7 cursor-pointer rounded border border-zinc-300 bg-transparent p-0" /></label><label className="flex items-center gap-1 text-[10px] text-muted">Fundo<input type="color" defaultValue="#ffffff" onInput={(e) => formatar("hiliteColor", e.currentTarget.value)} className="h-6 w-7 cursor-pointer rounded border border-zinc-300 bg-transparent p-0" /></label><button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => formatar("hiliteColor", "transparent")} className="rounded border border-zinc-300 px-2 py-1 text-[10px]">Limpar fundo</button></div>}</div>;
  return <div className="relative"><div key={conteudo.versao} contentEditable suppressContentEditableWarning style={estiloFonteTexto(bloco, 1.333)} onInput={salvar} onSelect={() => setSelecionando(Boolean(window.getSelection()?.toString()))} onBlur={() => setSelecionando(false)} className={`min-h-28 w-full whitespace-pre-wrap rounded bg-transparent px-1 outline-none ${bloco.negrito || bloco.subtitulo ? "font-bold" : ""} ${bloco.italico ? "italic" : ""} ${bloco.sublinhado ? "underline underline-offset-4" : ""} ${corClasse(bloco.cor)} ${bloco.destaque === "verde" ? "bg-emerald-50" : bloco.destaque === "azul" ? "bg-sky-50" : bloco.destaque === "amarelo" ? "bg-amber-50" : ""} ${bloco.tamanho === "grande" ? "text-lg" : bloco.tamanho === "pequeno" ? "text-xs" : "text-sm"} ${bloco.espacamentoLinha === "compacto" ? "leading-5" : bloco.espacamentoLinha === "amplo" ? "leading-9" : "leading-7"} ${bloco.alinhamento === "centro" ? "text-center" : bloco.alinhamento === "direita" ? "text-right" : bloco.alinhamento === "justificar" ? "text-justify" : "text-left"}`} ref={area}>{conteudo.trechos.map((trecho, i) => <span key={i} className={`${trecho.negrito ? "font-bold" : ""} ${trecho.italico ? "italic" : ""} ${trecho.sublinhado ? "underline" : ""} ${corClasse(trecho.cor)} ${corFundo(trecho.destaque)}`}>{trecho.texto}</span>)}</div>{selecionando && <div className="mt-2 flex flex-wrap items-center gap-1 rounded-lg border border-zinc-200 bg-white p-1.5 text-zinc-700 shadow-sm"><button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => formatar("bold")} className={`${botao} font-bold`}>B</button><button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => formatar("italic")} className={`${botao} italic`}>I</button><button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => formatar("underline")} className={`${botao} underline`}>U</button><span className="mx-1 h-5 border-l border-zinc-200" /><span className="text-[10px] text-muted">Texto</span>{[["#1f2937","Padrão"],["#15803d","Verde"],["#1d4ed8","Azul"],["#b91c1c","Vermelho"]].map(([cor, titulo]) => <button type="button" title={titulo} key={cor} onMouseDown={(e) => e.preventDefault()} onClick={() => formatar("foreColor", cor)} className="h-5 w-5 rounded border border-zinc-300" style={{ backgroundColor: cor }} />)}<span className="ml-2 text-[10px] text-muted">Fundo</span>{[["transparent","Sem fundo"],["#bbf7d0","Verde"],["#bae6fd","Azul"],["#fde68a","Amarelo"]].map(([cor, titulo]) => <button type="button" title={titulo} key={cor} onMouseDown={(e) => e.preventDefault()} onClick={() => formatar("hiliteColor", cor)} className="h-5 w-5 rounded border border-zinc-300" style={{ backgroundColor: cor }} />)}</div>}</div>;
}

function DestaqueEditavel({ bloco, aoMudar }: { bloco: BlocoDestaque; aoMudar: (bloco: Bloco) => void }) {
  const estilo = ESTILO_DESTAQUE[bloco.variante];
  return <div className={`rounded-xl border-l-4 px-5 py-4 ${estilo.caixa}`}>
    <input value={bloco.titulo ?? ""} onChange={(e) => aoMudar({ ...bloco, titulo: e.target.value || null })} placeholder={ROTULOS_DESTAQUE[bloco.variante]} className={`w-full bg-transparent text-xs font-bold uppercase tracking-[0.14em] outline-none placeholder:opacity-60 ${estilo.rotulo}`} />
    <textarea value={bloco.texto} onChange={(e) => aoMudar({ ...bloco, texto: e.target.value })} placeholder="Escreva o destaque..." rows={3} className="mt-1.5 w-full resize-y bg-transparent text-[15px] leading-7 text-zinc-800 outline-none placeholder:italic placeholder:text-secondary" />
  </div>;
}

function IndicadoresEditaveis({ bloco, aoMudar }: { bloco: BlocoIndicadores; aoMudar: (bloco: Bloco) => void }) {
  const alterar = (indice: number, parte: Partial<{ valor: string; rotulo: string }>) =>
    aoMudar({ ...bloco, itens: bloco.itens.map((item, i) => (i === indice ? { ...item, ...parte } : item)) });
  return <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${bloco.itens.length}, minmax(0, 1fr))` }}>
    {bloco.itens.map((item, i) => <div key={i} className="rounded-xl border border-zinc-200 bg-white px-3 py-4 text-center">
      <input value={item.valor} onChange={(e) => alterar(i, { valor: e.target.value })} placeholder="0" className="w-full bg-transparent text-center text-3xl font-bold text-marca-azul outline-none placeholder:text-zinc-300" />
      <input value={item.rotulo} onChange={(e) => alterar(i, { rotulo: e.target.value })} placeholder="Rótulo" className="mt-1 w-full bg-transparent text-center text-[11px] font-semibold uppercase tracking-wider text-muted outline-none placeholder:text-zinc-300" />
    </div>)}
  </div>;
}

// O bloco de texto mostra `trechos` (o texto com formatação por trecho), e não
// `texto`: trocar só `texto` fazia a revisão sumir. Se o texto inteiro tem uma
// formatação só (ou nenhuma), ela é mantida no texto revisado; se tem trechos
// com formatações diferentes, não dá pra mapear a correção neles e a formatação
// por trecho é refeita (o bloco continua com o estilo geral, e dá pra desfazer).
function textoRevisado(bloco: Extract<Bloco, { tipo: "texto" }>, texto: string): Bloco {
  const { trechos, ...resto } = bloco;
  const estilos = (trechos ?? []).map((trecho) => JSON.stringify(Object.fromEntries(Object.entries(trecho).filter(([chave]) => chave !== "texto"))));
  const uniforme = estilos.length > 0 && estilos.every((estilo) => estilo === estilos[0]);
  return { ...resto, texto, ...(uniforme ? { trechos: [{ ...JSON.parse(estilos[0]), texto }] } : {}) } as Bloco;
}

// O que cada tipo de bloco tem de texto revisável e como devolver a revisão.
function alvoDeRevisao(bloco: Bloco): { texto: string; rotulo: string; aplicar: (texto: string) => Bloco } | null {
  if (bloco.tipo === "texto") return { texto: bloco.texto, rotulo: bloco.titulo ? `Texto · ${bloco.titulo}` : "Texto", aplicar: (texto) => textoRevisado(bloco, texto) };
  if (bloco.tipo === "foto") return bloco.legenda ? { texto: bloco.legenda, rotulo: "Legenda da foto", aplicar: (texto) => ({ ...bloco, legenda: texto || null } as Bloco) } : null;
  if (bloco.tipo === "grafico") return { texto: bloco.titulo, rotulo: "Título do gráfico", aplicar: (texto) => ({ ...bloco, titulo: texto } as Bloco) };
  if (bloco.tipo === "tabela") return { texto: bloco.titulo, rotulo: "Título da tabela", aplicar: (texto) => ({ ...bloco, titulo: texto } as Bloco) };
  if (bloco.tipo === "destaque") return { texto: bloco.texto, rotulo: "Destaque", aplicar: (texto) => ({ ...bloco, texto } as Bloco) };
  return null;
}

const ID_TITULO_REVISAO = "__titulo";

// Revisão do relatório inteiro: a IA lê tudo, sugere correções por trecho e
// dá dicas gerais; o consultor marca o que aceitar.
function RevisaoIa({ blocos, titulo, aoFechar, aoAplicar }: { blocos: Bloco[]; titulo: string; aoFechar: () => void; aoAplicar: (aplicados: Record<string, Bloco>, novoTitulo: string | null) => void }) {
  const [estado, setEstado] = useState<"carregando" | "pronto" | "erro">("carregando");
  const [erro, setErro] = useState<string | null>(null);
  const [revisao, setRevisao] = useState<RevisaoRelatorio | null>(null);
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set());
  const trechos = useMemo(() => {
    const lista: { id: string; rotulo: string; texto: string }[] = titulo.trim() ? [{ id: ID_TITULO_REVISAO, rotulo: "Título do relatório", texto: titulo }] : [];
    for (const bloco of blocos) { const alvo = alvoDeRevisao(bloco); if (alvo?.texto.trim()) lista.push({ id: bloco.id, rotulo: alvo.rotulo, texto: alvo.texto }); }
    return lista;
  }, [blocos, titulo]);
  const [pedido] = useState(() => trechos);
  useEffect(() => {
    let ativo = true;
    revisarRelatorioComIa(pedido).then((resultado) => {
      if (!ativo) return;
      if (!resultado.ok) { setErro(resultado.erro); setEstado("erro"); return; }
      setRevisao(resultado.revisao);
      setMarcadas(new Set(resultado.revisao.sugestoes.map((sug) => sug.id)));
      setEstado("pronto");
    });
    return () => { ativo = false; };
  }, [pedido]);
  const originalDe = (id: string) => pedido.find((item) => item.id === id);
  function aplicar(ids: Set<string>) {
    const aplicados: Record<string, Bloco> = {};
    let novoTitulo: string | null = null;
    for (const sug of revisao?.sugestoes ?? []) {
      if (!ids.has(sug.id)) continue;
      if (sug.id === ID_TITULO_REVISAO) { novoTitulo = sug.sugerido; continue; }
      const bloco = blocos.find((item) => item.id === sug.id);
      const alvo = bloco && alvoDeRevisao(bloco);
      if (alvo) aplicados[sug.id] = alvo.aplicar(sug.sugerido);
    }
    aoAplicar(aplicados, novoTitulo);
    aoFechar();
  }
  return <DialogFrame onClose={aoFechar} label={"Revisão do relatório com IA"} className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4">
    <div onClick={(e) => e.stopPropagation()} className="flex max-h-[85vh] w-full max-w-3xl flex-col rounded-2xl border border-white/10 bg-[#0f1d23] text-zinc-200 shadow-2xl">
      <div className="flex items-center gap-3 border-b border-white/10 px-5 py-4">
        <Sparkles size={18} className="text-accent" />
        <div className="flex-1"><strong className="block text-sm text-white">Revisão do relatório com IA</strong><span className="text-xs text-secondary">Lê o relatório inteiro e sugere correções. Nada muda sem você aceitar; dá para desfazer depois.</span></div>
        <button type="button" onClick={aoFechar} aria-label="Fechar" className="rounded-md p-1.5 text-secondary hover:bg-white/10 hover:text-white"><X size={16} /></button>
      </div>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
        {estado === "carregando" && <p className="flex items-center gap-2 py-10 text-sm text-secondary"><span className="h-4 w-4 animate-spin rounded-full border-2 border-accent border-t-transparent" /> Lendo {pedido.length} trecho{pedido.length === 1 ? "" : "s"} do relatório…</p>}
        {estado === "erro" && <p role="alert" className="rounded-lg border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-400">{erro}</p>}
        {estado === "pronto" && revisao && <>
          {revisao.dicas.length > 0 && <section className="rounded-lg border border-accent/30 bg-accent/10 p-3"><strong className="mb-1 block text-xs uppercase tracking-wider text-accent">Sugestões para o relatório</strong><ul className="list-disc space-y-1 pl-5 text-sm">{revisao.dicas.map((dica, i) => <li key={i}>{dica}</li>)}</ul></section>}
          {revisao.sugestoes.length === 0 && <p className="py-6 text-center text-sm text-secondary">Nenhuma sugestão de correção de texto.</p>}
          {revisao.sugestoes.map((sug) => {
            const original = originalDe(sug.id);
            const marcada = marcadas.has(sug.id);
            return <label key={sug.id} className={`block cursor-pointer rounded-lg border p-3 transition ${marcada ? "border-accent/50 bg-white/[0.03]" : "border-white/10 opacity-70"}`}>
              <div className="mb-2 flex items-center gap-2"><input type="checkbox" checked={marcada} onChange={() => setMarcadas((atual) => { const nova = new Set(atual); if (nova.has(sug.id)) nova.delete(sug.id); else nova.add(sug.id); return nova; })} className="accent-[var(--accent)]" /><strong className="text-xs text-white">{original?.rotulo}</strong><span className="text-[11px] text-secondary">· {sug.motivo}</span></div>
              <div className="grid gap-2 md:grid-cols-2">
                <p className="whitespace-pre-wrap rounded-md bg-red-500/10 p-2 text-xs leading-5 text-zinc-300"><span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-red-400">Atual</span>{original?.texto}</p>
                <p className="whitespace-pre-wrap rounded-md bg-accent/10 p-2 text-xs leading-5 text-zinc-200"><span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-accent">Sugerido</span>{sug.sugerido}</p>
              </div>
            </label>;
          })}
        </>}
      </div>
      <div className="flex items-center justify-end gap-2 border-t border-white/10 px-5 py-3">
        <button type="button" onClick={aoFechar} className="editor-top-btn">Fechar</button>
        {estado === "pronto" && (revisao?.sugestoes.length ?? 0) > 0 && <>
          <button type="button" disabled={marcadas.size === 0} onClick={() => aplicar(marcadas)} className="editor-top-btn">Aplicar marcadas ({marcadas.size})</button>
          <button type="button" onClick={() => aplicar(new Set(revisao!.sugestoes.map((sug) => sug.id)))} className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground hover:brightness-110">Aplicar todas</button>
        </>}
      </div>
    </div>
  </DialogFrame>;
}

function ImportadorTabela({ selecionado, aoAplicar }: { selecionado: Extract<Bloco, { tipo: "tabela" }> | null; aoAplicar: (bloco: Bloco) => void }) {
  const arquivo = useRef<HTMLInputElement>(null);
  const [erro, setErro] = useState<string | null>(null);
  if (!selecionado) return null;
  async function importar(item: File) {
    try {
      setErro(null);
      let matriz: unknown[][];
      if (/\.csv$/i.test(item.name) || item.type.includes("csv")) {
        const texto = await item.text();
        const delimitador = texto.split("\n").slice(0, 3).join("\n").split(";").length > texto.split("\n").slice(0, 3).join("\n").split(",").length ? ";" : ",";
        matriz = texto.split(/\r?\n/).filter((linha) => linha.trim()).map((linha) => linha.split(delimitador).map((celula) => celula.trim().replace(/^"|"$/g, "")));
      } else {
        const XLSX = await import("xlsx");
        const planilha = XLSX.read(await item.arrayBuffer(), { type: "array" });
        const primeira = planilha.SheetNames[0];
        if (!primeira) throw new Error("A planilha não possui uma aba.");
        matriz = XLSX.utils.sheet_to_json(planilha.Sheets[primeira], { header: 1, defval: "" }) as unknown[][];
      }
      const linhas = matriz.filter((linha) => linha.some((celula) => String(celula ?? "").trim())).slice(0, 61);
      if (linhas.length < 2) throw new Error("A planilha precisa de cabeçalho e ao menos uma linha de dados.");
      const colunas = Math.min(8, Math.max(...linhas.map((linha) => linha.length)));
      const cabecalhos = Array.from({ length: colunas }, (_, i) => String(linhas[0][i] ?? `Coluna ${i + 1}`).trim() || `Coluna ${i + 1}`);
      const dados = linhas.slice(1).map((linha) => Array.from({ length: colunas }, (_, i) => String(linha[i] ?? "").trim()));
      aoAplicar({ ...selecionado, cabecalhos, linhas: dados } as Bloco);
    } catch (causa) {
      setErro(causa instanceof Error ? causa.message : "Não foi possível importar a planilha.");
    } finally { if (arquivo.current) arquivo.current.value = ""; }
  }
  return <div className="fixed bottom-24 right-5 z-40 print:hidden"><input ref={arquivo} type="file" accept=".csv,.xlsx,.xls,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="hidden" onChange={(e) => e.target.files?.[0] && void importar(e.target.files[0])} /><button type="button" onClick={() => arquivo.current?.click()} className="rounded-lg border border-accent/30 bg-[#0d1a20]/95 px-3 py-2 text-xs font-semibold text-accent shadow-xl backdrop-blur hover:bg-[#14252d]"><Table2 className="mr-1 inline" size={14} /> Importar tabela</button>{erro && <p role="alert" className="mt-1 max-w-64 rounded bg-red-950/90 p-2 text-[11px] text-red-200">{erro}</p>}</div>;
}

// Girar e recortar (zoom) a foto, no painel — o recorte se posiciona com o ponto focal logo abaixo.
function GirarERecortar({ foto, aoMudar }: { foto: Extract<Bloco, { tipo: "foto" }>; aoMudar: (bloco: Bloco) => void }) {
  const rotacao = foto.rotacao ?? 0;
  const zoom = foto.zoom ?? 1;
  return <div className="space-y-2 rounded-lg border border-white/10 p-3">
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs font-semibold text-zinc-300">Girar e recortar</span>
      <button type="button" onClick={() => aoMudar({ ...foto, rotacao: ((rotacao + 90) % 360) as 0 | 90 | 180 | 270 } as Bloco)} className="rounded bg-white/10 px-2 py-1 text-[11px] font-semibold text-accent hover:bg-white/15">Girar 90°</button>
    </div>
    <label className="block text-[11px] text-secondary">Zoom <span className="float-right text-accent">{Math.round(zoom * 100)}%</span>
      <input type="range" min="1" max="2.5" step="0.05" value={zoom} onChange={(e) => aoMudar({ ...foto, zoom: Number(e.target.value) } as Bloco)} className="mt-1 w-full accent-accent" />
    </label>
  </div>;
}

function ControleDocumento({ id, status, podeAprovar, alterando, aoMudar, versoes }: {
  id: string;
  status: "RASCUNHO" | "EM_REVISAO" | "APROVADO";
  podeAprovar: boolean;
  alterando: boolean;
  aoMudar: (status: "RASCUNHO" | "EM_REVISAO" | "APROVADO") => void;
  versoes: { numero: number; criadoEm: string }[];
}) {
  const { confirmar, avisar } = useConfirm();
  const [restaurando, setRestaurando] = useState<number | null>(null);
  async function restaurar(numero: number) {
    if (!(await confirmar({ mensagem: `Restaurar a versão ${numero}? O conteúdo atual será substituído.`, confirmarLabel: "Restaurar" }))) return;
    setRestaurando(numero);
    const resultado = await restaurarVersaoRelatorio(id, numero);
    if (!resultado.ok) { void avisar(resultado.erro); setRestaurando(null); return; }
    window.location.reload();
  }
  return <section className="space-y-3 border-t border-white/10 pt-4">
    <strong className="block text-sm text-zinc-200">Controle do documento</strong>
    <label className="block text-xs text-secondary">Etapa editorial
      <select value={status} disabled={alterando} onChange={(e) => aoMudar(e.target.value as "RASCUNHO" | "EM_REVISAO" | "APROVADO")} className={`${campo} mt-1`}>
        <option value="RASCUNHO">Rascunho</option><option value="EM_REVISAO">Em revisão</option>
        {podeAprovar && <option value="APROVADO">Aprovado</option>}
      </select>
    </label>
    <p className="text-[11px] leading-4 text-muted">{status === "APROVADO" ? "Documento aprovado." : status === "EM_REVISAO" ? "Aguardando análise." : "Ainda em elaboração."}</p>
    <div className="rounded-lg border border-white/10 p-3 text-xs text-secondary"><strong className="block text-zinc-200">Versões salvas</strong>{versoes.length ? <ul className="mt-2 space-y-2">{versoes.map((versao) => <li key={versao.numero} className="flex items-center justify-between gap-2"><span>v{versao.numero} · {new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(versao.criadoEm))}</span><button type="button" disabled={restaurando !== null} onClick={() => restaurar(versao.numero)} className="text-[10px] font-semibold text-accent hover:text-white">{restaurando === versao.numero ? "Restaurando…" : "Restaurar"}</button></li>)}</ul> : <p className="mt-1">Use “Salvar relatório” para criar a primeira versão.</p>}</div>
  </section>;
}

// Logo do parceiro: anexada aqui, sai à direita do cabeçalho (tela e PDF). Grava
// na hora, então só existe depois que o relatório foi salvo a primeira vez.
function TextoMarcaEditor({ texto }: { texto: string }) {
  const [rotulo, ...resto] = texto.split("\n").map((l) => l.trim()).filter(Boolean);
  const nome = resto.join(" ");
  return <div className="mr-auto ml-6 min-w-0 border-l border-zinc-300 pl-5">
    {nome && <p className="text-[10px] font-semibold uppercase tracking-[.2em] text-muted">{rotulo}</p>}
    <p className="text-2xl font-semibold leading-tight text-marca-azul">{nome || rotulo}</p>
    <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted">uma iniciativa <Logo fundo="claro" className="h-4 w-auto" /></p>
  </div>;
}

function DicaTrocarLogo({ direita = false }: { direita?: boolean }) {
  return <span className={`pointer-events-none absolute top-full z-40 mt-1 whitespace-nowrap rounded bg-[#14252d] px-2 py-1 text-[10px] font-semibold text-zinc-200 opacity-0 shadow transition group-hover:opacity-100 ${direita ? "right-2" : "left-2"}`}>Clique para mudar a logo</span>;
}

// Logo da esquerda: a da empresa (padrão) ou uma da biblioteca de logos.
function SeletorLogoPrincipal({ relatorioId, biblioteca, aoMudar, aoImportar, aoEscolherPendente, aoExcluir }: { relatorioId: string | null; biblioteca: LogoBiblioteca[]; aoMudar: (url: string | null) => void; aoImportar: (logo: LogoBiblioteca) => void; aoEscolherPendente: (logoId: string | null) => void; aoExcluir: (logo: LogoBiblioteca) => void }) {
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  async function escolher(logoId: string | null, logoNova?: LogoBiblioteca) {
    if (!relatorioId) {
      aoEscolherPendente(logoId);
      return aoMudar(logoId ? (logoNova ?? biblioteca.find((item) => item.id === logoId))?.url ?? null : null);
    }
    setErro(null);
    setSalvando(true);
    const resultado = await escolherLogoPrincipalDoEditor(relatorioId, logoId);
    setSalvando(false);
    if (!resultado.ok) return setErro(resultado.erro);
    aoMudar(resultado.url);
  }
  return <section className="space-y-2">
    <strong className="block text-sm text-zinc-200">Logo principal</strong>
    <>
      <button type="button" disabled={salvando} onClick={() => escolher(null)} className="flex w-full items-center gap-3 rounded-lg border border-white/10 bg-white p-2 text-left hover:border-accent disabled:opacity-40"><Logo fundo="claro" className="h-8 w-auto max-w-[55%]" /><span className="text-[11px] font-semibold text-subtle">Usar a logo da empresa (padrão)</span></button>
      <span className="block text-xs text-secondary">Ou clique numa logo da lista:</span>
      <GradeLogos logos={biblioteca} desabilitado={salvando} aoEscolher={(id) => escolher(id)} aoExcluir={aoExcluir} />
      <ImportarLogo tipo="PROGRAMA" rotulo="Importar logo" aoImportar={(logo) => { aoImportar(logo); escolher(logo.id, logo); }} />
      {erro && <p role="alert" className="text-[11px] text-red-400">{erro}</p>}
      <p className="text-[11px] leading-4 text-muted">A importada fica na lista para os próximos relatórios. Passe o mouse numa logo e clique no × para apagar da lista.</p>
    </>
  </section>;
}

// Logo do parceiro/programa nas folhas do editor (capa e rodapé), igual ao PDF.
// − / + que aparecem ao passar o mouse na logo; o tamanho vale pra todas as
// páginas e pro PDF.
function AjusteTamanhoLogo({ valor, aoMudar }: { valor: number; aoMudar: (valor: number) => void; direita?: boolean; acima?: boolean }) {
  const gesto = usePointerDrag();
  const [arrastando, setArrastando] = useState(false);
  const ajustar = (novo: number) => aoMudar(Math.round(Math.min(2.5, Math.max(0.5, novo)) * 20) / 20);
  return <button
    type="button"
    title="Arraste ou use as setas para ajustar o tamanho. Home: mínimo. End: máximo."
    aria-label="Redimensionar logo"
    onPointerDown={e => {
      e.preventDefault();
      e.stopPropagation();
      const x = e.clientX, y = e.clientY;
      const iniciado = gesto.iniciar(e, {
        mover: movimento => ajustar(valor + (movimento.clientX - x + y - movimento.clientY) / 160),
        concluir: () => setArrastando(false),
        cancelar: () => setArrastando(false),
      });
      if (iniciado) setArrastando(true);
    }}
    onBlur={gesto.cancelar}
    onKeyDown={e => {
      if (["ArrowUp", "ArrowRight", "ArrowDown", "ArrowLeft", "Home", "End"].includes(e.key)) {
        e.preventDefault();
        ajustar(e.key === "Home" ? 0.5 : e.key === "End" ? 2.5 : valor + (["ArrowUp", "ArrowRight"].includes(e.key) ? 0.05 : -0.05));
      }
    }}
    onDoubleClick={() => aoMudar(1)}
    className={`absolute z-40 flex h-5 w-5 touch-none items-center justify-center rounded-sm border-2 border-accent bg-white text-emerald-700 shadow transition focus:opacity-100 group-hover/tam:opacity-100 ${arrastando ? "opacity-100" : "opacity-0"} -right-2 -top-2 cursor-nesw-resize`}
  >
    <Maximize2 size={10} />
    {arrastando && <span className="pointer-events-none absolute -top-6 left-1/2 -translate-x-1/2 rounded bg-[#14252d] px-1.5 py-0.5 text-[10px] font-semibold text-zinc-200">{Math.round(valor * 100)}%</span>}
  </button>;
}

function MarcaParceiroEditor({ url, rotulo, grande = false, escala = 1 }: { url: string; rotulo: string | null; grande?: boolean; escala?: number }) {
  return <div className="flex shrink-0 flex-col items-end gap-1">{rotulo && <span className={`font-semibold uppercase tracking-[.18em] text-muted ${grande ? "text-[11px]" : "text-[9px]"}`}>{rotulo}</span>}<img src={url} alt="Logo do parceiro" className="object-contain" style={{ maxHeight: (grande ? 38 : 46) * escala, maxWidth: (grande ? 135 : 180) * escala }} /></div>;
}

function CampoFolha({ rotulo, valor }: { rotulo: string; valor: string }) {
  return <div className="min-w-0"><span className="block text-[10px] font-bold uppercase tracking-[.18em] text-emerald-700">{rotulo}</span><span className="mt-0.5 block truncate text-[15px] text-marca-azul">{valor}</span></div>;
}

type LogoBiblioteca = { id: string; nome: string; tipo: string; url: string | null };

// Importa uma imagem pra biblioteca de logos (fica disponível em todos os
// relatórios) e devolve a logo nova pra já ser escolhida.
function ImportarLogo({ tipo, rotulo, aoImportar }: { tipo: "PARCEIRO" | "PROGRAMA"; rotulo: string; aoImportar: (logo: LogoBiblioteca) => void }) {
  const { perguntar } = useConfirm();
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  async function enviar(e: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0];
    e.target.value = "";
    if (!arquivo) return;
    const nome = await perguntar({ titulo: "Nova logo", mensagem: "Nome da logo (ex.: Koppert)", valorInicial: arquivo.name.replace(/\.[^.]+$/, ""), confirmarLabel: "Importar" });
    if (nome === null) return;
    setErro(null);
    setEnviando(true);
    const fd = new FormData();
    fd.set("arquivo", arquivo);
    fd.set("nome", nome);
    fd.set("tipo", tipo);
    const resultado = await importarLogoBiblioteca(fd);
    setEnviando(false);
    if (!resultado.ok) return setErro(resultado.erro);
    aoImportar(resultado.logo);
  }
  return <>
    <label className={`${botao} flex w-full cursor-pointer items-center justify-center gap-1 ${enviando ? "pointer-events-none opacity-40" : ""}`}><ImagePlus size={13} /> {enviando ? "Importando…" : rotulo}<input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={enviar} disabled={enviando} /></label>
    {erro && <p role="alert" className="text-[11px] text-red-400">{erro}</p>}
  </>;
}

function GradeLogos({ logos, desabilitado, aoEscolher, aoExcluir }: { logos: LogoBiblioteca[]; desabilitado: boolean; aoEscolher: (id: string) => void; aoExcluir: (logo: LogoBiblioteca) => void }) {
  if (!logos.length) return null;
  return <div className="grid grid-cols-2 gap-2">{logos.map((logo) => <div key={logo.id} className="group/item relative">
    <button type="button" disabled={desabilitado} onClick={() => aoEscolher(logo.id)} title={logo.nome} className="flex h-14 w-full items-center justify-center rounded-lg border border-white/10 bg-white p-2 hover:border-accent disabled:opacity-40">{logo.url ? <img src={logo.url} alt={logo.nome} className="max-h-full max-w-full object-contain" /> : <span className="text-[10px] text-muted">{logo.nome}</span>}</button>
    <button type="button" disabled={desabilitado} onClick={() => aoExcluir(logo)} title={`Apagar ${logo.nome} da lista`} aria-label={`Apagar ${logo.nome} da lista`} className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-600 text-white opacity-0 shadow transition hover:bg-red-500 group-hover/item:opacity-100"><X size={11} /></button>
  </div>)}</div>;
}

function LogoParceiroCampo({ relatorioId, url, aoMudar, biblioteca, aoImportar, aoEscolherPendente, aoExcluir }: { relatorioId: string | null; url: string | null; aoMudar: (logo: { url: string; rotulo: string | null } | null) => void; biblioteca: LogoBiblioteca[]; aoImportar: (logo: LogoBiblioteca) => void; aoEscolherPendente: (logoId: string | null) => void; aoExcluir: (logo: LogoBiblioteca) => void }) {
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function usarDaBiblioteca(logoId: string, logoNova?: LogoBiblioteca) {
    if (!logoId) return;
    if (!relatorioId) {
      const logo = logoNova ?? biblioteca.find((item) => item.id === logoId);
      if (!logo?.url) return;
      aoEscolherPendente(logoId);
      return aoMudar({ url: logo.url, rotulo: "Em parceria com" });
    }
    setErro(null);
    setEnviando(true);
    const resultado = await escolherLogoDaBibliotecaDoEditor(relatorioId, logoId);
    setEnviando(false);
    if (!resultado.ok) return setErro(resultado.erro);
    aoMudar({ url: resultado.url, rotulo: resultado.rotulo });
  }

  async function remover() {
    if (!relatorioId) {
      aoEscolherPendente(null);
      return aoMudar(null);
    }
    setErro(null);
    setEnviando(true);
    const resultado = await removerLogoParceiroDoEditor(relatorioId);
    setEnviando(false);
    if (!resultado.ok) return setErro(resultado.erro);
    aoMudar(null);
  }

  return <section className="space-y-2 border-t border-white/10 pt-4">
    <strong className="block text-sm text-zinc-200">Logo do parceiro / programa</strong>
    {url && <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-white p-2"><img src={url} alt="Logo do parceiro" className="max-h-14 min-w-0 flex-1 object-contain" /><button type="button" disabled={enviando} onClick={remover} className="shrink-0 rounded-md border border-red-300 px-2 py-1 text-[11px] font-semibold text-red-600 hover:bg-red-50">Remover</button></div>}
    {biblioteca.length > 0 && <span className="block text-xs text-secondary">Clique numa logo para usar:</span>}
    <GradeLogos logos={biblioteca} desabilitado={enviando} aoEscolher={(id) => usarDaBiblioteca(id)} aoExcluir={aoExcluir} />
    <ImportarLogo tipo="PARCEIRO" rotulo="Importar logo de parceiro" aoImportar={(logo) => { aoImportar(logo); usarDaBiblioteca(logo.id, logo); }} />
    {erro && <p role="alert" className="text-[11px] text-red-400">{erro}</p>}
    <p className="text-[11px] leading-4 text-muted">A logo importada fica na lista para os próximos relatórios. Passe o mouse numa logo e clique no × para apagar da lista.</p>
  </section>;
}

function Propriedades({ rascunho, alterar, opcoesClientes, opcoesFazendas, trabalhos }: { rascunho: Rascunho; alterar: (m: Partial<Rascunho>) => void; opcoesClientes: ComboBoxOpcao[]; opcoesFazendas: ComboBoxOpcao[]; trabalhos: { id: string; nome: string }[] }) {
  return <><strong>Documento</strong><label className="block text-xs text-secondary">Tipo<select className={`${campo} mt-1`} value={rascunho.tipo} onChange={(e) => alterar({ tipo: e.target.value as Rascunho["tipo"], categoria: e.target.value === "TECNICO" ? "TECNICA" : rascunho.categoria })}><option value="VISITA">Relatório de visita</option><option value="TECNICO">Relatório técnico</option></select></label><label className="block text-xs text-secondary">Categoria *<select required className={`${campo} mt-1`} value={rascunho.categoria} onChange={(e) => alterar({ categoria: e.target.value })}>{CATEGORIAS_VISITA.map((item) => <option key={item.id} value={item.id}>{item.rotulo}</option>)}</select></label><div className="text-xs text-secondary">Cliente *<ComboBox key={rascunho.clienteId} opcoes={opcoesClientes} valor={rascunho.clienteId} placeholder="Digite o nome..." onSelecionar={(clienteId) => alterar({ clienteId, fazendaId: "" })} className="mt-1" /></div><div className="text-xs text-secondary">Fazenda<ComboBox key={`${rascunho.clienteId}:${rascunho.fazendaId}`} opcoes={opcoesFazendas} valor={rascunho.fazendaId} placeholder={rascunho.clienteId ? "Digite o nome..." : "Selecione o cliente"} disabled={!rascunho.clienteId} onSelecionar={(fazendaId) => alterar({ fazendaId })} className="mt-1" /></div><label className="block text-xs text-secondary">Data da visita<DateInput className={`${campo} mt-1`} value={rascunho.dataVisita} onChange={(e) => alterar({ dataVisita: e.target.value })} /></label>{rascunho.tipo === "TECNICO" && trabalhos.length > 0 && <label className="block text-xs text-secondary">Trabalho da safra<select className={`${campo} mt-1`} value={rascunho.trabalhoId} onChange={(e) => alterar({ trabalhoId: e.target.value })}><option value="">Avulso</option>{trabalhos.map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}</select></label>}
    <div className="space-y-2 border-t border-white/10 pt-4">
      <span className="block text-xs font-semibold text-zinc-300">Visibilidade no PDF</span>
      <Interruptor rotulo="Mostrar localização" ativo={rascunho.mostrarLocalizacao} aoMudar={(mostrarLocalizacao) => alterar({ mostrarLocalizacao })} />
      <Interruptor rotulo="Mostrar horários" ativo={rascunho.mostrarHorarios} aoMudar={(mostrarHorarios) => alterar({ mostrarHorarios })} />
      <p className="text-[11px] leading-4 text-muted">Vale para a capa e para a ficha da visita (chegada, saída e coordenadas do check-in).</p>
    </div></>;
}

function PainelCapa({ titulo, alterarTitulo, semCapa, alterarSemCapa, orientacao, alterarOrientacao, fotos, semFoto, mudarBlocos, aplicarModelo }: {
  orientacao: "PAISAGEM" | "RETRATO";
  alterarOrientacao: (orientacao: "PAISAGEM" | "RETRATO") => void;
  titulo: string;
  alterarTitulo: (titulo: string) => void;
  semCapa: boolean;
  alterarSemCapa: (semCapa: boolean) => void;
  fotos: Extract<Bloco, { tipo: "foto" }>[];
  semFoto: boolean;
  mudarBlocos: (fn: (blocos: Bloco[]) => Bloco[]) => void;
  aplicarModelo: (modelo: ModeloDocumento) => void;
}) {
  function escolherFoto(id: string | null) {
    alterarSemCapa(false);
    mudarBlocos((atuais) => atuais.map((bloco) => bloco.tipo === "foto" ? { ...bloco, capa: id === null ? false : bloco.id === id } : bloco));
  }
  return <>
    <strong>Configurar capa</strong>
    <p className="text-xs leading-5 text-secondary">A capa fica antes da página 1 e não entra na numeração do conteúdo.</p>
    <label className="block text-xs text-secondary">Título da capa<input value={titulo} onChange={(e) => alterarTitulo(e.target.value)} placeholder="Título do relatório" className={`${campo} mt-1`} /></label>
    <div className="rounded-lg border border-white/10 p-3"><span className="mb-2 block text-xs font-semibold text-zinc-300">Modelos do documento</span><div className="grid grid-cols-1 gap-1"><button type="button" onClick={() => aplicarModelo("vistoria")} className={botao}>Vistoria técnica</button><button type="button" onClick={() => aplicarModelo("acompanhamento")} className={botao}>Acompanhamento de lavoura</button><button type="button" onClick={() => aplicarModelo("resultado")} className={botao}>Resultado de ensaio</button></div></div>
    <div><span className="mb-2 block text-xs text-secondary">Folha do PDF</span><div className="grid grid-cols-2 gap-2">{(["PAISAGEM", "RETRATO"] as const).map((op) => <button key={op} type="button" onClick={() => alterarOrientacao(op)} className={`${botao} ${orientacao === op ? "!border-accent !text-accent" : ""}`}>{op === "PAISAGEM" ? "A4 paisagem" : "A4 retrato"}</button>)}</div></div>
    <div className="space-y-2">
      <span className="block text-xs text-secondary">Na capa</span>
      <Interruptor rotulo="Mostrar capa" ativo={!semCapa} aoMudar={(ativo) => alterarSemCapa(!ativo)} />
      {!semCapa && fotos.length > 0 && <Interruptor rotulo="Foto na capa" ativo={!semFoto} aoMudar={(ativo) => escolherFoto(ativo ? fotos[0].id : null)} />}
    </div>
    {fotos.length > 0 ? <div><span className="mb-2 block text-xs text-secondary">Escolher foto da capa</span><div className="grid grid-cols-2 gap-2">{fotos.map((foto, indice) => <button key={foto.id} type="button" onClick={() => escolherFoto(foto.id)} className={`overflow-hidden rounded-lg border p-1 text-left ${!semCapa && (foto.capa || (!semFoto && !fotos.some((item) => item.capa) && indice === 0)) ? "border-accent" : "border-white/10"}`}><img src={foto.url} alt={`Opção de capa ${indice + 1}`} className="aspect-[4/3] w-full rounded object-cover" /><span className="mt-1 block truncate px-1 text-[10px] text-secondary">{foto.legenda || `Foto ${indice + 1}`}</span></button>)}</div></div> : <p className="rounded-lg border border-dashed border-white/10 p-3 text-xs text-muted">Adicione fotos na aba Bloco para poder escolher uma como capa.</p>}
  </>;
}

type EstadoAnotar = {
  ferramenta: FormaAnotacao | null; setFerramenta: (forma: FormaAnotacao | null) => void;
  cor: string; setCor: (cor: string) => void;
  espessura: number; setEspessura: (espessura: number) => void;
  selecionada: string | null; setSelecionada: (id: string | null) => void;
};

function PainelBloco({ selecionado, inserir, atualizar, mudarBlocos, mover, duplicar, remover, fotoEmPaginaExclusiva, inputFotos, storageConfigurado, adicionarFotos, anotar }: { anotar: EstadoAnotar; selecionado: Bloco | null; inserir: (b: Bloco) => void; atualizar: (b: Bloco) => void; mudarBlocos: (fn: (b: Bloco[]) => Bloco[]) => void; mover: (id: string, d: -1 | 1) => void; duplicar: (b: Bloco) => void; remover: (id: string) => void; fotoEmPaginaExclusiva: (id: string) => void; inputFotos: React.RefObject<HTMLInputElement | null>; storageConfigurado: boolean; adicionarFotos: (f: FileList) => void }) {
  const t = selecionado?.tipo === "texto" ? selecionado : null;
  return <>
    <Grupo titulo="Inserir">
      <div className="grid grid-cols-4 gap-1">
        <BotaoInserir rotulo="Texto" onClick={() => inserir(novoTexto())}><Type size={16} /></BotaoInserir>
        <BotaoInserir rotulo="Gráfico" onClick={() => inserir(novoGrafico())}><BarChart3 size={16} /></BotaoInserir>
        <BotaoInserir rotulo="Tabela" onClick={() => inserir(novaTabela())}><Table2 size={16} /></BotaoInserir>
        <BotaoInserir rotulo="Fotos" onClick={() => inputFotos.current?.click()} disabled={!storageConfigurado}><ImagePlus size={16} /></BotaoInserir>
      </div>
      <input ref={inputFotos} type="file" accept="image/*" multiple className="hidden" onChange={(e) => e.target.files?.length && adicionarFotos(e.target.files)} />
      <MaisBlocos inserir={inserir} />
    </Grupo>
    {!selecionado && <p className="rounded-lg border border-dashed border-white/10 p-3 text-xs text-muted">Clique num bloco da folha para formatar.</p>}
    {selecionado && <Grupo titulo={`Organizar · ${NOMES_BLOCO[selecionado.tipo] ?? selecionado.tipo}`}>
      <div className="flex items-center gap-1">
        <BotaoFerramenta titulo="Subir" onClick={() => mover(selecionado.id, -1)}><ArrowUp size={15} /></BotaoFerramenta>
        <BotaoFerramenta titulo="Descer" onClick={() => mover(selecionado.id, 1)}><ArrowDown size={15} /></BotaoFerramenta>
        <BotaoFerramenta titulo="Duplicar" onClick={() => duplicar(selecionado)}><Copy size={15} /></BotaoFerramenta>
        <span className="mx-1 h-5 w-px bg-white/10" />
        <BotaoFerramenta titulo="Excluir" perigo onClick={() => remover(selecionado.id)}><Trash2 size={15} /></BotaoFerramenta>
      </div>
      <Interruptor rotulo="Começar em nova página" ativo={Boolean(selecionado.novaPagina)} aoMudar={(novaPagina) => atualizar({ ...selecionado, novaPagina } as Bloco)} />
    </Grupo>}
    {t && <>
      <Grupo titulo="Fonte">
        <div className="flex flex-wrap items-center gap-1">
          <BotaoFerramenta titulo="Negrito" ativo={t.negrito} onClick={() => atualizar({ ...t, negrito: !t.negrito })}><Bold size={15} /></BotaoFerramenta>
          <BotaoFerramenta titulo="Itálico" ativo={t.italico} onClick={() => atualizar({ ...t, italico: !t.italico })}><Italic size={15} /></BotaoFerramenta>
          <BotaoFerramenta titulo="Sublinhado" ativo={t.sublinhado} onClick={() => atualizar({ ...t, sublinhado: !t.sublinhado })}><Underline size={15} /></BotaoFerramenta>
          <span className="mx-1 h-5 w-px bg-white/10" />
        </div>
        <div className="flex items-center gap-1">
          <select title="Fonte" value={t.fonte ?? "padrao"} onChange={(e) => atualizar({ ...t, fonte: e.target.value as FonteTexto })} className="h-8 min-w-0 flex-1 rounded-md border border-white/10 bg-zinc-900 px-2 text-xs text-zinc-200 outline-none focus:border-accent">{FONTES_TEXTO.map((f) => <option key={f.id} value={f.id} style={{ fontFamily: f.css }}>{f.nome}</option>)}</select>
          <CampoTamanhoFonte valor={t.tamanhoPt ?? TAMANHO_PT_PADRAO[t.tamanho ?? "normal"]} aoMudar={(tamanhoPt) => atualizar({ ...t, tamanhoPt })} />
          <BotaoFerramenta titulo="Aumentar fonte" onClick={() => atualizar({ ...t, tamanhoPt: proximoTamanho(t.tamanhoPt ?? TAMANHO_PT_PADRAO[t.tamanho ?? "normal"], 1) })}><span className="text-xs font-bold">A<sup>+</sup></span></BotaoFerramenta>
          <BotaoFerramenta titulo="Diminuir fonte" onClick={() => atualizar({ ...t, tamanhoPt: proximoTamanho(t.tamanhoPt ?? TAMANHO_PT_PADRAO[t.tamanho ?? "normal"], -1) })}><span className="text-[10px] font-bold">A<sup>−</sup></span></BotaoFerramenta>
        </div>
        <LinhaCores rotulo="Cor" opcoes={[["padrao", "#3f3f46"], ["verde", "#047857"], ["azul", "#19323b"], ["vermelho", "#b91c1c"]]} valor={t.cor ?? "padrao"} aoMudar={(cor) => atualizar({ ...t, cor: cor as NonNullable<typeof t.cor> })} />
        <LinhaCores rotulo="Realce" opcoes={[["nenhum", "transparent"], ["verde", "#d1fae5"], ["azul", "#e0f2fe"], ["amarelo", "#fef3c7"]]} valor={t.destaque ?? "nenhum"} aoMudar={(destaque) => atualizar({ ...t, destaque: destaque as NonNullable<typeof t.destaque> })} />
      </Grupo>
      <Grupo titulo="Parágrafo">
        <div className="flex flex-wrap items-center gap-1">
          {([["esquerda", AlignLeft], ["centro", AlignCenter], ["direita", AlignRight], ["justificar", AlignJustify]] as const).map(([alinhamento, Icone]) => <BotaoFerramenta key={alinhamento} titulo={`Alinhar: ${alinhamento}`} ativo={(t.alinhamento ?? "esquerda") === alinhamento} onClick={() => atualizar({ ...t, alinhamento })}><Icone size={15} /></BotaoFerramenta>)}
          <span className="mx-1 h-5 w-px bg-white/10" />
          <BotaoFerramenta titulo="Lista com marcadores" ativo={t.lista} onClick={() => atualizar({ ...t, lista: !t.lista })}><List size={15} /></BotaoFerramenta>
          <BotaoFerramenta titulo="Subtítulo" ativo={t.subtitulo} onClick={() => atualizar({ ...t, subtitulo: !t.subtitulo })}><Heading size={15} /></BotaoFerramenta>
        </div>
        <div className="flex items-center justify-between gap-2"><span className="text-[11px] text-secondary">Entrelinhas</span><div className="flex gap-1">{(["compacto", "normal", "amplo"] as const).map((espacamentoLinha) => <button key={espacamentoLinha} type="button" onClick={() => atualizar({ ...t, espacamentoLinha })} className={`rounded-md border px-2 py-1 text-[11px] font-semibold ${(t.espacamentoLinha ?? "normal") === espacamentoLinha ? "border-accent text-accent" : "border-white/10 text-secondary hover:text-white"}`}>{espacamentoLinha === "compacto" ? "1,0" : espacamentoLinha === "normal" ? "1,5" : "2,0"}</button>)}</div></div>
      </Grupo>
    </>}
    {selecionado?.tipo === "destaque" && <PainelDestaque bloco={selecionado} atualizar={atualizar} />}
    {selecionado?.tipo === "indicadores" && <PainelIndicadores bloco={selecionado} atualizar={atualizar} />}
    {selecionado?.tipo === "divisor" && <PainelDivisor bloco={selecionado} atualizar={atualizar} />}
    {selecionado && selecionado.tipo !== "texto" && !ehBlocoAvulso(selecionado) && <Grupo titulo="Largura">
      <div className="grid grid-cols-3 gap-1">{(["terco", "metade", "inteira"] as LarguraBloco[]).map((largura) => <button key={largura} type="button" onClick={() => atualizar({ ...selecionado, largura } as Bloco)} className={`rounded-md border px-2 py-1.5 text-[11px] font-semibold ${larguraDoBloco(selecionado) === largura ? "border-accent bg-accent/15 text-accent" : "border-white/10 text-zinc-300 hover:border-white/30"}`}>{largura === "terco" ? "⅓ da linha" : largura === "metade" ? "½ linha" : "Inteira"}</button>)}</div>
    </Grupo>}
    {selecionado?.tipo === "foto" && <>
      <Grupo titulo="Imagem">
        <div className="flex items-center justify-between gap-2"><span className="text-[11px] text-secondary">Proporção</span><div className="flex gap-1">{(["paisagem", "panoramica", "quadrada", "retrato"] as const).map((proporcao) => <button key={proporcao} type="button" onClick={() => atualizar({ ...selecionado, proporcao })} className={`rounded-md border px-2 py-1 text-[11px] font-semibold ${(selecionado.proporcao ?? "paisagem") === proporcao ? "border-accent bg-accent/15 text-accent" : "border-white/10 text-zinc-300 hover:border-white/30"}`}>{proporcao === "paisagem" ? "16:9" : proporcao === "panoramica" ? "21:9" : proporcao === "quadrada" ? "1:1" : "3:4"}</button>)}</div></div>
        <Interruptor rotulo="Preencher a área (corta as bordas)" ativo={selecionado.ajuste !== "conter"} aoMudar={(preencher) => atualizar({ ...selecionado, ajuste: preencher ? "cobrir" : "conter" })} />
        <GirarERecortar foto={selecionado} aoMudar={atualizar} />
        {selecionado.ajuste !== "conter" && <PontoFocal foto={selecionado} aoMudar={atualizar} />}
      </Grupo>
      <Grupo titulo="Legenda"><div className="flex flex-wrap items-center gap-1"><FormatoTextoCurto rotulo="Legenda" estilo={selecionado.legendaEstilo} padraoNegrito={false} aoMudar={(legendaEstilo) => atualizar({ ...selecionado, legendaEstilo })} /></div></Grupo>
      <Grupo titulo="Anotações"><PainelAnotacoes foto={selecionado} atualizar={atualizar} anotar={anotar} /></Grupo>
      <Grupo titulo="Na página">
        <Interruptor rotulo="Usar como foto da capa" ativo={Boolean(selecionado.capa)} aoMudar={(capa) => mudarBlocos((atuais) => atuais.map((bloco) => bloco.tipo === "foto" ? { ...bloco, capa: capa && bloco.id === selecionado.id } : bloco))} />
        <button type="button" onClick={() => fotoEmPaginaExclusiva(selecionado.id)} className={`${botao} w-full`}>Foto sozinha em uma página</button>
      </Grupo>
    </>}
    {selecionado?.tipo === "tabela" && <Grupo titulo={`Tabela · ${selecionado.linhas.length} linhas × ${selecionado.cabecalhos.length} colunas`}>
      <div className="flex items-center gap-1">
        <BotaoFerramenta titulo="Adicionar linha" onClick={() => selecionado.linhas.length < 60 && atualizar({ ...selecionado, linhas: [...selecionado.linhas, selecionado.cabecalhos.map(() => "")] })}><span className="flex items-center text-[10px] font-bold"><Plus size={11} />L</span></BotaoFerramenta>
        <BotaoFerramenta titulo="Remover última linha" onClick={() => selecionado.linhas.length > 1 && atualizar({ ...selecionado, linhas: selecionado.linhas.slice(0, -1) })}><span className="flex items-center text-[10px] font-bold"><Minus size={11} />L</span></BotaoFerramenta>
        <span className="mx-1 h-5 w-px bg-white/10" />
        <BotaoFerramenta titulo="Adicionar coluna" onClick={() => selecionado.cabecalhos.length < 8 && atualizar({ ...selecionado, cabecalhos: [...selecionado.cabecalhos, `Coluna ${selecionado.cabecalhos.length + 1}`], linhas: selecionado.linhas.map((linha) => [...linha, ""]) })}><span className="flex items-center text-[10px] font-bold"><Plus size={11} />C</span></BotaoFerramenta>
        <BotaoFerramenta titulo="Remover última coluna" onClick={() => selecionado.cabecalhos.length > 1 && atualizar({ ...selecionado, cabecalhos: selecionado.cabecalhos.slice(0, -1), linhas: selecionado.linhas.map((linha) => linha.slice(0, -1)) })}><span className="flex items-center text-[10px] font-bold"><Minus size={11} />C</span></BotaoFerramenta>
      </div>
      <p className="text-[11px] text-muted">L = linha, C = coluna. Clique nas células da folha para escrever.</p>
    </Grupo>}
    {selecionado?.tipo === "grafico" && <>
      <Grupo titulo="Título do gráfico"><div className="flex flex-wrap items-center gap-1"><FormatoTextoCurto rotulo="Título" estilo={selecionado.tituloEstilo} padraoNegrito={true} aoMudar={(tituloEstilo) => atualizar({ ...selecionado, tituloEstilo })} /></div></Grupo>
      <Grupo titulo="Dados e aparência"><EditorGrafico bloco={selecionado} aoMudar={atualizar} /></Grupo>
    </>}
    {selecionado && <Grupo titulo="Espaçamento">
      <div className="grid grid-cols-2 gap-2"><label className="text-[11px] text-secondary">Acima (px)<input type="number" min="0" max="600" value={selecionado.margemSuperior ?? 0} onChange={(e) => atualizar({ ...selecionado, margemSuperior: Math.min(600, Math.max(0, Number(e.target.value))) } as Bloco)} className={`${campo} mt-1`} /></label><label className="text-[11px] text-secondary">Abaixo (px)<input type="number" min="0" max="64" value={selecionado.margemInferior ?? 0} onChange={(e) => atualizar({ ...selecionado, margemInferior: Math.min(64, Math.max(0, Number(e.target.value))) } as Bloco)} className={`${campo} mt-1`} /></label></div>
    </Grupo>}
  </>;
}

// Caixa de tamanho como a do Word: digita o número ou abre a lista completa.
function CampoTamanhoFonte({ valor, aoMudar }: { valor: number; aoMudar: (pt: number) => void }) {
  const [aberto, setAberto] = useState(false);
  const [digitado, setDigitado] = useState<string | null>(null);
  const aplicar = (texto: string) => { const pt = Number(texto.replace(",", ".")); if (pt >= 6 && pt <= 96) aoMudar(pt); setDigitado(null); };
  return <div className="relative" onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setAberto(false); }}>
    <div className="flex h-8 w-[4.5rem] items-center rounded-md border border-white/10 bg-zinc-900 focus-within:border-accent">
      <input title="Tamanho da fonte (pt)" inputMode="decimal" value={digitado ?? String(valor)} onChange={(e) => setDigitado(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { aplicar(e.currentTarget.value); setAberto(false); } }} onBlur={(e) => digitado !== null && aplicar(e.target.value)} className="h-full w-full min-w-0 bg-transparent pl-2 text-xs text-zinc-200 outline-none" />
      <button type="button" aria-label="Escolher tamanho" onClick={() => setAberto((a) => !a)} className="flex h-full w-6 shrink-0 items-center justify-center text-secondary hover:text-white"><ChevronDown size={13} /></button>
    </div>
    {aberto && <div className="absolute right-0 top-full z-50 mt-1 max-h-64 w-20 overflow-y-auto rounded-md border border-white/10 bg-[#0f1d23] py-1 shadow-xl">
      {TAMANHOS_PT.map((pt) => <button key={pt} type="button" onClick={() => { aoMudar(pt); setDigitado(null); setAberto(false); }} className={`block w-full px-3 py-1 text-left text-xs hover:bg-white/10 ${pt === valor ? "font-bold text-accent" : "text-zinc-200"}`}>{pt}</button>)}
    </div>}
  </div>;
}

// Tamanho em pt equivalente aos antigos P/M/G (blocos salvos antes da escolha em pt).
const TAMANHO_PT_PADRAO = { pequeno: 9, normal: 11, grande: 14 } as const;
function proximoTamanho(atual: number, direcao: 1 | -1): number {
  const lista = direcao === 1 ? TAMANHOS_PT : [...TAMANHOS_PT].reverse();
  return lista.find((pt) => (direcao === 1 ? pt > atual : pt < atual)) ?? atual;
}

const NOMES_BLOCO: Partial<Record<Bloco["tipo"], string>> = { texto: "Texto", foto: "Foto", grafico: "Gráfico", tabela: "Tabela", destaque: "Destaque", indicadores: "Indicadores", divisor: "Separador" };

// Linha tracejada onde a folha A4 acaba: se o conteúdo passar disso, o PDF
// continua numa folha nova a partir daqui (a folha do editor só cresce).
function MarcasQuebraFolha({ paisagem }: { paisagem: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [medidas, setMedidas] = useState({ folha: 0, total: 0 });
  useEffect(() => {
    const folha = ref.current?.parentElement;
    if (!folha) return;
    const medir = () => setMedidas({ folha: folha.offsetWidth * (paisagem ? 210 / 297 : 297 / 210), total: folha.offsetHeight });
    medir();
    const observador = new ResizeObserver(medir);
    observador.observe(folha);
    return () => observador.disconnect();
  }, [paisagem]);
  const quebras: number[] = [];
  for (let y = medidas.folha; medidas.folha > 0 && y < medidas.total - 8; y += medidas.folha) quebras.push(y);
  return <div ref={ref} aria-hidden className="pointer-events-none absolute inset-0 z-30">
    {quebras.map((y, i) => <div key={i} style={{ top: y }} className="absolute inset-x-0 flex items-center gap-2">
      <span className="h-0 flex-1 border-t-2 border-dashed border-red-400/70" />
      <span className="rounded-full bg-red-500 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white">Fim da folha · o PDF continua na próxima</span>
      <span className="h-0 flex-1 border-t-2 border-dashed border-red-400/70" />
    </div>)}
  </div>;
}

// Miniatura que é a cópia reduzida da folha real do editor (capa ou página):
// clona o HTML da folha e encolhe pra largura da lateral. Atualiza logo depois
// de cada mudança (com um respiro pra não clonar a cada tecla).
function MiniaturaEspelho({ alvoId }: { alvoId: string }) {
  const caixa = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const alvo = document.getElementById(alvoId);
      const destino = caixa.current;
      if (!alvo || !destino) return;
      const copia = alvo.cloneNode(true) as HTMLElement;
      copia.removeAttribute("id");
      copia.querySelectorAll("[id]").forEach((el) => el.removeAttribute("id"));
      copia.style.width = `${alvo.offsetWidth}px`;
      copia.style.minHeight = `${alvo.offsetHeight}px`;
      copia.style.boxShadow = "none";
      copia.style.transformOrigin = "top left";
      copia.style.transform = `scale(${destino.clientWidth / alvo.offsetWidth})`;
      destino.replaceChildren(copia);
    }, 250);
    return () => window.clearTimeout(timer);
  });
  return <div ref={caixa} aria-hidden inert className="pointer-events-none absolute inset-0 overflow-hidden" />;
}

function AcaoMiniatura({ titulo, onClick, desabilitado, perigo, children }: { titulo: string; onClick: () => void; desabilitado?: boolean; perigo?: boolean; children: React.ReactNode }) {
  return <button type="button" title={titulo} aria-label={titulo} disabled={desabilitado} onClick={onClick} className={`flex h-5 w-5 items-center justify-center rounded disabled:opacity-30 ${perigo ? "text-red-400 hover:bg-red-500/20" : "text-zinc-200 hover:bg-white/15"}`}>{children}</button>;
}

// Grupo do painel no estilo da faixa de opções do PowerPoint: título pequeno
// em caixa alta e as ferramentas logo abaixo.
function Grupo({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return <section className="space-y-2 border-t border-white/10 pt-3 first:border-t-0 first:pt-0">
    <h3 className="text-[10px] font-bold uppercase tracking-[.16em] text-muted">{titulo}</h3>
    {children}
  </section>;
}

function BotaoInserir({ rotulo, onClick, disabled, children }: { rotulo: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return <button type="button" onClick={onClick} disabled={disabled} className="flex flex-col items-center gap-1 rounded-lg border border-white/10 bg-white/[0.03] py-2 text-[10px] font-semibold text-zinc-300 hover:border-accent/60 hover:text-white disabled:opacity-40">{children}{rotulo}</button>;
}

function BotaoFerramenta({ titulo, ativo, perigo, onClick, children }: { titulo: string; ativo?: boolean; perigo?: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" title={titulo} aria-label={titulo} aria-pressed={ativo} onClick={onClick} className={`flex h-8 w-8 items-center justify-center rounded-md border transition ${ativo ? "border-accent bg-accent/15 text-accent" : perigo ? "border-white/10 text-red-400 hover:border-red-400/50 hover:bg-red-500/10" : "border-white/10 text-zinc-300 hover:border-white/30 hover:text-white"}`}>{children}</button>;
}

function LinhaCores({ rotulo, opcoes, valor, aoMudar }: { rotulo: string; opcoes: [string, string][]; valor: string; aoMudar: (valor: string) => void }) {
  return <div className="flex items-center justify-between gap-2"><span className="text-[11px] text-secondary">{rotulo}</span><div className="flex gap-1.5">{opcoes.map(([id, cor]) => <button key={id} type="button" title={id} aria-label={`${rotulo}: ${id}`} aria-pressed={valor === id} onClick={() => aoMudar(id)} style={{ background: cor }} className={`h-6 w-6 rounded-full border-2 ${valor === id ? "border-accent" : "border-white/20"} ${cor === "transparent" ? "bg-[linear-gradient(135deg,transparent_45%,#ef4444_45%,#ef4444_55%,transparent_55%)]" : ""}`} />)}</div></div>;
}

// Blocos extras guardados numa seção recolhida: o painel continua enxuto e quem
// precisa de uma caixa de destaque, números grandes ou um separador abre aqui.
function MaisBlocos({ inserir }: { inserir: (bloco: Bloco) => void }) {
  return <details className="rounded-lg border border-white/10 p-3 [&_summary]:cursor-pointer">
    <summary className="text-xs font-semibold text-zinc-300">Destaques e separadores</summary>
    <div className="mt-3 space-y-3">
      <div>
        <span className="mb-1.5 block text-[11px] text-secondary">Caixa de destaque</span>
        <div className="grid grid-cols-2 gap-2">{(Object.keys(ROTULOS_DESTAQUE) as VarianteDestaque[]).map((variante) => <button key={variante} type="button" onClick={() => inserir(novoDestaque(variante))} className={botao}>{ROTULOS_DESTAQUE[variante]}</button>)}</div>
      </div>
      <button type="button" onClick={() => inserir(novosIndicadores())} className={`${botao} w-full`}>Indicadores (números grandes)</button>
      <div>
        <span className="mb-1.5 block text-[11px] text-secondary">Separador</span>
        <div className="grid grid-cols-3 gap-2">{([["linha", "Linha"], ["pontilhada", "Pontilhada"], ["espaco", "Espaço"]] as const).map(([estilo, rotulo]) => <button key={estilo} type="button" onClick={() => inserir(novoDivisor(estilo))} className={botao}>{rotulo}</button>)}</div>
      </div>
    </div>
  </details>;
}

function PainelDestaque({ bloco, atualizar }: { bloco: BlocoDestaque; atualizar: (bloco: Bloco) => void }) {
  return <div className="space-y-2 rounded-lg border border-white/10 p-3">
    <span className="block text-xs font-semibold text-zinc-300">Tipo de destaque</span>
    <div className="grid grid-cols-2 gap-2">{(Object.keys(ROTULOS_DESTAQUE) as VarianteDestaque[]).map((variante) => <button key={variante} type="button" onClick={() => atualizar({ ...bloco, variante })} className={`${botao} ${bloco.variante === variante ? "!border-accent !text-accent" : ""}`}>{ROTULOS_DESTAQUE[variante]}</button>)}</div>
    <p className="text-[11px] leading-4 text-muted">O título e o texto se escrevem direto na caixa, na página.</p>
  </div>;
}

function PainelIndicadores({ bloco, atualizar }: { bloco: BlocoIndicadores; atualizar: (bloco: Bloco) => void }) {
  return <div className="space-y-2 rounded-lg border border-white/10 p-3">
    <span className="block text-xs font-semibold text-zinc-300">Indicadores ({bloco.itens.length} de 4)</span>
    <div className="grid grid-cols-2 gap-2">
      <button type="button" disabled={bloco.itens.length >= 4} onClick={() => atualizar({ ...bloco, itens: [...bloco.itens, { valor: "", rotulo: `Indicador ${bloco.itens.length + 1}` }] })} className={botao}><Plus size={14} /> Indicador</button>
      <button type="button" disabled={bloco.itens.length <= 1} onClick={() => atualizar({ ...bloco, itens: bloco.itens.slice(0, -1) })} className={botao}><Minus size={14} /> Indicador</button>
    </div>
    <p className="text-[11px] leading-4 text-muted">Escreva o número e o rótulo direto nos cartões, na página (ex.: “+12 sc/ha”, “Produtividade”).</p>
  </div>;
}

function PainelDivisor({ bloco, atualizar }: { bloco: BlocoDivisor; atualizar: (bloco: Bloco) => void }) {
  return <div className="space-y-2 rounded-lg border border-white/10 p-3">
    <span className="block text-xs font-semibold text-zinc-300">Estilo do separador</span>
    <div className="grid grid-cols-3 gap-2">{([["linha", "Linha"], ["pontilhada", "Pontilhada"], ["espaco", "Espaço"]] as [EstiloDivisor, string][]).map(([estilo, rotulo]) => <button key={estilo} type="button" onClick={() => atualizar({ ...bloco, estilo })} className={`${botao} ${bloco.estilo === estilo ? "!border-accent !text-accent" : ""}`}>{rotulo}</button>)}</div>
  </div>;
}

const FERRAMENTAS_ANOTAR: { forma: FormaAnotacao; icone: React.ReactNode }[] = [
  { forma: "elipse", icone: <Circle size={14} /> },
  { forma: "retangulo", icone: <Square size={14} /> },
  { forma: "linha", icone: <Slash size={14} /> },
  { forma: "seta", icone: <ArrowUpRight size={14} /> },
  { forma: "texto", icone: <Type size={14} /> },
  { forma: "etiqueta", icone: <Tag size={14} /> },
];

// Desenho sobre a foto, como num slide: círculo, retângulo, linha, seta, texto e etiqueta.
// Escolhe a forma e arrasta sobre a foto, na página; clicar numa marcação a seleciona.
function PainelAnotacoes({ foto, atualizar, anotar }: { foto: Extract<Bloco, { tipo: "foto" }>; atualizar: (bloco: Bloco) => void; anotar: EstadoAnotar }) {
  const anotacoes = foto.anotacoes ?? [];
  const escolhida = anotacoes.find((a) => a.id === anotar.selecionada) ?? null;
  const mudarAnotacao = (parte: Partial<AnotacaoFoto>) => escolhida && atualizar({ ...foto, anotacoes: anotacoes.map((a) => (a.id === escolhida.id ? { ...a, ...parte } : a)) });
  const escolherCor = (cor: string) => { anotar.setCor(cor); mudarAnotacao({ cor }); };
  const escolherEspessura = (espessura: number) => { anotar.setEspessura(espessura); mudarAnotacao({ espessura }); };
  return <details className="rounded-lg border border-white/10 p-3 [&_summary]:cursor-pointer" open={anotar.ferramenta !== null || anotacoes.length > 0}>
    <summary className="text-xs font-semibold text-zinc-300">Desenhar na foto{anotacoes.length > 0 ? ` (${anotacoes.length})` : ""}</summary>
    <div className="mt-3 space-y-3">
      <div className="grid grid-cols-6 gap-1">{FERRAMENTAS_ANOTAR.map(({ forma, icone }) => <button key={forma} type="button" title={ROTULOS_FORMA[forma]} aria-label={ROTULOS_FORMA[forma]} aria-pressed={anotar.ferramenta === forma} onClick={() => { anotar.setFerramenta(anotar.ferramenta === forma ? null : forma); anotar.setSelecionada(null); }} className={`${botao} !px-0 ${anotar.ferramenta === forma ? "!border-accent !text-accent" : ""}`}>{icone}</button>)}</div>
      <p className="text-[11px] leading-4 text-muted">{anotar.ferramenta ? `${ROTULOS_FORMA[anotar.ferramenta]}: ${anotar.ferramenta === "texto" || anotar.ferramenta === "etiqueta" ? "clique na foto e digite." : "arraste sobre a foto."} Clique na forma de novo para parar.` : "Escolha uma forma e desenhe na foto. Para editar uma marcação, clique nela."}</p>
      <div className="flex items-center gap-2">{CORES_ANOTACAO.map(({ cor, rotulo }) => <button key={cor} type="button" title={rotulo} aria-label={rotulo} onClick={() => escolherCor(cor)} className={`h-6 w-6 rounded-full border-2 ${(escolhida ? escolhida.cor : anotar.cor) === cor ? "border-accent" : "border-white/30"}`} style={{ backgroundColor: cor }} />)}</div>
      <div className="grid grid-cols-3 gap-1">{ESPESSURAS_ANOTACAO.map(({ valor, rotulo }) => <button key={valor} type="button" onClick={() => escolherEspessura(valor)} className={`${botao} ${(escolhida ? escolhida.espessura : anotar.espessura) === valor ? "!border-accent !text-accent" : ""}`}>{rotulo}</button>)}</div>
      {escolhida && <div className="space-y-2 rounded-lg border border-accent/30 bg-accent/5 p-2">
        <span className="block text-[11px] font-semibold text-accent">Marcação selecionada: {ROTULOS_FORMA[escolhida.forma]}</span>
        {(escolhida.forma === "texto" || escolhida.forma === "etiqueta") && <input value={escolhida.texto ?? ""} onChange={(e) => mudarAnotacao({ texto: e.target.value })} placeholder="Texto da marcação" className={`${campo} !py-1.5`} />}
        <button type="button" onClick={() => { atualizar({ ...foto, anotacoes: anotacoes.filter((a) => a.id !== escolhida.id) }); anotar.setSelecionada(null); }} className={`${botao} w-full !text-red-400`}><Trash2 size={14} /> Apagar marcação</button>
      </div>}
      {anotacoes.length > 0 && <button type="button" onClick={() => { atualizar({ ...foto, anotacoes: [] }); anotar.setSelecionada(null); }} className={`${botao} w-full`}>Limpar todas as marcações</button>}
    </div>
  </details>;
}

// Proporção (largura/altura) natural de uma imagem, lida no navegador.
function useProporcaoImagem(url: string): number | null {
  const [proporcao, setProporcao] = useState<number | null>(null);
  useEffect(() => {
    let ativo = true;
    const imagem = new window.Image();
    imagem.onload = () => { if (ativo && imagem.naturalHeight) setProporcao(imagem.naturalWidth / imagem.naturalHeight); };
    imagem.src = url;
    return () => { ativo = false; };
  }, [url]);
  return proporcao;
}

// Ponto focal da foto. Com a foto "preenchendo" o quadro, só existe folga para
// mover no eixo em que ela é maior que o quadro (ou em qualquer eixo, com zoom).
// Uma foto 4:3 num quadro 16:9, por exemplo, já ocupa toda a largura: o
// controle horizontal não teria o que mover — então avisa em vez de parecer quebrado.
function PontoFocal({ foto, aoMudar }: { foto: Extract<Bloco, { tipo: "foto" }>; aoMudar: (bloco: Bloco) => void }) {
  const naturalDaFoto = useProporcaoImagem(foto.url);
  const girada = (foto.rotacao ?? 0) === 90 || (foto.rotacao ?? 0) === 270;
  const razaoFoto = naturalDaFoto ? (girada ? 1 / naturalDaFoto : naturalDaFoto) : null;
  const razaoQuadro = foto.proporcao === "quadrada" ? 1 : foto.proporcao === "retrato" ? 3 / 4 : foto.proporcao === "panoramica" ? 21 / 9 : 16 / 9;
  const comZoom = (foto.zoom ?? 1) > 1;
  const folgaHorizontal = comZoom || razaoFoto === null || razaoFoto > razaoQuadro + 0.02;
  const folgaVertical = comZoom || razaoFoto === null || razaoFoto < razaoQuadro - 0.02;
  const controle = (rotulo: string, valor: number, ativo: boolean, aviso: string, aoAlterar: (valor: number) => void) => (
    <label className={`block text-[11px] ${ativo ? "text-secondary" : "text-subtle"}`}>{rotulo}
      <input type="range" min="0" max="100" value={valor} disabled={!ativo} onChange={(e) => aoAlterar(Number(e.target.value))} className="w-full accent-accent disabled:opacity-40" />
      {!ativo && <span className="block text-[10px] leading-4 text-amber-300/80">{aviso}</span>}
    </label>
  );
  return <div className="space-y-2 rounded-lg border border-white/10 p-3">
    <span className="text-xs font-semibold text-zinc-300">Ponto focal</span>
    {controle("Horizontal", foto.focoX ?? 50, folgaHorizontal, "A foto já ocupa toda a largura do quadro. Use o zoom (Recorte / zoom) ou outra proporção para mover.", (focoX) => aoMudar({ ...foto, focoX }))}
    {controle("Vertical", foto.focoY ?? 50, folgaVertical, "A foto já ocupa toda a altura do quadro. Use o zoom (Recorte / zoom) ou outra proporção para mover.", (focoY) => aoMudar({ ...foto, focoY }))}
  </div>;
}

function EditorGrafico({ bloco, aoMudar }: { bloco: BlocoGrafico; aoMudar: (bloco: BlocoGrafico) => void }) {
  const { avisar } = useConfirm();
  const arquivo = useRef<HTMLInputElement>(null);
  const numero = (valor: string) => { const n = Number(valor.replace(",", ".")); return valor.trim() && Number.isFinite(n) ? n : null; };
  const paleta = ["#00dc4d", "#38bdf8", "#fbbf24", "#f472b6", "#a78bfa", "#fb923c"];
  const porItem = coresPorCategoria(bloco) || bloco.formato === "pizza" || bloco.formato === "rosca";
  const mudarLinhas = (linhas: BlocoGrafico["linhas"]) => aoMudar({ ...bloco, linhas });
  async function importar(arquivoSelecionado: File) {
    try {
      let matriz: unknown[][];
      if (/\.csv$/i.test(arquivoSelecionado.name) || arquivoSelecionado.type.includes("csv")) {
        const texto = await arquivoSelecionado.text(); const delimitador = (texto.match(/;/g)?.length ?? 0) > (texto.match(/,/g)?.length ?? 0) ? ";" : ",";
        matriz = texto.split(/\r?\n/).filter((linha) => linha.trim()).map((linha) => linha.split(delimitador));
      } else {
        const XLSX = await import("xlsx"); const livro = XLSX.read(await arquivoSelecionado.arrayBuffer(), { type: "array" });
        matriz = XLSX.utils.sheet_to_json(livro.Sheets[livro.SheetNames[0]], { header: 1, defval: "" }) as unknown[][];
      }
      if (matriz.length < 2) throw new Error("A planilha precisa de cabeçalho e dados.");
      const series = matriz[0].slice(1, 7).map((v, i) => String(v).trim() || `Série ${i + 1}`);
      if (!series.length) throw new Error("Inclua ao menos uma coluna de valores.");
      aoMudar({ ...bloco, series, linhas: matriz.slice(1, 61).map((linha) => ({ rotulo: String(linha[0] ?? "").trim(), valores: series.map((_, i) => numero(String(linha[i + 1] ?? ""))) })).filter((linha) => linha.rotulo || linha.valores.some((v) => v !== null)) });
    } catch (erro) { void avisar(erro instanceof Error ? erro.message : "Não foi possível importar a planilha."); }
    finally { if (arquivo.current) arquivo.current.value = ""; }
  }
  function mudarCor(indice: number, cor: string) {
    const tamanho = porItem ? bloco.linhas.length : bloco.series.length;
    const cores = Array.from({ length: tamanho }, (_, i) => bloco.cores?.[i] ?? paleta[i % paleta.length]); cores[indice] = cor;
    aoMudar({ ...bloco, cores });
  }
  return <div className="space-y-4 rounded-lg border border-white/10 p-3">
    <section className="space-y-2"><strong className="block text-xs text-zinc-200">1. Tipo e leitura</strong><label className="block text-xs text-secondary">Formato<select value={bloco.formato} onChange={(e) => aoMudar({ ...bloco, formato: e.target.value as FormatoGrafico })} className={`${campo} mt-1`}>{FORMATOS_GRAFICO.map((formato) => <option key={formato} value={formato}>{ROTULOS_FORMATO[formato]}</option>)}</select></label><div className="grid grid-cols-2 gap-2"><label className="text-xs text-secondary">Eixo horizontal<input value={bloco.eixoX ?? ""} onChange={(e) => aoMudar({ ...bloco, eixoX: e.target.value })} placeholder="Ex.: Tratamento" className={`${campo} mt-1`} /></label><label className="text-xs text-secondary">Eixo vertical<input value={bloco.eixoY ?? ""} onChange={(e) => aoMudar({ ...bloco, eixoY: e.target.value })} placeholder="Ex.: Produtividade" className={`${campo} mt-1`} /></label></div><label className="block text-xs text-secondary">Unidade<input value={bloco.unidade ?? ""} onChange={(e) => aoMudar({ ...bloco, unidade: e.target.value })} placeholder="Ex.: kg/ha" className={`${campo} mt-1`} /></label></section>
    <section className="border-t border-white/10 pt-3"><div className="mb-2 flex items-center justify-between"><strong className="text-xs text-zinc-200">2. Dados</strong><button type="button" onClick={() => arquivo.current?.click()} className="text-[11px] font-semibold text-accent"><Table2 className="mr-1 inline" size={13} />Importar CSV / Excel</button></div><input ref={arquivo} type="file" accept=".csv,.xlsx,.xls,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="hidden" onChange={(e) => e.target.files?.[0] && void importar(e.target.files[0])} />{!porItem && <div className="mb-2 flex gap-1 overflow-x-auto">{bloco.series.map((serie, indice) => <label key={indice} className="min-w-28 flex-1 text-[10px] text-secondary">Série {indice + 1}<input value={serie} onChange={(e) => aoMudar({ ...bloco, series: bloco.series.map((item, i) => i === indice ? e.target.value : item) })} className={`${campo} mt-1`} /></label>)}<button type="button" disabled={bloco.series.length >= 6} onClick={() => aoMudar({ ...bloco, series: [...bloco.series, `Série ${bloco.series.length + 1}`], linhas: bloco.linhas.map((linha) => ({ ...linha, valores: [...linha.valores, null] })) })} className="mt-4 h-9 shrink-0 rounded border border-white/10 px-2 text-accent disabled:opacity-40">+</button></div>}<div className="overflow-x-auto"><table className="w-full min-w-[250px] text-xs"><thead><tr><th className="pb-1 text-left text-muted">Item</th>{bloco.series.map((serie, i) => <th key={i} className="pb-1 pl-1 text-left text-muted">{porItem ? "Valor" : serie || `Série ${i + 1}`}</th>)}<th /></tr></thead><tbody>{bloco.linhas.map((linha, indice) => <tr key={indice}><td><input value={linha.rotulo} onChange={(e) => mudarLinhas(bloco.linhas.map((item, i) => i === indice ? { ...item, rotulo: e.target.value } : item))} className={campo} /></td>{bloco.series.map((_, serie) => <td key={serie} className="pl-1"><input value={linha.valores[serie] ?? ""} onChange={(e) => mudarLinhas(bloco.linhas.map((item, i) => i === indice ? { ...item, valores: item.valores.map((valor, si) => si === serie ? numero(e.target.value) : valor) } : item))} inputMode="decimal" className={campo} /></td>)}<td><button type="button" onClick={() => mudarLinhas(bloco.linhas.filter((_, i) => i !== indice))} className="pl-1 text-red-400">×</button></td></tr>)}</tbody></table></div><button type="button" onClick={() => mudarLinhas([...bloco.linhas, { rotulo: `Item ${bloco.linhas.length + 1}`, valores: bloco.series.map(() => null) }])} className={`${botao} mt-2 w-full`}><Plus size={13} /> Adicionar item</button></section>
    <section className="border-t border-white/10 pt-3"><strong className="mb-2 block text-xs text-zinc-200">3. Cores {porItem ? "dos itens" : "das séries"}</strong><div className="grid grid-cols-1 gap-1">{(porItem ? bloco.linhas.map((linha) => linha.rotulo) : bloco.series).map((nome, indice) => <label key={indice} className="grid grid-cols-[30px_1fr] items-center gap-2 rounded px-1 py-1 text-xs text-secondary hover:bg-white/[.03]"><input type="color" value={bloco.cores?.[indice] ?? paleta[indice % paleta.length]} onChange={(e) => mudarCor(indice, e.target.value)} className="h-7 w-7 rounded border border-white/10 bg-transparent" /><span className="truncate">{nome || `Item ${indice + 1}`}</span></label>)}</div></section>
  </div>;
}

export function EditorGraficoLegado({ bloco, aoMudar }: { bloco: BlocoGrafico; aoMudar: (bloco: BlocoGrafico) => void }) {
  const { avisar } = useConfirm();
  const numero = (valor: string) => { const n = Number(valor.replace(",", ".")); return valor.trim() && Number.isFinite(n) ? n : null; };
  const arquivoPlanilha = useRef<HTMLInputElement>(null);
  async function importarPlanilha(arquivo: File) {
    try {
      let matriz: unknown[][];
      if (/\.csv$/i.test(arquivo.name) || arquivo.type.includes("csv")) {
        const separador = (await arquivo.text()).includes(";") ? ";" : ",";
        matriz = (await arquivo.text()).split(/\r?\n/).filter(Boolean).map((linha) => linha.split(separador).map((celula) => celula.trim()));
      } else {
        const XLSX = await import("xlsx");
        const planilha = XLSX.read(await arquivo.arrayBuffer(), { type: "array" });
        matriz = XLSX.utils.sheet_to_json<unknown[]>(planilha.Sheets[planilha.SheetNames[0]], { header: 1, defval: "" });
      }
      const [cabecalho, ...dados] = matriz.filter((linha) => linha.some((celula) => String(celula).trim()));
      if (!cabecalho || cabecalho.length < 2) throw new Error("A planilha precisa ter uma coluna de rótulos e ao menos uma coluna numérica.");
      const series = cabecalho.slice(1, 7).map((celula, indice) => String(celula).trim() || `Série ${indice + 1}`);
      aoMudar({
        ...bloco,
        series,
        linhas: dados.slice(0, 60).map((linha) => ({
          rotulo: String(linha[0] ?? "").trim(),
          valores: series.map((_, indice) => numero(String(linha[indice + 1] ?? ""))),
        })).filter((linha) => linha.rotulo || linha.valores.some((valor) => valor !== null)),
      });
    } catch (erro) {
      void avisar(erro instanceof Error ? erro.message : "Não foi possível importar a planilha.");
    } finally {
      if (arquivoPlanilha.current) arquivoPlanilha.current.value = "";
    }
  }
  function addSerie() {
    if (bloco.series.length >= 6) return;
    aoMudar({ ...bloco, series: [...bloco.series, `Série ${bloco.series.length + 1}`], linhas: bloco.linhas.map((linha) => ({ ...linha, valores: [...linha.valores, 0] })) });
  }
  function removerSerie(indice: number) {
    if (bloco.series.length <= 1) return;
    aoMudar({ ...bloco, series: bloco.series.filter((_, i) => i !== indice), cores: bloco.cores?.filter((_, i) => i !== indice), linhas: bloco.linhas.map((linha) => ({ ...linha, valores: linha.valores.filter((_, i) => i !== indice) })) });
  }
  const paleta = ["#00dc4d", "#38bdf8", "#fbbf24", "#f472b6", "#a78bfa", "#fb923c"];
  const coresDeCategorias = coresPorCategoria(bloco) || bloco.formato === "pizza" || bloco.formato === "rosca";
  const controlesCores = coresDeCategorias ? <div className="space-y-2 rounded-lg border border-white/10 p-3"><span className="block text-xs font-semibold text-zinc-300">Cor de cada {bloco.formato === "pizza" || bloco.formato === "rosca" ? "fatia" : "barra"}</span>{bloco.linhas.map((linha, indice) => <label key={indice} className="grid grid-cols-[34px_1fr] items-center gap-2 text-xs text-secondary"><input type="color" value={bloco.cores?.[indice] ?? paleta[indice % paleta.length]} onChange={(e) => { const cores = bloco.linhas.map((_, i) => bloco.cores?.[i] ?? paleta[i % paleta.length]); cores[indice] = e.target.value; aoMudar({ ...bloco, cores }); }} className="h-8 w-8 rounded border border-white/10 bg-transparent" /><span className="truncate">{linha.rotulo || `${bloco.formato === "pizza" || bloco.formato === "rosca" ? "Fatia" : "Barra"} ${indice + 1}`}</span></label>)}</div> : null;
  return <div className="space-y-3 rounded-lg border border-white/10 p-3">
    {controlesCores}
    <label className="block text-xs text-secondary">Formato<select value={bloco.formato} onChange={(e) => aoMudar({ ...bloco, formato: e.target.value as FormatoGrafico })} className={`${campo} mt-1`}>{FORMATOS_GRAFICO.map((formato) => <option key={formato} value={formato}>{ROTULOS_FORMATO[formato]}</option>)}</select></label>
    <div className="grid grid-cols-2 gap-2"><label className="text-xs text-secondary">Eixo horizontal<input value={bloco.eixoX ?? ""} onChange={(e) => aoMudar({ ...bloco, eixoX: e.target.value })} className={`${campo} mt-1`} /></label><label className="text-xs text-secondary">Eixo vertical<input value={bloco.eixoY ?? ""} onChange={(e) => aoMudar({ ...bloco, eixoY: e.target.value })} className={`${campo} mt-1`} /></label></div>
    <label className="block text-xs text-secondary">Unidade<input value={bloco.unidade ?? ""} onChange={(e) => aoMudar({ ...bloco, unidade: e.target.value })} placeholder="Ex: kg/ha" className={`${campo} mt-1`} /></label>
    <div className="space-y-2">{bloco.series.map((serie, indice) => <div key={indice} className="grid grid-cols-[34px_1fr_24px] gap-1"><input type="color" value={bloco.cores?.[indice] ?? ["#00dc4d", "#38bdf8", "#fbbf24", "#f472b6", "#a78bfa", "#fb923c"][indice]} onChange={(e) => { const paleta = ["#00dc4d", "#38bdf8", "#fbbf24", "#f472b6", "#a78bfa", "#fb923c"]; const cores = bloco.series.map((_, i) => bloco.cores?.[i] ?? paleta[i]); cores[indice] = e.target.value; aoMudar({ ...bloco, cores }); }} className="h-9 w-9 rounded border border-white/10 bg-transparent" /><input value={serie} onChange={(e) => aoMudar({ ...bloco, series: bloco.series.map((item, i) => i === indice ? e.target.value : item) })} className={campo} /><button type="button" onClick={() => removerSerie(indice)} disabled={bloco.series.length <= 1} className="text-red-400 disabled:opacity-30">×</button></div>)}</div>
    <div className="grid grid-cols-2 gap-2"><button type="button" onClick={addSerie} disabled={bloco.series.length >= 6} className={botao}><Plus size={13} /> Série</button><button type="button" onClick={() => arquivoPlanilha.current?.click()} className={botao}><Table2 size={13} /> CSV / Excel</button></div><input ref={arquivoPlanilha} type="file" accept=".csv,.xlsx,.xls,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="hidden" onChange={(e) => e.target.files?.[0] && void importarPlanilha(e.target.files[0])} />
    <div className="overflow-x-auto"><table className="w-full min-w-[260px] text-xs"><thead><tr><th className="pb-1 text-left text-muted">Rótulo</th>{bloco.series.map((serie, i) => <th key={i} className="pb-1 pl-1 text-muted">{serie || i + 1}</th>)}<th /></tr></thead><tbody>{bloco.linhas.map((linha, indice) => <tr key={indice}><td><input value={linha.rotulo} onChange={(e) => aoMudar({ ...bloco, linhas: bloco.linhas.map((item, i) => i === indice ? { ...item, rotulo: e.target.value } : item) })} className={campo} /></td>{bloco.series.map((_, serie) => <td key={serie} className="pl-1"><input value={linha.valores[serie] ?? ""} onChange={(e) => aoMudar({ ...bloco, linhas: bloco.linhas.map((item, i) => i === indice ? { ...item, valores: item.valores.map((valor, si) => si === serie ? numero(e.target.value) : valor) } : item) })} inputMode="decimal" className={campo} /></td>)}<td><button type="button" onClick={() => aoMudar({ ...bloco, linhas: bloco.linhas.filter((_, i) => i !== indice) })} className="pl-1 text-red-400">×</button></td></tr>)}</tbody></table></div>
    <button type="button" onClick={() => aoMudar({ ...bloco, linhas: [...bloco.linhas, { rotulo: `Item ${bloco.linhas.length + 1}`, valores: bloco.series.map(() => 0) }] })} className={`${botao} w-full`}><Plus size={13} /> Linha</button>
  </div>;
}

type EstiloCurto = { negrito?: boolean; tamanho?: "pequeno" | "normal" | "grande"; alinhamento?: "esquerda" | "centro" | "direita" };

// Botões de formatação de um texto curto (legenda da foto, título do gráfico).
function FormatoTextoCurto({ rotulo, estilo, padraoNegrito, aoMudar }: { rotulo: string; estilo: EstiloCurto | undefined; padraoNegrito: boolean; aoMudar: (estilo: EstiloCurto) => void }) {
  const atual = estilo ?? {};
  const negrito = atual.negrito ?? padraoNegrito;
  const alin = atual.alinhamento ?? "esquerda";
  const tam = atual.tamanho ?? "normal";
  const ordem = ["pequeno", "normal", "grande"] as const;
  const btn = (ativo: boolean) => `rounded p-1.5 transition hover:bg-white/10 ${ativo ? "bg-accent/20 text-accent" : "text-white"}`;
  return <>
    <span className="px-1 text-[10px] font-bold uppercase tracking-wider text-secondary">{rotulo}</span>
    <button type="button" title="Negrito" onClick={() => aoMudar({ ...atual, negrito: !negrito })} className={btn(negrito)}><Bold size={15} /></button>
    <button type="button" title="Alinhar à esquerda" onClick={() => aoMudar({ ...atual, alinhamento: "esquerda" })} className={btn(alin === "esquerda")}><AlignLeft size={15} /></button>
    <button type="button" title="Centralizar" onClick={() => aoMudar({ ...atual, alinhamento: "centro" })} className={btn(alin === "centro")}><AlignCenter size={15} /></button>
    <button type="button" title="Alinhar à direita" onClick={() => aoMudar({ ...atual, alinhamento: "direita" })} className={btn(alin === "direita")}><AlignRight size={15} /></button>
    <button type="button" title="Diminuir texto" disabled={tam === "pequeno"} onClick={() => aoMudar({ ...atual, tamanho: ordem[Math.max(0, ordem.indexOf(tam) - 1)] })} className={`${btn(false)} disabled:opacity-30`}><Minus size={15} /></button>
    <button type="button" title="Aumentar texto" disabled={tam === "grande"} onClick={() => aoMudar({ ...atual, tamanho: ordem[Math.min(2, ordem.indexOf(tam) + 1)] })} className={`${btn(false)} disabled:opacity-30`}><Plus size={15} /></button>
  </>;
}

function Interruptor({ rotulo, ativo, aoMudar }: { rotulo: string; ativo: boolean; aoMudar: (ativo: boolean) => void }) {
  return <button type="button" role="switch" aria-checked={ativo} onClick={() => aoMudar(!ativo)} className="flex w-full items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-semibold text-zinc-300 hover:border-accent/50">
    {rotulo}
    <span className={`relative h-5 w-9 rounded-full transition ${ativo ? "bg-accent" : "bg-white/15"}`}><span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${ativo ? "left-[18px]" : "left-0.5"}`} /></span>
  </button>;
}
