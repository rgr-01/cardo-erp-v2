"use client";

import { useMemo, useState, useTransition } from "react";
import { Info, Pencil, Plus, Trash2 } from "lucide-react";
import { criarProduto, atualizarCustoProduto, atualizarDetalhesProduto, excluirProduto } from "@/app/actions/produtos";
import { fmtBRL } from "@/lib/format";
import { precoMinimo } from "@/lib/preco-minimo";
import { PrecosProduto } from "./precos-produto";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { MenuAcoes } from "@/components/ui/menu-acoes";
import { FiltroColunaExcel } from "@/components/ui/filtro-coluna-excel";
import { Paginacao, usePaginacao } from "@/components/ui/paginacao";
import { useConfirm } from "@/components/ui/confirm-dialog";

export type FornecedorComProdutos = {
  id: string;
  nome: string;
  produtos: {
    id: string;
    nome: string;
    ingredienteAtivo: string | null;
    embalagem: string | null;
    recomendacao: string | null;
    ncm: string | null;
    cfop: string | null;
    qtdVendas: number;
    custoAvista: number | null;
    custoAprazo: number | null;
    custoCompra: number | null;
    margemPct: number | null;
  }[];
};
type Produto = FornecedorComProdutos["produtos"][number] & { fornecedorId: string; fornecedorNome: string };
const inputCls = "rounded-lg border border-surface-border bg-zinc-800 px-3 py-1.5 text-sm text-white outline-none focus:border-accent";
const normalizar = (texto: string) => texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
const lerPreco = (texto: string) => texto.trim() ? Number(texto.replace(",", ".")) : null;
// Margem sobre o preco de venda (igual a lib/margem.ts): preco = custo / (1 - margem).
// Sem margem informada usa a padrao (30%). Margem digitada em % (ex.: "25,5").
const MARGEM_PADRAO = 30;
const lerMargem = (texto: string) => {
  const valor = lerPreco(texto);
  return valor != null && Number.isFinite(valor) && valor >= 0 && valor < 100 ? valor : null;
};
// Sugestao pro vendedor nao digitar preco 3 vezes: custo com a margem do produto.
const sugerirPreco = (compraTexto: string, margemTexto = "") => {
  const compra = lerPreco(compraTexto);
  if (compra == null || !Number.isFinite(compra) || compra < 0) return "";
  const margem = margemTexto.trim() ? lerMargem(margemTexto) : MARGEM_PADRAO;
  return margem == null ? "" : (compra / (1 - margem / 100)).toFixed(2);
};
// Margem em branco: produto com preco cadastrado fica com 30%, sem preco fica sem margem.
const margemParaSalvar = (texto: string, precos: (number | null)[]) => {
  if (texto.trim()) return lerMargem(texto)! / 100;
  return precos.some((v) => v != null) ? MARGEM_PADRAO / 100 : null;
};
const margemParaTexto = (margem: number | null) => (margem == null ? "" : String(Math.round(margem * 10000) / 100));
const fmtMargem = (margem: number) => `${(Math.round(margem * 1000) / 10).toLocaleString("pt-BR")}%`;

const camposDetalhes = [
  { campo: "ingredienteAtivo", rotulo: "Ingrediente ativo", limite: 2000 },
  { campo: "embalagem", rotulo: "Embalagem", limite: 300 },
  { campo: "recomendacao", rotulo: "Recomendação", limite: 4000 },
  // NCM/CFOP: exigidos pela Focus NFe pra emitir NF-e desse produto (ver
  // emitirNotaFiscalFocusNfe em lib/servicos/financeiro.ts) — sem eles, a
  // emissão automática fica bloqueada com mensagem clara.
  { campo: "ncm", rotulo: "NCM", limite: 8 },
  { campo: "cfop", rotulo: "CFOP", limite: 4 },
] as const;

function Preco({ valor, minimo = false }: { valor: number | null; minimo?: boolean }) {
  if (valor == null || !Number.isFinite(valor) || valor < 0) {
    return <span className="text-xs text-amber-400">{minimo ? "—" : "Sem preço"}</span>;
  }
  return <span className={minimo ? "text-accent" : "font-semibold text-white"}>{fmtBRL(valor)}</span>;
}

export function ProdutosLista({ fornecedores, ehAdmin, fornecedorInicial }: { fornecedores: FornecedorComProdutos[]; ehAdmin: boolean; fornecedorInicial?: string }) {
  const [busca, setBusca] = useState("");
  const [filtroFornecedor, setFiltroFornecedor] = useState<Set<string>>(new Set(fornecedorInicial ? [fornecedorInicial] : []));
  const [filtroProduto, setFiltroProduto] = useState<Set<string>>(new Set());
  const [filtroPreco, setFiltroPreco] = useState<"todos" | "com" | "sem">("todos");
  const [criandoProduto, setCriandoProduto] = useState(false);
  const [novo, setNovo] = useState({ fornecedorId: "", nome: "", compra: "", margem: "", avista: "", aprazo: "", ingredienteAtivo: "", embalagem: "", recomendacao: "", ncm: "", cfop: "" });
  const [detalhes, setDetalhes] = useState<Produto | null>(null);
  const [editando, setEditando] = useState<string | null>(null);
  const [rascunho, setRascunho] = useState({ avista: "", aprazo: "", compra: "", margem: "", ingredienteAtivo: "", embalagem: "", recomendacao: "", ncm: "", cfop: "" });
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();
  const { confirmar } = useConfirm();

  const produtos = useMemo(() => fornecedores.flatMap((f) => f.produtos.map((p) => ({
    ...p, fornecedorId: f.id, fornecedorNome: f.nome,
  }))).sort((a, b) => a.fornecedorNome.localeCompare(b.fornecedorNome, "pt-BR") || a.nome.localeCompare(b.nome, "pt-BR")), [fornecedores]);
  const opcoesFornecedores = useMemo(() => fornecedores.filter((f) => f.produtos.length > 0)
    .map((f) => ({ id: f.id, label: f.nome })), [fornecedores]);
  const opcoesProdutos = useMemo(() => produtos.map((p) => ({ id: p.id, label: p.nome }))
    .sort((a, b) => a.label.localeCompare(b.label, "pt-BR")), [produtos]);
  const filtrados = useMemo(() => produtos.filter((p) => {
    const temPreco = p.custoAvista != null || p.custoAprazo != null;
    return (
      (!busca || normalizar(`${p.nome} ${p.fornecedorNome} ${p.ingredienteAtivo ?? ""} ${p.embalagem ?? ""} ${p.recomendacao ?? ""}`).includes(normalizar(busca))) &&
      (!filtroFornecedor.size || filtroFornecedor.has(p.fornecedorId)) &&
      (!filtroProduto.size || filtroProduto.has(p.id)) &&
      (filtroPreco === "todos" || (filtroPreco === "com" ? temPreco : !temPreco))
    );
  }), [produtos, busca, filtroFornecedor, filtroProduto, filtroPreco]);
  const paginacao = usePaginacao(filtrados, JSON.stringify([busca, [...filtroFornecedor], [...filtroProduto], filtroPreco]), 25);

  function executar(acao: () => Promise<{ ok: boolean; erro?: string }>, aoSalvar?: () => void) {
    setErro(null);
    startTransition(async () => {
      try {
        const resultado = await acao();
        if (!resultado.ok) setErro(resultado.erro || "Não foi possível salvar. Tente novamente.");
        else aoSalvar?.();
      } catch {
        setErro("Não foi possível concluir a operação. Tente novamente.");
      }
    });
  }
  function iniciarEdicao(p: Produto) {
    setErro(null);
    setEditando(p.id);
    setDetalhes(null);
    setRascunho({
      avista: p.custoAvista?.toString() ?? "",
      aprazo: p.custoAprazo?.toString() ?? "",
      compra: p.custoCompra?.toString() ?? "",
      margem: margemParaTexto(p.margemPct),
      ingredienteAtivo: p.ingredienteAtivo ?? "",
      embalagem: p.embalagem ?? "",
      recomendacao: p.recomendacao ?? "",
      ncm: p.ncm ?? "",
      cfop: p.cfop ?? "",
    });
  }
  function cancelarEdicao() {
    setEditando(null);
    setErro(null);
  }
  async function salvarEdicao(p: Produto) {
    const avista = lerPreco(rascunho.avista);
    const aprazo = lerPreco(rascunho.aprazo);
    const compra = lerPreco(rascunho.compra);
    if ([avista, aprazo, compra].some((v) => v != null && (!Number.isFinite(v) || v < 0))) {
      setErro("Informe preços válidos, iguais ou maiores que zero.");
      return;
    }
    if (rascunho.margem.trim() && lerMargem(rascunho.margem) == null) {
      setErro("Informe uma margem entre 0% e 99,9%.");
      return;
    }
    setErro(null);
    startTransition(async () => {
      const detalhes = { ingredienteAtivo: rascunho.ingredienteAtivo, embalagem: rascunho.embalagem, recomendacao: rascunho.recomendacao, ncm: rascunho.ncm, cfop: rascunho.cfop };
      const resultadoDetalhes = await atualizarDetalhesProduto(p.id, detalhes);
      if (!resultadoDetalhes.ok) { setErro(resultadoDetalhes.erro || "Não foi possível salvar. Tente novamente."); return; }
      const resultadoPreco = await atualizarCustoProduto(p.id, avista, aprazo, compra, margemParaSalvar(rascunho.margem, [avista, aprazo, compra]));
      if (!resultadoPreco.ok) { setErro(resultadoPreco.erro || "Não foi possível salvar. Tente novamente."); return; }
      setEditando(null);
    });
  }
  async function removerProduto(p: Produto) {
    if (await confirmar({ mensagem: `Excluir o produto ${p.nome}?`, confirmarLabel: "Excluir produto", variante: "perigo" })) executar(() => excluirProduto(p.id));
  }
  function cancelarCriacao() {
    setCriandoProduto(false);
    setErro(null);
  }
  async function salvarNovoProduto() {
    if (!novo.nome.trim() || !novo.fornecedorId) return;
    const compra = lerPreco(novo.compra);
    const avista = lerPreco(novo.avista);
    const aprazo = lerPreco(novo.aprazo);
    if ([avista, aprazo, compra].some((v) => v != null && (!Number.isFinite(v) || v < 0))) {
      setErro("Informe preços válidos, iguais ou maiores que zero.");
      return;
    }
    if (novo.margem.trim() && lerMargem(novo.margem) == null) {
      setErro("Informe uma margem entre 0% e 99,9%.");
      return;
    }
    setErro(null);
    startTransition(async () => {
      const detalhes = { ingredienteAtivo: novo.ingredienteAtivo, embalagem: novo.embalagem, recomendacao: novo.recomendacao, ncm: novo.ncm, cfop: novo.cfop };
      const resultadoProduto = await criarProduto(novo.nome.trim(), novo.fornecedorId, detalhes);
      if (!resultadoProduto.ok) { setErro(resultadoProduto.erro || "Não foi possível salvar. Tente novamente."); return; }
      if ("id" in resultadoProduto && (compra != null || avista != null || aprazo != null)) {
        await atualizarCustoProduto(resultadoProduto.id, avista, aprazo, compra, margemParaSalvar(novo.margem, [avista, aprazo, compra]));
      }
      setCriandoProduto(false);
    });
  }
  const mensagemErro = erro && <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-red-400">{erro}</p>;

  return (
    <div className="flex h-[calc(100dvh-6rem)] min-h-[24rem] flex-col gap-4 md:h-[calc(100dvh-2rem)]">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
        <div><h1>Produtos</h1><p className="mt-1 text-sm text-muted">Catálogo, custos e preços de venda</p></div>
      </div>

      <>
      <div className="flex shrink-0 flex-wrap items-center gap-3">
        <input aria-label="Buscar produto ou fornecedor" placeholder="Buscar produto ou fornecedor..." value={busca} onChange={(e) => setBusca(e.target.value)} className={`${inputCls} w-full sm:w-80`} />
        <select aria-label="Filtrar por preço" value={filtroPreco} onChange={(e) => setFiltroPreco(e.target.value as typeof filtroPreco)} className={inputCls}>
          <option value="todos">Todos os preços</option>
          <option value="com">Com preço cadastrado</option>
          <option value="sem">Sem preço cadastrado</option>
        </select>
        {(busca || filtroFornecedor.size > 0 || filtroProduto.size > 0 || filtroPreco !== "todos") && (
          <Button size="sm" variant="ghost" onClick={() => { setBusca(""); setFiltroFornecedor(new Set()); setFiltroProduto(new Set()); setFiltroPreco("todos"); }}>Limpar filtros</Button>
        )}
        <Button variant="primary" className="sm:ml-auto" onClick={() => { setErro(null); setNovo({ fornecedorId: "", nome: "", compra: "", margem: "", avista: "", aprazo: "", ingredienteAtivo: "", embalagem: "", recomendacao: "", ncm: "", cfop: "" }); setCriandoProduto(true); }}><Plus size={14} /> Novo produto</Button>
      </div>
      {mensagemErro}
      <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-surface-border">
        <table className="w-full min-w-[1800px] text-sm">
          <thead className="sticky top-0 z-10 bg-zinc-900 text-left text-xs font-medium text-muted">
            <tr className="border-b border-surface-border">
              <th className="px-3 py-3">Fornecedor<FiltroColunaExcel rotulo="Fornecedor" opcoes={opcoesFornecedores} selecionados={filtroFornecedor} onMudar={setFiltroFornecedor} /></th>
              <th className="px-3 py-3">Produto<FiltroColunaExcel rotulo="Produto" opcoes={opcoesProdutos} selecionados={filtroProduto} onMudar={setFiltroProduto} /></th>
              {camposDetalhes.map(({ campo, rotulo }) => (
                <th key={campo} className="px-3 py-3">{rotulo}</th>
              ))}
              <th className="px-3 py-3 text-right" title="O que se paga ao fornecedor — base do calculo de margem no orçamento (nunca aparece pro cliente)">Custo de compra</th>
              <th className="px-3 py-3 text-right" title="Margem sobre o preço de venda. Vazia = padrão de 30%. Ao mudar, recalcula os preços à vista e a prazo.">Margem</th>
              <th className="px-3 py-3 text-right">À vista</th>
              <th className="px-3 py-3 text-right">Mín. à vista</th>
              <th className="px-3 py-3 text-right">A prazo</th>
              <th className="px-3 py-3 text-right">Mín. a prazo</th>
              <th className="px-3 py-3 text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {criandoProduto && (
              <tr className="border-b border-surface-border/50 bg-accent/5">
                <td className="px-3 py-2.5">
                  <select autoFocus aria-label="Fornecedor do novo produto" value={novo.fornecedorId} onChange={(e) => setNovo((n) => ({ ...n, fornecedorId: e.target.value }))} className={`${inputCls} w-full`} disabled={pendente}>
                    <option value="">Selecione...</option>
                    {fornecedores.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
                  </select>
                </td>
                <td className="px-3 py-2.5">
                  <input aria-label="Nome do novo produto" placeholder="Nome do produto" value={novo.nome} onChange={(e) => setNovo((n) => ({ ...n, nome: e.target.value }))} className={`${inputCls} w-full`} disabled={pendente} />
                </td>
                {camposDetalhes.map(({ campo, rotulo, limite }) => (
                  <td key={campo} className={`${campo === "embalagem" || campo === "ncm" || campo === "cfop" ? "max-w-28" : "max-w-56"} px-3 py-2.5`}>
                    <input aria-label={`${rotulo} do novo produto`}
                      maxLength={limite} value={novo[campo]} onChange={(e) => setNovo((n) => ({ ...n, [campo]: e.target.value }))}
                      className={`${inputCls} w-full`} disabled={pendente} placeholder="Não informado" />
                  </td>
                ))}
                <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">
                  <input aria-label="Custo de compra do novo produto" inputMode="decimal" value={novo.compra} onChange={(e) => {
                    const texto = e.target.value;
                    setNovo((n) => {
                      const sugestao = sugerirPreco(texto, n.margem);
                      return { ...n, compra: texto, avista: !n.avista.trim() ? sugestao : n.avista, aprazo: !n.aprazo.trim() ? sugestao : n.aprazo };
                    });
                  }} className={`${inputCls} w-24 text-right`} disabled={pendente} />
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">
                  <input aria-label="Margem do novo produto (%)" inputMode="decimal" value={novo.margem} onChange={(e) => {
                    const texto = e.target.value;
                    setNovo((n) => {
                      const sugestao = sugerirPreco(n.compra, texto);
                      return { ...n, margem: texto, avista: sugestao || n.avista, aprazo: sugestao || n.aprazo };
                    });
                  }} className={`${inputCls} w-20 text-right`} disabled={pendente} /> <span className="text-xs text-muted">%</span>
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">
                  <input aria-label="Preço à vista do novo produto" inputMode="decimal" value={novo.avista} onChange={(e) => setNovo((n) => ({ ...n, avista: e.target.value }))} className={`${inputCls} w-24 text-right`} disabled={pendente} />
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums"><Preco valor={precoMinimo(lerPreco(novo.avista))} minimo /></td>
                <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">
                  <input aria-label="Preço a prazo do novo produto" inputMode="decimal" value={novo.aprazo} onChange={(e) => setNovo((n) => ({ ...n, aprazo: e.target.value }))} className={`${inputCls} w-24 text-right`} disabled={pendente} />
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums"><Preco valor={precoMinimo(lerPreco(novo.aprazo))} minimo /></td>
                <td className="px-3 py-2.5 text-right">
                  <div className="flex justify-end gap-1">
                    <Button size="sm" variant="primary" disabled={pendente || !novo.nome.trim() || !novo.fornecedorId} onClick={salvarNovoProduto}>{pendente ? "Salvando..." : "Salvar"}</Button>
                    <Button size="sm" disabled={pendente} onClick={cancelarCriacao}>Cancelar</Button>
                  </div>
                </td>
              </tr>
            )}
            {paginacao.itens.map((p) => {
              const emEdicao = editando === p.id;
              const avista = emEdicao ? lerPreco(rascunho.avista) : p.custoAvista;
              const aprazo = emEdicao ? lerPreco(rascunho.aprazo) : p.custoAprazo;
              return (
                <tr key={p.id} className={`border-b border-surface-border/50 ${emEdicao ? "bg-accent/5" : "hover:bg-zinc-900/60"}`}>
                  <td className="max-w-40 truncate px-3 py-2.5 text-secondary" title={p.fornecedorNome}>{p.fornecedorNome}</td>
                  <td className="max-w-72 px-3 py-2.5"><button onClick={() => setDetalhes(p)} title={`Ver detalhes de ${p.nome}`} className="block max-w-full truncate text-left font-semibold text-zinc-200 hover:text-accent">{p.nome}</button></td>
                  {camposDetalhes.map(({ campo, rotulo, limite }) => (
                    <td key={campo} className={`${campo === "embalagem" || campo === "ncm" || campo === "cfop" ? "max-w-28" : "max-w-56"} px-3 py-2.5 text-xs text-secondary`}>
                      {emEdicao ? (
                        <input aria-label={`${rotulo} de ${p.nome}`}
                          maxLength={limite} value={rascunho[campo]} onChange={(e) => setRascunho((r) => ({ ...r, [campo]: e.target.value }))}
                          className={`${inputCls} w-full`} disabled={pendente} placeholder="Não informado" />
                      ) : (
                        <span className="line-clamp-2" title={p[campo] ?? "Não informado"}>{p[campo] || "—"}</span>
                      )}
                    </td>
                  ))}
                  <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">{emEdicao ? <input autoFocus aria-label={`Custo de compra de ${p.nome}`} inputMode="decimal" value={rascunho.compra} onChange={(e) => {
                    const texto = e.target.value;
                    setRascunho((r) => {
                      // So sugere avista/a prazo se ainda nao tiverem valor —
                      // nao sobrescreve preco ja ajustado pelo gestor.
                      const sugestao = sugerirPreco(texto, r.margem);
                      return {
                        ...r,
                        compra: texto,
                        avista: !r.avista.trim() ? sugestao : r.avista,
                        aprazo: !r.aprazo.trim() ? sugestao : r.aprazo,
                      };
                    });
                  }} className={`${inputCls} w-24 text-right`} disabled={pendente} /> : <Preco valor={p.custoCompra} />}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">{emEdicao ? <><input aria-label={`Margem de ${p.nome} (%)`} inputMode="decimal" value={rascunho.margem} onChange={(e) => {
                    const texto = e.target.value;
                    // Mudar a margem recalcula os precos de venda a partir do custo.
                    setRascunho((r) => {
                      const sugestao = sugerirPreco(r.compra, texto);
                      return { ...r, margem: texto, avista: sugestao || r.avista, aprazo: sugestao || r.aprazo };
                    });
                  }} className={`${inputCls} w-20 text-right`} disabled={pendente} /> <span className="text-xs text-muted">%</span></> : p.margemPct != null ? <span className="font-semibold text-zinc-200">{fmtMargem(p.margemPct)}</span> : <span className="text-subtle">—</span>}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">{emEdicao ? <input aria-label={`Preço à vista de ${p.nome}`} inputMode="decimal" value={rascunho.avista} onChange={(e) => setRascunho((r) => ({ ...r, avista: e.target.value }))} className={`${inputCls} w-24 text-right`} disabled={pendente} /> : <Preco valor={avista} />}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums"><Preco valor={precoMinimo(avista)} minimo /></td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">{emEdicao ? <input aria-label={`Preço a prazo de ${p.nome}`} inputMode="decimal" value={rascunho.aprazo} onChange={(e) => setRascunho((r) => ({ ...r, aprazo: e.target.value }))} className={`${inputCls} w-24 text-right`} disabled={pendente} /> : <Preco valor={aprazo} />}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums"><Preco valor={precoMinimo(aprazo)} minimo /></td>
                  <td className="px-3 py-2.5 text-right">
                    {emEdicao ? <div className="flex justify-end gap-1"><Button size="sm" variant="primary" disabled={pendente} onClick={() => salvarEdicao(p)}>{pendente ? "Salvando..." : "Salvar"}</Button><Button size="sm" disabled={pendente} onClick={cancelarEdicao}>Cancelar</Button></div> : (
                      <MenuAcoes desabilitado={pendente} rotuloBotao={`Ações de ${p.nome}`} acoes={[
                        { rotulo: "Ver detalhes", icone: <Info size={14} />, aoClicar: () => setDetalhes(p) },
                        ...(ehAdmin ? [
                          { rotulo: "Editar", icone: <Pencil size={14} />, aoClicar: () => iniciarEdicao(p) },
                          { rotulo: "Excluir", icone: <Trash2 size={14} />, aoClicar: () => { void removerProduto(p); }, perigosa: true, desabilitada: p.qtdVendas > 0 },
                        ] : []),
                      ]} />
                    )}
                  </td>
                </tr>
              );
            })}
            {filtrados.length === 0 && <tr><td colSpan={14} className="px-3 py-10 text-center text-muted"><p className="sticky left-3 max-w-[calc(100vw-4rem)] whitespace-normal md:max-w-[calc(100vw-20rem)]">{produtos.length ? "Nenhum produto encontrado com esses filtros." : "Nenhum produto cadastrado. Use Novo produto para começar."}</p></td></tr>}
          </tbody>
        </table>
      </div>
      <Paginacao {...paginacao} />
      </>

      <Modal open={detalhes !== null} onClose={() => setDetalhes(null)} title="Detalhes do produto">
        {detalhes && <div className="max-h-[75vh] space-y-4 overflow-y-auto">
          <div><p className="font-semibold text-white">{detalhes.nome}</p><p className="text-sm text-secondary">{detalhes.fornecedorNome}</p></div>
          <dl className="space-y-3 text-sm">
            {camposDetalhes.map(({ campo, rotulo }) => <div key={campo}><dt className="text-xs text-muted">{rotulo}</dt><dd className="whitespace-pre-wrap break-words text-zinc-200">{detalhes[campo] || "Não informado"}</dd></div>)}
          </dl>
          <PrecosProduto avista={detalhes.custoAvista} aprazo={detalhes.custoAprazo} custoCompra={detalhes.custoCompra} />
          <p className="text-sm text-secondary">{detalhes.qtdVendas} {detalhes.qtdVendas === 1 ? "venda registrada" : "vendas registradas"}</p>
          {ehAdmin && <div className="flex flex-wrap justify-end gap-2">
            <Button onClick={() => iniciarEdicao(detalhes)}><Pencil size={14} /> Editar</Button>
          </div>}
        </div>}
      </Modal>
    </div>
  );
}
