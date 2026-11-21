"use client";
import { DialogFrame } from "@/components/ui/dialog-frame";

import { useMemo, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import { MapPin, UserRound, Users, Wheat } from "lucide-react";
import type { CarteiraVisitas } from "@/lib/visitas-calendario";
import {
  CATEGORIAS_VISITA,
  corDaCategoria,
  rotuloDaCategoria,
  type CategoriaVisita,
} from "@/lib/visitas-categoria";
import {
  criarRelatorioVisita,
  excluirRelatorioVisita,
} from "@/app/actions/relatorios-visita";
import { ComboBox, type ComboBoxOpcao } from "@/components/ui/combo-box";
import { FiltroConsultores } from "@/components/ui/filtro-consultores";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { SeletorPeriodo } from "@/components/visitas/seletor-periodo";
import { DateInput } from "@/components/ui/date-input";
import { Kpi } from "@/components/ui/kpi";

export type FotoLinha = { id: string; url: string; legenda: string | null };

export type TipoRelatorio = "VISITA" | "TECNICO";

export type RelatorioLinha = {
  id: string;
  tipo: TipoRelatorio;
  categoria: CategoriaVisita;
  agendada: boolean;
  titulo: string | null;
  texto: string;
  dataVisita: string;
  clienteNome: string;
  fazendaNome: string | null;
  consultorNome: string;
  consultorId: string;
  fotos: FotoLinha[];
  capaUrl: string | null;
  finalidade: string | null;
  horaChegada: string | null;
  horaSaida: string | null;
  kmChegada: number | null;
  linkExterno: string | null;
};

export type ClienteOpcao = { id: string; nome: string; fazendas?: { id: string; nome: string }[] };

type FiltrosAtuais = {
  q: string;
  consultor: string;
  categoria: string;
  de: string;
  ate: string;
  ordem: "recentes" | "antigas";
};

const inputCls =
  "w-full rounded-lg border border-surface-border bg-zinc-800 px-3 py-2 text-sm text-white outline-none [color-scheme:dark] focus:border-accent";
const labelCls = "mb-1 block text-xs font-medium text-secondary";

function fmtData(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function BadgeCategoria({ categoria, agendada }: { categoria: CategoriaVisita; agendada?: boolean }) {
  const cor = corDaCategoria(categoria);
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${
        agendada ? "border border-dashed" : ""
      }`}
      style={{ backgroundColor: agendada ? "transparent" : `${cor}26`, color: cor, borderColor: cor }}
    >
      {rotuloDaCategoria(categoria)}
      {agendada ? " · agendada" : ""}
    </span>
  );
}

function FormNovoRelatorio({
  clientes,
  trabalhos,
  agendar,
  clienteInicial,
  tipoInicial,
  trabalhoInicial,
  aoFechar,
}: {
  clientes: ClienteOpcao[];
  trabalhos: { id: string; nome: string }[];
  agendar: boolean;
  clienteInicial?: string;
  tipoInicial?: TipoRelatorio;
  trabalhoInicial?: string;
  aoFechar: () => void;
}) {
  const [erro, setErro] = useState<string | null>(null);
  const [tipo, setTipo] = useState<TipoRelatorio>(tipoInicial ?? "VISITA");
  const [clienteId, setClienteId] = useState(clienteInicial ?? "");
  const [fazendaId, setFazendaId] = useState("");
  const fazendas = clientes.find((c) => c.id === clienteId)?.fazendas ?? [];
  const opcoesClientes: ComboBoxOpcao[] = useMemo(
    () => clientes.map((c) => ({ id: c.id, label: c.nome })),
    [clientes]
  );
  const [pendente, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const hoje = new Date().toISOString().slice(0, 10);

  function salvar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErro(null);
    if (!clienteId) {
      setErro("Selecione um cliente.");
      return;
    }
    const fd = new FormData(e.currentTarget);
    fd.set("clienteId", clienteId);
    fd.set("fazendaId", fazendaId);
    if (agendar) fd.set("agendar", "1");
    startTransition(async () => {
      const resultado = await criarRelatorioVisita(fd);
      if (resultado.ok) {
        formRef.current?.reset();
        aoFechar();
      } else {
        setErro(resultado.erro);
      }
    });
  }

  return (
    <DialogFrame onClose={aoFechar} label={"Visita"} className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 lg:pl-64">
      <form
        ref={formRef}
        onSubmit={salvar}
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-surface-border bg-zinc-900 p-6"
      >
        <h2 className="mb-4 text-lg font-bold text-white">{agendar ? "Agendar visita" : "Novo relatório"}</h2>
        <div className="space-y-4">
          {!agendar && (
            <div>
              <label className={labelCls}>Tipo de relatório</label>
              <select
                name="tipo"
                value={tipo}
                onChange={(e) => setTipo(e.target.value as TipoRelatorio)}
                className={inputCls}
              >
                <option value="VISITA">Relatório de visita</option>
                <option value="TECNICO">Relatório técnico (laudo/ensaio)</option>
              </select>
            </div>
          )}
          <div>
            <label className={labelCls}>Categoria da visita</label>
            <select
              name="categoria"
              key={`${agendar}-${tipo}`}
              defaultValue={tipo === "TECNICO" ? "TECNICA" : "COMERCIAL"}
              required
              className={inputCls}
            >
              {CATEGORIAS_VISITA.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.rotulo}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>Cliente *</label>
            <ComboBox
              opcoes={opcoesClientes}
              valor={clienteId}
              placeholder="Digite o nome do cliente..."
              onSelecionar={(id) => {
                setClienteId(id);
                setFazendaId("");
              }}
              className="w-full"
            />
          </div>
          {fazendas.length > 0 && (
            <div>
              <label className={labelCls}>Fazenda</label>
              <ComboBox
                key={`${clienteId}:${fazendaId}`}
                opcoes={[
                  { id: "", label: "Sem fazenda" },
                  ...fazendas.map((f) => ({ id: f.id, label: f.nome })),
                ]}
                valor={fazendaId}
                placeholder="Digite o nome da fazenda..."
                onSelecionar={setFazendaId}
                className="w-full"
              />
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>{agendar ? "Data e hora *" : "Data da visita"}</label>
              {agendar ? (
                <input name="dataVisita" type="datetime-local" required className={inputCls} />
              ) : (
                <DateInput name="dataVisita" defaultValue={hoje} className={inputCls} />
              )}
            </div>
            <div>
              <label className={labelCls}>{agendar ? "Objetivo (opcional)" : "Título (opcional)"}</label>
              <input
                name="titulo"
                placeholder={agendar ? "Ex: Avaliar estande" : "Ex: Fazenda Manto Verde / Visita técnica"}
                className={inputCls}
              />
            </div>
          </div>
          {!agendar && trabalhos.length > 0 && tipo === "TECNICO" && (
            <div>
              <label className={labelCls}>Trabalho da safra</label>
              <select name="trabalhoId" className={inputCls} defaultValue={trabalhoInicial ?? ""}>
                <option value="">Avulso (vincular depois)</option>
                {trabalhos.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nome}
                  </option>
                ))}
              </select>
            </div>
          )}
          {!agendar && (
            <div>
              <label className={labelCls}>Relato *</label>
              <textarea
                name="texto"
                required
                rows={5}
                placeholder="O que foi observado, combinado ou recomendado..."
                className={inputCls}
              />
            </div>
          )}
          {!agendar && tipo === "TECNICO" && (
            <div>
              <label className={labelCls}>Fotos (opcional, até 8)</label>
              <input
                name="fotos"
                type="file"
                accept="image/*"
                multiple
                className="block w-full text-sm text-zinc-300 file:mr-3 file:rounded-lg file:border-0 file:bg-zinc-800 file:px-3 file:py-2 file:text-sm file:text-zinc-200 hover:file:bg-zinc-700"
              />
            </div>
          )}
        </div>

        {erro && <p role="alert" className="mt-3 text-sm text-red-400">{erro}</p>}

        <div className="mt-5 flex gap-2">
          <button
            type="submit"
            disabled={pendente}
            className="flex-1 rounded-lg bg-accent py-2 text-sm font-semibold text-accent-foreground hover:brightness-110 disabled:opacity-50"
          >
            {pendente ? "Salvando..." : agendar ? "Agendar" : "Salvar relatório"}
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

function CardRelatorio({
  relatorio,
  podeEditar,
}: {
  relatorio: RelatorioLinha;
  podeEditar: boolean;
}) {
  const [pendente, startTransition] = useTransition();
  const [removido, setRemovido] = useState(false);
  const { confirmar } = useConfirm();

  async function excluir() {
    if (!(await confirmar({ mensagem: "Excluir este relatório de visita?", confirmarLabel: "Excluir relatório", variante: "perigo" })))
      return;
    startTransition(async () => {
      const resultado = await excluirRelatorioVisita(relatorio.id);
      if (resultado.ok) setRemovido(true);
    });
  }

  if (removido) return null;

  const capa = relatorio.capaUrl;
  const cor = corDaCategoria(relatorio.categoria);

  return (
    <article
      className={`erp-panel flex min-w-0 flex-col overflow-hidden rounded-xl border bg-zinc-900 ${
        relatorio.agendada ? "border-dashed border-zinc-600" : "border-surface-border"
      }`}
    >
      {capa && (
        <a href={`/relatorios/visitas/${relatorio.id}`} className="block">
          {/* eslint-disable-next-line @next/next/no-img-element -- fotos vêm do storage externo (Supabase), sem domínio fixo para next/image */}
          <img loading="lazy" decoding="async" src={capa} alt="" className="h-20 w-full object-cover" />
        </a>
      )}

      <div className="flex flex-1 flex-col p-4">
        <a href={`/relatorios/visitas/${relatorio.id}`} className="block">
          <div className="flex items-center gap-2">
            <p className="line-clamp-1 text-sm font-semibold text-white" title={relatorio.fazendaNome ?? relatorio.clienteNome}>
              {relatorio.fazendaNome ?? relatorio.clienteNome}
            </p>
            <BadgeCategoria categoria={relatorio.categoria} agendada={relatorio.agendada} />
          </div>
          <p className="mt-2 flex max-w-full items-center gap-1.5 text-xs font-medium text-secondary">
            <UserRound size={12} className="shrink-0 text-accent" />
            <span className="truncate">{relatorio.consultorNome}</span>
          </p>
          <p className="mt-1 text-xs text-muted">
            {relatorio.fazendaNome ? `${relatorio.clienteNome} · ` : ""}
            {fmtData(relatorio.dataVisita)}
            {relatorio.agendada ? ` às ${fmtHora(relatorio.dataVisita)}` : ""}
          </p>
          {relatorio.titulo && (
            <p className="mt-1 line-clamp-1 text-xs font-medium" style={{ color: cor }}>
              {relatorio.titulo}
            </p>
          )}
          <p className="mt-1.5 line-clamp-2 text-xs text-muted">{relatorio.texto}</p>
        </a>

        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-surface-border pt-3">
          <a
            href={`/relatorios/visitas/${relatorio.id}`}
            className="rounded px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-800"
          >
            Abrir
          </a>
          {podeEditar && (
            <a
              href={`/relatorios/visitas/${relatorio.id}/editar`}
              className="rounded px-2 py-1 text-xs text-accent hover:bg-zinc-800"
            >
              Editar
            </a>
          )}
          {relatorio.linkExterno && (
            <a
              href={relatorio.linkExterno}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded px-2 py-1 text-xs text-secondary hover:bg-zinc-800"
              title="Abrir o relatório original no TBDC"
            >
              TBDC
            </a>
          )}
          {relatorio.fotos.length > 0 && (
            <span className="ml-auto text-xs text-subtle">
              {relatorio.fotos.length} foto{relatorio.fotos.length > 1 ? "s" : ""}
            </span>
          )}
          {podeEditar && (
            <button
              onClick={excluir}
              disabled={pendente}
              className="rounded px-2 py-1 text-xs text-muted hover:bg-red-500/10 hover:text-red-400"
            >
              Excluir
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

function fmtDataGrupo(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function fmtHora(iso: string) {
  return new Date(iso).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Resumo do dia só pra quem gerencia a equipe: as visitas realizadas no dia
// escolhido, agrupadas por colaborador. Quando a visita teve check-in
// (hora/KM), mostra esses dados; senão as colunas ficam em "—" mas a visita
// continua aparecendo.
function ResumoDoDia({
  resumo,
  aoEscolherDia,
}: {
  resumo: { periodo: string; hoje: string; linhas: RelatorioLinha[] };
  aoEscolherDia: (periodo: string) => void;
}) {
  const { periodo, hoje, linhas } = resumo;
  // periodo: yyyy-mm-dd (um dia) ou yyyy-mm (o mês inteiro).
  const porMes = periodo.length === 7;
  const ehAtual = periodo === (porMes ? hoje.slice(0, 7) : hoje);
  const rotuloPeriodo = porMes
    ? new Date(`${periodo}-15T12:00:00`).toLocaleDateString("pt-BR", { month: "long", year: "numeric" })
    : fmtData(`${periodo}T12:00:00`);

  const porColaborador = useMemo(() => {
    const mapa = new Map<string, RelatorioLinha[]>();
    for (const r of linhas) {
      const lista = mapa.get(r.consultorNome);
      if (lista) lista.push(r);
      else mapa.set(r.consultorNome, [r]);
    }
    for (const lista of mapa.values()) {
      lista.sort((a, b) =>
        (a.horaChegada ?? a.dataVisita).localeCompare(b.horaChegada ?? b.dataVisita)
      );
    }
    return Array.from(mapa.entries()).sort((a, b) => a[0].localeCompare(b[0], "pt-BR"));
  }, [linhas]);

  const colaboradores = porColaborador.length;
  // Fazenda cadastrada no relatório; sem ela, conta o cliente.
  const fazendas = new Set(linhas.map((r) => r.fazendaNome ?? r.clienteNome)).size;

  const indicadores = [
    { icone: Users, valor: colaboradores, rotulo: colaboradores === 1 ? "Colaborador" : "Colaboradores" },
    { icone: MapPin, valor: linhas.length, rotulo: "Visitas realizadas" },
    { icone: Wheat, valor: fazendas, rotulo: "Fazendas atendidas" },
  ];

  return (
    <section className="space-y-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-white">
          Resumo de visitas{" "}
          <span className="font-normal text-secondary">
            — {ehAtual ? (porMes ? "mês atual, " : "hoje, ") : ""}
            {rotuloPeriodo}
          </span>
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-1 rounded-lg bg-zinc-800 p-1">
            {(["dia", "mes"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() =>
                  aoEscolherDia(
                    m === "mes"
                      ? periodo.slice(0, 7)
                      : periodo.length === 7
                        ? periodo === hoje.slice(0, 7) ? hoje : `${periodo}-01`
                        : periodo
                  )
                }
                aria-pressed={(m === "mes") === porMes}
                className={`rounded-md px-3 py-1 text-xs font-medium transition ${
                  (m === "mes") === porMes ? "bg-zinc-700 text-white" : "text-secondary hover:text-white"
                }`}
              >
                {m === "mes" ? "Mês" : "Dia"}
              </button>
            ))}
          </div>
          <SeletorPeriodo periodo={periodo} hoje={hoje} aoMudar={aoEscolherDia} />
          {!ehAtual && (
            <button
              type="button"
              onClick={() => aoEscolherDia(porMes ? hoje.slice(0, 7) : hoje)}
              className="whitespace-nowrap rounded-lg border border-surface-border px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
            >
              {porMes ? "Mês atual" : "Hoje"}
            </button>
          )}
        </div>
      </div>

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        {indicadores.map(({ icone: Icone, valor, rotulo }) => (
          <Kpi key={rotulo} rotulo={rotulo} valor={String(valor)} detalhe="No período selecionado" icone={Icone} />
        ))}
      </div>

      {porColaborador.length === 0 ? (
        <p className="rounded-lg border border-dashed border-surface-border p-6 text-center text-sm text-muted">
          Nenhuma visita realizada {porMes ? "nesse mês" : "nesse dia"}.
        </p>
      ) : (
        <div className="space-y-4">
          {porColaborador.map(([consultor, itens], indiceColaborador) => (
            <div key={consultor} className="erp-panel overflow-hidden rounded-xl border border-surface-border bg-zinc-900">
              <div className="flex items-center gap-3 border-b border-surface-border px-4 py-4 lg:px-5">
                <UserRound size={20} className="shrink-0 text-accent" />
                <p className="text-sm font-semibold text-white">
                  Colaborador {indiceColaborador + 1} — {consultor}
                </p>
                <span className="ml-auto rounded-full bg-accent/15 px-2 py-0.5 text-xs font-semibold text-accent">
                  {itens.length} {itens.length === 1 ? "visita" : "visitas"}
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-surface-border bg-zinc-800/40 text-left text-xs text-secondary">
                      <th className="w-10 px-3 py-2">Nº</th>
                      <th className="px-3 py-2">Fazenda</th>
                      <th className="px-3 py-2">Tipo</th>
                      <th className="px-3 py-2">Data</th>
                      <th className="px-3 py-2">Chegada</th>
                      <th className="px-3 py-2">KM chegada</th>
                      <th className="px-3 py-2">Objetivo da visita</th>
                      <th className="px-3 py-2">Saída</th>
                    </tr>
                  </thead>
                  <tbody>
                    {itens.map((r, i) => (
                      <tr key={r.id} className="border-b border-surface-border/60 last:border-0 hover:bg-zinc-800/30">
                        <td className="px-3 py-2 text-muted">{i + 1}</td>
                        <td className="px-3 py-2">
                          <a
                            href={`/relatorios/visitas/${r.id}`}
                            className="font-medium text-white underline-offset-4 hover:text-accent hover:underline"
                            title="Abrir relatório"
                          >
                            {r.fazendaNome ?? r.clienteNome}
                          </a>
                          {r.fazendaNome && (
                            <span className="block text-xs text-muted">{r.clienteNome}</span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <BadgeCategoria categoria={r.categoria} />
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-zinc-300">
                          {fmtData(r.horaChegada ?? r.dataVisita)}
                        </td>
                        <td className="px-3 py-2 text-zinc-300">
                          {r.horaChegada ? fmtHora(r.horaChegada) : "—"}
                        </td>
                        <td className="px-3 py-2 text-zinc-300">
                          {r.kmChegada != null ? r.kmChegada.toLocaleString("pt-BR") : "—"}
                        </td>
                        <td className="px-3 py-2 text-zinc-300">
                          {r.finalidade || r.titulo || "—"}
                        </td>
                        <td className="px-3 py-2 text-zinc-300">
                          {r.horaSaida ? fmtHora(r.horaSaida) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// FullCalendar só é baixado quando a pessoa abre o calendário.
const CalendarioVisitas = dynamic(
  () => import("@/components/visitas/calendario-visitas").then((m) => m.CalendarioVisitas),
  {
    ssr: false,
    loading: () => (
      <div className="h-[600px] animate-pulse rounded-xl border border-surface-border bg-zinc-900" />
    ),
  }
);

export function VisitasPainel({
  clientes,
  consultoresOpcoes,
  carteira,
  trabalhos,
  relatorios,
  resumo,
  paginacao,
  filtros,
  safra,
  usuarioId,
  ehAdmin,
  storageConfigurado,
}: {
  clientes: ClienteOpcao[];
  consultoresOpcoes: { id: string; nome: string }[];
  carteira: CarteiraVisitas;
  trabalhos: { id: string; nome: string }[];
  relatorios: RelatorioLinha[];
  resumo: { periodo: string; hoje: string; linhas: RelatorioLinha[] };
  paginacao: { pagina: number; porPagina: number; total: number };
  filtros: FiltrosAtuais;
  safra: { id: string; nome: string };
  usuarioId: string;
  ehAdmin: boolean;
  storageConfigurado: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const parametros = useSearchParams();
  const [navegando, startNavegacao] = useTransition();

  // Sobe a cada formulário fechado pro calendário rebuscar as visitas.
  const [versaoCalendario, setVersaoCalendario] = useState(0);
  // "Gerar relatório aqui" (Trabalhos da safra) chega com ?novo=tecnico&trabalho=ID.
  const [formulario, setFormulario] = useState<{
    agendar: boolean;
    clienteId?: string;
    tipo?: TipoRelatorio;
    trabalhoId?: string;
  } | null>(() =>
    parametros.get("novo") === "tecnico"
      ? { agendar: false, tipo: "TECNICO", trabalhoId: parametros.get("trabalho") ?? undefined }
      : null
  );
  // Calendário é o padrão; vindo do mapa de clientes (?cliente=...) abre a lista
// filtrada, que é onde dá pra ver as visitas daquele cliente.
  const [modo, setModo] = useState<"lista" | "calendario">(() =>
    parametros.get("cliente") ? "lista" : "calendario"
  );
  const [filtrosAbertos, setFiltrosAbertos] = useState(false);
  // Rascunho dos filtros: só vai pra URL (e ao servidor) ao clicar em Aplicar.
  const [rascunho, setRascunho] = useState<FiltrosAtuais>(filtros);

  // O filtro de consultor guarda os ids separados por vírgula (vários consultores).
  const nomesDosConsultores = (ids: string) =>
    ids
      .split(",")
      .map((id) => consultoresOpcoes.find((c) => c.id === id)?.nome)
      .filter(Boolean)
      .join(", ");

  function irPara(mudancas: Record<string, string | null>) {
    const novos = new URLSearchParams(parametros.toString());
    for (const [chave, valor] of Object.entries(mudancas)) {
      if (valor) novos.set(chave, valor);
      else novos.delete(chave);
    }
    const query = novos.toString();
    startNavegacao(() => router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false }));
  }

  function aplicarFiltros() {
    irPara({
      q: rascunho.q.trim() || null,
      cliente: null,
      consultor: rascunho.consultor || null,
      categoria: rascunho.categoria || null,
      de: rascunho.de || null,
      ate: rascunho.ate || null,
      ordem: rascunho.ordem === "antigas" ? "antigas" : null,
      pagina: null,
    });
    setFiltrosAbertos(false);
  }

  function limparFiltros() {
    const vazio: FiltrosAtuais = { q: "", consultor: "", categoria: "", de: "", ate: "", ordem: "recentes" };
    setRascunho(vazio);
    irPara({ q: null, cliente: null, consultor: null, categoria: null, de: null, ate: null, ordem: null, pagina: null });
    setFiltrosAbertos(false);
  }

  const qtdFiltrosAtivos = [filtros.q, filtros.consultor, filtros.categoria, filtros.de, filtros.ate].filter(Boolean).length;
  const filtrosAtivos = qtdFiltrosAtivos > 0;

  // Admin abre a página no resumo por consultor; a lista de cards fica
  // recolhida até pedir. Consultor (sem resumo) vê a lista direto.
  const [listaVisivel, setListaVisivel] = useState(!ehAdmin);
  // Filtrar ou paginar sem ver o resultado não faz sentido: abre a lista.
  const mostrarLista = listaVisivel || filtrosAtivos || paginacao.pagina > 1;

  const grupos = useMemo(() => {
    const mapa = new Map<string, RelatorioLinha[]>();
    for (const r of relatorios) {
      const chave = r.dataVisita.slice(0, 10);
      const lista = mapa.get(chave);
      if (lista) lista.push(r);
      else mapa.set(chave, [r]);
    }
    return Array.from(mapa.entries());
  }, [relatorios]);

  const totalPaginas = Math.max(1, Math.ceil(paginacao.total / paginacao.porPagina));

  return (
    <div className={navegando ? "opacity-70 transition-opacity" : "transition-opacity"}>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-white">Relatórios de visita</h1>
          <p className="text-sm text-secondary">
            {ehAdmin ? "Acompanhamento de campo da equipe, por consultor." : "Suas visitas e relatórios técnicos."}{" "}
            <span className="text-muted">Safra {safra.nome}.</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Calendário e lista são visões diferentes: dois botões separados. */}
          <div className="mr-4 flex gap-2">
            {(["calendario", "lista"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setModo(m)}
                className={`rounded-lg border px-4 py-2 text-sm font-medium transition ${
                  modo === m
                    ? "border-accent bg-accent/10 text-accent"
                    : "border-surface-border text-zinc-300 hover:bg-zinc-800"
                }`}
              >
                {m === "lista" ? "Lista" : "Calendário"}
              </button>
            ))}
          </div>
          {modo === "lista" && (
            <div className="relative">
              <button
                onClick={() => {
                  setRascunho(filtros);
                  setFiltrosAbertos((a) => !a);
                }}
                className={`flex items-center gap-1.5 rounded-lg border px-4 py-2 text-sm font-medium hover:bg-zinc-800 ${
                  filtrosAtivos
                    ? "border-accent text-accent"
                    : "border-surface-border text-zinc-300"
                }`}
              >
                Filtrar
                {filtrosAtivos && (
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-accent text-[11px] font-bold text-accent-foreground">
                    {qtdFiltrosAtivos}
                  </span>
                )}
              </button>

              {filtrosAbertos && (
                <>
                  <button
                    aria-label="Fechar filtros"
                    onClick={() => setFiltrosAbertos(false)}
                    className="fixed inset-0 z-40 cursor-default"
                  />
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      aplicarFiltros();
                    }}
                    className="absolute right-0 z-50 mt-2 w-80 space-y-3 rounded-xl border border-surface-border bg-zinc-900 p-4 shadow-xl"
                  >
                    <input
                      type="text"
                      placeholder="Buscar cliente, fazenda, título ou relato..."
                      value={rascunho.q}
                      onChange={(e) => setRascunho({ ...rascunho, q: e.target.value })}
                      className={inputCls}
                    />
                    <select
                      value={rascunho.categoria}
                      onChange={(e) => setRascunho({ ...rascunho, categoria: e.target.value })}
                      className={inputCls}
                    >
                      <option value="">Todas as categorias</option>
                      {CATEGORIAS_VISITA.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.rotulo}
                        </option>
                      ))}
                    </select>
                    {ehAdmin && (
                      <FiltroConsultores
                        consultores={consultoresOpcoes}
                        selecionados={rascunho.consultor.split(",").filter(Boolean)}
                        aoMudar={(ids) => setRascunho({ ...rascunho, consultor: ids.join(",") })}
                        alinhar="left"
                      />
                    )}
                    <div className="flex items-center gap-2">
                      <div className="min-w-0 flex-1">
                        <label className="mb-1 block text-xs text-muted">De</label>
                        <DateInput
                          value={rascunho.de}
                          onChange={(e) => setRascunho({ ...rascunho, de: e.target.value })}
                          className={`${inputCls} min-w-0`}
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <label className="mb-1 block text-xs text-muted">Até</label>
                        <DateInput
                          value={rascunho.ate}
                          onChange={(e) => setRascunho({ ...rascunho, ate: e.target.value })}
                          className={`${inputCls} min-w-0`}
                        />
                      </div>
                    </div>
                    <select
                      value={rascunho.ordem}
                      onChange={(e) =>
                        setRascunho({ ...rascunho, ordem: e.target.value as "recentes" | "antigas" })
                      }
                      className={inputCls}
                    >
                      <option value="recentes">Mais recentes primeiro</option>
                      <option value="antigas">Mais antigas primeiro</option>
                    </select>
                    <div className="flex gap-2">
                      <button
                        type="submit"
                        className="flex-1 rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-accent-foreground hover:brightness-110"
                      >
                        Aplicar
                      </button>
                      {filtrosAtivos && (
                        <button
                          type="button"
                          onClick={limparFiltros}
                          className="rounded-lg border border-surface-border px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
                        >
                          Limpar
                        </button>
                      )}
                    </div>
                  </form>
                </>
              )}
            </div>
          )}
          <button
            onClick={() => setFormulario({ agendar: true })}
            className="rounded-lg border border-accent px-4 py-2 text-sm font-semibold text-accent hover:bg-accent/10"
          >
            Agendar visita
          </button>
          <Link
            href="/relatorios/visitas/novo"
            className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground hover:brightness-110"
          >
            + Novo relatório
          </Link>
        </div>
      </div>

      {ehAdmin && modo === "lista" && (
        <div className="mb-8">
          <ResumoDoDia resumo={resumo} aoEscolherDia={(periodo) => irPara({ resumo: periodo === resumo.hoje.slice(0, 7) ? null : periodo })} />
        </div>
      )}

      {!storageConfigurado && (
        <p className="mb-4 rounded-lg border border-amber-600/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-300">
          O envio de fotos ainda não está disponível. Você pode criar relatórios com texto. Para habilitar as fotos, fale com o administrador.
        </p>
      )}

      {modo === "calendario" ? (
        <CalendarioVisitas
          key={safra.id}
          ehAdmin={ehAdmin}
          consultores={consultoresOpcoes}
          carteira={carteira}
          versao={versaoCalendario}
          aoAgendar={(clienteId) => setFormulario({ agendar: true, clienteId })}
        />
      ) : (
        <div className={`flex flex-wrap items-center gap-3 ${ehAdmin ? "border-t border-white/[0.08] pt-6" : ""}`}>
          <h2 className="text-base font-bold text-white">
            Todos os relatórios{" "}
            <span className="font-normal text-muted">({paginacao.total.toLocaleString("pt-BR")})</span>
          </h2>
          <button
            onClick={() => setListaVisivel((v) => !v)}
            disabled={filtrosAtivos || paginacao.pagina > 1}
            className="rounded-lg border border-surface-border px-3 py-1 text-xs font-medium text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
          >
            {mostrarLista ? "Ocultar" : "Mostrar"}
          </button>
          {filtros.consultor && (
            <span className="rounded-full bg-accent/10 px-2 py-0.5 text-xs text-accent">
              {nomesDosConsultores(filtros.consultor)}
            </span>
          )}
        </div>
      )}

      {modo === "calendario" || !mostrarLista ? null : paginacao.total === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-surface-border p-8 text-center text-sm text-muted">
          {filtrosAtivos
            ? "Nenhum relatório com esses filtros. Altere o período, o consultor ou a busca."
            : "Nenhum relatório de visita nesta safra. Use \"Novo relatório\" para registrar a primeira visita."}
        </p>
      ) : (
        <>
          <div className="mt-4 space-y-6">
            {grupos.map(([data, itens]) => (
              <section key={data}>
                <h2 className="mb-2 text-sm font-semibold capitalize text-secondary">
                  {fmtDataGrupo(itens[0].dataVisita)}
                </h2>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                  {itens.map((r) => (
                    <CardRelatorio
                      key={r.id}
                      relatorio={r}
                      podeEditar={ehAdmin || r.consultorId === usuarioId}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>

          {totalPaginas > 1 && (
            <nav className="mt-6 flex items-center justify-center gap-3 text-sm">
              <button
                disabled={paginacao.pagina <= 1}
                onClick={() => irPara({ pagina: paginacao.pagina - 1 > 1 ? String(paginacao.pagina - 1) : null })}
                className="rounded-lg border border-surface-border px-3 py-1.5 text-zinc-300 hover:bg-zinc-800 disabled:opacity-40"
              >
                Anterior
              </button>
              <span className="text-secondary">
                Página {paginacao.pagina} de {totalPaginas}
              </span>
              <button
                disabled={paginacao.pagina >= totalPaginas}
                onClick={() => irPara({ pagina: String(paginacao.pagina + 1) })}
                className="rounded-lg border border-surface-border px-3 py-1.5 text-zinc-300 hover:bg-zinc-800 disabled:opacity-40"
              >
                Próxima
              </button>
            </nav>
          )}
        </>
      )}

      {formulario && (
        <FormNovoRelatorio
          clientes={clientes}
          trabalhos={trabalhos}
          agendar={formulario.agendar}
          clienteInicial={formulario.clienteId}
          tipoInicial={formulario.tipo}
          trabalhoInicial={formulario.trabalhoId}
          aoFechar={() => {
            setFormulario(null);
            setVersaoCalendario((v) => v + 1);
            if (parametros.get("novo")) irPara({ novo: null, trabalho: null });
          }}
        />
      )}
    </div>
  );
}
