"use client";

import { CampoSenha } from "@/components/ui/campo-senha";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, Plus } from "lucide-react";
import { criarEmpresa, type NovaEmpresaInput } from "@/app/actions/empresas";
import { MODULOS_EMPRESA, NOMES_MODULO, normalizarModulos, type Modulo } from "@/lib/modulos";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export type EmpresaLinha = {
  id: string;
  nomeFantasia: string;
  cnpj: string | null;
  ativo: boolean;
  modulos: Modulo[];
  qtdUsuarios: number;
  qtdClientes: number;
  plano: string | null;
  limiteUsuarios: number | null;
};

const inputCls =
  "w-full rounded-lg border border-surface-border bg-zinc-800 px-3 py-2 text-sm text-white outline-none focus:border-accent";
const labelCls = "mb-1 block text-xs font-medium text-secondary";

// Marcar ERP marca Plano de Vendas; desmarcar Plano de Vendas desmarca ERP.
function alternarModulo(atuais: Modulo[], modulo: Modulo): Modulo[] {
  if (atuais.includes(modulo)) {
    return atuais.filter((m) => m !== modulo);
  }
  return normalizarModulos([...atuais, modulo]);
}

function CaixasModulos({ valor, aoMudar }: { valor: Modulo[]; aoMudar: (m: Modulo[]) => void }) {
  return (
    <div className="flex flex-col gap-1.5">
      {MODULOS_EMPRESA.map((m) => (
        <label key={m} className="flex items-center gap-2 text-sm text-zinc-300">
          <input
            type="checkbox"
            checked={valor.includes(m)}
            onChange={() => aoMudar(alternarModulo(valor, m))}
            className="h-4 w-4 accent-accent"
          />
          {NOMES_MODULO[m]}
        </label>
      ))}
    </div>
  );
}

function FormEmpresa({ aoFechar }: { aoFechar: () => void }) {
  const [erro, setErro] = useState<string | null>(null);
  const [modulos, setModulos] = useState<Modulo[]>([...MODULOS_EMPRESA]);
  const [pendente, startTransition] = useTransition();

  function salvar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErro(null);
    const fd = new FormData(e.currentTarget);
    const input: NovaEmpresaInput = {
      modulos,
      nomeFantasia: String(fd.get("nomeFantasia") ?? ""),
      razaoSocial: String(fd.get("razaoSocial") ?? ""),
      cnpj: String(fd.get("cnpj") ?? ""),
      adminNome: String(fd.get("adminNome") ?? ""),
      adminEmail: String(fd.get("adminEmail") ?? ""),
      adminSenha: String(fd.get("adminSenha") ?? ""),
    };
    startTransition(async () => {
      const resultado = await criarEmpresa(input);
      if (resultado.ok) aoFechar();
      else setErro(resultado.erro);
    });
  }

  return (
    <Modal open onClose={aoFechar} title="Nova empresa" maxWidth="max-w-md">
      <form onSubmit={salvar}>
        <div className="space-y-4">
          <div>
            <label className={labelCls}>Nome da empresa *</label>
            <input name="nomeFantasia" required className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Razão social</label>
            <input name="razaoSocial" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>CNPJ</label>
            <input name="cnpj" className={inputCls} />
          </div>
          <div>
            <p className={labelCls}>Módulos contratados</p>
            <CaixasModulos valor={modulos} aoMudar={setModulos} />
          </div>
          <p className="border-t border-surface-border pt-4 text-xs font-semibold uppercase tracking-wide text-muted">
            Administrador da empresa
          </p>
          <div>
            <label className={labelCls}>Nome *</label>
            <input name="adminNome" required className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>E-mail *</label>
            <input name="adminEmail" type="email" required className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Senha *</label>
            <CampoSenha name="adminSenha" required minLength={12} autoComplete="new-password" className={inputCls} />
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="danger" onClick={aoFechar}>
            Cancelar
          </Button>
          <Button type="submit" variant="primary" disabled={pendente}>
            {pendente ? "Criando..." : "Criar empresa"}
          </Button>
        </div>
        {erro && <p role="alert" className="mt-3 rounded-lg bg-danger/10 px-3 py-2 text-sm text-red-400">{erro}</p>}
      </form>
    </Modal>
  );
}

export function EmpresasTable({ empresas }: { empresas: EmpresaLinha[] }) {
  const [criando, setCriando] = useState(false);
  const router = useRouter();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Empresas</h1>
          <p className="text-sm text-muted">Clientes do sistema. Clique numa empresa para editar dados, módulos, plano e usuários.</p>
        </div>
        <Button variant="primary" onClick={() => setCriando(true)}>
          <Plus size={14} /> Nova empresa
        </Button>
      </div>

      <div className="tabela-fixa overflow-x-auto rounded-xl border border-surface-border">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b border-surface-border bg-zinc-900 text-left text-xs font-medium text-muted">
              <th className="px-3 py-2.5">Empresa</th>
              <th className="px-3 py-2.5">Plano</th>
              <th className="px-3 py-2.5">Módulos</th>
              <th className="px-3 py-2.5">Situação</th>
              <th className="px-3 py-2.5 text-right">Usuários</th>
              <th className="px-3 py-2.5 text-right">Clientes</th>
              <th className="px-3 py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {empresas.map((e) => (
              <tr key={e.id} onClick={() => router.push(`/master/empresas/${e.id}`)} className="cursor-pointer border-b border-surface-border transition last:border-0 hover:bg-zinc-900">
                <td className="px-3 py-3"><span className="font-medium text-white">{e.nomeFantasia}</span>{e.cnpj && <span className="block text-xs text-muted">{e.cnpj}</span>}</td>
                <td className="px-3 py-3 text-secondary">{e.plano ?? "—"}</td>
                <td className="px-3 py-3"><div className="flex flex-wrap gap-1">{e.modulos.map((m) => <Badge key={m}>{NOMES_MODULO[m]}</Badge>)}</div></td>
                <td className="px-3 py-3"><Badge variant={e.ativo ? "success" : "danger"}>{e.ativo ? "Ativa" : "Desativada"}</Badge></td>
                <td className="px-3 py-3 text-right text-zinc-300">{e.qtdUsuarios}{e.limiteUsuarios ? <span className="text-muted"> / {e.limiteUsuarios}</span> : null}</td>
                <td className="px-3 py-3 text-right text-zinc-300">{e.qtdClientes}</td>
                <td className="px-3 py-3 text-right"><Link href={`/master/empresas/${e.id}`} onClick={(ev) => ev.stopPropagation()} className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline">Editar <ChevronRight size={13} /></Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {criando && <FormEmpresa aoFechar={() => setCriando(false)} />}
    </div>
  );
}
