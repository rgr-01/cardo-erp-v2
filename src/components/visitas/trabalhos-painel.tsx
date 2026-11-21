"use client";
import { DialogFrame } from "@/components/ui/dialog-frame";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ComboBox, type ComboBoxOpcao } from "@/components/ui/combo-box";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { JanelaRelatorioCompleto, RelatorioJanela } from "@/components/visitas/relatorio-janela";
import {
  atualizarTrabalhoDaSafra,
  criarTrabalhoDaSafra,
  excluirTrabalhoDaSafra,
  relatoriosDoTrabalho,
  unirRelatoriosEmTrabalho,
  vincularRelatoriosAoTrabalho,
} from "@/app/actions/trabalhos";
import {
  STATUS_TRABALHO,
  TIPOS_TRABALHO,
  rotuloDoTipoTrabalho,
  agruparTrabalhos,
  relatoriosPorFornecedor,
  sugerirTrabalho,
  type AgruparPor,
  type RelatorioAvulso,
  type RelatorioDoTrabalho,
  type TrabalhoLinha,
} from "@/lib/trabalhos";
import { DateInput } from "@/components/ui/date-input";
import { NumberInput } from "@/components/ui/number-input";
import { FlaskConical, FileText, Files, CalendarCheck } from "lucide-react";
import { Kpi } from "@/components/ui/kpi";
import { ESTILO_PAINEL } from "@/components/ui/padroes-painel";

const inputCls =
  "w-full rounded-lg border border-surface-border bg-zinc-800 px-3 py-2 text-sm text-white outline-none focus:border-accent";
const labelCls = "mb-1 block text-xs font-medium text-secondary";
const cartao = ESTILO_PAINEL;

const ABAS: { id: AgruparPor; rotulo: string }[] = [
  { id: "tipo", rotulo: "Geração de demanda" },
  { id: "produto", rotulo: "Produto" },
  { id: "fornecedor", rotulo: "Fornecedor" },
  { id: "cliente", rotulo: "Cliente" },
];

function fmtData(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" });
}

type Rascunho = {
  nome: string;
  tipo: string;
  status: string;
  produto: string;
  fornecedor: string;
  cultura: string;
  clienteIds: string[];
  campos: string;
  visitasPrevistas: string;
  dataPrevista: string;
  observacao: string;
};

const rascunhoVazio: Rascunho = {
  nome: "",
  tipo: "AREA_DEMONSTRATIVA",
  status: "PLANEJADO",
  produto: "",
  fornecedor: "",
  cultura: "",
  clienteIds: [],
  campos: "1",
  visitasPrevistas: "0",
  dataPrevista: "",
  observacao: "",
};

function rascunhoDe(t: TrabalhoLinha): Rascunho {
  return {
    nome: t.nome,
    tipo: t.tipo,
    status: t.status,
    produto: t.produto ?? "",
    fornecedor: t.fornecedor ?? "",
    cultura: t.cultura ?? "",
    clienteIds: t.clientes.map((c) => c.id),
    campos: String(t.campos),
    visitasPrevistas: String(t.visitasPrevistas),
    dataPrevista: t.dataPrevista ? t.dataPrevista.slice(0, 10) : "",
    observacao: t.observacao ?? "",
  };
}

type Modal =
  | { tipo: "novo"; inicial?: Partial<Rascunho> }
  | { tipo: "editar"; trabalho: TrabalhoLinha }
  | { tipo: "unir"; relatorioIds: string[]; inicial: Partial<Rascunho> };

function FormTrabalho({
  modal,
  clientes,
  aoFechar,
}: {
  modal: Modal;
  clientes: { id: string; nome: string }[];
  aoFechar: () => void;
}) {
  const [dados, setDados] = useState<Rascunho>(() =>
    modal.tipo === "editar" ? rascunhoDe(modal.trabalho) : { ...rascunhoVazio, ...modal.inicial }
  );
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();
  const [reinicio, setReinicio] = useState(0);
  const opcoes: ComboBoxOpcao[] = useMemo(
    () => clientes.filter((c) => !dados.clienteIds.includes(c.id)).map((c) => ({ id: c.id, label: c.nome })),
    [clientes, dados.clienteIds]
  );
  const nomeDe = (id: string) => clientes.find((c) => c.id === id)?.nome ?? id;
  const set = (parte: Partial<Rascunho>) => setDados((d) => ({ ...d, ...parte }));

  function salvar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    const payload = { ...dados, dataPrevista: dados.dataPrevista || null };
    startTransition(async () => {
      const r =
        modal.tipo === "editar"
          ? await atualizarTrabalhoDaSafra(modal.trabalho.id, payload as never)
          : modal.tipo === "unir"
            ? await unirRelatoriosEmTrabalho(modal.relatorioIds, payload as never)
            : await criarTrabalhoDaSafra(payload as never);
      if (r.ok) aoFechar();
      else setErro(r.erro);
    });
  }

  return (
    <DialogFrame onClose={aoFechar} label={"Trabalho"} className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 lg:pl-64">
      <form
        onSubmit={salvar}
        className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-xl border border-surface-border bg-zinc-900 p-6"
      >
        <h2 className="mb-4 text-lg font-bold text-white">
          {modal.tipo === "editar"
            ? "Editar trabalho"
            : modal.tipo === "unir"
              ? `Unir ${modal.relatorioIds.length} relatórios em um novo trabalho`
              : "Abrir novo trabalho"}
        </h2>
        <div className="space-y-4">
          <div>
            <label className={labelCls}>Nome *</label>
            <input
              value={dados.nome}
              onChange={(e) => set({ nome: e.target.value })}
              required
              placeholder="Ex: Bioestimulante Raiz+ em soja"
              className={inputCls}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Tipo</label>
              <select value={dados.tipo} onChange={(e) => set({ tipo: e.target.value })} className={inputCls}>
                {TIPOS_TRABALHO.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.rotulo}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Situação</label>
              <select value={dados.status} onChange={(e) => set({ status: e.target.value })} className={inputCls}>
                {STATUS_TRABALHO.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.rotulo}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={labelCls}>Produto</label>
              <input value={dados.produto} onChange={(e) => set({ produto: e.target.value })} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Fornecedor</label>
              <input value={dados.fornecedor} onChange={(e) => set({ fornecedor: e.target.value })} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Cultura</label>
              <input value={dados.cultura} onChange={(e) => set({ cultura: e.target.value })} className={inputCls} />
            </div>
          </div>
          <div>
            <label className={labelCls}>Clientes envolvidos</label>
            <ComboBox
              key={reinicio}
              opcoes={opcoes}
              valor=""
              placeholder="Adicionar cliente..."
              onSelecionar={(id) => {
                set({ clienteIds: [...dados.clienteIds, id] });
                setReinicio((n) => n + 1);
              }}
              className="w-full"
            />
            {dados.clienteIds.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {dados.clienteIds.map((id) => (
                  <span key={id} className="flex items-center gap-1 rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-zinc-200">
                    {nomeDe(id)}
                    <button
                      type="button"
                      aria-label={`Remover ${nomeDe(id)}`}
                      onClick={() => set({ clienteIds: dados.clienteIds.filter((c) => c !== id) })}
                      className="text-muted hover:text-red-400"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={labelCls}>Campos</label>
              <NumberInput min={1} value={dados.campos} onChange={(e) => set({ campos: e.target.value })} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Visitas previstas</label>
              <NumberInput
                min={0}
                value={dados.visitasPrevistas}
                onChange={(e) => set({ visitasPrevistas: e.target.value })}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Data prevista</label>
              <DateInput value={dados.dataPrevista} onChange={(e) => set({ dataPrevista: e.target.value })} className={inputCls} />
            </div>
          </div>
          <div>
            <label className={labelCls}>Observação</label>
            <textarea value={dados.observacao} onChange={(e) => set({ observacao: e.target.value })} rows={3} className={inputCls} />
          </div>
        </div>

        {erro && <p role="alert" className="mt-3 text-sm text-red-400">{erro}</p>}

        <div className="mt-5 flex gap-2">
          <button
            type="submit"
            disabled={pendente}
            className="flex-1 rounded-lg bg-accent py-2 text-sm font-semibold text-accent-foreground hover:brightness-110 disabled:opacity-50"
          >
            {pendente ? "Salvando..." : "Salvar"}
          </button>
          <button
            type="button"
            onClick={aoFechar}
            className="rounded-lg border border-danger/40 bg-danger/10 px-4 py-2 text-sm font-semibold text-danger-ink hover:bg-danger/20"
          >
            Cancelar
          </button>
        </div>
      </form>
    </DialogFrame>
  );
}

type Janela = { url: string; titulo: string };

// Relatórios de um trabalho: ver e editar sem sair da tela (abre a janela por cima).
function ListaRelatoriosTrabalho({
  trabalho,
  aoAbrir,
  aoEditarTudo,
  aoFechar,
}: {
  trabalho: TrabalhoLinha;
  aoAbrir: (janela: Janela) => void;
  aoEditarTudo: (relatorios: RelatorioDoTrabalho[]) => void;
  aoFechar: () => void;
}) {
  const [relatorios, setRelatorios] = useState<RelatorioDoTrabalho[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let ativo = true;
    relatoriosDoTrabalho(trabalho.id).then((r) => {
      if (!ativo) return;
      if (r.ok) setRelatorios(r.relatorios);
      else setErro(r.erro);
    });
    return () => {
      ativo = false;
    };
  }, [trabalho.id]);

  return (
    <DialogFrame onClose={aoFechar} label={"Relatórios do trabalho"} className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 lg:pl-64">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-surface-border bg-zinc-900 p-6">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-white">Relatórios do trabalho</h2>
            <p className="text-sm text-secondary">{trabalho.nome}</p>
          </div>
          <button
            type="button"
            onClick={aoFechar}
            className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-500"
          >
            Fechar
          </button>
        </div>
        {erro && <p role="alert" className="text-sm text-red-400">{erro}</p>}
        {!erro && relatorios === null && <p className="text-sm text-muted">Carregando...</p>}
        {relatorios && relatorios.length === 0 && (
          <p className="rounded-lg border border-dashed border-surface-border p-6 text-center text-sm text-muted">
            Nenhum relatório vinculado a este trabalho. Vincule um relatório para acompanhar os resultados aqui.
          </p>
        )}
        {relatorios && relatorios.length > 0 && (
          <div className="mb-2 flex items-center justify-between gap-3 rounded-lg border border-accent/40 bg-accent/10 px-3 py-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-white">Relatório completo do trabalho</p>
              <p className="text-xs text-secondary">
                As {relatorios.length} visitas em ordem de data, num PDF só, com uma capa
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              <a
                href={`/api/trabalhos/${trabalho.id}/pdf`}
                className="rounded-lg border border-surface-border px-3 py-1.5 text-xs font-semibold text-zinc-200 hover:bg-zinc-800"
              >
                Baixar PDF
              </a>
              <button
                type="button"
                onClick={() => aoEditarTudo(relatorios)}
                className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-accent-foreground hover:brightness-110"
              >
                Editar tudo
              </button>
            </div>
          </div>
        )}
        {relatorios && relatorios.length > 0 && (
          <ul className="divide-y divide-surface-border/60">
            {relatorios.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-white">{r.titulo || "Relatório técnico"}</p>
                  <p className="text-xs text-muted">
                    {fmtData(r.dataVisita)} · {r.clienteNome} · {r.consultorNome}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    onClick={() => aoAbrir({ url: `/relatorios/visitas/${r.id}`, titulo: r.titulo || "Relatório técnico" })}
                    className="rounded-lg border border-surface-border px-3 py-1 text-xs font-medium text-zinc-200 hover:bg-zinc-800"
                  >
                    Ver
                  </button>
                  {r.podeEditar && (
                    <button
                      onClick={() =>
                        aoAbrir({
                          url: `/relatorios/visitas/${r.id}/editar`,
                          titulo: `Editar — ${r.titulo || "Relatório técnico"}`,
                        })
                      }
                      className="rounded-lg bg-accent px-3 py-1 text-xs font-semibold text-accent-foreground hover:brightness-110"
                    >
                      Editar
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </DialogFrame>
  );
}

function LinhaTrabalho({
  t,
  ehAdmin,
  aoEditar,
  aoVerRelatorios,
  aoGerarRelatorio,
}: {
  t: TrabalhoLinha;
  ehAdmin: boolean;
  aoEditar: () => void;
  aoVerRelatorios: () => void;
  aoGerarRelatorio: () => void;
}) {
  const tipo = TIPOS_TRABALHO.find((x) => x.id === t.tipo)!;
  const status = STATUS_TRABALHO.find((x) => x.id === t.status)!;
  const { confirmar } = useConfirm();
  const [pendente, startTransition] = useTransition();
  const pct = t.visitasPrevistas > 0 ? Math.min(100, Math.round((t.visitasFeitas / t.visitasPrevistas) * 100)) : 0;

  const [menuAberto, setMenuAberto] = useState(false);

  async function excluir() {
    if (
      !(await confirmar({
        mensagem: `Excluir o trabalho "${t.nome}"? Os relatórios voltam a ser avulsos.`,
        confirmarLabel: "Excluir trabalho",
        variante: "perigo",
      }))
    )
      return;
    startTransition(async () => {
      await excluirTrabalhoDaSafra(t.id);
    });
  }

  return (
    <div className="grid gap-4 rounded-lg border border-surface-border/70 bg-zinc-800/30 p-3 md:grid-cols-[minmax(0,1fr)_200px_170px] md:items-center">
      <div className="min-w-0 space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-white">{t.nome}</span>
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${tipo.classe}`}>{tipo.rotulo}</span>
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${status.classe}`}>{status.rotulo}</span>
        </div>
        <p className="text-xs text-secondary">
          <span className="font-medium text-zinc-200">{t.produto ?? "Sem produto"}</span>
          {t.fornecedor ? ` · ${t.fornecedor}` : ""}
          {t.cultura ? ` · ${t.cultura}` : ""}
        </p>
        <p className="text-xs text-muted">
          {t.clientes.length > 0 ? t.clientes.map((c) => c.nome).join(", ") : "Sem cliente"} · {t.campos}{" "}
          {t.campos === 1 ? "campo" : "campos"}
        </p>
      </div>

      <div className="space-y-1">
        <div className="flex justify-between text-xs text-secondary">
          <span>Visitas ao campo</span>
          <span className="font-semibold text-white">
            {t.visitasFeitas} de {t.visitasPrevistas}
          </span>
        </div>
        <div className="h-2 overflow-hidden rounded bg-zinc-800">
          <div className="h-2 bg-accent" style={{ width: `${pct}%` }} />
        </div>
        <p className="text-[11px] text-muted">
          {t.ultimoRelatorio
            ? `Último: ${fmtData(t.ultimoRelatorio.data)}${t.ultimoRelatorio.titulo ? ` · ${t.ultimoRelatorio.titulo}` : ""}`
            : t.dataPrevista
              ? `Previsto para ${fmtData(t.dataPrevista)}`
              : "Sem relatórios ainda"}
        </p>
      </div>

      <div className="flex items-center gap-2 md:justify-end">
        <div className="flex flex-col items-start gap-1 md:items-end">
          <button
            onClick={aoGerarRelatorio}
            className="text-xs font-semibold text-accent underline-offset-2 hover:underline"
          >
            Gerar relatório aqui
          </button>
          <button
            onClick={aoVerRelatorios}
            disabled={t.relatorios === 0}
            title={t.relatorios === 0 ? "Sem relatórios ainda" : "Ver os relatórios deste trabalho"}
            className="text-left text-sm md:text-right enabled:hover:underline"
          >
            <span className="text-xl font-bold text-white">{t.relatorios}</span>{" "}
            <span className="text-secondary">{t.relatorios === 1 ? "relatório" : "relatórios"}</span>
          </button>
        </div>
        {(ehAdmin || t.relatorios > 0) && (
          <div className="relative self-center">
            <button
              onClick={() => setMenuAberto((v) => !v)}
              aria-label="Mais ações"
              className="rounded-md px-2 py-0.5 text-lg leading-none text-secondary hover:bg-zinc-800 hover:text-white"
            >
              ⋮
            </button>
            {menuAberto && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMenuAberto(false)} />
                <div className="absolute right-0 z-20 mt-1 w-44 overflow-hidden rounded-lg border border-surface-border bg-zinc-900 py-1 text-left text-xs shadow-lg">
                  {t.relatorios > 0 && (
                    <a
                      href={`/api/trabalhos/${t.id}/pdf`}
                      onClick={() => setMenuAberto(false)}
                      title="Todas as visitas em ordem, num PDF só, com uma capa"
                      className="block w-full px-3 py-2 text-left font-semibold text-accent hover:bg-zinc-800"
                    >
                      Relatório geral (PDF)
                    </a>
                  )}
                  {ehAdmin && (<>
                  <button
                    onClick={() => { setMenuAberto(false); aoEditar(); }}
                    className="block w-full px-3 py-2 text-left text-zinc-200 hover:bg-zinc-800"
                  >
                    Editar trabalho
                  </button>
                  <button
                    onClick={() => { setMenuAberto(false); aoVerRelatorios(); }}
                    disabled={t.relatorios === 0}
                    className="block w-full px-3 py-2 text-left text-zinc-200 hover:bg-zinc-800 disabled:opacity-40"
                  >
                    Editar relatórios
                  </button>
                  <button
                    onClick={() => { setMenuAberto(false); excluir(); }}
                    disabled={pendente}
                    className="block w-full px-3 py-2 text-left text-red-400 hover:bg-zinc-800"
                  >
                    Excluir
                  </button>
                  </>)}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function TrabalhosPainel({
  safraNome,
  trabalhos,
  avulsos,
  clientes,
  ehAdmin,
}: {
  safraNome: string;
  trabalhos: TrabalhoLinha[];
  avulsos: RelatorioAvulso[];
  clientes: { id: string; nome: string }[];
  ehAdmin: boolean;
}) {
  const [por, setPor] = useState<AgruparPor>("tipo");
  const [modal, setModal] = useState<Modal | null>(null);
  const router = useRouter();
  const [janela, setJanela] = useState<Janela | null>(null);
  const [listaDe, setListaDe] = useState<TrabalhoLinha | null>(null);
  const [completo, setCompleto] = useState<{ trabalho: TrabalhoLinha; relatorios: RelatorioDoTrabalho[] } | null>(null);
  // "Vincular" de um avulso: abre a escolha do trabalho na própria linha.
  const [escolha, setEscolha] = useState<{ relatorioId: string; trabalhoId: string } | null>(null);
  const fecharJanela = useCallback(() => {
    setJanela(null);
    router.refresh();
  }, [router]);
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();

  const grupos = useMemo(() => agruparTrabalhos(trabalhos, por), [trabalhos, por]);
  const fornecedores = useMemo(() => relatoriosPorFornecedor(trabalhos), [trabalhos]);
  const maxFornecedor = Math.max(1, ...fornecedores.map((f) => f.relatorios));

  const sugestoes = useMemo(
    () => new Map(avulsos.map((a) => [a.id, sugerirTrabalho(a, trabalhos)])),
    [avulsos, trabalhos]
  );
  const comSugestao = avulsos.filter((a) => sugestoes.get(a.id));

  const abertos = trabalhos.filter((t) => t.status !== "CONCLUIDO");
  const kpis = [
    {
      rotulo: "Trabalhos abertos na safra",
      valor: abertos.length,
      unidade: `${trabalhos.filter((t) => t.status === "EM_ANDAMENTO").length} em andamento`,
      sub: `${trabalhos.filter((t) => t.status === "PLANEJADO").length} planejados · ${new Set(abertos.flatMap((t) => t.clientes.map((c) => c.id))).size} clientes envolvidos`,
    },
    {
      rotulo: "Relatórios técnicos gerados",
      valor: trabalhos.reduce((s, t) => s + t.relatorios, 0) + avulsos.length,
      unidade: "na safra",
      sub: `${trabalhos.reduce((s, t) => s + t.relatorios, 0)} dentro de trabalhos`,
    },
    {
      rotulo: "Relatórios avulsos",
      valor: avulsos.length,
      unidade: "para organizar",
      sub: `${comSugestao.length} com sugestão de trabalho`,
      alerta: avulsos.length > 0,
    },
    {
      rotulo: "Visitas previstas nos trabalhos",
      valor: trabalhos.reduce((s, t) => s + t.visitasFeitas, 0),
      unidade: `de ${trabalhos.reduce((s, t) => s + t.visitasPrevistas, 0)} feitas`,
      sub: "soma dos campos acompanhados",
    },
  ];

  function alternar(id: string) {
    setMarcados((atual) => {
      const novo = new Set(atual);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  }

  function vincular(relatorioIds: string[], trabalhoId: string) {
    setErro(null);
    startTransition(async () => {
      const r = await vincularRelatoriosAoTrabalho(relatorioIds, trabalhoId);
      if (!r.ok) setErro(r.erro);
      else setMarcados(new Set());
    });
  }

  function aceitarSugestoes() {
    setErro(null);
    startTransition(async () => {
      // Um vínculo por trabalho sugerido.
      const porTrabalho = new Map<string, string[]>();
      for (const a of comSugestao) {
        const t = sugestoes.get(a.id)!;
        porTrabalho.set(t.id, [...(porTrabalho.get(t.id) ?? []), a.id]);
      }
      for (const [trabalhoId, ids] of porTrabalho) {
        const r = await vincularRelatoriosAoTrabalho(ids, trabalhoId);
        if (!r.ok) return setErro(r.erro);
      }
      setMarcados(new Set());
    });
  }

  const selecionados = avulsos.filter((a) => marcados.has(a.id));
  const clientesSelecionados = new Set(selecionados.map((s) => s.clienteId)).size;

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">
            Gestão de visitas · Safra {safraNome}
          </p>
          <h1 className="text-xl font-bold text-white">Geração de demanda</h1>
          <p className="text-sm text-secondary">
            Áreas demonstrativas, ensaios, vitrines e dias de campo, com os relatórios técnicos de cada um.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setJanela({ url: "/relatorios/visitas/novo?tipo=TECNICO", titulo: "Novo relatório avulso" })}
            className="rounded-lg border border-surface-border px-4 py-2 text-sm font-medium text-zinc-300 hover:bg-zinc-800"
          >
            Novo relatório avulso
          </button>
          {ehAdmin && (
            <button
              onClick={() => setModal({ tipo: "novo" })}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground hover:brightness-110"
            >
              Abrir novo trabalho
            </button>
          )}
        </div>
      </div>

      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((k, i) => (
          <Kpi key={k.rotulo} rotulo={k.rotulo} valor={String(k.valor)} unidade={k.unidade} detalhe={k.sub} alerta={k.alerta} icone={[FlaskConical, FileText, Files, CalendarCheck][i]} />
        ))}
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,2.1fr)_minmax(0,1fr)]">
        <section className={cartao}>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-white">Trabalhos</h2>
            <div className="flex items-center gap-2 text-xs text-secondary">
              Agrupar por
              <div className="flex gap-1 rounded-lg bg-zinc-800 p-1">
                {ABAS.map((a) => (
                  <button
                    key={a.id}
                    onClick={() => setPor(a.id)}
                    aria-pressed={por === a.id}
                    className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                      por === a.id ? "bg-zinc-700 text-white" : "text-secondary hover:text-white"
                    }`}
                  >
                    {a.rotulo}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {trabalhos.length === 0 ? (
            <p className="rounded-lg border border-dashed border-surface-border p-8 text-center text-sm text-muted">
              Nenhum trabalho aberto nesta safra.{ehAdmin ? ' Use "Abrir novo trabalho".' : ""}
            </p>
          ) : (
            <div className="space-y-5">
              {grupos.map((g) => (
                <div key={g.nome} className="space-y-2">
                  <div className="flex items-baseline justify-between border-b-2 border-zinc-600 pb-1 pt-2">
                    <h3 className="text-sm font-bold text-white">{g.nome}</h3>
                    <span className="text-xs text-muted">
                      {g.trabalhos.length} {g.trabalhos.length === 1 ? "trabalho" : "trabalhos"} · {g.relatorios}{" "}
                      {g.relatorios === 1 ? "relatório" : "relatórios"}
                    </span>
                  </div>
                  {g.trabalhos.map((t) => (
                    <LinhaTrabalho
                      key={t.id}
                      t={t}
                      ehAdmin={ehAdmin}
                      aoEditar={() => setModal({ tipo: "editar", trabalho: t })}
                      aoVerRelatorios={() => setListaDe(t)}
                      aoGerarRelatorio={() =>
                        setJanela({
                          url: `/relatorios/visitas/novo?tipo=TECNICO&trabalho=${t.id}`,
                          titulo: `Novo relatório — ${t.nome}`,
                        })
                      }
                    />
                  ))}
                </div>
              ))}
            </div>
          )}
        </section>

        <div className="space-y-4">
          <section className={`${cartao} ${avulsos.length > 0 ? "border-amber-500/50" : ""}`}>
            <div className="flex items-baseline justify-between">
              <h2 className="text-sm font-semibold text-white">Relatórios avulsos</h2>
              {avulsos.length > 0 && (
                <span className="text-xs font-semibold text-amber-400">{avulsos.length} para organizar</span>
              )}
            </div>
            <p className="mb-2 text-xs text-muted">
              Relatórios técnicos sem trabalho. Vincule à sugestão ou selecione vários para uni-los em um novo trabalho.
            </p>
            {avulsos.length === 0 ? (
              <p className="rounded-lg border border-dashed border-surface-border p-4 text-center text-xs text-muted">
                Nenhum relatório técnico sem trabalho vinculado nesta safra.
              </p>
            ) : (
              <ul>
                {avulsos.map((a) => {
                  const sugestao = sugestoes.get(a.id);
                  return (
                    <li key={a.id} className="flex gap-3 border-t border-surface-border/60 py-3 first:border-0">
                      <input
                        id={`av-${a.id}`}
                        type="checkbox"
                        checked={marcados.has(a.id)}
                        onChange={() => alternar(a.id)}
                        className="mt-0.5 h-4 w-4 shrink-0 accent-[#00dc4d]"
                      />
                      <div className="min-w-0 flex-1">
                        <label htmlFor={`av-${a.id}`} className="block cursor-pointer text-sm font-semibold text-white">
                          {a.titulo || "Relatório técnico"}
                        </label>
                        <p className="text-xs text-muted">
                          {fmtData(a.dataVisita)} · {a.clienteNome}
                          <span className="ml-2 inline-flex gap-2">
                            <button
                              onClick={() =>
                                setJanela({ url: `/relatorios/visitas/${a.id}`, titulo: a.titulo || "Relatório técnico" })
                              }
                              className="font-medium text-zinc-300 hover:text-white hover:underline"
                            >
                              Ver
                            </button>
                            <button
                              onClick={() =>
                                setJanela({
                                  url: `/relatorios/visitas/${a.id}/editar`,
                                  titulo: `Editar — ${a.titulo || "Relatório técnico"}`,
                                })
                              }
                              className="font-medium text-zinc-300 hover:text-white hover:underline"
                            >
                              Editar
                            </button>
                          </span>
                        </p>
                        <div className="mt-1 flex items-center justify-between gap-2">
                          <p className={`text-xs ${sugestao ? "text-accent" : "text-amber-400"}`}>
                            {sugestao ? `Sugestão: ${sugestao.nome}` : "Sem trabalho parecido"}
                          </p>
                          {sugestao || abertos.length > 0 ? (
                            <button
                              disabled={pendente}
                              onClick={() =>
                                setEscolha(escolha?.relatorioId === a.id ? null : { relatorioId: a.id, trabalhoId: (sugestao ?? abertos[0]).id })
                              }
                              className="shrink-0 rounded-lg border border-surface-border px-2.5 py-1 text-xs font-medium text-zinc-200 hover:bg-zinc-800 disabled:opacity-50"
                            >
                              Vincular
                            </button>
                          ) : (
                            ehAdmin && (
                              <button
                                onClick={() =>
                                  setModal({
                                    tipo: "novo",
                                    inicial: { nome: a.titulo ?? "", clienteIds: [a.clienteId] },
                                  })
                                }
                                className="shrink-0 rounded-lg border border-surface-border px-2.5 py-1 text-xs font-medium text-zinc-200 hover:bg-zinc-800"
                              >
                                Criar trabalho
                              </button>
                            )
                          )}
                        </div>
                        {escolha?.relatorioId === a.id && (
                          <EscolhaDeTrabalho
                            trabalhos={ordenarParaEscolha(abertos, sugestao?.id, a.clienteId)}
                            sugeridoId={sugestao?.id}
                            clienteId={a.clienteId}
                            selecionado={escolha.trabalhoId}
                            aoSelecionar={(trabalhoId) => setEscolha({ relatorioId: a.id, trabalhoId })}
                            aoConfirmar={() => { vincular([a.id], escolha.trabalhoId); setEscolha(null); }}
                            aoCancelar={() => setEscolha(null)}
                            pendente={pendente}
                          />
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}

            {erro && <p role="alert" className="mt-2 text-xs text-red-400">{erro}</p>}

            {avulsos.length > 0 && (
              <div className="mt-3 space-y-2 border-t border-surface-border pt-3">
                {ehAdmin && (
                  <button
                    disabled={selecionados.length < 2 || clientesSelecionados > 1}
                    onClick={() =>
                      setModal({
                        tipo: "unir",
                        relatorioIds: selecionados.map((s) => s.id),
                        inicial: { clienteIds: [...new Set(selecionados.map((s) => s.clienteId))] },
                      })
                    }
                    className="w-full rounded-lg bg-accent py-2.5 text-sm font-semibold text-accent-foreground hover:brightness-110 disabled:bg-zinc-800 disabled:text-muted"
                  >
                    {clientesSelecionados > 1
                      ? "Selecione relatórios do mesmo cliente"
                      : selecionados.length >= 2
                        ? `Unir ${selecionados.length} selecionados em um novo trabalho`
                        : "Selecione 2 ou mais para unir"}
                  </button>
                )}
                {comSugestao.length > 0 && (
                  <button
                    disabled={pendente}
                    onClick={aceitarSugestoes}
                    className="w-full rounded-lg border border-surface-border py-2 text-sm font-medium text-zinc-200 hover:bg-zinc-800 disabled:opacity-50"
                  >
                    Aceitar as {comSugestao.length} {comSugestao.length === 1 ? "sugestão" : "sugestões"} de vínculo
                  </button>
                )}
              </div>
            )}
          </section>

          <section className={cartao}>
            <h2 className="text-sm font-semibold text-white">Relatórios por fornecedor</h2>
            <p className="mb-3 text-xs text-muted">Base para prestar contas a cada parceiro</p>
            {fornecedores.length === 0 ? (
              <p className="text-xs text-muted">Sem trabalhos ainda.</p>
            ) : (
              <ul className="space-y-3">
                {fornecedores.map((f) => (
                  <li key={f.nome}>
                    <div className="flex justify-between text-xs">
                      <span className="font-semibold text-white">{f.nome}</span>
                      <span className="text-muted">
                        {f.trabalhos} {f.trabalhos === 1 ? "trabalho" : "trabalhos"} · {f.relatorios} relatórios
                      </span>
                    </div>
                    <div className="mt-1 h-2 overflow-hidden rounded bg-zinc-800">
                      <div className="h-2 bg-accent" style={{ width: `${Math.max(3, Math.round((f.relatorios / maxFornecedor) * 100))}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>

      {modal && <FormTrabalho modal={modal} clientes={clientes} aoFechar={() => setModal(null)} />}
      {listaDe && (
        <ListaRelatoriosTrabalho
          trabalho={listaDe}
          aoAbrir={setJanela}
          aoEditarTudo={(relatorios) => {
            setCompleto({ trabalho: listaDe, relatorios });
            setListaDe(null);
          }}
          aoFechar={() => setListaDe(null)}
        />
      )}
      {completo && (
        <JanelaRelatorioCompleto
          titulo={completo.trabalho.nome}
          pdfUrl={`/api/trabalhos/${completo.trabalho.id}/pdf`}
          capitulos={[...completo.relatorios]
            .sort((a, b) => a.dataVisita.localeCompare(b.dataVisita))
            .map((r) => ({ id: r.id, titulo: r.titulo || "Relatório técnico", data: fmtData(r.dataVisita) }))}
          aoFechar={() => {
            setCompleto(null);
            router.refresh();
          }}
        />
      )}
      {janela && <RelatorioJanela url={janela.url} titulo={janela.titulo} aoFechar={fecharJanela} />}
    </div>
  );
}

// Sugerido primeiro, depois os do mesmo cliente, depois o resto por nome.
function ordenarParaEscolha(trabalhos: TrabalhoLinha[], sugeridoId: string | undefined, clienteId: string) {
  const peso = (t: TrabalhoLinha) => (t.id === sugeridoId ? 0 : t.clientes.some((c) => c.id === clienteId) ? 1 : 2);
  return [...trabalhos].sort((x, y) => peso(x) - peso(y) || x.nome.localeCompare(y.nome, "pt-BR"));
}

// Escolha do trabalho ao vincular um avulso: com nomes parecidos, mostra tipo,
// clientes e visitas de cada um pra não ligar no trabalho errado.
function EscolhaDeTrabalho({ trabalhos, sugeridoId, clienteId, selecionado, aoSelecionar, aoConfirmar, aoCancelar, pendente }: {
  trabalhos: TrabalhoLinha[];
  sugeridoId: string | undefined;
  clienteId: string;
  selecionado: string;
  aoSelecionar: (id: string) => void;
  aoConfirmar: () => void;
  aoCancelar: () => void;
  pendente: boolean;
}) {
  return (
    <div className="mt-2 rounded-lg border border-surface-border bg-black/20 p-2">
      <p className="mb-1.5 px-1 text-xs font-semibold text-zinc-300">Vincular a qual trabalho?</p>
      <ul className="max-h-64 space-y-1 overflow-y-auto">
        {trabalhos.map((t) => {
          const mesmoCliente = t.clientes.some((c) => c.id === clienteId);
          return (
            <li key={t.id}>
              <label className={`flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 ${selecionado === t.id ? "bg-accent/10 ring-1 ring-accent/40" : "hover:bg-zinc-800/60"}`}>
                <input
                  type="radio"
                  name="trabalho-escolhido"
                  checked={selecionado === t.id}
                  onChange={() => aoSelecionar(t.id)}
                  className="mt-0.5 accent-[#00dc4d]"
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-xs font-semibold text-white">
                    {t.nome}
                    {t.id === sugeridoId && <span className="ml-1.5 rounded bg-accent/15 px-1 py-px text-[10px] font-semibold text-accent">sugerido</span>}
                    {mesmoCliente && <span className="ml-1.5 rounded bg-sky-500/15 px-1 py-px text-[10px] font-semibold text-sky-300">mesmo cliente</span>}
                  </span>
                  <span className="block truncate text-[11px] text-muted">
                    {rotuloDoTipoTrabalho(t.tipo)} · {t.clientes.map((c) => c.nome).join(", ") || "sem cliente"} · {t.visitasFeitas}/{t.visitasPrevistas || "?"} visitas
                  </span>
                </span>
              </label>
            </li>
          );
        })}
      </ul>
      <div className="mt-2 flex justify-end gap-2">
        <button onClick={aoCancelar} className="rounded-lg px-2.5 py-1 text-xs font-medium text-secondary hover:text-white">Cancelar</button>
        <button
          disabled={pendente}
          onClick={aoConfirmar}
          className="rounded-lg bg-accent px-3 py-1 text-xs font-semibold text-black hover:brightness-110 disabled:opacity-50"
        >
          Vincular a este
        </button>
      </div>
    </div>
  );
}
