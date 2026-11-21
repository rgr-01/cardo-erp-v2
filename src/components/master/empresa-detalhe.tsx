"use client";

import { InterruptorAtivo } from "@/components/ui/interruptor-ativo";
import { CampoSenha } from "@/components/ui/campo-senha";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, KeyRound, Plus, ShieldCheck, ShieldOff } from "lucide-react";
import {
  alternarAtivaEmpresa,
  alternarAtivoUsuarioEmpresa,
  atualizarDadosEmpresa,
  criarAdminEmpresa,
  definirModulosEmpresa,
  definirPlanoEmpresa,
  redefinirSenhaUsuarioEmpresa,
} from "@/app/actions/empresas";
import { MODULOS_EMPRESA, NOMES_MODULO, DESCRICAO_MODULO, normalizarModulos, type Modulo } from "@/lib/modulos";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useConfirm } from "@/components/ui/confirm-dialog";

type Dados = { nomeFantasia: string; razaoSocial: string; cnpj: string; endereco: string; cidadeUfCep: string };
type Plano = { plano: string; limiteUsuarios: number | null; limiteRelatoriosMes: number | null; limiteArmazenamentoGb: number | null; observacoesPlano: string };
type Usuario = { id: string; nome: string; email: string; role: string; ativo: boolean };

const ABAS = [
  { id: "dados", rotulo: "Dados" },
  { id: "modulos", rotulo: "Módulos" },
  { id: "plano", rotulo: "Plano e limites" },
  { id: "usuarios", rotulo: "Usuários" },
  { id: "situacao", rotulo: "Situação" },
] as const;
type Aba = (typeof ABAS)[number]["id"];

const inputCls = "w-full rounded-lg border border-surface-border bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus:border-accent";
const labelCls = "mb-1 block text-xs font-medium text-secondary";

function Mensagem({ msg }: { msg: { ok: boolean; texto: string } | null }) {
  if (!msg) return null;
  return <p className={`rounded-lg px-3 py-2 text-sm ${msg.ok ? "bg-accent/10 text-accent" : "bg-danger/10 text-red-400"}`}>{msg.texto}</p>;
}

export function EmpresaDetalhe({
  empresa,
  usuarios,
  uso,
}: {
  empresa: { id: string; ativo: boolean; criadaEm: string; dados: Dados; modulos: Modulo[]; plano: Plano };
  usuarios: Usuario[];
  uso: { usuariosAtivos: number; relatoriosNoMes: number };
}) {
  const router = useRouter();
  const { confirmar, perguntar } = useConfirm();
  const [aba, setAba] = useState<Aba>("dados");
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const [pendente, startTransition] = useTransition();

  const [dados, setDados] = useState(empresa.dados);
  const [modulos, setModulos] = useState<Modulo[]>(empresa.modulos);
  const [plano, setPlano] = useState(empresa.plano);
  const [novoAdmin, setNovoAdmin] = useState({ nome: "", email: "", senha: "" });

  function executar(acao: () => Promise<{ ok: true } | { ok: false; erro: string }>, sucesso: string, aoTerminar?: () => void) {
    setMsg(null);
    startTransition(async () => {
      const r = await acao();
      setMsg(r.ok ? { ok: true, texto: sucesso } : { ok: false, texto: r.erro });
      if (r.ok) { aoTerminar?.(); router.refresh(); }
    });
  }

  function alternarModulo(m: Modulo) {
    setModulos((atuais) => atuais.includes(m)
      ? atuais.filter((x) => x !== m)
      : normalizarModulos([...atuais, m]));
  }

  async function redefinirSenha(u: Usuario) {
    const senha = await perguntar({ titulo: `Nova senha para ${u.nome}`, mensagem: "Mínimo de 12 caracteres, com maiúscula, minúscula, número e símbolo.", tipoCampo: "senha", confirmarLabel: "Redefinir senha" });
    if (!senha) return;
    executar(() => redefinirSenhaUsuarioEmpresa(empresa.id, u.id, senha), `Senha de ${u.nome} redefinida. As sessões abertas dele foram encerradas.`);
  }

  async function alternarUsuario(u: Usuario) {
    const ok = await confirmar({
      mensagem: u.ativo ? `Desativar ${u.nome}? A pessoa perde o acesso na hora.` : `Ativar ${u.nome}?`,
      confirmarLabel: u.ativo ? "Desativar acesso" : "Ativar acesso",
      variante: u.ativo ? "perigo" : "padrao",
    });
    if (ok) executar(() => alternarAtivoUsuarioEmpresa(empresa.id, u.id, !u.ativo), u.ativo ? `${u.nome} desativado.` : `${u.nome} ativado.`);
  }

  async function alternarSituacao() {
    const ok = await confirmar({
      mensagem: empresa.ativo ? `Desativar ${dados.nomeFantasia}? Toda a equipe perde o acesso.` : `Reativar ${dados.nomeFantasia}?`,
      confirmarLabel: empresa.ativo ? "Desativar empresa" : "Reativar empresa",
      variante: empresa.ativo ? "perigo" : "padrao",
    });
    if (ok) executar(() => alternarAtivaEmpresa(empresa.id), empresa.ativo ? "Empresa desativada." : "Empresa reativada.");
  }

  const campo = (nome: keyof Dados, rotulo: string) => (
    <div>
      <label htmlFor={`emp-${nome}`} className={labelCls}>{rotulo}</label>
      <input id={`emp-${nome}`} value={dados[nome]} onChange={(e) => setDados({ ...dados, [nome]: e.target.value })} className={inputCls} />
    </div>
  );
  const limite = (nome: "limiteUsuarios" | "limiteRelatoriosMes" | "limiteArmazenamentoGb", rotulo: string, usoAtual?: string) => (
    <div>
      <label htmlFor={`plano-${nome}`} className={labelCls}>{rotulo}</label>
      <input id={`plano-${nome}`} type="number" min={0} step={nome === "limiteArmazenamentoGb" ? 0.5 : 1} placeholder="Sem limite" value={plano[nome] ?? ""} onChange={(e) => setPlano({ ...plano, [nome]: e.target.value === "" ? null : Number(e.target.value) })} className={inputCls} />
      {usoAtual && <p className="mt-1 text-xs text-muted">Uso atual: {usoAtual}</p>}
    </div>
  );

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div>
        <Link href="/master/empresas" className="inline-flex items-center gap-1 text-xs text-secondary hover:text-white"><ArrowLeft size={13} /> Empresas</Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold text-white">{empresa.dados.nomeFantasia}</h1>
          <Badge variant={empresa.ativo ? "success" : "danger"}>{empresa.ativo ? "Ativa" : "Desativada"}</Badge>
          {empresa.plano.plano && <Badge>{empresa.plano.plano}</Badge>}
        </div>
        <p className="text-sm text-muted">Cliente desde {empresa.criadaEm} · {uso.usuariosAtivos} usuários ativos · {uso.relatoriosNoMes} relatórios neste mês</p>
      </div>

      <div className="flex gap-1 overflow-x-auto border-b border-surface-border">
        {ABAS.map((a) => (
          <button key={a.id} type="button" onClick={() => { setAba(a.id); setMsg(null); }} className={`shrink-0 border-b-2 px-4 py-2.5 text-sm font-medium transition ${aba === a.id ? "border-accent text-accent" : "border-transparent text-secondary hover:text-white"}`}>{a.rotulo}</button>
        ))}
      </div>

      <Mensagem msg={msg} />

      {aba === "dados" && (
        <form onSubmit={(e) => { e.preventDefault(); executar(() => atualizarDadosEmpresa(empresa.id, dados), "Dados salvos."); }} className="space-y-4 rounded-xl border border-surface-border bg-zinc-900 p-5">
          <div className="grid gap-4 md:grid-cols-2">
            {campo("nomeFantasia", "Nome fantasia *")}
            {campo("razaoSocial", "Razão social")}
            {campo("cnpj", "CNPJ")}
            {campo("endereco", "Endereço")}
            {campo("cidadeUfCep", "Cidade / UF / CEP")}
          </div>
          <p className="text-xs text-muted">Logo, cor e ícone a própria empresa troca em Configurações.</p>
          <div className="flex justify-end"><Button type="submit" variant="primary" disabled={pendente}>{pendente ? "Salvando..." : "Salvar dados"}</Button></div>
        </form>
      )}

      {aba === "modulos" && (
        <div className="space-y-3">
          {MODULOS_EMPRESA.map((m) => {
            const ligado = modulos.includes(m);
            return (
              <button key={m} type="button" role="switch" aria-checked={ligado} onClick={() => alternarModulo(m)} className={`flex w-full items-center gap-4 rounded-xl border p-4 text-left transition ${ligado ? "border-accent/50 bg-accent/5" : "border-surface-border bg-zinc-900 hover:border-zinc-600"}`}>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-white">{NOMES_MODULO[m]}</p>
                  <p className="mt-0.5 text-xs text-muted">{DESCRICAO_MODULO[m]}</p>
                </div>
                <span className={`relative h-6 w-11 shrink-0 rounded-full transition ${ligado ? "bg-accent" : "bg-zinc-700"}`}><span className={`absolute top-0.5 h-5 w-5 rounded-full bg-[#fff] shadow transition-colors ${ligado ? "left-[22px]" : "left-0.5"}`} /></span>
              </button>
            );
          })}
          <p className="text-xs text-muted">Clientes e Localização, Dashboard e WhatsApp valem para todos os planos.</p>
          <div className="flex justify-end"><Button variant="primary" disabled={pendente || modulos.length === 0} onClick={() => executar(() => definirModulosEmpresa(empresa.id, modulos), "Módulos atualizados.")}>{pendente ? "Salvando..." : "Salvar módulos"}</Button></div>
        </div>
      )}

      {aba === "plano" && (
        <form onSubmit={(e) => { e.preventDefault(); executar(() => definirPlanoEmpresa(empresa.id, plano), "Plano salvo."); }} className="space-y-4 rounded-xl border border-surface-border bg-zinc-900 p-5">
          <div>
            <label htmlFor="plano-nome" className={labelCls}>Plano contratado</label>
            <input id="plano-nome" list="planos-sugeridos" value={plano.plano} onChange={(e) => setPlano({ ...plano, plano: e.target.value })} placeholder="Ex.: Relatórios, Completo" className={inputCls} />
            <datalist id="planos-sugeridos"><option value="Relatórios" /><option value="Vendas" /><option value="Completo" /><option value="Teste grátis" /></datalist>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {limite("limiteUsuarios", "Usuários ativos (máx.)", `${uso.usuariosAtivos}`)}
            {limite("limiteRelatoriosMes", "Relatórios por mês (máx.)", `${uso.relatoriosNoMes} neste mês`)}
            {limite("limiteArmazenamentoGb", "Armazenamento (GB)")}
          </div>
          <div>
            <label htmlFor="plano-obs" className={labelCls}>Observações (valor, vencimento, combinados)</label>
            <textarea id="plano-obs" rows={3} value={plano.observacoesPlano} onChange={(e) => setPlano({ ...plano, observacoesPlano: e.target.value })} className={inputCls} />
          </div>
          <p className="text-xs text-muted">Campo vazio = sem limite. Usuários e relatórios são bloqueados ao passar do limite, com aviso para falar com a Cardo AI. Armazenamento é só informativo por enquanto.</p>
          <div className="flex justify-end"><Button type="submit" variant="primary" disabled={pendente}>{pendente ? "Salvando..." : "Salvar plano"}</Button></div>
        </form>
      )}

      {aba === "usuarios" && (
        <div className="space-y-4">
          <div className="overflow-x-auto rounded-xl border border-surface-border">
            <table className="w-full min-w-[560px] text-sm">
              <thead><tr className="border-b border-surface-border bg-zinc-900 text-left text-xs font-medium text-muted"><th className="px-3 py-2.5">Nome</th><th className="px-3 py-2.5">E-mail</th><th className="px-3 py-2.5">Perfil</th><th className="px-3 py-2.5">Situação</th><th className="px-3 py-2.5" /></tr></thead>
              <tbody>
                {usuarios.map((u) => (
                  <tr key={u.id} className="border-b border-surface-border last:border-0">
                    <td className="px-3 py-2.5 font-medium text-white">{u.nome}</td>
                    <td className="px-3 py-2.5 text-secondary">{u.email}</td>
                    <td className="px-3 py-2.5 text-secondary">{u.role === "ADMIN" ? "Administrador" : "Consultor"}</td>
                    <td className="px-3 py-2.5"><InterruptorAtivo ativo={u.ativo} desabilitado={pendente} aoMudar={() => alternarUsuario(u)} /></td>
                    <td className="px-3 py-2.5 text-right"><button type="button" onClick={() => redefinirSenha(u)} className="inline-flex items-center gap-1 text-xs text-secondary hover:text-white"><KeyRound size={13} /> Redefinir senha</button></td>
                  </tr>
                ))}
                {usuarios.length === 0 && <tr><td colSpan={5} className="px-3 py-6 text-center text-sm text-muted"><p className="sticky left-3 max-w-[calc(100vw-4rem)] whitespace-normal md:max-w-[calc(100vw-20rem)]">Nenhum usuário. Cadastre o administrador abaixo.</p></td></tr>}
              </tbody>
            </table>
          </div>
          <form onSubmit={(e) => { e.preventDefault(); executar(() => criarAdminEmpresa(empresa.id, novoAdmin), "Administrador criado.", () => setNovoAdmin({ nome: "", email: "", senha: "" })); }} className="space-y-3 rounded-xl border border-surface-border bg-zinc-900 p-5">
            <p className="text-sm font-semibold text-white">Novo administrador</p>
            <div className="grid gap-3 md:grid-cols-3">
              <input required placeholder="Nome" value={novoAdmin.nome} onChange={(e) => setNovoAdmin({ ...novoAdmin, nome: e.target.value })} className={inputCls} />
              <input required type="email" placeholder="E-mail" value={novoAdmin.email} onChange={(e) => setNovoAdmin({ ...novoAdmin, email: e.target.value })} className={inputCls} />
              <CampoSenha required autoComplete="new-password" minLength={12} placeholder="Senha (12+ caracteres)" value={novoAdmin.senha} onChange={(e) => setNovoAdmin({ ...novoAdmin, senha: e.target.value })} className={inputCls} />
            </div>
            <p className="text-xs text-muted">O administrador cadastra o resto da equipe em Usuários, dentro do sistema.</p>
            <div className="flex justify-end"><Button type="submit" variant="primary" disabled={pendente}><Plus size={14} /> Criar administrador</Button></div>
          </form>
        </div>
      )}

      {aba === "situacao" && (
        <div className="space-y-3 rounded-xl border border-surface-border bg-zinc-900 p-5">
          <p className="text-sm text-zinc-300">{empresa.ativo ? "A empresa está ativa: a equipe entra normalmente." : "A empresa está desativada: ninguém da equipe consegue entrar. Os dados continuam guardados."}</p>
          <Button variant={empresa.ativo ? "danger" : "primary"} disabled={pendente} onClick={alternarSituacao}>
            {empresa.ativo ? <><ShieldOff size={14} /> Desativar empresa</> : <><ShieldCheck size={14} /> Reativar empresa</>}
          </Button>
        </div>
      )}
    </div>
  );
}
