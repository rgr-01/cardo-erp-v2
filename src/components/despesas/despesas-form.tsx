"use client";
import { DialogFrame } from "@/components/ui/dialog-frame";

import { useMemo, useRef, useState, useTransition } from "react";
import {
  criarDespesa,
  atualizarDespesa,
  excluirFotoDespesa,
  extrairDespesaDeFoto,
} from "@/app/actions/despesas";
import { ComboBox, type ComboBoxOpcao } from "@/components/ui/combo-box";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { CONTA_POR_CATEGORIA } from "@/lib/despesas-contas";
import type { ClienteOpcao, DespesaLinha, GrupoPlano } from "@/components/despesas/despesas-painel";
import { DateInput } from "@/components/ui/date-input";

const inputCls =
  "w-full rounded-lg border border-surface-border bg-zinc-800 px-3 py-2 text-sm text-white outline-none focus:border-accent";
const labelCls = "mb-1 block text-xs font-medium text-secondary";
const fileCls =
  "block w-full text-sm text-zinc-300 file:mr-3 file:rounded-lg file:border-0 file:bg-zinc-800 file:px-3 file:py-2 file:text-sm file:text-zinc-200 hover:file:bg-zinc-700";

export function FormDespesa({
  clientes,
  grupos,
  filiais,
  hoje,
  despesa,
  aoFechar,
}: {
  clientes: ClienteOpcao[];
  grupos: GrupoPlano[];
  filiais: string[];
  hoje: string;
  despesa?: DespesaLinha;
  aoFechar: () => void;
}) {
  const editando = Boolean(despesa);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();
  const [extraindo, startExtracao] = useTransition();
  const { confirmar } = useConfirm();
  const [origemOcr, setOrigemOcr] = useState(false);
  const [fotosExistentes, setFotosExistentes] = useState(despesa?.fotos ?? []);
  const formRef = useRef<HTMLFormElement>(null);
  const fotoRef = useRef<HTMLInputElement>(null);
  const [clienteId, setClienteId] = useState(
    clientes.find((c) => c.nome === despesa?.clienteNome)?.id ?? ""
  );
  const opcoesClientes: ComboBoxOpcao[] = useMemo(
    () => clientes.map((c) => ({ id: c.id, label: c.nome })),
    [clientes]
  );
  const contaPorCodigo = useMemo(
    () => new Map(grupos.flatMap((g) => g.contas).map((c) => [c.codigo, c.id])),
    [grupos]
  );

  function extrairDaNota() {
    setErro(null);
    const arquivo = fotoRef.current?.files?.[0];
    if (!arquivo) {
      setErro("Selecione uma foto da nota antes de extrair.");
      return;
    }
    const fd = new FormData();
    fd.append("foto", arquivo);
    startExtracao(async () => {
      const resultado = await extrairDespesaDeFoto(fd);
      if (!resultado.ok) {
        setErro(resultado.erro);
        return;
      }
      const form = formRef.current;
      if (!form) return;
      const campo = (nome: string) => form.elements.namedItem(nome) as HTMLInputElement;
      if (resultado.valor != null) campo("valor").value = String(resultado.valor);
      if (resultado.data) campo("data").value = resultado.data;
      if (resultado.estabelecimento) campo("estabelecimento").value = resultado.estabelecimento;
      if (resultado.categoria) {
        const contaId = contaPorCodigo.get(CONTA_POR_CATEGORIA[resultado.categoria]);
        if (contaId) campo("contaId").value = contaId;
      }
      setOrigemOcr(true);
      if (resultado.confianca === "baixa") {
        setErro("Extração com baixa confiança — confira os campos antes de salvar.");
      }
    });
  }

  async function removerFotoExistente(fotoId: string) {
    if (!despesa) return;
    if (!(await confirmar({ mensagem: "Remover esta foto da despesa?", confirmarLabel: "Remover foto", variante: "perigo" }))) return;
    startTransition(async () => {
      const resultado = await excluirFotoDespesa(fotoId, despesa.id);
      if (resultado.ok) {
        setFotosExistentes((atual) => atual.filter((f) => f.id !== fotoId));
      } else {
        setErro(resultado.erro);
      }
    });
  }

  function salvar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErro(null);
    const fd = new FormData(e.currentTarget);
    fd.set("origemOcr", origemOcr ? "true" : "false");
    fd.set("clienteId", clienteId);

    // O arquivo usado no "Extrair da nota" vira também um anexo da despesa,
    // sem exigir um segundo upload manual.
    const fotoOcr = fotoRef.current?.files?.[0];
    if (fotoOcr) fd.append("fotos", fotoOcr);

    startTransition(async () => {
      const resultado = editando
        ? await atualizarDespesa(despesa!.id, fd)
        : await criarDespesa(fd);
      if (resultado.ok) {
        formRef.current?.reset();
        aoFechar();
      } else {
        setErro(resultado.erro);
      }
    });
  }

  return (
    <DialogFrame onClose={aoFechar} label={"Despesa"} className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 lg:pl-64">
      <form
        ref={formRef}
        onSubmit={salvar}
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-accent/60 bg-zinc-900 p-6"
      >
        <h2 className="mb-4 text-lg font-bold text-white">
          {editando ? "Editar despesa" : "Lançar despesa"}
        </h2>

        {fotosExistentes.length > 0 && (
          <div className="mb-4">
            <label className={labelCls}>Fotos atuais</label>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {fotosExistentes.map((f) => (
                <div key={f.id} className="group relative">
                  <a href={f.url} target="_blank" rel="noreferrer">
                    {/* eslint-disable-next-line @next/next/no-img-element -- fotos vêm do storage externo (Supabase), sem domínio fixo para next/image */}
                    <img
                      loading="lazy"
                      decoding="async"
                      src={f.url}
                      alt="Comprovante da despesa"
                      className="aspect-square w-full rounded-lg object-cover"
                    />
                  </a>
                  <button
                    type="button"
                    onClick={() => removerFotoExistente(f.id)}
                    className="absolute right-1 top-1 rounded bg-black/70 px-1.5 py-0.5 text-xs text-red-400 opacity-0 group-hover:opacity-100"
                  >
                    Remover
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mb-4">
          <label className={labelCls}>
            {editando ? "Adicionar foto da nota (opcional)" : "Foto da nota (opcional)"}
          </label>
          <input ref={fotoRef} type="file" accept="image/*" className={fileCls} />
          <button
            type="button"
            onClick={extrairDaNota}
            disabled={extraindo}
            className="mt-2 rounded-lg border border-accent/40 px-3 py-1.5 text-xs font-semibold text-accent hover:bg-accent/10 disabled:opacity-50"
          >
            {extraindo ? "Extraindo..." : "Extrair da nota"}
          </button>
          <p className="mt-1 text-xs text-muted">
            A foto usada para extrair os dados também fica anexada à despesa.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className={labelCls}>Competência</label>
            <DateInput
              name="data"

              defaultValue={despesa ? despesa.data.slice(0, 10) : hoje}
              className={inputCls}
            />
          </div>
          <div className="sm:col-span-2">
            <label className={labelCls}>Conta *</label>
            <select
              name="contaId"
              required
              defaultValue={despesa?.contaId ?? ""}
              className={inputCls}
            >
              <option value="">Selecione a conta</option>
              {grupos.map((g) => (
                <optgroup key={g.id} label={g.nome}>
                  {g.contas
                    .filter((c) => c.ativo || c.id === despesa?.contaId)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.codigo} · {c.nome}
                      </option>
                    ))}
                </optgroup>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>Filial</label>
            <input
              name="filial"
              list="filiais-despesa"
              defaultValue={despesa?.filial ?? ""}
              placeholder="Ex.: Matriz"
              className={inputCls}
            />
            <datalist id="filiais-despesa">
              {filiais.map((f) => (
                <option key={f} value={f} />
              ))}
            </datalist>
          </div>
          <div>
            <label className={labelCls}>Fornecedor</label>
            <input
              name="estabelecimento"
              defaultValue={despesa?.estabelecimento ?? ""}
              placeholder="Nome do fornecedor"
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>Documento</label>
            <input
              name="documento"
              defaultValue={despesa?.documento ?? ""}
              placeholder="NF 4521 ou boleto"
              className={inputCls}
            />
          </div>
          <div className="sm:col-span-2">
            <label className={labelCls}>Histórico</label>
            <input
              name="descricao"
              defaultValue={despesa?.descricao ?? ""}
              placeholder="Conta de energia de outubro"
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>Valor (R$) *</label>
            <input
              name="valor"
              type="number"
              step="0.01"
              min="0.01"
              required
              defaultValue={despesa?.valor}
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>Vencimento</label>
            <DateInput
              name="vencimento"

              defaultValue={despesa?.vencimento?.slice(0, 10) ?? ""}
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>Situação</label>
            <select name="situacao" defaultValue={despesa?.situacao ?? "PAGO"} className={inputCls}>
              <option value="PAGO">Pago</option>
              <option value="A_PAGAR">A pagar</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>Cliente (opcional)</label>
            <ComboBox
              opcoes={opcoesClientes}
              valor={clienteId}
              placeholder="Nenhum"
              onSelecionar={setClienteId}
              onCancelar={() => setClienteId("")}
              className="w-full"
            />
          </div>
          <div className="sm:col-span-2">
            <label className={labelCls}>Outras fotos (opcional)</label>
            <input name="fotos" type="file" accept="image/*" multiple className={fileCls} />
          </div>
        </div>

        {erro && <p role="alert" className="mt-3 text-sm text-amber-400">{erro}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={aoFechar}
            className="rounded-lg border border-surface-border px-4 py-2 text-sm font-semibold text-zinc-200 hover:bg-zinc-800"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={pendente}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground hover:brightness-110 disabled:opacity-50"
          >
            {pendente ? "Salvando..." : editando ? "Salvar alterações" : "Salvar lançamento"}
          </button>
        </div>
      </form>
    </DialogFrame>
  );
}
