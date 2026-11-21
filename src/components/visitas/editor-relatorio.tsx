"use client";

// Editor do relatório no mesmo visual da leitura (dossiê, ver BlocosRender):
// o título, o relato e as legendas são editados clicando direto no texto.
// Todo bloco (texto, gráfico, foto) muda de lugar com as setas ↑ ↓ e foto/
// gráfico escolhem meia largura ou largura inteira — a tela e o PDF montam o
// documento nessa ordem (ver montarLayout).

import { NomeEmpresa } from "@/components/marca-empresa";
import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  atualizarRelatorioVisita,
  enviarFotoDoEditor,
  paginacaoDoRelatorio,
} from "@/app/actions/relatorios-visita";
import {
  autoLayout,
  fotoDeCapa,
  ehBlocoAvulso,
  larguraDoBloco,
  montarLayout,
  quebrasDePagina,
  type MapaPaginas,
  tituloDaSecao,
  tituloPadraoDaSecao,
  novoId,
  type Bloco,
  type BlocoGrafico,
  type BlocoVisual,
  type FormatoGrafico,
  FORMATOS_GRAFICO,
  ROTULOS_FORMATO,
  usaSerieUnica,
  type SemGeometria,
} from "@/lib/relatorio-conteudo";
import { ContinuaNaPagina, GraficoBloco, QuebraPagina } from "@/components/visitas/blocos-render";
import { Logo } from "@/components/logo";
import { ComboBox, type ComboBoxOpcao } from "@/components/ui/combo-box";
import { CATEGORIAS_VISITA, type CategoriaVisita } from "@/lib/visitas-categoria";
import { DateInput } from "@/components/ui/date-input";

const inputCls =
  "w-full rounded-lg border border-surface-border bg-zinc-800 px-3 py-2 text-sm text-white outline-none focus:border-accent";
const labelCls = "mb-1 block text-xs font-medium text-secondary";
const btnControle =
  "rounded-md bg-black/60 px-2 py-1 text-xs text-white hover:bg-black/80 disabled:opacity-30";
const btnGhost =
  "rounded px-2 py-1 text-xs text-secondary hover:bg-zinc-800 hover:text-zinc-200 disabled:opacity-40";

// Campo que parece texto do documento: sem borda até passar o mouse/focar.
const editavel =
  "w-full rounded-md bg-transparent outline-none ring-1 ring-transparent transition hover:ring-zinc-300/60 focus:ring-2 focus:ring-marca-verde/60";

// Aceita "12,5" e "12.5"; vazio vira null (buraco no gráfico, não zero).
function paraNumero(texto: string): number | null {
  const limpo = texto.trim().replace(",", ".");
  if (!limpo) return null;
  const n = Number(limpo);
  return Number.isFinite(n) ? n : null;
}

function graficoVazio(): SemGeometria<BlocoGrafico> {
  return {
    id: novoId(),
    tipo: "grafico",
    titulo: "",
    formato: "barra",
    series: ["Valor"],
    linhas: [
      { rotulo: "", valores: [null] },
      { rotulo: "", valores: [null] },
    ],
  };
}

// Geometria não importa mais pra exibição, mas o schema do `conteudo` exige:
// empilha tudo na ordem atual ao salvar.
function comGeometria(blocos: Bloco[]): Bloco[] {
  return autoLayout(
    blocos.map(({ pagina, x, y, w, h, ...resto }) => {
      void pagina;
      void x;
      void y;
      void w;
      void h;
      return resto as SemGeometria<Bloco>;
    }),
  );
}

// Textarea que cresce com o conteúdo, pra parecer um parágrafo do documento.
function TextoAutoAjuste({
  valor,
  aoMudar,
  placeholder,
  className,
}: {
  valor: string;
  aoMudar: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [valor]);
  return (
    <textarea
      ref={ref}
      value={valor}
      onChange={(e) => aoMudar(e.target.value)}
      placeholder={placeholder}
      rows={1}
      className={`${editavel} resize-none overflow-hidden px-2 py-1 ${className ?? ""}`}
    />
  );
}

function EditorGrafico({
  bloco,
  aoMudar,
}: {
  bloco: BlocoGrafico;
  aoMudar: (b: BlocoGrafico) => void;
}) {
  function mudarSerie(indice: number, nome: string) {
    const series = [...bloco.series];
    series[indice] = nome;
    aoMudar({ ...bloco, series });
  }

  function addColuna() {
    if (bloco.series.length >= 6) return;
    aoMudar({
      ...bloco,
      series: [...bloco.series, `Série ${bloco.series.length + 1}`],
      linhas: bloco.linhas.map((l) => ({ ...l, valores: [...l.valores, null] })),
    });
  }

  function removerColuna() {
    if (bloco.series.length <= 1) return;
    aoMudar({
      ...bloco,
      series: bloco.series.slice(0, -1),
      cores: bloco.cores?.slice(0, -1),
      linhas: bloco.linhas.map((l) => ({ ...l, valores: l.valores.slice(0, -1) })),
    });
  }

  function addLinha() {
    aoMudar({
      ...bloco,
      linhas: [...bloco.linhas, { rotulo: "", valores: bloco.series.map(() => null) }],
    });
  }

  function removerLinha(indice: number) {
    aoMudar({ ...bloco, linhas: bloco.linhas.filter((_, i) => i !== indice) });
  }

  function mudarCelula(linhaIdx: number, serieIdx: number, texto: string) {
    const linhas = bloco.linhas.map((l, i) => {
      if (i !== linhaIdx) return l;
      const valores = [...l.valores];
      valores[serieIdx] = paraNumero(texto);
      return { ...l, valores };
    });
    aoMudar({ ...bloco, linhas });
  }

  function mudarRotulo(linhaIdx: number, rotulo: string) {
    aoMudar({
      ...bloco,
      linhas: bloco.linhas.map((l, i) => (i === linhaIdx ? { ...l, rotulo } : l)),
    });
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className={labelCls}>Título do gráfico</label>
          <input
            value={bloco.titulo}
            onChange={(e) => aoMudar({ ...bloco, titulo: e.target.value })}
            placeholder="Ex: P Mehlich por talhão"
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls}>Formato</label>
          <select
            value={bloco.formato}
            onChange={(e) => aoMudar({ ...bloco, formato: e.target.value as FormatoGrafico })}
            className={inputCls}
          >
            {FORMATOS_GRAFICO.map((formato) => (
              <option key={formato} value={formato}>
                {ROTULOS_FORMATO[formato]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div><label className={labelCls}>Eixo horizontal</label><input value={bloco.eixoX ?? ""} onChange={(e) => aoMudar({ ...bloco, eixoX: e.target.value })} placeholder="Ex: Talhão" className={inputCls} /></div>
        <div><label className={labelCls}>Eixo vertical</label><input value={bloco.eixoY ?? ""} onChange={(e) => aoMudar({ ...bloco, eixoY: e.target.value })} placeholder="Ex: Produtividade" className={inputCls} /></div>
        <div><label className={labelCls}>Unidade</label><input value={bloco.unidade ?? ""} onChange={(e) => aoMudar({ ...bloco, unidade: e.target.value })} placeholder="Ex: kg/ha" className={inputCls} /></div>
      </div>

      <div>
        <label className={labelCls}>Cores das séries</label>
        <div className="flex flex-wrap gap-2">
          {bloco.series.map((serie, i) => (
            <label key={i} className="flex items-center gap-1 rounded border border-surface-border bg-zinc-800 px-2 py-1 text-xs text-zinc-300">
              <input type="color" value={bloco.cores?.[i] ?? ["#00dc4d", "#38bdf8", "#fbbf24", "#f472b6", "#a78bfa", "#fb923c"][i]} onChange={(e) => { const paleta = ["#00dc4d", "#38bdf8", "#fbbf24", "#f472b6", "#a78bfa", "#fb923c"]; const cores = bloco.series.map((_, indice) => bloco.cores?.[indice] ?? paleta[indice]); cores[i] = e.target.value; aoMudar({ ...bloco, cores }); }} className="h-6 w-6 bg-transparent" />
              {serie || `Série ${i + 1}`}
            </label>
          ))}
        </div>
      </div>

      {usaSerieUnica(bloco.formato) && bloco.series.length > 1 && (
        <p className="text-xs text-amber-400">
          {ROTULOS_FORMATO[bloco.formato]} usa só a primeira coluna ({bloco.series[0]}).
        </p>
      )}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[380px] text-sm">
          <thead>
            <tr>
              <th className="pb-1 text-left text-xs font-medium text-secondary">Rótulo</th>
              {bloco.series.map((serie, i) => (
                <th key={i} className="pb-1 pl-2">
                  <input
                    value={serie}
                    onChange={(e) => mudarSerie(i, e.target.value)}
                    className="w-full rounded border border-surface-border bg-zinc-800 px-2 py-1 text-xs text-white outline-none focus:border-accent"
                  />
                </th>
              ))}
              <th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {bloco.linhas.map((linha, li) => (
              <tr key={li}>
                <td className="py-1 pr-2">
                  <input
                    value={linha.rotulo}
                    onChange={(e) => mudarRotulo(li, e.target.value)}
                    placeholder="Ex: Talhão 1"
                    className="w-full rounded border border-surface-border bg-zinc-800 px-2 py-1 text-xs text-white outline-none focus:border-accent"
                  />
                </td>
                {bloco.series.map((_, si) => (
                  <td key={si} className="py-1 pl-2">
                    <input
                      defaultValue={
                        linha.valores[si] === null || linha.valores[si] === undefined
                          ? ""
                          : String(linha.valores[si])
                      }
                      onChange={(e) => mudarCelula(li, si, e.target.value)}
                      inputMode="decimal"
                      placeholder="0"
                      className="w-full rounded border border-surface-border bg-zinc-800 px-2 py-1 text-xs text-white outline-none focus:border-accent"
                    />
                  </td>
                ))}
                <td className="pl-1">
                  <button
                    type="button"
                    onClick={() => removerLinha(li)}
                    disabled={bloco.linhas.length <= 1}
                    className={btnGhost}
                    aria-label="Remover linha"
                  >
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={addLinha} className={btnGhost}>
          + Linha
        </button>
        <button type="button" onClick={addColuna} className={btnGhost}>
          + Coluna
        </button>
        <button
          type="button"
          onClick={removerColuna}
          disabled={bloco.series.length <= 1}
          className={btnGhost}
        >
          − Coluna
        </button>
      </div>
    </div>
  );
}

function Secao({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-xs font-bold uppercase tracking-[0.16em] text-marca-azul">{children}</h2>
  );
}

// Título da seção editável: mostra o título atual como texto de verdade (dá
// pra apagar letra por letra). Deixar vazio e sair do campo volta pro padrão.
function SecaoEditavel({
  valor,
  padrao,
  aoMudar,
  controles,
}: {
  valor: string;
  padrao: string;
  aoMudar: (novo: string | null) => void;
  controles?: React.ReactNode;
}) {
  // Enquanto digita, o campo pode ficar vazio sem voltar pro padrão.
  const [rascunho, setRascunho] = useState<string | null>(null);
  return (
    <div className="group/secao relative -mx-2 flex items-center gap-2">
      <input
        value={rascunho ?? valor}
        onFocus={() => setRascunho(valor)}
        onChange={(e) => {
          setRascunho(e.target.value);
          const novo = e.target.value.trim();
          if (novo) aoMudar(novo === padrao ? null : e.target.value);
        }}
        onBlur={() => {
          if (!rascunho?.trim()) aoMudar(null);
          setRascunho(null);
        }}
        placeholder={padrao}
        maxLength={80}
        aria-label="Título da seção"
        title="Clique pra renomear a seção (vazio = título padrão)"
        className={`${editavel} px-2 py-1 text-xs font-bold uppercase tracking-[0.16em] text-marca-azul placeholder:text-marca-azul/50`}
      />
      {controles && (
        <div className="hidden shrink-0 items-center gap-1 group-focus-within/secao:flex group-hover/secao:flex">
          {controles}
        </div>
      )}
    </div>
  );
}

function BotaoAdicionar({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded-lg border border-dashed border-marca-verde/60 px-3 py-1.5 text-xs font-semibold text-marca-azul transition hover:bg-marca-verde/10 disabled:opacity-50"
    >
      {children}
    </button>
  );
}

export function EditorRelatorio({
  relatorioId,
  versaoInicial,
  tipo,
  categoriaInicial,
  clienteIdInicial,
  clientes,
  fazendaIdInicial,
  consultorNome,
  tituloInicial,
  dataInicial,
  blocosIniciais,
  storageConfigurado,
}: {
  relatorioId: string;
  versaoInicial: string;
  tipo: "VISITA" | "TECNICO";
  categoriaInicial: string;
  clienteIdInicial: string;
  clientes: { id: string; nome: string; fazendas: { id: string; nome: string }[] }[];
  fazendaIdInicial: string | null;
  consultorNome: string;
  tituloInicial: string | null;
  dataInicial: string;
  blocosIniciais: Bloco[];
  storageConfigurado: boolean;
}) {
  const [tipoRelatorio, setTipoRelatorio] = useState(tipo);
  const [categoria, setCategoria] = useState<CategoriaVisita>(categoriaInicial as CategoriaVisita);
  const [clienteId, setClienteId] = useState(clienteIdInicial);
  const tecnico = tipoRelatorio === "TECNICO";
  const [titulo, setTitulo] = useState(tituloInicial ?? "");
  const [dataVisita, setDataVisita] = useState(dataInicial.slice(0, 10));
  const [fazendaId, setFazendaId] = useState(fazendaIdInicial ?? "");
  const [blocos, setBlocos] = useState<Bloco[]>(blocosIniciais);
  const [selecionadoId, setSelecionadoId] = useState<string | null>(blocosIniciais[0]?.id ?? null);
  const [arrastandoId, setArrastandoId] = useState<string | null>(null);
  const pilhaDesfazer = useRef<Bloco[][]>([]);
  const pilhaRefazer = useRef<Bloco[][]>([]);
  const [podeDesfazer, setPodeDesfazer] = useState(false);
  const [podeRefazer, setPodeRefazer] = useState(false);
  const revisao = useRef(0);
  const versaoServidor = useRef(versaoInicial);
  const [graficoAberto, setGraficoAberto] = useState<string | null>(null);
  const [alterado, setAlterado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [enviandoFotos, setEnviandoFotos] = useState(0);
  const [salvando, startSalvar] = useTransition();
  const inputFoto = useRef<HTMLInputElement>(null);
  const inputTroca = useRef<HTMLInputElement>(null);
  const [trocandoId, setTrocandoId] = useState<string | null>(null);
  const clienteAtual = clientes.find((cliente) => cliente.id === clienteId) ?? clientes[0];
  const clienteNome = clienteAtual?.nome ?? "Cliente";
  const fazendas = clienteAtual?.fazendas ?? [];
  const opcoesClientes: ComboBoxOpcao[] = useMemo(() => clientes.map((cliente) => ({ id: cliente.id, label: cliente.nome })), [clientes]);

  const secoes = montarLayout(blocos);
  const posicao = (id: string) => blocos.findIndex((b) => b.id === id);

  // Onde o PDF vai quebrar cada página, com o que está na tela (mesmo que
  // ainda não salvo). O cálculo usa as fontes do PDF, então roda no servidor —
  // espera a digitação parar um pouco antes de pedir.
  const [paginas, setPaginas] = useState<MapaPaginas | null>(null);
  const [movendoPagina, setMovendoPagina] = useState(false);
  useEffect(() => {
    let cancelado = false;
    const timer = setTimeout(() => {
      paginacaoDoRelatorio(relatorioId, blocos, titulo || null)
        .then((mapa) => {
          if (!cancelado) setPaginas(mapa);
        })
        .catch(() => {});
    }, 800);
    return () => {
      cancelado = true;
      clearTimeout(timer);
    };
  }, [relatorioId, blocos, titulo]);
  const quebras = quebrasDePagina(secoes, paginas);
  // Divisória "Página N" do editor. Se o bloco logo abaixo está preso no topo
  // da página (novaPagina), o "Tirar quebra" fica nela — em vez de uma segunda
  // faixa "começa na página seguinte" logo embaixo, que parecia outra página.
  const divisoria = (numero: number, primeiroId: string | undefined) => {
    const bloco = primeiroId ? blocos.find((b) => b.id === primeiroId) : undefined;
    return (
      <QuebraPagina
        numero={numero}
        total={quebras.total}
        acao={bloco?.novaPagina && !textoVazio(bloco) ? botaoTirarQuebra(bloco) : undefined}
      />
    );
  };
  const quebraAntes = (id: string) =>
    quebras.antesDoBloco[id] ? divisoria(quebras.antesDoBloco[id], id) : null;
  // Blocos que já têm a divisória "Página N" logo acima.
  const comDivisoria = new Set<string>([
    ...Object.keys(quebras.antesDoBloco),
    ...Object.keys(quebras.antesDaSecao).map((indice) => {
      const secao = secoes[Number(indice)];
      return secao ? (secao.tipo === "avulso" ? secao.bloco.id : secao.tipo === "visual" ? secao.linhas[0]?.[0]?.id : secao.blocos[0]?.id) ?? "" : "";
    }),
  ]);

  // Avisa antes de sair da página com alteração não salva.
  useEffect(() => {
    if (!alterado) return;
    const avisar = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", avisar);
    return () => window.removeEventListener("beforeunload", avisar);
  }, [alterado]);

  // Salva depois que a pessoa para de editar. O botão continua disponível
  // para quem quiser confirmar imediatamente antes de sair.
  useEffect(() => {
    if (!alterado || enviandoFotos > 0) return;
    const timer = window.setTimeout(() => salvar(), 2200);
    return () => window.clearTimeout(timer);
    // `salvar` usa exatamente o snapshot listado abaixo; não deve reiniciar o
    // timer só porque a função ganhou uma nova identidade no render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alterado, enviandoFotos, blocos, titulo, dataVisita, fazendaId, tipoRelatorio, categoria, clienteId]);

  function mudar(fn: (atuais: Bloco[]) => Bloco[]) {
    setBlocos((atuais) => {
      const proximos = fn(atuais);
      if (proximos === atuais) return atuais;
      pilhaDesfazer.current.push(atuais);
      if (pilhaDesfazer.current.length > 80) pilhaDesfazer.current.shift();
      pilhaRefazer.current = [];
      setPodeDesfazer(true);
      setPodeRefazer(false);
      revisao.current += 1;
      return proximos;
    });
    setAlterado(true);
    setAviso(null);
  }

  function desfazerAlteracao() {
    const anteriores = pilhaDesfazer.current.pop();
    if (!anteriores) return;
    pilhaRefazer.current.push(blocos);
    setBlocos(anteriores);
    setPodeDesfazer(pilhaDesfazer.current.length > 0);
    setPodeRefazer(true);
    revisao.current += 1;
    setAlterado(true);
  }

  function refazerAlteracao() {
    const proximos = pilhaRefazer.current.pop();
    if (!proximos) return;
    pilhaDesfazer.current.push(blocos);
    setBlocos(proximos);
    setPodeDesfazer(true);
    setPodeRefazer(pilhaRefazer.current.length > 0);
    revisao.current += 1;
    setAlterado(true);
  }

  function atualizarBloco(novo: Bloco) {
    mudar((atuais) => atuais.map((b) => (b.id === novo.id ? novo : b)));
  }

  function removerBloco(id: string) {
    mudar((atuais) => atuais.filter((b) => b.id !== id));
    if (selecionadoId === id) setSelecionadoId(null);
  }

  function duplicarBloco(bloco: Bloco) {
    const copia = { ...bloco, id: novoId(), novaPagina: false } as Bloco;
    mudar((atuais) => {
      const indice = atuais.findIndex((b) => b.id === bloco.id);
      return indice < 0 ? atuais : [...atuais.slice(0, indice + 1), copia, ...atuais.slice(indice + 1)];
    });
    setSelecionadoId(copia.id);
  }

  function inserirDepoisDoSelecionado(bloco: Bloco) {
    mudar((atuais) => {
      const indice = selecionadoId ? atuais.findIndex((b) => b.id === selecionadoId) : atuais.length - 1;
      return [...atuais.slice(0, indice + 1), bloco, ...atuais.slice(indice + 1)];
    });
    setSelecionadoId(bloco.id);
  }

  function soltarAntesDe(alvoId: string) {
    if (!arrastandoId || arrastandoId === alvoId) return setArrastandoId(null);
    mudar((atuais) => {
      const origem = atuais.find((b) => b.id === arrastandoId);
      if (!origem) return atuais;
      const semOrigem = atuais.filter((b) => b.id !== arrastandoId);
      const destino = semOrigem.findIndex((b) => b.id === alvoId);
      if (destino < 0) return atuais;
      return [...semOrigem.slice(0, destino), origem, ...semOrigem.slice(destino)];
    });
    setArrastandoId(null);
  }

  const propsArrastar = (id: string) => ({
    draggable: true,
    onDragStart: () => setArrastandoId(id),
    onDragEnd: () => setArrastandoId(null),
    onDragOver: (e: React.DragEvent) => e.preventDefault(),
    onDrop: () => soltarAntesDe(id),
  });

  // Troca o bloco de lugar com o vizinho na ordem do documento (qualquer
  // tipo): é essa ordem que a tela e o PDF seguem pra montar o relatório.
  // A quebra de página (novaPagina) pertence à POSIÇÃO, não ao bloco: quem
  // sobe pro lugar do bloco que abria a página passa a abrir a página. Senão a
  // quebra ia junto e o bloco movido caía no fim da página anterior.
  function mover(id: string, direcao: -1 | 1) {
    mudar((atuais) => {
      const i = atuais.findIndex((b) => b.id === id);
      const alvo = i + direcao;
      if (i === -1 || alvo < 0 || alvo >= atuais.length) return atuais;
      const copia = [...atuais];
      copia[i] = { ...atuais[alvo], novaPagina: atuais[i].novaPagina } as Bloco;
      copia[alvo] = { ...atuais[i], novaPagina: atuais[alvo].novaPagina } as Bloco;
      return copia;
    });
  }

  // Página do PDF onde o bloco começa (null enquanto a paginação não chegou,
  // ou pra texto vazio, que não entra no PDF).
  function paginaDoBloco(id: string): number | null {
    return paginas?.blocos[id]?.inicio ?? null;
  }

  // Leva o bloco pra outra página que JÁ existe no PDF, sem criar página:
  // - próxima: vira o primeiro bloco da página seguinte (a quebra passa a ser
  //   logo antes dele);
  // - anterior: vira o último bloco da página anterior (a quebra passa a ser
  //   logo depois dele).
  // Leva um bloco — ou uma seção inteira (ids contínuos) — pra página
  // anterior/seguinte do PDF, sem criar página.
  function moverParaPagina(ids: string[], direcao: -1 | 1) {
    const atual = ids.length ? paginaDoBloco(ids[0]) : null;
    if (!paginas || atual === null || movendoPagina) return;
    const destino = atual + direcao;
    if (destino < 1 || destino > paginas.totalPaginas) return;

    const noGrupo = new Set(ids);
    const grupo = blocos.filter((b) => noGrupo.has(b.id));
    const resto = blocos.filter((b) => !noGrupo.has(b.id));
    if (grupo.length === 0) return;
    // Primeiro bloco da página que marca o ponto de inserção: a seguinte
    // (entra antes dele) ou a atual (entra antes dele, no fim da anterior).
    const referencia = direcao === 1 ? destino : atual;
    const idxRef = resto.findIndex((b) => (paginas.blocos[b.id]?.inicio ?? 0) >= referencia);
    let candidato: Bloco[];
    if (idxRef === -1) {
      // Voltando e é o único conteúdo da página: basta tirar a quebra.
      if (direcao === 1) return;
      candidato = blocos.map((b) => (b.id === ids[0] ? ({ ...b, novaPagina: false } as Bloco) : b));
    } else {
      const ref = resto[idxRef];
      // Na ida, o grupo abre a página (assume a quebra); na volta, a quebra
      // fica em quem abria a página atual, logo depois dele.
      const movido = grupo.map((b, i) => (i === 0 ? ({ ...b, novaPagina: direcao === 1 } as Bloco) : b));
      candidato = [
        ...resto.slice(0, idxRef),
        ...movido,
        { ...ref, novaPagina: direcao === -1 } as Bloco,
        ...resto.slice(idxRef + 1),
      ];
    }

    // Confere no servidor, com a paginação real do PDF, antes de aplicar:
    // página anterior cheia não pode empurrar tudo pra uma página nova.
    const totalAntes = paginas.totalPaginas;
    setMovendoPagina(true);
    setAviso(null);
    paginacaoDoRelatorio(relatorioId, candidato, titulo || null)
      .then((mapa) => {
        if (!mapa) return;
        const caiu = mapa.blocos[ids[0]]?.inicio;
        if (direcao === -1 && caiu !== destino) {
          setAviso(`Não cabe na página ${destino} — ela já está cheia.`);
          return;
        }
        mudar(() => candidato);
        setPaginas(mapa);
        if (mapa.totalPaginas > totalAntes) {
          setAviso(`A página ${caiu ?? destino} encheu e o final passou pra página ${mapa.totalPaginas}.`);
        }
      })
      .catch(() => setErro("Não consegui calcular as páginas agora."))
      .finally(() => setMovendoPagina(false));
  }

  function alternarLargura(bloco: BlocoVisual) {
    atualizarBloco({
      ...bloco,
      largura: larguraDoBloco(bloco) === "inteira" ? "metade" : "inteira",
    } as Bloco);
  }

  function novoTexto(secao?: "sintese" | "observacoes" | "analise" | "encaminhamentos"): Bloco {
    const [bloco] = autoLayout([{ id: novoId(), tipo: "texto", texto: "", secao } as SemGeometria<Bloco>]);
    return bloco;
  }

  // Parágrafo novo no fim do quadro de síntese (depois dos textos do começo).
  function addParagrafoSintese() {
    mudar((atuais) => {
      let fim = 0;
      while (fim < atuais.length && atuais[fim].tipo === "texto" &&
        (!(atuais[fim] as Extract<Bloco, { tipo: "texto" }>).secao ||
          (atuais[fim] as Extract<Bloco, { tipo: "texto" }>).secao === "sintese")) fim++;
      return [...atuais.slice(0, fim), novoTexto("sintese"), ...atuais.slice(fim)];
    });
  }

  function addTextoNoFim() {
    mudar((atuais) => [...atuais, novoTexto()]);
  }

  // Página nova em branco no fim: um texto (opcional) marcado pra começar
  // numa página nova do PDF; o que for adicionado depois entra nela.
  function addNovaPagina() {
    mudar((atuais) => [...atuais, { ...novoTexto(), novaPagina: true } as Bloco]);
  }

  function addSecaoNoFim(secao: "observacoes" | "analise" | "encaminhamentos") {
    mudar((atuais) => [...atuais, novoTexto(secao)]);
  }

  function addGrafico() {
    const [bloco] = autoLayout([graficoVazio()]);
    mudar((atuais) => [...atuais, bloco]);
    setGraficoAberto(bloco.id);
  }

  async function enviarArquivo(arquivo: File) {
    const fd = new FormData();
    fd.append("foto", arquivo);
    return enviarFotoDoEditor(relatorioId, fd);
  }

  async function addFotos(arquivos: FileList) {
    setErro(null);
    const lista = Array.from(arquivos);
    setEnviandoFotos(lista.length);
    try {
      for (const arquivo of lista) {
        const resultado = await enviarArquivo(arquivo);
        if (!resultado.ok) {
          setErro(resultado.erro);
          continue;
        }
        const bloco = {
          id: novoId(),
          tipo: "foto",
          url: resultado.url,
          path: resultado.path,
          legenda: null,
        } as SemGeometria<Bloco>;
        mudar((atuais) => [...atuais, ...autoLayout([bloco])]);
        setEnviandoFotos((n) => n - 1);
      }
    } finally {
      setEnviandoFotos(0);
      if (inputFoto.current) inputFoto.current.value = "";
    }
  }

  // Substitui a imagem de uma foto mantendo legenda, lugar e tamanho.
  function pedirTroca(id: string) {
    setTrocandoId(id);
    inputTroca.current?.click();
  }

  async function trocarFoto(id: string, arquivo: File) {
    setErro(null);
    try {
      const resultado = await enviarArquivo(arquivo);
      if (!resultado.ok) {
        setErro(resultado.erro);
        return;
      }
      mudar((atuais) =>
        atuais.map((b) =>
          b.id === id && b.tipo === "foto" ? { ...b, url: resultado.url, path: resultado.path } : b
        )
      );
    } finally {
      setTrocandoId(null);
      if (inputTroca.current) inputTroca.current.value = "";
    }
  }

  // Blocos de uma seção, na ordem (as seções são trechos contínuos de `blocos`).
  function idsDaSecao(secao: (typeof secoes)[number]): string[] {
    return (secao.tipo === "avulso" ? [secao.bloco] : secao.tipo === "visual" ? secao.linhas.flat() : secao.blocos).map((b) => b.id);
  }

  // Troca a seção inteira (título + todos os cards) de lugar com a vizinha.
  // A síntese fica sempre no começo.
  function moverSecao(indice: number, direcao: -1 | 1) {
    const vizinha = indice + direcao;
    if (indice === 0 || vizinha <= 0 || vizinha >= secoes.length) return;
    const [antes, depois] = direcao === -1 ? [vizinha, indice] : [indice, vizinha];
    const idsAntes = idsDaSecao(secoes[antes]);
    const idsDepois = idsDaSecao(secoes[depois]);
    if (idsAntes.length === 0 || idsDepois.length === 0) return;
    mudar((atuais) => {
      const inicio = atuais.findIndex((b) => b.id === idsAntes[0]);
      if (inicio === -1) return atuais;
      const meio = inicio + idsAntes.length;
      const fim = meio + idsDepois.length;
      // Quebra de página fica na posição (ver mover): quem assume o começo de
      // cada trecho herda a quebra que estava ali.
      const comQuebra = (trecho: Bloco[], quebra: boolean | undefined) =>
        trecho.map((b, i) => (i === 0 ? ({ ...b, novaPagina: quebra } as Bloco) : b));
      return [
        ...atuais.slice(0, inicio),
        ...comQuebra(atuais.slice(meio, fim), atuais[inicio].novaPagina),
        ...comQuebra(atuais.slice(inicio, meio), atuais[meio].novaPagina),
        ...atuais.slice(fim),
      ];
    });
  }

  // O título personalizado da seção mora no primeiro bloco dela.
  function tituloEditavel(secao: (typeof secoes)[number], indice: number) {
    const primeiro = secao.tipo === "avulso" ? secao.bloco : secao.tipo === "visual" ? secao.linhas[0]?.[0] : secao.blocos[0];
    const padrao = tituloPadraoDaSecao(secao, tecnico);
    if (!primeiro) return <Secao>{padrao}</Secao>;
    const movivel = indice > 0;
    const paginaSecao = paginaDoBloco(primeiro.id);
    return (
      <SecaoEditavel
        valor={tituloDaSecao(secao, tecnico)}
        padrao={padrao}
        aoMudar={(novo) => atualizarBloco({ ...primeiro, tituloSecao: novo } as Bloco)}
        controles={
          movivel && (
            <>
              <button
                type="button"
                onClick={() => moverSecao(indice, -1)}
                disabled={indice <= 1}
                className={btnControle}
                title="Mover a seção inteira pra cima"
                aria-label="Mover a seção inteira pra cima"
              >
                ↑ Seção
              </button>
              <button
                type="button"
                onClick={() => moverSecao(indice, 1)}
                disabled={indice >= secoes.length - 1}
                className={btnControle}
                title="Mover a seção inteira pra baixo"
                aria-label="Mover a seção inteira pra baixo"
              >
                ↓ Seção
              </button>
              {paginaSecao !== null && paginas && paginas.totalPaginas > 1 && (
                <>
                  <button
                    type="button"
                    onClick={() => moverParaPagina(idsDaSecao(secao), -1)}
                    disabled={paginaSecao <= 1 || movendoPagina}
                    className={btnControle}
                    title={`Levar a seção inteira pro fim da página ${paginaSecao - 1} do PDF`}
                    aria-label="Levar a seção pra página anterior"
                  >
                    ⇡ Pág. ant.
                  </button>
                  <button
                    type="button"
                    onClick={() => moverParaPagina(idsDaSecao(secao), 1)}
                    disabled={paginaSecao >= paginas.totalPaginas || movendoPagina}
                    className={btnControle}
                    title={`Levar a seção inteira pro começo da página ${paginaSecao + 1} do PDF`}
                    aria-label="Levar a seção pra próxima página"
                  >
                    ⇣ Próx. pág.
                  </button>
                </>
              )}
            </>
          )
        }
      />
    );
  }

  // Setas ↑ ↓, nova página e remover, de qualquer bloco.
  function controles(bloco: Bloco, extra?: React.ReactNode) {
    const i = posicao(bloco.id);
    const pagina = paginaDoBloco(bloco.id);
    return (
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => mover(bloco.id, -1)}
          disabled={i <= 0}
          className={btnControle}
          title="Mover para antes"
          aria-label="Mover para antes"
        >
          ↑
        </button>
        <button
          type="button"
          onClick={() => mover(bloco.id, 1)}
          disabled={i === -1 || i >= blocos.length - 1}
          className={btnControle}
          title="Mover para depois"
          aria-label="Mover para depois"
        >
          ↓
        </button>
        {/* Leva o bloco pra página anterior/seguinte do PDF (ver moverParaPagina). */}
        {pagina !== null && paginas && paginas.totalPaginas > 1 && (
          <>
            <button
              type="button"
              onClick={() => moverParaPagina([bloco.id], -1)}
              disabled={pagina <= 1 || movendoPagina}
              className={btnControle}
              title={`Levar pro fim da página ${pagina - 1} do PDF`}
              aria-label="Levar pra página anterior"
            >
              ⇡ Pág. ant.
            </button>
            <button
              type="button"
              onClick={() => moverParaPagina([bloco.id], 1)}
              disabled={pagina >= paginas.totalPaginas || movendoPagina}
              className={btnControle}
              title={`Levar pro começo da página ${pagina + 1} do PDF`}
              aria-label="Levar pra próxima página"
            >
              ⇣ Próx. pág.
            </button>
          </>
        )}
        {extra}
        <button
          type="button"
          onClick={() => duplicarBloco(bloco)}
          className={btnControle}
          title="Duplicar bloco"
          aria-label="Duplicar bloco"
        >
          Duplicar
        </button>
        <button
          type="button"
          onClick={() => removerBloco(bloco.id)}
          className={`${btnControle} hover:!bg-red-600`}
          title="Remover"
          aria-label="Remover"
        >
          ✕
        </button>
      </div>
    );
  }

  // Separador da página nova: daqui pra baixo o PDF começa numa página nova.
  function textoVazio(bloco: Bloco) {
    return bloco.tipo === "texto" && !bloco.texto.trim();
  }

  function botaoTirarQuebra(bloco: Bloco) {
    return (
      <button
        type="button"
        onClick={() => atualizarBloco({ ...bloco, novaPagina: false } as Bloco)}
        className="whitespace-nowrap rounded-md px-2 py-1 text-xs text-secondary hover:bg-red-50 hover:text-red-500"
        title="Este bloco está preso no topo da página. Tirar a quebra: ele volta a seguir logo depois do anterior, se couber."
      >
        Tirar quebra
      </button>
    );
  }

  // Faixa verde só pra página em branco do "+ Nova página" (texto vazio) ou
  // enquanto a paginação não chegou; no resto, a divisória "Página N" já mostra.
  function avisoNovaPagina(bloco: Bloco) {
    if (!bloco.novaPagina) return null;
    if (!textoVazio(bloco) && (comDivisoria.has(bloco.id) || paginas)) return null;
    return (
      <div className="mb-3 flex items-center gap-3">
        <span className="h-0 flex-1 border-t-2 border-dashed border-marca-verde" />
        <span className="rounded-full bg-marca-verde/15 px-3 py-1 text-xs font-bold uppercase tracking-wider text-marca-azul">
          Começa na página seguinte
        </span>
        <span className="h-0 flex-1 border-t-2 border-dashed border-marca-verde" />
        <button
          type="button"
          onClick={() =>
            bloco.tipo === "texto" && !bloco.texto.trim()
              ? removerBloco(bloco.id)
              : atualizarBloco({ ...bloco, novaPagina: false } as Bloco)
          }
          className="rounded-md px-2 py-1 text-xs text-secondary hover:bg-red-50 hover:text-red-500"
          title="Tirar a quebra: o bloco volta a seguir logo depois do anterior"
        >
          Tirar quebra
        </button>
      </div>
    );
  }

  function botaoLargura(bloco: BlocoVisual) {
    const inteira = larguraDoBloco(bloco) === "inteira";
    return (
      <button
        type="button"
        onClick={() => alternarLargura(bloco)}
        className={btnControle}
        title={inteira ? "Deixar em meia largura" : "Ocupar a largura inteira"}
      >
        {inteira ? "½ largura" : "Largura inteira"}
      </button>
    );
  }

  function textoEditavel(bloco: Extract<Bloco, { tipo: "texto" }>) {
    return (
      <div key={bloco.id} {...propsArrastar(bloco.id)} onClick={() => setSelecionadoId(bloco.id)} className={`group relative -mx-2 cursor-grab rounded-lg transition ${arrastandoId === bloco.id ? "opacity-40" : ""} ${selecionadoId === bloco.id ? "ring-2 ring-marca-verde/40" : ""}`}>
        {avisoNovaPagina(bloco)}
        <TextoAutoAjuste
          valor={bloco.texto}
          aoMudar={(texto) => atualizarBloco({ ...bloco, texto })}
          placeholder={
            bloco.novaPagina
              ? "Texto da página nova (opcional) — fotos e gráficos adicionados depois entram nela"
              : "Escreva aqui..."
          }
          className={`${bloco.tamanho === "pequeno" ? "text-[13px] leading-6" : bloco.tamanho === "grande" ? "text-lg leading-8" : "text-[15px] leading-7"} ${bloco.alinhamento === "centro" ? "text-center" : bloco.alinhamento === "direita" ? "text-right" : "text-left"} ${bloco.negrito ? "font-semibold" : ""} text-zinc-700 placeholder:italic placeholder:text-secondary`}
        />
        <div className="absolute -top-3 right-0 hidden group-focus-within:flex group-hover:flex">
          {controles(bloco)}
        </div>
      </div>
    );
  }

  function fotoEditavel(bloco: Extract<Bloco, { tipo: "foto" }>) {
    return (
      <figure key={bloco.id} {...propsArrastar(bloco.id)} onClick={() => setSelecionadoId(bloco.id)} className={`group relative cursor-grab overflow-hidden rounded-xl border bg-white p-2 shadow-sm transition ${arrastandoId === bloco.id ? "opacity-40" : ""} ${selecionadoId === bloco.id ? "border-marca-verde ring-2 ring-marca-verde/30" : "border-zinc-200"}`}>
        {avisoNovaPagina(bloco)}
        <div className="overflow-hidden rounded-lg bg-zinc-100">
          {/* eslint-disable-next-line @next/next/no-img-element -- fotos vêm do storage externo */}
          <img
            src={bloco.url}
            alt={bloco.legenda ?? "Foto da visita"}
            className={`${bloco.proporcao === "quadrada" ? "aspect-square" : bloco.proporcao === "retrato" ? "aspect-[3/4]" : bloco.proporcao === "panoramica" ? "aspect-[21/9]" : "aspect-[16/9]"} w-full ${bloco.ajuste === "conter" ? "object-contain" : "object-cover"}`}
          />
        </div>
        <button
          type="button"
          onClick={() => pedirTroca(bloco.id)}
          disabled={trocandoId !== null}
          className="absolute left-4 top-4 rounded-md bg-black/60 px-2 py-1 text-xs font-medium text-white hover:bg-black/80 disabled:opacity-50"
        >
          {trocandoId === bloco.id ? "Enviando..." : "Trocar foto"}
        </button>
        <div className="absolute right-4 top-4 hidden group-hover:flex">
          {controles(bloco, botaoLargura(bloco))}
        </div>
        <figcaption className="px-0 pb-0 pt-2">
          <TextoAutoAjuste
            valor={bloco.legenda ?? ""}
            aoMudar={(legenda) => atualizarBloco({ ...bloco, legenda: legenda || null })}
            placeholder="Escreva uma legenda..."
            className="text-sm leading-5 text-subtle placeholder:italic placeholder:text-secondary"
          />
        </figcaption>
      </figure>
    );
  }

  function graficoEditavel(bloco: BlocoGrafico) {
    return (
      <div key={bloco.id} {...propsArrastar(bloco.id)} onClick={() => setSelecionadoId(bloco.id)} className={`cursor-grab rounded-xl border bg-white p-5 transition ${arrastandoId === bloco.id ? "opacity-40" : ""} ${selecionadoId === bloco.id ? "border-marca-verde ring-2 ring-marca-verde/30" : "border-zinc-200"}`}>
        {avisoNovaPagina(bloco)}
        <input
          value={bloco.titulo}
          onChange={(e) => atualizarBloco({ ...bloco, titulo: e.target.value })}
          placeholder="Título do gráfico"
          aria-label="Título do gráfico"
          className={`${editavel} -mx-2 mb-3 px-2 py-1 text-sm font-semibold text-zinc-800 placeholder:italic placeholder:font-normal placeholder:text-secondary`}
        />
        <GraficoBloco bloco={bloco} alto={larguraDoBloco(bloco) === "inteira"} semTitulo />
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-zinc-100 pt-3">
          <button
            type="button"
            onClick={() => setGraficoAberto((a) => (a === bloco.id ? null : bloco.id))}
            className="rounded-md px-2 py-1 text-xs font-semibold text-marca-azul hover:bg-marca-verde/10"
          >
            {graficoAberto === bloco.id ? "Fechar dados" : "Editar dados"}
          </button>
          {controles(bloco, botaoLargura(bloco))}
        </div>
        {graficoAberto === bloco.id && (
          <div className="mt-3 rounded-lg bg-zinc-900 p-4">
            <EditorGrafico bloco={bloco} aoMudar={(novo) => atualizarBloco(novo)} />
          </div>
        )}
      </div>
    );
  }

  function salvar() {
    const revisaoSalva = revisao.current;
    setErro(null);
    setAviso(null);
    startSalvar(async () => {
      const resultado = await atualizarRelatorioVisita(relatorioId, {
        titulo: titulo || null,
        tipo: tipoRelatorio,
        categoria,
        clienteId,
        dataVisita,
        fazendaId: fazendaId || null,
        versaoEsperada: versaoServidor.current,
        conteudo: comGeometria(blocos),
      });
      if (resultado.ok) {
        versaoServidor.current = resultado.versao;
        if (revisao.current === revisaoSalva) setAlterado(false);
        setAviso("Relatório salvo.");
      } else {
        setErro(resultado.erro);
      }
    });
  }

  const selecionado = blocos.find((bloco) => bloco.id === selecionadoId) ?? null;
  const fotosDoDocumento = blocos.filter((bloco): bloco is Extract<Bloco, { tipo: "foto" }> => bloco.tipo === "foto");
  const fotoCapa = fotoDeCapa(fotosDoDocumento);
  const capaDesativada = fotosDoDocumento.length > 0 && fotoCapa === null;

  return (
    <div className="tema-fixo -m-4 min-h-dvh bg-[#071014]">
      <header className="sticky top-0 z-30 flex flex-wrap items-center gap-2 border-b border-white/10 bg-[#0b171c]/95 px-4 py-3 backdrop-blur xl:px-6">
        <a href={`/relatorios/visitas/${relatorioId}`} className="editor-top-btn">Voltar</a>
        <button type="button" onClick={desfazerAlteracao} disabled={!podeDesfazer} className="editor-top-btn">↶ Desfazer</button>
        <button type="button" onClick={refazerAlteracao} disabled={!podeRefazer} className="editor-top-btn">↷ Refazer</button>
        <a href={`/api/relatorios/visitas/${relatorioId}/pdf`} target="_blank" rel="noreferrer" className="editor-top-btn">Prévia PDF</a>
        <span className={`hidden text-xs md:ml-auto md:block ${alterado ? "text-amber-400" : "text-secondary"}`}>
          {salvando ? "Salvando..." : alterado ? "Alterações não salvas" : "Relatório salvo"}
        </span>
        <button type="button" onClick={salvar} disabled={salvando || !alterado} className="ml-auto rounded-lg bg-accent px-4 py-2 text-sm font-bold text-accent-foreground hover:brightness-110 disabled:opacity-50 md:ml-2">
          {salvando ? "Salvando..." : "Salvar relatório"}
        </button>
      </header>

      <div className="grid items-start gap-5 p-4 xl:grid-cols-[minmax(0,1fr)_280px] xl:p-6">
      <main className="min-w-0 overflow-x-auto rounded-2xl border border-white/[0.06] bg-[#0a151a] px-3 py-6 sm:px-6">
      <div className="mx-auto w-[210mm] max-w-full pb-24">

      {tecnico && fotoCapa && (
        <div className="mb-5 overflow-hidden rounded-2xl bg-white text-marca-azul">
          <div className="px-7 py-9 sm:px-12">
            <Logo fundo="claro" className="h-8 w-auto" />
            <p className="mt-12 text-xs font-bold uppercase tracking-wider">Dossiê técnico</p>
            <p className="mt-2 text-3xl font-bold">{titulo || "Relatório técnico"}</p>
            <p className="mt-4 text-sm">{clienteNome} · {dataVisita}</p>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element -- foto do storage externo */}
          <img src={fotoCapa.url} alt="Prévia da capa" style={{ objectPosition: `${fotoCapa.focoX ?? 50}% ${fotoCapa.focoY ?? 50}%` }} className="aspect-[16/5] w-full object-cover" />
        </div>
      )}
      {/* Mesmas classes do BlocosRender (leitura) — o que se edita aqui é o que sai. */}
      <div className="min-h-[297mm] overflow-hidden border border-zinc-200 bg-[#fcfcfa] shadow-[0_22px_70px_rgba(0,0,0,0.45)]">
        <div
          className={
            tecnico
              ? "bg-marca-azul px-7 py-9 text-white sm:px-12"
              : "border-b-[5px] border-marca-verde bg-white px-7 py-8 sm:px-12"
          }
        >
          <div className="flex items-center justify-between gap-4">
            <Logo fundo={tecnico ? "escuro" : "claro"} className="h-7 w-auto sm:h-8" />
            <p
              className={
                tecnico
                  ? "text-xs font-bold uppercase tracking-[0.22em] text-marca-verde"
                  : "text-xs font-bold uppercase tracking-[0.22em] text-marca-azul"
              }
            >
              {tecnico ? "Dossiê técnico" : "Registro de campo"}
            </p>
          </div>
          <input
            value={titulo}
            onChange={(e) => {
              setTitulo(e.target.value);
              revisao.current += 1;
              setAlterado(true);
            }}
            placeholder={tecnico ? "Visita técnica" : "Visita de rotina"}
            className={`${editavel} -mx-2 px-2 ${
              tecnico
                ? "mt-4 text-3xl font-bold tracking-tight text-white placeholder:text-white/40 hover:ring-white/30 focus:ring-marca-verde/70 sm:text-4xl"
                : "mt-3 text-2xl font-bold tracking-tight text-zinc-900 placeholder:text-secondary sm:text-3xl"
            }`}
          />
          <div
            className={`flex flex-wrap items-center gap-x-2 gap-y-1 ${tecnico ? "mt-3 text-zinc-300" : "mt-2 text-subtle"}`}
          >
            <span>{clienteNome}</span>
            {fazendas.length > 0 && (
              <>
                <span aria-hidden>·</span>
                <select
                  aria-label="Fazenda"
                  value={fazendaId}
                  onChange={(e) => {
                    setFazendaId(e.target.value);
                    revisao.current += 1;
                    setAlterado(true);
                  }}
                  className={`${editavel} -mx-1 w-auto px-1 py-0.5 ${tecnico ? "text-zinc-300 [color-scheme:dark] hover:ring-white/30" : "text-subtle"}`}
                >
                  <option value="">Sem fazenda</option>
                  {fazendas.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.nome}
                    </option>
                  ))}
                </select>
              </>
            )}
          </div>
          <div
            className={
              tecnico
                ? "mt-7 grid gap-4 border-t border-white/20 pt-5 text-sm sm:grid-cols-2"
                : "mt-6 grid gap-4 border-t border-zinc-200 pt-5 text-sm text-subtle sm:grid-cols-2"
            }
          >
            <label className="block">
              <span className="block text-[11px] font-bold uppercase tracking-wider opacity-65">
                Data da visita
              </span>
              <DateInput
                value={dataVisita}
                onChange={(e) => {
                  setDataVisita(e.target.value);
                  revisao.current += 1;
                  setAlterado(true);
                }}
                className={`${editavel} -mx-2 px-2 py-0.5 ${tecnico ? "text-white [color-scheme:dark] hover:ring-white/30" : "text-zinc-700"}`}
              />
            </label>
            <p>
              <span className="block text-[11px] font-bold uppercase tracking-wider opacity-65">
                Consultor
              </span>
              {consultorNome}
            </p>
          </div>
        </div>

        <div className="space-y-9 px-7 py-8 sm:px-12 sm:py-10">
          {quebras.total > 1 && <QuebraPagina numero={1} total={quebras.total} />}
          {secoes.map((secao, indiceSecao) => (
            <Fragment key={indiceSecao}>
              {quebras.antesDaSecao[indiceSecao] && (
                divisoria(
                  quebras.antesDaSecao[indiceSecao],
                  secao.tipo === "avulso" ? secao.bloco.id : secao.tipo === "visual" ? secao.linhas[0]?.[0]?.id : secao.blocos[0]?.id
                )
              )}
              {renderSecao(secao, indiceSecao)}
            </Fragment>
          ))}
          {rodapeDeAdicionar()}
        </div>

        <footer className="flex items-center justify-between border-t border-zinc-200 px-7 py-4 text-[11px] font-medium uppercase tracking-wider text-muted sm:px-12">
          <span><NomeEmpresa /></span>
          <span>Documento de uso interno</span>
        </footer>
      </div>
      </div>
      </main>

      <aside className="sticky top-20 rounded-2xl border border-white/10 bg-[#0d1a20] p-5 text-zinc-200">
        <div className="mb-5 border-b border-white/10 pb-4">
          <h2 className="font-bold">Propriedades</h2>
          <p className="mt-1 text-xs text-muted">{selecionado ? `Bloco de ${selecionado.tipo}` : "Selecione um bloco na página"}</p>
        </div>
        <div className="space-y-5">
          <div className="space-y-3 border-b border-white/10 pb-5">
            <span className={labelCls}>Dados do relatório</span>
            <select value={tipoRelatorio} onChange={(e) => { setTipoRelatorio(e.target.value as "VISITA" | "TECNICO"); if (e.target.value === "TECNICO") setCategoria("TECNICA"); revisao.current += 1; setAlterado(true); }} className={inputCls}>
              <option value="VISITA">Relatório de visita</option><option value="TECNICO">Relatório técnico</option>
            </select>
            <select value={categoria} onChange={(e) => { setCategoria(e.target.value as CategoriaVisita); revisao.current += 1; setAlterado(true); }} className={inputCls}>
              {CATEGORIAS_VISITA.map((item) => <option key={item.id} value={item.id}>{item.rotulo}</option>)}
            </select>
            <ComboBox
              key={clienteId}
              opcoes={opcoesClientes}
              valor={clienteId}
              placeholder="Digite o cliente..."
              onSelecionar={(id) => { setClienteId(id); setFazendaId(""); revisao.current += 1; setAlterado(true); }}
              className="w-full"
            />
          </div>
          <div>
            <span className={labelCls}>Adicionar após o bloco</span>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => inserirDepoisDoSelecionado(novoTexto())} className="editor-top-btn justify-center">+ Texto</button>
              <button type="button" onClick={() => { const [grafico] = autoLayout([graficoVazio()]); inserirDepoisDoSelecionado(grafico); setGraficoAberto(grafico.id); }} className="editor-top-btn justify-center">+ Gráfico</button>
              {tecnico && <button type="button" onClick={() => inputFoto.current?.click()} disabled={!storageConfigurado || enviandoFotos > 0} className="editor-top-btn col-span-2 justify-center">+ Foto</button>}
            </div>
          </div>

          {selecionado?.tipo === "texto" && (
            <>
              <div><span className={labelCls}>Tamanho</span><div className="grid grid-cols-3 gap-1">{(["pequeno", "normal", "grande"] as const).map((tamanho) => <button key={tamanho} type="button" onClick={() => atualizarBloco({ ...selecionado, tamanho })} className={`${btnControle} ${selecionado.tamanho === tamanho || (!selecionado.tamanho && tamanho === "normal") ? "!bg-accent !text-marca-azul" : ""}`}>{tamanho === "pequeno" ? "P" : tamanho === "grande" ? "G" : "M"}</button>)}</div></div>
              <div><span className={labelCls}>Alinhamento</span><div className="grid grid-cols-3 gap-1">{(["esquerda", "centro", "direita"] as const).map((alinhamento) => <button key={alinhamento} type="button" onClick={() => atualizarBloco({ ...selecionado, alinhamento })} className={`${btnControle} ${selecionado.alinhamento === alinhamento || (!selecionado.alinhamento && alinhamento === "esquerda") ? "!bg-accent !text-marca-azul" : ""}`}>{alinhamento === "esquerda" ? "←" : alinhamento === "direita" ? "→" : "↔"}</button>)}</div></div>
              <div><span className={labelCls}>Formatação</span><div className="grid grid-cols-2 gap-2"><button type="button" onClick={() => atualizarBloco({ ...selecionado, negrito: !selecionado.negrito })} className={`${btnControle} ${selecionado.negrito ? "!bg-accent !text-marca-azul" : ""}`}>Negrito</button><button type="button" onClick={() => atualizarBloco({ ...selecionado, lista: !selecionado.lista })} className={`${btnControle} ${selecionado.lista ? "!bg-accent !text-marca-azul" : ""}`}>Lista</button></div></div>
            </>
          )}

          {selecionado && selecionado.tipo !== "texto" && !ehBlocoAvulso(selecionado) && (
            <button type="button" onClick={() => alternarLargura(selecionado)} className="editor-top-btn w-full justify-center">{larguraDoBloco(selecionado) === "inteira" ? "Usar meia largura" : "Usar largura inteira"}</button>
          )}
          {selecionado?.tipo === "foto" && (
            <>
              <button type="button" onClick={() => atualizarBloco({ ...selecionado, ajuste: selecionado.ajuste === "conter" ? "cobrir" : "conter" })} className="editor-top-btn w-full justify-center">Imagem: {selecionado.ajuste === "conter" ? "mostrar inteira" : "preencher área"}</button>
              <button type="button" onClick={() => mudar((atuais) => atuais.map((b) => b.tipo === "foto" ? { ...b, capa: b.id === selecionado.id } : b))} className={`editor-top-btn w-full justify-center ${selecionado.capa ? "!border-accent !text-accent" : ""}`}>{selecionado.capa ? "Foto escolhida para capa" : "Usar como capa"}</button>
              <button type="button" onClick={() => mudar((atuais) => atuais.map((b) => b.tipo === "foto" ? { ...b, capa: false } : b))} className={`editor-top-btn w-full justify-center ${capaDesativada ? "!border-accent !text-accent" : ""}`}>Sem capa fotográfica</button>
            </>
          )}
          {selecionado && (
            <>
              <button type="button" onClick={() => atualizarBloco({ ...selecionado, novaPagina: !selecionado.novaPagina } as Bloco)} className={`editor-top-btn w-full justify-center ${selecionado.novaPagina ? "!border-accent !text-accent" : ""}`}>{selecionado.novaPagina ? "Começa em nova página" : "Começar em nova página"}</button>
              <button type="button" onClick={() => duplicarBloco(selecionado)} className="editor-top-btn w-full justify-center">Duplicar bloco</button>
            </>
          )}
          {erro && <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">{erro}</p>}
          {aviso && !erro && <p className="rounded-lg border border-accent/20 bg-accent/5 p-3 text-sm text-accent">{aviso}</p>}
        </div>
      </aside>
      </div>
    </div>
  );

  function renderSecao(secao: (typeof secoes)[number], indiceSecao: number) {
            if (secao.tipo === "sintese") {
              return (
                <section
                  key="sintese"
                  className={tecnico ? "rounded-xl border border-marca-verde/25 bg-marca-verde/[0.06] p-6" : ""}
                >
                  {tituloEditavel(secao, indiceSecao)}
                  <div className="mt-4 space-y-3">
                    {secao.blocos.map((bloco) => textoEditavel(bloco))}
                    {secao.blocos.length === 0 && (
                      <p className="text-sm italic text-muted">Nenhuma observação registrada.</p>
                    )}
                    <BotaoAdicionar onClick={addParagrafoSintese}>+ Parágrafo</BotaoAdicionar>
                  </div>
                  <ContinuaNaPagina numero={quebras.continuaEm[secao.blocos.at(-1)?.id ?? ""]} />
                </section>
              );
            }
            if (secao.tipo === "texto") {
              return (
                <section key={indiceSecao} className="space-y-3">
                  {secao.blocos.map((bloco) => (
                    <Fragment key={bloco.id}>
                      {quebraAntes(bloco.id)}
                      {textoEditavel(bloco)}
                      <ContinuaNaPagina numero={quebras.continuaEm[bloco.id]} />
                    </Fragment>
                  ))}
                </section>
              );
            }
            if (secao.tipo === "secao_texto") {
              return (
                <section key={indiceSecao}>
                  {tituloEditavel(secao, indiceSecao)}
                  <div className="mt-4 space-y-3">
                    {secao.blocos.map((bloco) => (
                      <Fragment key={bloco.id}>
                      {quebraAntes(bloco.id)}
                      <div className="rounded-xl border border-zinc-200 bg-white p-5">
                        {secao.secao === "observacoes" && (
                          <input
                            value={bloco.titulo ?? ""}
                            onChange={(e) => atualizarBloco({ ...bloco, titulo: e.target.value })}
                            placeholder="Área, talhão ou experimento"
                            className="mb-3 w-full text-sm font-bold uppercase tracking-wide text-marca-azul outline-none"
                          />
                        )}
                        {textoEditavel(bloco)}
                      </div>
                      <ContinuaNaPagina numero={quebras.continuaEm[bloco.id]} />
                      </Fragment>
                    ))}
                  </div>
                </section>
              );
            }
            if (secao.tipo === "avulso") return null;
            return (
              <section key={indiceSecao}>
                {tituloEditavel(secao, indiceSecao)}
                <div className="mt-4 space-y-5">
                  {secao.linhas.map((linha) => (
                    <Fragment key={linha[0].id}>
                    {quebraAntes(linha[0].id)}
                    <div
                      className={`grid gap-5 ${linha.length > 1 || larguraDoBloco(linha[0]) === "metade" ? "sm:grid-cols-2" : ""}`}
                    >
                      {linha.map((bloco) =>
                        bloco.tipo === "foto" ? fotoEditavel(bloco) : bloco.tipo === "grafico" ? graficoEditavel(bloco) : null
                      )}
                    </div>
                    </Fragment>
                  ))}
                </div>
              </section>
            );
  }

  function rodapeDeAdicionar() {
    return (
          <div className="flex flex-wrap items-center gap-2 border-t border-dashed border-zinc-200 pt-6">
            <span className="mr-1 text-xs font-medium text-muted">Adicionar no fim:</span>
            <BotaoAdicionar onClick={addTextoNoFim}>+ Texto</BotaoAdicionar>
            <BotaoAdicionar onClick={addNovaPagina}>+ Nova página</BotaoAdicionar>
            {tecnico && <BotaoAdicionar onClick={() => addSecaoNoFim("observacoes")}>+ Observação por área</BotaoAdicionar>}
            {tecnico && <BotaoAdicionar onClick={() => addSecaoNoFim("analise")}>+ Análise</BotaoAdicionar>}
            {tecnico && <BotaoAdicionar onClick={() => addSecaoNoFim("encaminhamentos")}>+ Encaminhamento</BotaoAdicionar>}
            <BotaoAdicionar onClick={addGrafico}>+ Gráfico</BotaoAdicionar>
            {tecnico && (
              <BotaoAdicionar
                onClick={() => inputFoto.current?.click()}
                disabled={!storageConfigurado || enviandoFotos > 0}
              >
                {enviandoFotos > 0
                  ? `Enviando ${enviandoFotos} foto${enviandoFotos > 1 ? "s" : ""}...`
                  : storageConfigurado
                    ? "+ Fotos"
                    : "Upload de fotos não configurado"}
              </BotaoAdicionar>
            )}
            <span className="text-xs text-secondary">Use ↑ ↓ em cada bloco pra mudar de lugar.</span>
            <input
              ref={inputFoto}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => e.target.files?.length && addFotos(e.target.files)}
            />
            <input
              ref={inputTroca}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const arquivo = e.target.files?.[0];
                if (arquivo && trocandoId) trocarFoto(trocandoId, arquivo);
              }}
            />
          </div>
    );
  }

}
