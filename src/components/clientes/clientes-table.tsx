"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import { Download, Plus, Minus, Check, X, Trash2, MapPin, Wheat } from "lucide-react";
import {
  criarCliente,
  atualizarCliente,
  excluirCliente,
  type ClienteInput,
} from "@/app/actions/clientes";
import { fmtNum } from "@/lib/format";
import { formatarNumeroCadastro } from "@/lib/numero-cadastro";
import { baixarCSV } from "@/lib/csv";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Paginacao, usePaginacao } from "@/components/ui/paginacao";
import { ComboBox, type ComboBoxOpcao } from "@/components/ui/combo-box";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { FiltroColunaExcel } from "@/components/ui/filtro-coluna-excel";
import { FiltroTextoColuna } from "@/components/ui/filtro-texto-coluna";
import dynamic from "next/dynamic";
import { corDoConsultor } from "@/lib/cores-consultor";
import { FazendasModal } from "@/components/clientes/fazendas-modal";

// Leaflet mexe em `window` ao ser importado: carrega só no navegador e só
// quando o modal abre.
const LocalizacaoModal = dynamic(
  () =>
    import("@/components/clientes/localizacao-modal").then(
      (m) => m.LocalizacaoModal
    ),
  { ssr: false }
);

export type ClienteLinha = {
  id: string;
  numero: number;
  nome: string;
  documento: string | null;
  razaoSocial: string | null;
  inscricaoEstadual: string | null;
  telefone: string | null;
  email: string | null;
  endereco: string | null;
  cidade: string | null;
  uf: string | null;
  cep: string | null;
  ctv: string | null;
  areaPlantio: number | null;
  areaTotal: number | null;
  pctIrrigada: number | null;
  pctArroz: number | null;
  pctSoja: number | null;
  pctMilho: number | null;
  pctAlgodao: number | null;
  pctFeijao: number | null;
  pctTrigo: number | null;
  pctMilho2: number | null;
  pctSorgo2: number | null;
  latitude: number | null;
  longitude: number | null;
  consultorId: string | null;
  consultorNome: string | null;
  qtdVendas: number;
  qtdVisitas: number;
  qtdFazendas: number;
  fazendasNomes: string[];
  ultimaVisita: string | null;
};

export type ConsultorOpcao = { id: string; nome: string };

const cellInputCls =
  "w-full rounded border border-accent bg-zinc-800 px-1.5 py-1 text-sm text-white outline-none";

type CampoTexto =
  | "nome"
  | "documento"
  | "razaoSocial"
  | "inscricaoEstadual"
  | "telefone"
  | "email"
  | "cep"
  | "endereco"
  | "cidade"
  | "uf"
  | "ctv";

type CampoNumero =
  | "areaPlantio"
  | "areaTotal"
  | "pctIrrigada"
  | "pctArroz"
  | "pctSoja"
  | "pctMilho"
  | "pctAlgodao"
  | "pctFeijao"
  | "pctTrigo"
  | "pctMilho2"
  | "pctSorgo2";

type CampoEditavel = CampoTexto | CampoNumero;

const CAMPOS_TEXTO_PRINCIPAIS: { campo: CampoTexto; rotulo: string; largura?: string }[] = [
  { campo: "nome", rotulo: "Nome", largura: "max-w-52" },
  { campo: "documento", rotulo: "CPF/CNPJ" },
  { campo: "razaoSocial", rotulo: "Razão social", largura: "max-w-44" },
  { campo: "inscricaoEstadual", rotulo: "Insc. estadual" },
  { campo: "telefone", rotulo: "Telefone" },
  { campo: "email", rotulo: "E-mail" },
  { campo: "cep", rotulo: "CEP" },
  { campo: "endereco", rotulo: "Endereço", largura: "max-w-44" },
  { campo: "cidade", rotulo: "Cidade" },
  { campo: "uf", rotulo: "UF" },
  { campo: "ctv", rotulo: "CTV" },
];

const CAMPOS_NUMERO_EXTRAS: { campo: CampoNumero; rotulo: string }[] = [
  { campo: "areaTotal", rotulo: "Área total (ha)" },
  { campo: "pctIrrigada", rotulo: "% Irrigada" },
  { campo: "pctArroz", rotulo: "% Arroz" },
  { campo: "pctSoja", rotulo: "% Soja" },
  { campo: "pctMilho", rotulo: "% Milho" },
  { campo: "pctAlgodao", rotulo: "% Algodão" },
  { campo: "pctFeijao", rotulo: "% Feijão" },
  { campo: "pctTrigo", rotulo: "% Trigo" },
  { campo: "pctMilho2", rotulo: "% Milho 2ª" },
  { campo: "pctSorgo2", rotulo: "% Sorgo 2ª" },
];

type LinhaNova = Record<CampoEditavel, string> & { consultorId: string };

const LINHA_NOVA_VAZIA: LinhaNova = {
  consultorId: "",
  nome: "",
  documento: "",
  razaoSocial: "",
  inscricaoEstadual: "",
  telefone: "",
  email: "",
  cep: "",
  endereco: "",
  cidade: "",
  uf: "",
  ctv: "",
  areaPlantio: "",
  areaTotal: "",
  pctIrrigada: "",
  pctArroz: "",
  pctSoja: "",
  pctMilho: "",
  pctAlgodao: "",
  pctFeijao: "",
  pctTrigo: "",
  pctMilho2: "",
  pctSorgo2: "",
};

// "+" no fim do cabeçalho: mostra/oculta as colunas extras. Ao passar o mouse
// abre um popup dizendo quais colunas entram (position:fixed porque a tabela
// tem rolagem lateral, que cortaria um popup absoluto).
function BotaoColunasExtras({
  ativo,
  aoAlternar,
  rotulos,
}: {
  ativo: boolean;
  aoAlternar: () => void;
  rotulos: string[];
}) {
  const [aberto, setAberto] = useState(false);
  const [pos, setPos] = useState({ top: 0, right: 0 });
  const botao = useRef<HTMLButtonElement>(null);

  function abrir() {
    const r = botao.current?.getBoundingClientRect();
    if (r) setPos({ top: r.bottom + 8, right: Math.max(8, window.innerWidth - r.right) });
    setAberto(true);
  }

  return (
    <>
      <button
        ref={botao}
        type="button"
        onClick={aoAlternar}
        onMouseEnter={abrir}
        onMouseLeave={() => setAberto(false)}
        onFocus={abrir}
        onBlur={() => setAberto(false)}
        aria-pressed={ativo}
        aria-label={ativo ? "Ocultar colunas extras" : "Mostrar mais colunas"}
        className={`inline-flex h-7 w-7 items-center justify-center rounded-full border transition ${
          ativo
            ? "border-accent bg-accent text-accent-foreground"
            : "border-surface-border text-secondary hover:border-accent hover:text-accent"
        }`}
      >
        {ativo ? <Minus size={14} strokeWidth={2.5} /> : <Plus size={14} strokeWidth={2.5} />}
      </button>
      {aberto && (
        <div
          role="tooltip"
          style={{ top: pos.top, right: pos.right }}
          className="pointer-events-none fixed z-[1400] w-56 rounded-lg border border-surface-border bg-zinc-800 px-3 py-2.5 text-left text-xs normal-case tracking-normal shadow-xl"
        >
          <p className="mb-1 font-semibold text-white">{ativo ? "Ocultar colunas extras" : "Mostrar mais colunas"}</p>
          <p className="mb-1.5 text-secondary">{ativo ? "Estão aparecendo:" : "Entram na tabela:"}</p>
          <ul className="space-y-0.5 text-zinc-200">
            {rotulos.map((r) => (
              <li key={r} className="flex items-center gap-1.5">
                <span className="h-1 w-1 rounded-full bg-accent" /> {r}
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}

function paraInput(cliente: ClienteLinha): ClienteInput {
  return {
    nome: cliente.nome,
    documento: cliente.documento,
    razaoSocial: cliente.razaoSocial,
    inscricaoEstadual: cliente.inscricaoEstadual,
    telefone: cliente.telefone,
    email: cliente.email,
    endereco: cliente.endereco,
    cidade: cliente.cidade,
    uf: cliente.uf,
    cep: cliente.cep,
    ctv: cliente.ctv,
    areaPlantio: cliente.areaPlantio,
    areaTotal: cliente.areaTotal,
    pctIrrigada: cliente.pctIrrigada,
    pctArroz: cliente.pctArroz,
    pctSoja: cliente.pctSoja,
    pctMilho: cliente.pctMilho,
    pctAlgodao: cliente.pctAlgodao,
    pctFeijao: cliente.pctFeijao,
    pctTrigo: cliente.pctTrigo,
    pctMilho2: cliente.pctMilho2,
    pctSorgo2: cliente.pctSorgo2,
    latitude: cliente.latitude,
    longitude: cliente.longitude,
    consultorId: cliente.consultorId,
  };
}

export function ClientesTable({
  clientes,
  ehAdmin,
  consultores,
  cores,
}: {
  clientes: ClienteLinha[];
  ehAdmin: boolean;
  consultores: ConsultorOpcao[];
  cores?: Record<string, string>;
}) {
  // Link vindo de outra tela (ex.: aviso de cadastro incompleto em Pedidos)
  // pode chegar com ?busca=<nome> pra abrir ja filtrado no cliente certo.
  const searchParams = useSearchParams();
  const [busca, setBusca] = useState(() => searchParams.get("busca") ?? "");
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();
  const { confirmar } = useConfirm();
  const [celulaAtiva, setCelulaAtiva] = useState<
    { clienteId: string; campo: CampoEditavel } | null
  >(null);
  // Valor otimista por clienteId+campo: mostra na hora o que foi digitado
  // (igual planilha) em vez de piscar pro valor antigo enquanto a Server
  // Action roda e o revalidatePath ainda não atualizou a prop `clientes`.
  const [edicoesOtimistas, setEdicoesOtimistas] = useState<
    Map<string, string | number | null>
  >(new Map());
  const [colunasExtras, setColunasExtras] = useState(false);
  const [criandoLinha, setCriandoLinha] = useState(false);
  const [linhaNova, setLinhaNova] = useState<LinhaNova>(LINHA_NOVA_VAZIA);
  const [localizacaoAberta, setLocalizacaoAberta] = useState<ClienteLinha | null>(null);
  const [fazendasAbertas, setFazendasAbertas] = useState<ClienteLinha | null>(null);
  const [filtroFazenda, setFiltroFazenda] = useState("");
  const [filtroUf, setFiltroUf] = useState<Set<string>>(new Set());
  const [filtroConsultorIds, setFiltroConsultorIds] = useState<Set<string>>(new Set());

  const opcoesConsultores: ComboBoxOpcao[] = useMemo(
    () => consultores.map((c) => ({ id: c.id, label: c.nome })),
    [consultores]
  );

  const opcoesFiltroUf = useMemo(() => {
    const ufs = new Set(clientes.map((c) => c.uf).filter((uf): uf is string => Boolean(uf)));
    return [...ufs].sort().map((uf) => ({ id: uf, label: uf }));
  }, [clientes]);

  const opcoesFiltroConsultor = useMemo(() => {
    const opcoes = consultores.map((c) => ({ id: c.id, label: c.nome }));
    const temSemConsultor = clientes.some((c) => !c.consultorId);
    return temSemConsultor ? [...opcoes, { id: "__sem__", label: "Sem consultor" }] : opcoes;
  }, [clientes, consultores]);

  useEffect(() => {
    if (!criandoLinha) return;
    document
      .getElementById("linha-novo-cliente")
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
    document.getElementById("novo-cliente-nome")?.focus();
  }, [criandoLinha]);

  const filtrados = useMemo(() => {
    const termoNome = busca.toLowerCase();
    const termoFazenda = filtroFazenda.trim().toLowerCase();
    return clientes.filter((c) => {
      if (termoNome && !c.nome.toLowerCase().includes(termoNome) && !(/^\d+$/.test(termoNome.trim()) && c.numero === Number(termoNome))) return false;
      if (termoFazenda && !c.fazendasNomes.some((f) => f.toLowerCase().includes(termoFazenda))) {
        return false;
      }
      if (filtroUf.size > 0 && !(c.uf && filtroUf.has(c.uf))) return false;
      if (filtroConsultorIds.size > 0) {
        const chave = c.consultorId ?? "__sem__";
        if (!filtroConsultorIds.has(chave)) return false;
      }
      return true;
    });
  }, [clientes, busca, filtroFazenda, filtroUf, filtroConsultorIds]);

  const paginacao = usePaginacao(filtrados, busca);

  // Assim que `clientes` (prop revalidada do servidor) já bate com o valor
  // otimista, a entrada é descartada na leitura/escrita abaixo — evita que o
  // Map cresça pra sempre e evita "prender" um valor otimista caso o servidor
  // tenha normalizado o texto (trim, capitalização etc.) de um jeito
  // diferente do que foi digitado.
  function otimistaAindaValida(
    clienteId: string,
    campo: string,
    valorOtimista: string | number | null,
  ) {
    const cliente = clientes.find((c) => c.id === clienteId);
    return !cliente || (cliente as Record<string, unknown>)[campo] !== valorOtimista;
  }

  function valorCampo<K extends keyof ClienteLinha>(cliente: ClienteLinha, campo: K): ClienteLinha[K] {
    const chave = `${cliente.id}:${campo}`;
    if (edicoesOtimistas.has(chave)) {
      const valorOtimista = edicoesOtimistas.get(chave) as ClienteLinha[K];
      if (otimistaAindaValida(cliente.id, campo as string, valorOtimista as string | number | null)) {
        return valorOtimista;
      }
    }
    return cliente[campo];
  }

  async function excluir(cliente: ClienteLinha) {
    if (!(await confirmar({ mensagem: `Excluir o cliente ${cliente.nome}?`, confirmarLabel: "Excluir cliente", variante: "perigo" })))
      return;
    setErro(null);
    startTransition(async () => {
      const resultado = await excluirCliente(cliente.id);
      if (!resultado.ok) setErro(resultado.erro);
    });
  }

  function salvarCampo(cliente: ClienteLinha, patch: Partial<ClienteInput>) {
    setErro(null);
    const input = { ...paraInput(cliente), ...patch };
    setCelulaAtiva(null);
    setEdicoesOtimistas((atual) => {
      const novo = new Map<string, string | number | null>();
      for (const [chave, valorOtimista] of atual) {
        const [id, campo] = chave.split(":");
        if (otimistaAindaValida(id, campo, valorOtimista)) novo.set(chave, valorOtimista);
      }
      for (const [campo, valor] of Object.entries(patch)) {
        novo.set(`${cliente.id}:${campo}`, valor as string | number | null);
      }
      return novo;
    });
    startTransition(async () => {
      const resultado = await atualizarCliente(cliente.id, input);
      if (!resultado.ok) {
        setErro(resultado.erro);
        // Falhou: descarta o otimista pra voltar a mostrar o valor real.
        setEdicoesOtimistas((atual) => {
          const novo = new Map(atual);
          for (const campo of Object.keys(patch)) novo.delete(`${cliente.id}:${campo}`);
          return novo;
        });
      }
      // Sucesso: mantém o otimista até o revalidatePath trazer a prop
      // atualizada — o efeito abaixo limpa quando `clientes` já bate.
    });
  }

  function atualizarLinhaNova(patch: Partial<LinhaNova>) {
    setLinhaNova((atual) => ({ ...atual, ...patch }));
  }

  function num(s: string): number | null {
    if (!s.trim()) return null;
    const n = parseFloat(s.replace(",", "."));
    return isNaN(n) ? null : n;
  }

  function salvarLinhaNova() {
    if (!linhaNova.nome.trim()) return;
    setErro(null);
    const input: ClienteInput = {
      nome: linhaNova.nome,
      documento: linhaNova.documento || null,
      razaoSocial: linhaNova.razaoSocial || null,
      inscricaoEstadual: linhaNova.inscricaoEstadual || null,
      telefone: linhaNova.telefone || null,
      email: linhaNova.email || null,
      endereco: linhaNova.endereco || null,
      cidade: linhaNova.cidade || null,
      uf: linhaNova.uf || null,
      cep: linhaNova.cep || null,
      ctv: linhaNova.ctv || null,
      areaPlantio: num(linhaNova.areaPlantio),
      areaTotal: num(linhaNova.areaTotal),
      pctIrrigada: num(linhaNova.pctIrrigada),
      pctArroz: num(linhaNova.pctArroz),
      pctSoja: num(linhaNova.pctSoja),
      pctMilho: num(linhaNova.pctMilho),
      pctAlgodao: num(linhaNova.pctAlgodao),
      pctFeijao: num(linhaNova.pctFeijao),
      pctTrigo: num(linhaNova.pctTrigo),
      pctMilho2: num(linhaNova.pctMilho2),
      pctSorgo2: num(linhaNova.pctSorgo2),
      consultorId: linhaNova.consultorId || null,
    };
    startTransition(async () => {
      const resultado = await criarCliente(input);
      if (!resultado.ok) setErro(resultado.erro);
      else {
        setLinhaNova(LINHA_NOVA_VAZIA);
        setCriandoLinha(false);
      }
    });
  }

  function exportar() {
    baixarCSV(
      "clientes-rede-agro.csv",
      [
        "Código",
        "Nome",
        "CTV",
        "Área plantio (ha)",
        "Área total (ha)",
        "% Irrigada",
        "% Arroz",
        "% Soja",
        "% Milho",
        "% Algodão",
        "% Feijão",
        "% Trigo",
        "% Milho 2ª",
        "% Sorgo 2ª",
        "Vendas",
      ],
      filtrados.map((c) => [
        formatarNumeroCadastro(c.numero),
        c.nome,
        c.ctv ?? "",
        c.areaPlantio ?? "",
        c.areaTotal ?? "",
        c.pctIrrigada ?? "",
        c.pctArroz ?? "",
        c.pctSoja ?? "",
        c.pctMilho ?? "",
        c.pctAlgodao ?? "",
        c.pctFeijao ?? "",
        c.pctTrigo ?? "",
        c.pctMilho2 ?? "",
        c.pctSorgo2 ?? "",
        c.qtdVendas,
      ])
    );
  }

  const totalColunas =
    1 + // código
    CAMPOS_TEXTO_PRINCIPAIS.length +
    1 + // consultor
    1 + // área plantio
    (colunasExtras ? CAMPOS_NUMERO_EXTRAS.length : 0) +
    1 + // vendas
    1 + // fazendas
    1 + // localização
    1; // ações

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">
          {fmtNum(filtrados.length)} clientes cadastrados
        </p>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={exportar}>
            <Download size={14} /> Exportar CSV
          </Button>
          <Button variant="primary" onClick={() => setCriandoLinha(true)}>
            <Plus size={14} /> Novo cliente
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          type="text"
          placeholder="Buscar por nome ou código..."
          aria-label="Buscar cliente por nome ou código"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="w-72"
        />
      </div>

      {erro && (
        <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-red-400">
          {erro}
        </p>
      )}

      <div className="tabela-fixa overflow-x-auto rounded-xl border border-surface-border">
        <table className={`w-full text-sm ${colunasExtras ? "min-w-[1900px]" : "min-w-[1100px]"}`}>
          <thead>
            <tr className="border-b border-surface-border bg-zinc-900 text-left text-xs font-medium text-muted">
              <th scope="col" className="w-24 whitespace-nowrap px-3 py-2.5">Código</th>
              {CAMPOS_TEXTO_PRINCIPAIS.map(({ campo, rotulo }) => (
                <th key={campo} className="px-3 py-2.5">
                  {rotulo}
                  {campo === "nome" && (
                    <FiltroTextoColuna valor={busca} onMudar={setBusca} rotulo="nome" />
                  )}
                  {campo === "uf" && (
                    <FiltroColunaExcel
                      rotulo="UF"
                      opcoes={opcoesFiltroUf}
                      selecionados={filtroUf}
                      onMudar={setFiltroUf}
                    />
                  )}
                </th>
              ))}
              <th className="px-3 py-2.5">
                Consultor
                <FiltroColunaExcel
                  rotulo="consultor"
                  opcoes={opcoesFiltroConsultor}
                  selecionados={filtroConsultorIds}
                  onMudar={setFiltroConsultorIds}
                />
              </th>
              <th className="px-3 py-2.5 text-right">Área plantio (ha)</th>
              {colunasExtras &&
                CAMPOS_NUMERO_EXTRAS.map(({ campo, rotulo }) => (
                  <th key={campo} className="px-3 py-2.5 text-right">
                    {rotulo}
                  </th>
                ))}
              <th className="px-3 py-2.5 text-right">Vendas</th>
              <th className="px-3 py-2.5">
                Fazendas
                <FiltroTextoColuna rotulo="fazenda" valor={filtroFazenda} onMudar={setFiltroFazenda} />
              </th>
              <th className="px-3 py-2.5">Localização</th>
              <th className="px-2 py-2 text-center">
                <BotaoColunasExtras
                  ativo={colunasExtras}
                  aoAlternar={() => setColunasExtras((v) => !v)}
                  rotulos={CAMPOS_NUMERO_EXTRAS.map((c) => c.rotulo)}
                />
              </th>
            </tr>
          </thead>
          <tbody>
            {criandoLinha && (
              <tr id="linha-novo-cliente" className="border-b border-surface-border bg-zinc-900/40">
                <td className="px-3 py-2 text-xs text-muted">Automático</td>
                {CAMPOS_TEXTO_PRINCIPAIS.map(({ campo }, i) => (
                  <td key={campo} className="px-3 py-2">
                    <input
                      id={i === 0 ? "novo-cliente-nome" : undefined}
                      type="text"
                      className={cellInputCls}
                      value={linhaNova[campo]}
                      onChange={(e) =>
                        atualizarLinhaNova({ [campo]: e.target.value } as Partial<LinhaNova>)
                      }
                    />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <ComboBox
                    opcoes={opcoesConsultores}
                    valor={linhaNova.consultorId}
                    placeholder="Sem consultor"
                    onSelecionar={(id) => atualizarLinhaNova({ consultorId: id })}
                  />
                </td>
                <td className="px-3 py-2">
                  <input
                    type="text"
                    inputMode="decimal"
                    className={`${cellInputCls} text-right`}
                    value={linhaNova.areaPlantio}
                    onChange={(e) =>
                      atualizarLinhaNova({ areaPlantio: e.target.value })
                    }
                  />
                </td>
                {colunasExtras &&
                  CAMPOS_NUMERO_EXTRAS.map(({ campo }) => (
                    <td key={campo} className="px-3 py-2">
                      <input
                        type="text"
                        inputMode="decimal"
                        className={`${cellInputCls} text-right`}
                        value={linhaNova[campo]}
                        onChange={(e) =>
                          atualizarLinhaNova({ [campo]: e.target.value } as Partial<LinhaNova>)
                        }
                      />
                    </td>
                  ))}
                <td className="px-3 py-2 text-subtle">—</td>
                <td className="px-3 py-2 text-subtle">—</td>
                <td className="px-3 py-2 text-subtle">
                  Salve pra marcar no mapa
                </td>
                <td className="px-3 py-2">
                  <div className="flex gap-1">
                    <button
                      onClick={salvarLinhaNova}
                      disabled={pendente || !linhaNova.nome.trim()}
                      title="Salvar"
                      className="rounded p-1 text-accent hover:bg-zinc-800 disabled:opacity-40"
                    >
                      <Check size={16} />
                    </button>
                    <button
                      onClick={() => {
                        setCriandoLinha(false);
                        setLinhaNova(LINHA_NOVA_VAZIA);
                      }}
                      title="Cancelar"
                      className="rounded p-1 text-secondary hover:bg-zinc-800 hover:text-red-400"
                    >
                      <X size={16} />
                    </button>
                  </div>
                </td>
              </tr>
            )}
            {paginacao.itens.map((c) => {
              const celulaEm = (campo: CampoEditavel) =>
                celulaAtiva?.clienteId === c.id && celulaAtiva.campo === campo;

              return (
                <tr
                  key={c.id}
                  className="border-b border-surface-border/50 transition hover:bg-zinc-900/60"
                >
                  <td className="whitespace-nowrap px-3 py-2 font-mono text-xs tabular-nums text-secondary">{formatarNumeroCadastro(c.numero)}</td>
                  {CAMPOS_TEXTO_PRINCIPAIS.map(({ campo, largura }) => (
                    <td
                      key={campo}
                      className={`px-3 py-2 ${largura ? `${largura} truncate` : ""} ${
                        campo === "nome" ? "font-medium text-white" : "text-zinc-300"
                      }`}
                    >
                      {celulaEm(campo) ? (
                        <input
                          autoFocus
                          type="text"
                          className={cellInputCls}
                          defaultValue={valorCampo(c, campo) ?? ""}
                          onBlur={(e) =>
                            salvarCampo(c, { [campo]: e.target.value || null })
                          }
                        />
                      ) : (
                        <button
                          className="w-full text-left"
                          onClick={() =>
                            setCelulaAtiva({ clienteId: c.id, campo })
                          }
                        >
                          {valorCampo(c, campo) || "—"}
                        </button>
                      )}
                    </td>
                  ))}
                  <td className="px-3 py-2">
                    <select
                      className="w-full rounded border border-transparent bg-transparent px-1 py-1 text-sm text-zinc-300 hover:border-surface-border focus:border-accent focus:bg-zinc-800"
                      value={valorCampo(c, "consultorId") ?? ""}
                      onChange={(e) =>
                        salvarCampo(c, { consultorId: e.target.value || null })
                      }
                    >
                      <option value="">Sem consultor</option>
                      {consultores.map((cons) => (
                        <option key={cons.id} value={cons.id}>
                          {cons.nome}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2 text-right text-zinc-300">
                    {celulaEm("areaPlantio") ? (
                      <input
                        autoFocus
                        type="text"
                        inputMode="decimal"
                        className={`${cellInputCls} text-right`}
                        defaultValue={valorCampo(c, "areaPlantio") ?? ""}
                        onBlur={(e) =>
                          salvarCampo(c, { areaPlantio: num(e.target.value) })
                        }
                      />
                    ) : (
                      <button
                        className="w-full text-right"
                        onClick={() =>
                          setCelulaAtiva({ clienteId: c.id, campo: "areaPlantio" })
                        }
                      >
                        {valorCampo(c, "areaPlantio") != null ? fmtNum(valorCampo(c, "areaPlantio")!) : "—"}
                      </button>
                    )}
                  </td>
                  {colunasExtras &&
                    CAMPOS_NUMERO_EXTRAS.map(({ campo }) => (
                      <td key={campo} className="px-3 py-2 text-right text-zinc-300">
                        {celulaEm(campo) ? (
                          <input
                            autoFocus
                            type="text"
                            inputMode="decimal"
                            className={`${cellInputCls} text-right`}
                            defaultValue={valorCampo(c, campo) ?? ""}
                            onBlur={(e) =>
                              salvarCampo(c, { [campo]: num(e.target.value) })
                            }
                          />
                        ) : (
                          <button
                            className="w-full text-right"
                            onClick={() =>
                              setCelulaAtiva({ clienteId: c.id, campo })
                            }
                          >
                            {c[campo] != null ? fmtNum(c[campo]!) : "—"}
                          </button>
                        )}
                      </td>
                    ))}
                  <td className="px-3 py-2 text-right text-zinc-300">
                    {fmtNum(c.qtdVendas)}
                  </td>
                  <td className="px-3 py-2">
                    <button
                      onClick={() => setFazendasAbertas(c)}
                      title="Fazendas do cliente"
                      className="flex items-center gap-1 rounded px-2 py-1 text-xs hover:bg-zinc-800"
                    >
                      <Wheat size={15} className={c.qtdFazendas > 0 ? "text-accent" : "text-muted"} />
                      <span className="text-secondary">
                        {c.qtdFazendas > 0 ? c.qtdFazendas : "Cadastrar"}
                      </span>
                    </button>
                  </td>
                  <td className="px-3 py-2">
                    <button
                      onClick={() => setLocalizacaoAberta(c)}
                      title={
                        c.latitude != null
                          ? "Localização marcada — clique para editar"
                          : "Marcar localização no mapa"
                      }
                      className="flex items-center gap-1 rounded px-2 py-1 text-xs hover:bg-zinc-800"
                    >
                      <MapPin
                        size={15}
                        style={c.latitude != null ? { color: corDoConsultor(c.consultorId, cores) } : undefined}
                        className={c.latitude == null ? "text-muted" : ""}
                      />
                      <span className="text-secondary">
                        {c.latitude != null ? "Marcada" : "Marcar"}
                      </span>
                    </button>
                  </td>
                  <td className="px-3 py-2">
                    {ehAdmin && (
                      <button
                        onClick={() => excluir(c)}
                        disabled={pendente}
                        title="Excluir"
                        className="rounded p-1 text-secondary hover:bg-zinc-800 hover:text-red-400"
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
            {filtrados.length === 0 && !criandoLinha && (
              <tr>
                <td
                  colSpan={totalColunas}
                  className="px-3 py-8 text-center text-muted"
                ><p className="sticky left-3 max-w-[calc(100vw-4rem)] whitespace-normal md:max-w-[calc(100vw-20rem)]">{clientes.length === 0 ? 'Nenhum cliente cadastrado. Use "Novo cliente" para começar.' : "Nenhum cliente corresponde à busca e aos filtros. Altere os critérios para ver outros resultados."}</p></td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Paginacao {...paginacao} />

      {fazendasAbertas && (
        <FazendasModal
          clienteId={fazendasAbertas.id}
          clienteNome={fazendasAbertas.nome}
          ehAdmin={ehAdmin}
          onFechar={() => setFazendasAbertas(null)}
        />
      )}

      {localizacaoAberta && (
        <LocalizacaoModal
          latInicial={localizacaoAberta.latitude}
          lonInicial={localizacaoAberta.longitude}
          onFechar={() => setLocalizacaoAberta(null)}
          onSalvar={(lat, lon) => {
            const cliente = localizacaoAberta;
            setLocalizacaoAberta(null);
            salvarCampo(cliente, { latitude: lat, longitude: lon });
          }}
        />
      )}
    </div>
  );
}
