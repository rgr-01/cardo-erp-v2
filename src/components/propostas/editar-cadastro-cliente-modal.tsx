"use client";
import { DialogFrame } from "@/components/ui/dialog-frame";

import { useState, useTransition } from "react";
import { X } from "lucide-react";
import { completarCadastroCliente } from "@/app/actions/clientes";
import type { ClienteOpcaoProposta } from "@/components/propostas/tipos";

type Campos = {
  razaoSocial: string;
  documento: string;
  cep: string;
  endereco: string;
  cidade: string;
  uf: string;
  email: string;
  telefone: string;
};

const inputCls =
  "w-full rounded-lg border bg-zinc-800 px-3 py-2 text-sm text-white outline-none focus:border-accent";

// Janela para preencher o que falta no cadastro do cliente sem sair do pedido.
// Os campos obrigatórios que ainda estão vazios ficam destacados.
export function EditarCadastroClienteModal({
  cliente,
  aoSalvar,
  aoFechar,
}: {
  cliente: ClienteOpcaoProposta;
  aoSalvar: (atualizado: Partial<ClienteOpcaoProposta>) => void;
  aoFechar: () => void;
}) {
  const [campos, setCampos] = useState<Campos>({
    // Sem razão social cadastrada, sugere o próprio nome do cliente (dá para editar).
    razaoSocial: cliente.razaoSocial || cliente.nome,
    documento: cliente.documento ?? "",
    cep: cliente.cep ?? "",
    endereco: cliente.endereco ?? "",
    cidade: cliente.cidade ?? "",
    uf: cliente.uf ?? "",
    email: cliente.email ?? "",
    telefone: cliente.telefone ?? "",
  });
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();

  function mudar(campo: keyof Campos, valor: string) {
    setCampos((atual) => ({ ...atual, [campo]: campo === "uf" ? valor.toUpperCase().slice(0, 2) : valor }));
  }

  function salvar() {
    setErro(null);
    startTransition(async () => {
      const resultado = await completarCadastroCliente(cliente.id, campos);
      if (!resultado.ok) {
        setErro(resultado.erro);
        return;
      }
      aoSalvar(resultado.cliente);
      aoFechar();
    });
  }

  const obrigatorios: (keyof Campos)[] = ["documento", "cep", "endereco", "cidade", "uf", "email"];
  const classe = (campo: keyof Campos) =>
    `${inputCls} ${
      obrigatorios.includes(campo) && !campos[campo].trim() ? "border-amber-500/70" : "border-surface-border"
    }`;

  // Cobre só o editor de pedido (que precisa ser "relative") e fica centralizada nele.
  return (
    <DialogFrame onClose={aoFechar} label="Editar cadastro do cliente">
      <div className="w-full max-w-2xl overflow-hidden rounded-xl border border-surface-border bg-zinc-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-surface-border px-5 py-3.5">
          <h3 className="text-base font-bold text-white">Cadastro do cliente</h3>
          <button
            type="button"
            onClick={aoFechar}
            aria-label="Fechar"
            className="rounded p-1 text-secondary hover:bg-zinc-800 hover:text-white"
          >
            <X size={18} />
          </button>
        </div>

        <div className="grid gap-4 px-5 py-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs font-medium text-secondary">Razão social</label>
            <input value={campos.razaoSocial} onChange={(e) => mudar("razaoSocial", e.target.value)} className={classe("razaoSocial")} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-secondary">CPF/CNPJ *</label>
            <input value={campos.documento} onChange={(e) => mudar("documento", e.target.value)} className={classe("documento")} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-secondary">E-mail *</label>
            <input type="email" value={campos.email} onChange={(e) => mudar("email", e.target.value)} className={classe("email")} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-secondary">CEP *</label>
            <input value={campos.cep} onChange={(e) => mudar("cep", e.target.value)} className={classe("cep")} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-secondary">Telefone</label>
            <input value={campos.telefone} onChange={(e) => mudar("telefone", e.target.value)} className={classe("telefone")} />
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs font-medium text-secondary">Endereço *</label>
            <input value={campos.endereco} onChange={(e) => mudar("endereco", e.target.value)} className={classe("endereco")} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-secondary">Cidade *</label>
            <input value={campos.cidade} onChange={(e) => mudar("cidade", e.target.value)} className={classe("cidade")} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-secondary">UF *</label>
            <input value={campos.uf} onChange={(e) => mudar("uf", e.target.value)} maxLength={2} className={classe("uf")} />
          </div>
        </div>

        {erro && <p role="alert" className="mx-5 mb-3 rounded-lg bg-danger/10 px-3 py-2 text-sm text-red-400">{erro}</p>}

        <div className="flex items-center justify-end gap-2 border-t border-surface-border px-5 py-3.5">
          <button
            type="button"
            onClick={aoFechar}
            className="rounded-lg border border-surface-border px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={salvar}
            disabled={pendente}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground hover:brightness-110 disabled:opacity-50"
          >
            {pendente ? "Salvando..." : "Salvar cadastro"}
          </button>
        </div>
      </div>
    </DialogFrame>
  );
}
