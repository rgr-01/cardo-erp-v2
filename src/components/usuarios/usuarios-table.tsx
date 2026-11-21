"use client";

import { InterruptorAtivo } from "@/components/ui/interruptor-ativo";
import { useState, useTransition } from "react";
import { LayoutGrid, Pencil, Plus, ShieldOff, ShieldCheck } from "lucide-react";
import {
  criarUsuario,
  atualizarUsuario,
  alternarAtivoUsuario,
  definirModulosUsuario,
  type UsuarioInput,
} from "@/app/actions/usuarios";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { MenuAcoes } from "@/components/ui/menu-acoes";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { DESCRICAO_MODULO, NOMES_MODULO, type Modulo } from "@/lib/modulos";

export type UsuarioLinha = {
  id: string;
  nome: string;
  email: string;
  role: "ADMIN" | "CONSULTOR";
  ativo: boolean;
  modulosBloqueados: string[];
  qtdVendas: number;
  qtdClientes: number;
};

const inputCls =
  "w-full rounded-lg border border-surface-border bg-zinc-800 px-3 py-2 text-sm text-white outline-none focus:border-accent";
const labelCls = "mb-1 block text-xs font-medium text-secondary";

function FormUsuario({
  usuario,
  aoFechar,
}: {
  usuario: UsuarioLinha | null;
  aoFechar: () => void;
}) {
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();

  function salvar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErro(null);
    const fd = new FormData(e.currentTarget);
    const input: UsuarioInput = {
      nome: String(fd.get("nome") ?? ""),
      email: String(fd.get("email") ?? ""),
      role: (fd.get("role") as "ADMIN" | "CONSULTOR") ?? "CONSULTOR",
      senha: String(fd.get("senha") ?? ""),
      ativo: fd.get("ativo") === "on",
    };
    startTransition(async () => {
      const resultado = usuario
        ? await atualizarUsuario(usuario.id, input)
        : await criarUsuario(input);
      if (resultado.ok) aoFechar();
      else setErro(resultado.erro);
    });
  }

  return (
    <Modal
      open
      onClose={aoFechar}
      title={usuario ? "Editar usuário" : "Novo usuário"}
      maxWidth="max-w-md"
    >
      <form onSubmit={salvar}>
        <div className="space-y-4">
          <div>
            <label htmlFor="usuario-nome" className={labelCls}>Nome *</label>
            <input
              id="usuario-nome"
              name="nome"
              required
              defaultValue={usuario?.nome ?? ""}
              className={inputCls}
            />
          </div>
          <div>
            <label htmlFor="usuario-email" className={labelCls}>E-mail *</label>
            <input
              id="usuario-email"
              name="email"
              type="email"
              required
              defaultValue={usuario?.email ?? ""}
              className={inputCls}
            />
          </div>
          <div>
            <label htmlFor="usuario-perfil" className={labelCls}>Perfil de acesso</label>
            <select
              id="usuario-perfil"
              name="role"
              defaultValue={usuario?.role ?? "CONSULTOR"}
              className={inputCls}
            >
              <option value="CONSULTOR">Consultor</option>
              <option value="ADMIN">Administrador</option>
            </select>
          </div>
          <div>
            <label htmlFor="usuario-senha" className={labelCls}>
              {usuario ? "Nova senha (deixe vazio para manter)" : "Senha *"}
            </label>
            <input
              id="usuario-senha"
              name="senha"
              type="password"
              autoComplete="new-password"
              aria-describedby="usuario-senha-ajuda"
              required={!usuario}
              minLength={12}
              className={inputCls}
            />
            <p id="usuario-senha-ajuda" className="mt-1.5 text-xs leading-relaxed text-secondary">Use ao menos 12 caracteres, com letra maiúscula, minúscula, número e símbolo.</p>
          </div>
          <label className="flex items-center gap-2 text-sm text-zinc-300">
            <input
              name="ativo"
              type="checkbox"
              defaultChecked={usuario?.ativo ?? true}
              className="h-4 w-4 accent-accent"
            />
            Usuário ativo
          </label>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="danger" onClick={aoFechar}>
            Cancelar
          </Button>
          <Button type="submit" variant="primary" disabled={pendente}>
            {pendente ? "Salvando..." : "Salvar"}
          </Button>
        </div>
        {erro && (
          <p role="alert" className="mt-3 rounded-lg bg-danger/10 px-3 py-2 text-sm text-red-400">
            {erro}
          </p>
        )}
      </form>
    </Modal>
  );
}

// Liga/desliga, para um usuário, os módulos contratados pela empresa. Dentro de
// cada módulo ele continua vendo só os próprios registros; admin vê tudo.
function FormModulos({
  usuario,
  modulosEmpresa,
  aoFechar,
}: {
  usuario: UsuarioLinha;
  modulosEmpresa: Modulo[];
  aoFechar: () => void;
}) {
  const [ligados, setLigados] = useState<Modulo[]>(
    modulosEmpresa.filter((m) => !usuario.modulosBloqueados.includes(m)),
  );
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();

  function alternar(m: Modulo) {
    setLigados((atuais) => {
      if (atuais.includes(m)) return atuais.filter((x) => x !== m);
      return modulosEmpresa.filter((x) => x === m || atuais.includes(x));
    });
  }

  function salvar() {
    setErro(null);
    startTransition(async () => {
      const resultado = await definirModulosUsuario(usuario.id, ligados);
      if (resultado.ok) aoFechar();
      else setErro(resultado.erro);
    });
  }

  return (
    <Modal open onClose={aoFechar} title={`Módulos de ${usuario.nome}`}>
      <div className="space-y-3">
        {usuario.role === "ADMIN" ? (
          <p className="text-sm text-secondary">Administrador enxerga todos os módulos da empresa.</p>
        ) : (
          modulosEmpresa.map((m) => {
            const ligado = ligados.includes(m);
            return (
              <button key={m} type="button" role="switch" aria-checked={ligado} onClick={() => alternar(m)} className={`flex w-full items-center gap-4 rounded-xl border p-4 text-left transition ${ligado ? "border-accent/50 bg-accent/5" : "border-surface-border bg-zinc-900 hover:border-zinc-600"}`}>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-white">{NOMES_MODULO[m]}</p>
                  <p className="mt-0.5 text-xs text-muted">{DESCRICAO_MODULO[m]}</p>
                </div>
                <span className={`relative h-6 w-11 shrink-0 rounded-full transition ${ligado ? "bg-accent" : "bg-zinc-700"}`}><span className={`absolute top-0.5 h-5 w-5 rounded-full bg-[#fff] shadow transition-colors ${ligado ? "left-[22px]" : "left-0.5"}`} /></span>
              </button>
            );
          })
        )}
        <p className="text-xs text-muted">Os módulos disponíveis seguem o contrato da empresa e as permissões do usuário. Despesas pertence ao Financeiro e pode ser desligado separadamente. Cada consultor vê só os próprios registros.</p>
        {erro && <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-red-400">{erro}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="danger" onClick={aoFechar}>Cancelar</Button>
          {usuario.role !== "ADMIN" && (
            <Button type="button" variant="primary" disabled={pendente} onClick={salvar}>{pendente ? "Salvando..." : "Salvar módulos"}</Button>
          )}
        </div>
      </div>
    </Modal>
  );
}

export function UsuariosTable({
  usuarios,
  meuId,
  modulosEmpresa,
}: {
  usuarios: UsuarioLinha[];
  meuId: string;
  modulosEmpresa: Modulo[];
}) {
  const [editando, setEditando] = useState<UsuarioLinha | null>(null);
  const [modulosDe, setModulosDe] = useState<UsuarioLinha | null>(null);
  const [criando, setCriando] = useState(false);
  const [erroAcao, setErroAcao] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const { confirmar } = useConfirm();

  async function aoAlternarAtivo(u: UsuarioLinha) {
    setErroAcao(null);
    const acaoNome = u.ativo ? "Desativar" : "Ativar";
    const ok = await confirmar({
      mensagem: u.ativo ? `Desativar o acesso de ${u.nome}? Essa pessoa não poderá entrar no sistema enquanto estiver desativada.` : `Ativar o acesso de ${u.nome}? Essa pessoa poderá entrar com o e-mail e a senha cadastrados.`,
      confirmarLabel: `${acaoNome} acesso`,
      variante: u.ativo ? "perigo" : "padrao",
    });
    if (!ok) return;
    startTransition(async () => {
      const resultado = await alternarAtivoUsuario(u.id, !u.ativo);
      if (!resultado.ok) setErroAcao(resultado.erro);
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Usuários</h1>
          <p className="text-sm text-muted">
            Cadastre a equipe, defina permissões e controle quem pode acessar o sistema.
          </p>
        </div>
        <Button variant="primary" onClick={() => setCriando(true)}>
          <Plus size={14} /> Novo usuário
        </Button>
      </div>

      {erroAcao && (
        <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-red-400">
          {erroAcao}
        </p>
      )}

      <div className="tabela-fixa overflow-x-auto rounded-xl border border-surface-border">
        <table className="w-full min-w-[600px] text-sm">
          <thead>
            <tr className="border-b border-surface-border bg-zinc-900 text-left text-xs font-medium text-muted">
              <th className="px-3 py-2.5">Nome</th>
              <th className="px-3 py-2.5">E-mail</th>
              <th className="px-3 py-2.5">Perfil de acesso</th>
              <th className="px-3 py-2.5">Situação</th>
              <th className="px-3 py-2.5 text-right">Clientes</th>
              <th className="px-3 py-2.5 text-right">Vendas</th>
              <th className="px-3 py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {usuarios.map((u) => (
              <tr
                key={u.id}
                className="border-b border-surface-border/50 transition hover:bg-zinc-900/60"
              >
                <td className="px-3 py-2 font-medium text-white">
                  {u.nome}
                  {u.id === meuId && (
                    <span className="ml-2 text-xs text-muted">(você)</span>
                  )}
                </td>
                <td className="px-3 py-2 text-secondary">{u.email}</td>
                <td className="px-3 py-2 text-zinc-300">
                  {u.role === "ADMIN" ? "Administrador" : "Consultor"}
                </td>
                <td className="px-3 py-2">
                  <InterruptorAtivo ativo={u.ativo} aoMudar={() => aoAlternarAtivo(u)} />
                </td>
                <td className="px-3 py-2 text-right text-zinc-300">
                  {u.qtdClientes}
                </td>
                <td className="px-3 py-2 text-right text-zinc-300">
                  {u.qtdVendas}
                </td>
                <td className="px-3 py-2 text-right">
                  <MenuAcoes
                    acoes={[
                      {
                        rotulo: "Editar",
                        icone: <Pencil size={14} />,
                        aoClicar: () => setEditando(u),
                      },
                      {
                        rotulo: "Módulos",
                        icone: <LayoutGrid size={14} />,
                        aoClicar: () => setModulosDe(u),
                      },
                      {
                        rotulo: u.ativo ? "Desativar acesso" : "Ativar acesso",
                        icone: u.ativo ? (
                          <ShieldOff size={14} />
                        ) : (
                          <ShieldCheck size={14} />
                        ),
                        perigosa: u.ativo,
                        desabilitada: u.id === meuId,
                        aoClicar: () => aoAlternarAtivo(u),
                      },
                    ]}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modulosDe && (
        <FormModulos usuario={modulosDe} modulosEmpresa={modulosEmpresa} aoFechar={() => setModulosDe(null)} />
      )}

      {(criando || editando) && (
        <FormUsuario
          usuario={editando}
          aoFechar={() => {
            setCriando(false);
            setEditando(null);
          }}
        />
      )}
    </div>
  );
}
