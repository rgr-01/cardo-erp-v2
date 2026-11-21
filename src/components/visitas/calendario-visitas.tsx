"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import ptBrLocale from "@fullcalendar/core/locales/pt-br";
import type { EventContentArg, EventSourceFuncArg, EventInput } from "@fullcalendar/core";
import { carregarEventosCalendario } from "@/app/actions/relatorios-visita";
import { CATEGORIAS_VISITA, rotuloDaCategoria, type CategoriaVisita } from "@/lib/visitas-categoria";
import {
  FAIXAS_RECENCIA,
  faixaPorDias,
  type FaixaRecencia,
} from "@/lib/recencia-visita";
import type { CarteiraVisitas, ClienteRecencia } from "@/lib/visitas-calendario";
import { FiltroConsultores } from "@/components/ui/filtro-consultores";
import { DiagnosticoCarteira } from "@/components/visitas/diagnostico-carteira";
import { ESTILO_PAINEL } from "@/components/ui/padroes-painel";

type ConsultorOpcao = { id: string; nome: string };

// Cada visita num "cartãozinho" de duas linhas: hora + cliente em cima,
// tipo/consultor embaixo — o nome do cliente não fica mais cortado.
function ConteudoEvento({ arg, ehAdmin }: { arg: EventContentArg; ehAdmin: boolean }) {
  const { consultor, categoria, emAndamento, agendada } = arg.event.extendedProps as {
    consultor: string;
    categoria: CategoriaVisita;
    emAndamento: boolean;
    agendada: boolean;
  };
  const detalhes = [
    rotuloDaCategoria(categoria).toLowerCase(),
    agendada ? "agendada" : null,
    emAndamento ? "em andamento" : null,
    ehAdmin ? consultor : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <div
      title={`${arg.timeText ? `${arg.timeText} · ` : ""}${arg.event.title} — ${detalhes}`}
      className={`min-w-0 overflow-hidden px-1.5 py-1 leading-tight ${agendada ? "text-zinc-200" : "text-zinc-950"}`}>
      <p className="truncate text-[12px] font-semibold">
        {arg.timeText && <span className="mr-1">{arg.timeText}</span>}
        {arg.event.title}
      </p>
      <p className="truncate text-[11px] opacity-75">{detalhes}</p>
    </div>
  );
}

const ORDEM_CRITICA: FaixaRecencia[] = ["vermelho", "laranja", "amarelo", "nunca", "verde"];

function agruparPorFaixa(clientes: ClienteRecencia[]) {
  const mapa = new Map<FaixaRecencia, ClienteRecencia[]>(
    FAIXAS_RECENCIA.map((f) => [f.faixa, []])
  );
  for (const c of clientes) mapa.get(faixaPorDias(c.dias))!.push(c);
  for (const lista of mapa.values()) {
    lista.sort((a, b) => (b.dias ?? Infinity) - (a.dias ?? Infinity) || a.nome.localeCompare(b.nome, "pt-BR"));
  }
  return mapa;
}

// Planilha com todas as faixas, da mais crítica pra menos; a lib xlsx só
// é baixada quando o usuário clica.
async function exportarRecencia(porFaixa: Map<FaixaRecencia, ClienteRecencia[]>, ehAdmin: boolean) {
  const XLSX = await import("xlsx");
  const linhas = ORDEM_CRITICA.flatMap((f) => {
    const rotulo = FAIXAS_RECENCIA.find((x) => x.faixa === f)?.rotulo ?? f;
    return (porFaixa.get(f) ?? []).map((c) => ({
      Cliente: c.nome,
      ...(ehAdmin ? { Consultor: c.consultorNome ?? "Sem consultor" } : {}),
      Cidade: c.cidade ?? "",
      Faixa: rotulo,
      "Última visita": c.ultimaVisita ? new Date(c.ultimaVisita).toLocaleDateString("pt-BR") : "nunca",
      "Dias sem visita": c.dias ?? "",
    }));
  });
  const planilha = XLSX.utils.json_to_sheet(linhas);
  planilha["!cols"] = [{ wch: 40 }, ...(ehAdmin ? [{ wch: 25 }] : []), { wch: 20 }, { wch: 14 }, { wch: 14 }, { wch: 15 }];
  const livro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(livro, planilha, "Tempo sem visita");
  XLSX.writeFile(livro, `tempo-sem-visita-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

function PainelRecencia({
  porFaixa,
  faixa,
  filtrando,
  aoEscolher,
  aoLimpar,
  ehAdmin,
}: {
  porFaixa: Map<FaixaRecencia, ClienteRecencia[]>;
  faixa: FaixaRecencia;
  filtrando: boolean;
  aoEscolher: (faixa: FaixaRecencia) => void;
  aoLimpar: () => void;
  ehAdmin: boolean;
}) {
  const lista = porFaixa.get(faixa) ?? [];

  return (
    <aside className={ESTILO_PAINEL}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-white">Tempo sem visita</h2>
        <button
          onClick={() => exportarRecencia(porFaixa, ehAdmin)}
          title="Baixar planilha (Excel) com todas as faixas"
          aria-label="Baixar planilha Excel"
          className="rounded-md p-1 text-secondary transition hover:bg-zinc-800 hover:text-white"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3v12m0 0-4-4m4 4 4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
          </svg>
        </button>
      </div>
      <p className="mb-3 text-xs text-muted">
        {ehAdmin ? "Clientes" : "Clientes da sua carteira"} pela última visita. Clique numa faixa pra
        filtrar o calendário.
      </p>

      <div className="grid grid-cols-2 gap-1.5">
        {FAIXAS_RECENCIA.map((f) => {
          const ativo = f.faixa === faixa;
          return (
            <button
              key={f.faixa}
              onClick={() => aoEscolher(f.faixa)}
              className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 text-left text-xs transition ${
                ativo && filtrando
                  ? "border-accent bg-accent/10"
                  : "border-surface-border hover:border-zinc-600"
              } ${f.faixa === "nunca" ? "col-span-2" : ""}`}
            >
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: f.cor }} />
              <span className="flex-1 text-zinc-300">{f.rotulo}</span>
              <span className="font-semibold text-white">{porFaixa.get(f.faixa)?.length ?? 0}</span>
            </button>
          );
        })}
      </div>

      {filtrando && (
        <div className="mt-3 flex items-center justify-between gap-2 rounded-lg bg-accent/10 px-2 py-1.5 text-xs text-accent">
          <span>Calendário filtrado por esta faixa</span>
          <button onClick={aoLimpar} className="font-semibold underline-offset-2 hover:underline">
            Limpar filtro
          </button>
        </div>
      )}

      <ul className="mt-3 max-h-[480px] space-y-1 overflow-y-auto pr-1">
        {lista.length === 0 && (
          <li className="py-6 text-center text-xs text-muted">Nenhum cliente nesta faixa de tempo sem visita. Selecione outra faixa.</li>
        )}
        {lista.map((c) => (
          <li
            key={c.id}
            className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-xs hover:bg-zinc-800"
          >
            <span className="min-w-0">
              <span className="block truncate font-medium text-zinc-200">{c.nome}</span>
              {ehAdmin && (
                <span className="block truncate text-muted">{c.consultorNome ?? "Sem consultor"}</span>
              )}
            </span>
            <span className="shrink-0 text-secondary">
              {c.dias === null ? "nunca" : c.dias === 0 ? "hoje" : `há ${c.dias} d`}
            </span>
          </li>
        ))}
      </ul>
    </aside>
  );
}

export function CalendarioVisitas({
  ehAdmin,
  consultores,
  carteira,
  versao,
  aoAgendar,
}: {
  ehAdmin: boolean;
  consultores: ConsultorOpcao[];
  carteira: CarteiraVisitas;
  versao: number;
  aoAgendar: (clienteId?: string) => void;
}) {
  const recencia = carteira.clientes;
  const router = useRouter();
  const calendario = useRef<FullCalendar>(null);
  const [consultorIds, setConsultorIds] = useState<string[]>([]);
  // Faixa mostrada no painel (null = a mais crítica com cliente) e se ela
  // também filtra o calendário.
  const [faixaEscolhida, setFaixaEscolhida] = useState<FaixaRecencia | null>(null);
  const [filtrandoFaixa, setFiltrandoFaixa] = useState(false);

  // O FullCalendar guarda a função de eventos; os refs deixam ela ler os
  // filtros atuais sem recriar o calendário.
  const filtroConsultor = useRef<string[]>([]);
  const filtroClientes = useRef<Set<string> | null>(null);

  // Visita criada/agendada (ou dados do servidor renovados): rebusca os
  // eventos sem precisar de F5.
  useEffect(() => {
    calendario.current?.getApi().refetchEvents();
  }, [versao, carteira]);

  const recenciaFiltrada = useMemo(
    () => (consultorIds.length > 0 ? recencia.filter((c) => !!c.consultorId && consultorIds.includes(c.consultorId)) : recencia),
    [recencia, consultorIds]
  );
  const porFaixa = useMemo(() => agruparPorFaixa(recenciaFiltrada), [recenciaFiltrada]);
  const faixa =
    faixaEscolhida ??
    ORDEM_CRITICA.find((f) => (porFaixa.get(f)?.length ?? 0) > 0) ??
    "vermelho";

  function aplicarFiltros(novosConsultores: string[], novaFaixa: FaixaRecencia | null) {
    filtroConsultor.current = novosConsultores;
    if (novaFaixa) {
      const lista = agruparPorFaixa(
        novosConsultores.length > 0 ? recencia.filter((c) => !!c.consultorId && novosConsultores.includes(c.consultorId)) : recencia
      ).get(novaFaixa);
      filtroClientes.current = new Set((lista ?? []).map((c) => c.id));
    } else {
      filtroClientes.current = null;
    }
    calendario.current?.getApi().refetchEvents();
  }

  function mudarConsultor(ids: string[]) {
    setConsultorIds(ids);
    aplicarFiltros(ids, filtrandoFaixa ? faixa : null);
  }

  // Clicar na faixa escolhe e filtra o calendário; clicar de novo na faixa
  // que já está filtrando tira o filtro.
  function escolherFaixa(nova: FaixaRecencia) {
    const desligar = filtrandoFaixa && nova === faixa;
    setFaixaEscolhida(desligar ? null : nova);
    setFiltrandoFaixa(!desligar);
    aplicarFiltros(consultorIds, desligar ? null : nova);
  }

  function limparFaixa() {
    setFaixaEscolhida(null);
    setFiltrandoFaixa(false);
    aplicarFiltros(consultorIds, null);
  }

  // Visitas já buscadas por período/consultores: ligar e desligar a faixa só
  // refiltra o que já veio, sem nova chamada ao servidor.
  const cacheEventos = useRef(new Map<string, EventInput[]>());

  // Função estável: se mudar a cada render o FullCalendar troca a fonte e
  // briga com o refetchEvents, deixando o calendário com o filtro antigo.
  const buscarEventos = useCallback(
    async (
      info: EventSourceFuncArg,
      sucesso: (eventos: EventInput[]) => void,
      falha: (erro: Error) => void
    ) => {
      try {
        const chave = `${info.startStr}|${info.endStr}|${filtroConsultor.current.join(",")}`;
        let eventos = cacheEventos.current.get(chave);
        if (!eventos) {
          eventos = await carregarEventosCalendario(info.startStr, info.endStr, filtroConsultor.current);
          cacheEventos.current.set(chave, eventos);
        }
        const clientes = filtroClientes.current;
        sucesso(clientes ? eventos.filter((e) => clientes.has(e.extendedProps?.clienteId)) : eventos);
      } catch (erro) {
        falha(erro instanceof Error ? erro : new Error("Não foi possível carregar as visitas. Atualize a página e tente novamente."));
      }
    },
    []
  );

  const visitasDoFiltro = useMemo(
    () =>
      consultorIds.length > 0
        ? carteira.visitas.filter((v) => consultorIds.includes(v.consultorId))
        : carteira.visitas,
    [carteira.visitas, consultorIds]
  );

  return (
    <>
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
      <div className={`calendario-visitas ${ESTILO_PAINEL}`}>
        {ehAdmin && (
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <FiltroConsultores
              consultores={consultores}
              selecionados={consultorIds}
              aoMudar={mudarConsultor}
              alinhar="left"
            />
          </div>
        )}

        <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-secondary">
          {CATEGORIAS_VISITA.map((c) => (
            <span key={c.id} className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: c.cor }} />
              {c.rotulo}
            </span>
          ))}
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-3.5 rounded-[3px] border border-dashed border-zinc-400" />
            agendada
          </span>
        </div>

        <FullCalendar
          ref={calendario}
          viewDidMount={({ el }) => {
            el.closest(".fc")?.querySelectorAll('.fc-icon[role="img"]').forEach(icon => icon.setAttribute("aria-hidden", "true"));
          }}
          plugins={[dayGridPlugin, timeGridPlugin]}
          locale={ptBrLocale}
          initialView="dayGridMonth"
          headerToolbar={{
            left: "prev,next today",
            center: "title",
            right: "dayGridMonth,timeGridWeek,timeGridDay",
          }}
          height="auto"
          events={buscarEventos}
          eventContent={(arg) => <ConteudoEvento arg={arg} ehAdmin={ehAdmin} />}
          eventClick={(info) => {
            info.jsEvent.preventDefault();
            router.push(`/relatorios/visitas/${info.event.id}`);
          }}
          eventDisplay="block"
          // Visita com check-in e check-out no mesmo minuto vira um bloco de
          // altura mínima legível, e as simultâneas ficam lado a lado em vez
          // de empilhadas uma sobre a outra.
          eventMinHeight={38}
          eventShortHeight={38}
          slotEventOverlap={false}
          dayMaxEvents={4}
          nowIndicator
          slotMinTime="05:00:00"
          slotMaxTime="21:00:00"
          allDayText="dia"
          eventTimeFormat={{ hour: "2-digit", minute: "2-digit", hour12: false }}
          slotLabelFormat={{ hour: "2-digit", minute: "2-digit", hour12: false }}
        />
      </div>

      <PainelRecencia
        porFaixa={porFaixa}
        faixa={faixa}
        filtrando={filtrandoFaixa}
        aoEscolher={escolherFaixa}
        aoLimpar={limparFaixa}
        ehAdmin={ehAdmin}
      />
    </div>
    <DiagnosticoCarteira clientes={recenciaFiltrada} visitas={visitasDoFiltro} aoAgendar={aoAgendar} />
    </>
  );
}
