"use client";
import { DialogFrame } from "@/components/ui/dialog-frame";

import { useMarcaEmpresa } from "@/components/marca-empresa";
import { useEffect, useState } from "react";
import { Info, Plus, X } from "lucide-react";
import { carregarDadosAssinatura } from "@/app/actions/propostas";
import type { AssinanteDoc } from "@/lib/propostas";
import { camposFaltantes } from "@/lib/clientes";
import type { ClienteOpcaoProposta } from "@/components/propostas/tipos";
import { EditarCadastroClienteModal } from "@/components/propostas/editar-cadastro-cliente-modal";

const inputCls =
  "w-full rounded-lg border border-surface-border bg-zinc-800 px-3 py-2 text-sm text-white outline-none focus:border-accent";
const labelCls = "mb-1 block text-[11px] font-medium text-secondary";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Pessoa = { nome: string; email: string };
type Outro = Pessoa & { id: number; rotulo: string };

function PessoaCampos({
  titulo,
  valor,
  aoMudar,
  emailObrigatorio = false,
  fixo = false,
}: {
  titulo: string;
  valor: Pessoa;
  aoMudar: (p: Pessoa) => void;
  emailObrigatorio?: boolean;
  fixo?: boolean;
}) {
  const emailFaltando = emailObrigatorio && !EMAIL_RE.test(valor.email.trim());
  return (
    <div>
      <p className="mb-1.5 text-xs font-semibold text-zinc-300">
        {titulo}
        {fixo && <span className="ml-1.5 font-normal text-muted">· sempre assina</span>}
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        <div>
          <label className={labelCls}>Nome (sai no campo de assinatura)</label>
          <input value={valor.nome} onChange={(e) => aoMudar({ ...valor, nome: e.target.value })} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>E-mail{emailObrigatorio ? " *" : " (opcional)"}</label>
          <input
            type="email"
            value={valor.email}
            onChange={(e) => aoMudar({ ...valor, email: e.target.value })}
            className={`${inputCls} ${emailFaltando ? "!border-amber-500/70" : ""}`}
          />
          {emailFaltando && (
            <p className="mt-1 text-[11px] text-amber-400">
              {valor.email.trim() ? "E-mail inválido." : "O cliente não tem e-mail cadastrado: informe um para liberar o envio."}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export function EnviarAssinaturaModal({
  propostaId,
  pendente,
  erro,
  aoConfirmar,
  aoFechar,
}: {
  propostaId: string;
  pendente: boolean;
  erro: string | null;
  aoConfirmar: (assinantes: AssinanteDoc[]) => void;
  aoFechar: () => void;
}) {
  const [carregando, setCarregando] = useState(true);
  const [erroCarga, setErroCarga] = useState<string | null>(null);
  const [admins, setAdmins] = useState<Pessoa[]>([]);

  // Cadastro do cliente: o e-mail de assinatura é sempre o do cadastro (só se muda editando o cadastro).
  const [cadastro, setCadastro] = useState<ClienteOpcaoProposta | null>(null);
  const [editandoCadastro, setEditandoCadastro] = useState(false);
  const [nomeCliente, setNomeCliente] = useState("");
  const [vendedor, setVendedor] = useState<Pessoa>({ nome: "", email: "" });
  const [usaAdministrativo, setUsaAdministrativo] = useState(false);
  const [administrativo, setAdministrativo] = useState<Pessoa>({ nome: "", email: "" });
  const [usaOutros, setUsaOutros] = useState(false);
  const [outros, setOutros] = useState<Outro[]>([]);
  const [erroForm, setErroForm] = useState<string | null>(null);

  // Já vem preenchido: e-mail do cliente (editável), vendedor = usuário logado e,
  // se for reenvio, o que foi escolhido da última vez.
  useEffect(() => {
    let ativo = true;
    carregarDadosAssinatura(propostaId).then((r) => {
      if (!ativo) return;
      if (!r.ok) {
        setErroCarga(r.erro);
        setCarregando(false);
        return;
      }
      const { dados } = r;
      const ant = (papel: AssinanteDoc["papel"]) => dados.anteriores.find((a) => a.papel === papel);
      setAdmins(dados.administrativos);
      setCadastro(dados.cliente);
      setNomeCliente(ant("CLIENTE")?.nome || dados.cliente.razaoSocial || dados.cliente.nome);
      setVendedor({
        nome: ant("VENDEDOR")?.nome || dados.vendedor.nome,
        email: ant("VENDEDOR")?.email || dados.vendedor.email,
      });
      const empresa = ant("EMPRESA");
      const primeiroAdmin = dados.administrativos[0];
      setAdministrativo({
        nome: empresa?.nome || primeiroAdmin?.nome || "",
        email: empresa?.email || primeiroAdmin?.email || "",
      });
      setUsaAdministrativo(Boolean(empresa));
      const salvosOutros = dados.anteriores.filter((a) => a.papel === "OUTRO");
      setOutros(
        salvosOutros.map((a, i) => ({ id: i, nome: a.nome, email: a.email ?? "", rotulo: a.rotulo ?? "Testemunha" }))
      );
      setUsaOutros(salvosOutros.length > 0);
      setCarregando(false);
    });
    return () => {
      ativo = false;
    };
  }, [propostaId]);

  function adicionarOutro() {
    setOutros((atual) => [...atual, { id: Date.now(), nome: "", email: "", rotulo: "Testemunha" }]);
  }

  function confirmar() {
    setErroForm(null);
    const emailOk = (e: string) => !e.trim() || EMAIL_RE.test(e.trim());
    if (!cadastro || camposFaltantes(cadastro).length > 0) {
      setErroForm("Complete o cadastro do cliente (incluindo o e-mail) antes de enviar.");
      return;
    }
    if (!nomeCliente.trim() || !vendedor.nome.trim()) {
      setErroForm("Cliente e vendedor precisam de nome para o campo de assinatura.");
      return;
    }
    if (!emailOk(vendedor.email) || (usaAdministrativo && !emailOk(administrativo.email))) {
      setErroForm("Há um e-mail inválido na lista.");
      return;
    }
    const outrosUsados = usaOutros ? outros.filter((o) => o.nome.trim() || o.email.trim()) : [];
    if (outrosUsados.some((o) => !o.nome.trim())) {
      setErroForm("Todo assinante adicionado precisa de nome.");
      return;
    }
    if (outrosUsados.some((o) => !emailOk(o.email))) {
      setErroForm("Há um e-mail inválido na lista.");
      return;
    }
    if (usaAdministrativo && !administrativo.nome.trim()) {
      setErroForm("Informe o nome do administrativo.");
      return;
    }
    const lista: AssinanteDoc[] = [
      { papel: "CLIENTE", nome: nomeCliente.trim(), email: (cadastro.email ?? "").trim() },
      { papel: "VENDEDOR", nome: vendedor.nome.trim(), ...(vendedor.email.trim() ? { email: vendedor.email.trim() } : {}) },
      ...(usaAdministrativo
        ? [
            {
              papel: "EMPRESA" as const,
              nome: administrativo.nome.trim(),
              ...(administrativo.email.trim() ? { email: administrativo.email.trim() } : {}),
            },
          ]
        : []),
      ...outrosUsados.map((o) => ({
        papel: "OUTRO" as const,
        nome: o.nome.trim(),
        ...(o.email.trim() ? { email: o.email.trim() } : {}),
        rotulo: o.rotulo.trim() || "Testemunha",
      })),
    ];
    aoConfirmar(lista);
  }

  // Prévia de como os nomes saem no pedido (linha de cima: cliente e empresa;
  // linha de baixo: vendedor e testemunha/outros).
  const marca = useMarcaEmpresa();
  const nomesPrevia: { nome: string; papel: string }[] = [
    { nome: nomeCliente, papel: "Cliente" },
    { nome: usaAdministrativo ? administrativo.nome : (marca?.nome ?? "Empresa"), papel: "Empresa" },
    { nome: vendedor.nome, papel: "Vendedor" },
    ...(usaOutros && outros.some((o) => o.nome.trim())
      ? outros.filter((o) => o.nome.trim()).map((o) => ({ nome: o.nome, papel: o.rotulo || "Testemunha" }))
      : [{ nome: "", papel: "Testemunha / Outro" }]),
  ];

  const caixa = "rounded-lg border border-surface-border bg-zinc-950/40 p-3";
  // Sem e-mail válido do cliente o envio fica travado (D4Sign precisa dele).
  const faltando = cadastro ? camposFaltantes(cadastro) : [];
  const cadastroOk = Boolean(cadastro) && faltando.length === 0;

  return (
    <DialogFrame onClose={aoFechar} label={"Enviar para assinatura"} className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 lg:pl-64">
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-surface-border bg-zinc-900"
      >
        <div className="flex items-start justify-between gap-3 border-b border-surface-border px-5 py-4">
          <div>
            <h2 className="text-lg font-bold text-white">Enviar para assinatura</h2>
            <p className="text-xs text-muted">
              Quem tem e-mail recebe o link. Os nomes saem nos campos de assinatura do pedido.
            </p>
          </div>
          <button
            type="button"
            onClick={aoFechar}
            aria-label="Fechar"
            className="rounded p-1 text-secondary hover:bg-zinc-800 hover:text-white"
          >
            <X size={18} />
          </button>
        </div>

        <div className="space-y-3 overflow-y-auto px-5 py-4">
          {carregando ? (
            <p className="py-8 text-center text-sm text-muted">Carregando dados do pedido…</p>
          ) : erroCarga ? (
            <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-red-400">{erroCarga}</p>
          ) : (
            <>
              <div className={caixa}>
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-zinc-300">
                    Cliente<span className="ml-1.5 font-normal text-muted">· sempre assina</span>
                  </p>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setEditandoCadastro(true)}
                      className={`rounded-lg border px-3 py-1 text-xs font-semibold transition ${
                        faltando.length > 0
                          ? "border-amber-500/50 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20"
                          : "border-surface-border text-zinc-300 hover:border-accent hover:text-accent"
                      }`}
                    >
                      Editar cadastro
                    </button>
                    <span className="group relative inline-flex">
                      <button
                        type="button"
                        aria-label="Sobre o cadastro do cliente"
                        className="flex h-6 w-6 items-center justify-center rounded-full border border-surface-border text-secondary transition hover:border-accent hover:text-accent focus:outline-none focus-visible:border-accent focus-visible:text-accent"
                      >
                        <Info size={13} />
                      </button>
                      <span
                        role="tooltip"
                        className="pointer-events-none invisible absolute right-0 top-8 z-20 w-72 rounded-lg border border-surface-border bg-zinc-800 px-3 py-2 text-xs leading-relaxed text-zinc-200 opacity-0 shadow-xl transition group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100"
                      >
                        {faltando.length > 0 ? (
                          <>
                            Cadastro incompleto: faltam <b className="text-amber-300">{faltando.join(", ")}</b>. Use
                            “Editar cadastro” para preencher e liberar o envio.
                          </>
                        ) : (
                          <>O e-mail de assinatura é sempre o do cadastro do cliente. Para trocar, use “Editar cadastro”.</>
                        )}
                      </span>
                    </span>
                  </div>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <div>
                    <label className={labelCls}>Nome (sai no campo de assinatura)</label>
                    <input value={nomeCliente} onChange={(e) => setNomeCliente(e.target.value)} className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>E-mail do cadastro</label>
                    <div
                      className={`${inputCls} truncate ${cadastro?.email ? "text-zinc-300" : "text-muted"} ${
                        cadastro && !cadastro.email ? "!border-amber-500/60" : ""
                      }`}
                      title="O e-mail vem do cadastro do cliente"
                    >
                      {cadastro?.email || "Sem e-mail no cadastro"}
                    </div>
                  </div>
                </div>
              </div>
              <div className={caixa}>
                <PessoaCampos titulo="Vendedor" valor={vendedor} aoMudar={setVendedor} fixo />
              </div>

              <div className={caixa}>
                <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-zinc-200">
                  <input
                    type="checkbox"
                    checked={usaAdministrativo}
                    onChange={(e) => setUsaAdministrativo(e.target.checked)}
                    className="h-4 w-4 accent-[var(--accent)]"
                  />
                  Administrativo <span className="font-normal text-muted">· opcional, assina pela empresa</span>
                </label>
                {usaAdministrativo && (
                  <div className="mt-3 space-y-2">
                    {admins.length > 1 && (
                      <select
                        value=""
                        onChange={(e) => {
                          const escolhido = admins.find((a) => a.email === e.target.value);
                          if (escolhido) setAdministrativo(escolhido);
                        }}
                        className={inputCls}
                      >
                        <option value="">Escolher da equipe…</option>
                        {admins.map((a) => (
                          <option key={a.email} value={a.email}>
                            {a.nome}
                          </option>
                        ))}
                      </select>
                    )}
                    <PessoaCampos titulo="" valor={administrativo} aoMudar={setAdministrativo} />
                  </div>
                )}
              </div>

              <div className={caixa}>
                <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-zinc-200">
                  <input
                    type="checkbox"
                    checked={usaOutros}
                    onChange={(e) => {
                      setUsaOutros(e.target.checked);
                      if (e.target.checked && outros.length === 0) adicionarOutro();
                    }}
                    className="h-4 w-4 accent-[var(--accent)]"
                  />
                  Outros <span className="font-normal text-muted">· testemunha ou outro assinante</span>
                </label>
                {usaOutros && (
                  <div className="mt-3 space-y-3">
                    {outros.map((o) => (
                      <div key={o.id} className="rounded-lg border border-surface-border p-2.5">
                        <div className="mb-2 flex items-center gap-2">
                          <input
                            value={o.rotulo}
                            onChange={(e) =>
                              setOutros((atual) => atual.map((x) => (x.id === o.id ? { ...x, rotulo: e.target.value } : x)))
                            }
                            aria-label="Papel (ex.: Testemunha)"
                            placeholder="Papel (ex.: Testemunha)"
                            className={`${inputCls} max-w-52 py-1.5`}
                          />
                          <button
                            type="button"
                            onClick={() => setOutros((atual) => atual.filter((x) => x.id !== o.id))}
                            aria-label="Remover assinante"
                            className="ml-auto rounded p-1 text-muted hover:bg-zinc-800 hover:text-danger-ink"
                          >
                            <X size={15} />
                          </button>
                        </div>
                        <PessoaCampos
                          titulo=""
                          valor={{ nome: o.nome, email: o.email }}
                          aoMudar={(p) =>
                            setOutros((atual) => atual.map((x) => (x.id === o.id ? { ...x, ...p } : x)))
                          }
                        />
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={adicionarOutro}
                      className="flex items-center gap-1.5 rounded-lg border border-surface-border px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800"
                    >
                      <Plus size={14} /> Adicionar outro
                    </button>
                  </div>
                )}
              </div>

              <div>
                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">
                  Como sai no pedido
                </p>
                <div className="grid grid-cols-2 gap-x-6 gap-y-5 rounded-lg border border-dashed border-surface-border px-5 pb-3 pt-5">
                  {nomesPrevia.map((slot, i) => (
                    <div key={i} className="text-center">
                      <div className="border-t border-dashed border-zinc-500 pt-1 text-xs text-zinc-200">
                        {slot.nome || " "}
                      </div>
                      <div className="text-[10px] text-muted">{slot.papel}</div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
          {(erroForm || erro) && <p className="text-xs text-danger-ink">{erroForm ?? erro}</p>}
        </div>

        {editandoCadastro && cadastro && (
          <EditarCadastroClienteModal
            cliente={cadastro}
            aoSalvar={(atualizado) => setCadastro((atual) => (atual ? { ...atual, ...atualizado } : atual))}
            aoFechar={() => setEditandoCadastro(false)}
          />
        )}

        <div className="flex justify-end gap-2 border-t border-surface-border px-5 py-3.5">
          <button
            type="button"
            onClick={aoFechar}
            disabled={pendente}
            className="rounded-lg border border-surface-border px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={confirmar}
            disabled={pendente || carregando || Boolean(erroCarga) || !cadastroOk}
            title={!cadastroOk && !carregando ? "Complete o cadastro do cliente (e-mail incluso) para enviar" : undefined}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground hover:brightness-110 disabled:opacity-50"
          >
            {pendente ? "Enviando..." : "Enviar"}
          </button>
        </div>
      </div>
    </DialogFrame>
  );
}
