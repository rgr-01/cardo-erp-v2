"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Plus, Trash2 } from "lucide-react";
import { criarFornecedor, excluirFornecedor } from "@/app/actions/produtos";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { formatarNumeroCadastro } from "@/lib/numero-cadastro";

type Fornecedor = { id: string; numero: number; nome: string; produtos: number };
const normalizar = (valor: string) => valor.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

export function FornecedoresLista({ fornecedores, podeVerProdutos }: { fornecedores: Fornecedor[]; podeVerProdutos: boolean }) {
  const [busca, setBusca] = useState("");
  const [aberto, setAberto] = useState(false);
  const [nome, setNome] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  const { confirmar } = useConfirm();
  const filtrados = fornecedores.filter(f => normalizar(f.nome).includes(normalizar(busca)) || (/^\d+$/.test(busca.trim()) && f.numero === Number(busca)));

  function salvar(event: React.FormEvent) {
    event.preventDefault();
    setErro(null);
    iniciar(async () => {
      const resultado = await criarFornecedor(nome);
      if (!resultado.ok) { setErro(resultado.erro); return; }
      setAberto(false);
      setNome("");
    });
  }

  async function excluir(fornecedor: Fornecedor) {
    if (!await confirmar({ mensagem: `Excluir o fornecedor ${fornecedor.nome}?`, confirmarLabel: "Excluir fornecedor", variante: "perigo" })) return;
    setErro(null);
    iniciar(async () => {
      const resultado = await excluirFornecedor(fornecedor.id);
      if (!resultado.ok) setErro(resultado.erro);
    });
  }

  return (
    <div className="space-y-5">
      <div className="page-heading flex flex-wrap items-center justify-between gap-3">
        <div><h1>Fornecedores</h1><p className="mt-1 text-sm text-muted">{fornecedores.length} fornecedores cadastrados</p></div>
        <Button variant="primary" onClick={() => { setErro(null); setNome(""); setAberto(true); }}><Plus size={16} /> Novo fornecedor</Button>
      </div>
      <input aria-label="Buscar fornecedor por nome ou código" placeholder="Buscar por nome ou código..." value={busca} onChange={event => setBusca(event.target.value)} className="erp-field w-full rounded-lg border border-control bg-zinc-900 px-3 py-2 text-sm sm:max-w-sm" />
      {erro && !aberto && <p role="alert" className="text-sm text-red-400">{erro}</p>}
      <div className="overflow-x-auto rounded-xl border border-surface-border bg-zinc-900">
        <table className="w-full min-w-[520px] text-left text-sm">
          <thead><tr className="border-b border-surface-border"><th scope="col" className="w-24 px-4 py-3">Código</th><th scope="col" className="px-4 py-3">Fornecedor</th><th scope="col" className="px-4 py-3 text-right">Produtos</th><th scope="col" className="px-4 py-3 text-right">Ações</th></tr></thead>
          <tbody className="divide-y divide-surface-border">
            {filtrados.map(f => <tr key={f.id}>
              <td className="whitespace-nowrap px-4 py-3 font-mono text-xs tabular-nums text-secondary">{formatarNumeroCadastro(f.numero)}</td>
              <td className="px-4 py-3 font-medium">{f.nome}</td>
              <td className="px-4 py-3 text-right tabular-nums">{f.produtos}</td>
              <td className="px-4 py-3"><div className="flex items-center justify-end gap-3">
                {podeVerProdutos && f.produtos > 0 && <Link href={`/produtos?fornecedor=${encodeURIComponent(f.id)}`} className="whitespace-nowrap text-xs font-semibold text-accent">Ver produtos</Link>}
                <Button size="sm" variant="ghost" aria-label={`Excluir fornecedor ${f.nome}`} title={f.produtos > 0 ? "Remova os produtos vinculados antes de excluir" : "Excluir fornecedor"} disabled={pendente || f.produtos > 0} onClick={() => { void excluir(f); }}><Trash2 size={16} /></Button>
              </div></td>
            </tr>)}
            {filtrados.length === 0 && <tr><td colSpan={4} className="px-4 py-10 text-center text-muted">{busca ? "Nenhum fornecedor corresponde à busca." : "Nenhum fornecedor cadastrado. Use Novo fornecedor para começar."}</td></tr>}
          </tbody>
        </table>
      </div>
      <Modal open={aberto} onClose={() => { if (!pendente) setAberto(false); }} title="Novo fornecedor">
        <form onSubmit={salvar} className="space-y-4">
          <p className="text-xs text-muted">O código será gerado automaticamente ao salvar.</p>
          <div><label htmlFor="fornecedor-nome" className="mb-2 block text-sm">Nome do fornecedor</label><input id="fornecedor-nome" required maxLength={120} autoFocus value={nome} onChange={event => setNome(event.target.value)} disabled={pendente} className="erp-field w-full rounded-lg border border-control bg-zinc-800 px-3 py-2 text-sm" /></div>
          {erro && <p role="alert" className="text-sm text-red-400">{erro}</p>}
          <div className="flex justify-end gap-2"><Button type="button" disabled={pendente} onClick={() => setAberto(false)}>Cancelar</Button><Button type="submit" variant="primary" disabled={pendente || !nome.trim()}>{pendente ? "Salvando..." : "Salvar fornecedor"}</Button></div>
        </form>
      </Modal>
    </div>
  );
}
