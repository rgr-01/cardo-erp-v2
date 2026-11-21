"use client";

import { useEffect, useState, useTransition } from "react";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Check, Plus, Trash2 } from "lucide-react";
import {
  atualizarFazenda,
  criarFazenda,
  excluirFazenda,
  listarFazendasDoCliente,
  type Fazenda,
} from "@/app/actions/fazendas";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";

type Rascunho = { nome: string; cidade: string; uf: string; area: string };

const VAZIO: Rascunho = { nome: "", cidade: "", uf: "", area: "" };

const inputCls =
  "w-full rounded-lg border border-surface-border bg-zinc-950 px-2.5 py-1.5 text-sm text-white outline-none focus:border-accent";

function paraRascunho(f: Fazenda): Rascunho {
  return {
    nome: f.nome,
    cidade: f.cidade ?? "",
    uf: f.uf ?? "",
    area: f.area != null ? String(f.area).replace(".", ",") : "",
  };
}

function paraInput(r: Rascunho) {
  const area = r.area.trim() ? Number(r.area.replace(/\./g, "").replace(",", ".")) : null;
  return { nome: r.nome, cidade: r.cidade || null, uf: r.uf || null, area };
}

// Fazendas de um cliente: um cliente pode ter várias, e o relatório de
// visita aponta de qual delas foi a visita.
export function FazendasModal({
  clienteId,
  clienteNome,
  ehAdmin,
  onFechar,
  onMudou,
}: {
  clienteId: string;
  clienteNome: string;
  ehAdmin: boolean;
  onFechar: () => void;
  onMudou?: (total: number) => void;
}) {
  const [fazendas, setFazendas] = useState<Fazenda[] | null>(null);
  const [edicoes, setEdicoes] = useState<Record<string, Rascunho>>({});
  const [nova, setNova] = useState<Rascunho>(VAZIO);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  const { confirmar } = useConfirm();

  function recarregar() {
    listarFazendasDoCliente(clienteId).then((r) => {
      if (!r.ok) return setErro(r.erro);
      setFazendas(r.fazendas);
      setEdicoes(Object.fromEntries(r.fazendas.map((f) => [f.id, paraRascunho(f)])));
      onMudou?.(r.fazendas.length);
    });
  }

  useEffect(() => {
    recarregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clienteId]);

  function executar(acao: () => Promise<{ ok: true } | { ok: false; erro: string }>, depois?: () => void) {
    setErro(null);
    iniciar(async () => {
      const r = await acao();
      if (!r.ok) return setErro(r.erro);
      depois?.();
      recarregar();
    });
  }

  function mudar(id: string, parcial: Partial<Rascunho>) {
    setEdicoes((atuais) => ({ ...atuais, [id]: { ...atuais[id], ...parcial } }));
  }

  return (
    <Modal open onClose={onFechar} title={`Fazendas — ${clienteNome}`} maxWidth="max-w-2xl">
      <div className="space-y-4">
        {fazendas === null ? (
          <p className="text-sm text-muted">Carregando…</p>
        ) : fazendas.length === 0 ? (
          <p className="text-sm text-muted">
            Nenhuma fazenda cadastrada. As fazendas aparecem na escolha do relatório de visita e na
            capa do PDF.
          </p>
        ) : (
          <div className="space-y-2">
            <div className="grid grid-cols-[1fr_8rem_3.5rem_5.5rem_4rem] gap-2 px-1 text-[11px] font-medium uppercase tracking-wider text-muted">
              <span>Nome</span>
              <span>Cidade</span>
              <span>UF</span>
              <span className="text-right">Área (ha)</span>
              <span />
            </div>
            {fazendas.map((f) => {
              const r = edicoes[f.id] ?? paraRascunho(f);
              const alterada = JSON.stringify(r) !== JSON.stringify(paraRascunho(f));
              return (
                <div key={f.id} className="grid grid-cols-[1fr_8rem_3.5rem_5.5rem_4rem] items-center gap-2">
                  <input className={inputCls} value={r.nome} onChange={(e) => mudar(f.id, { nome: e.target.value })} />
                  <input className={inputCls} value={r.cidade} onChange={(e) => mudar(f.id, { cidade: e.target.value })} />
                  <input
                    className={inputCls}
                    value={r.uf}
                    maxLength={2}
                    onChange={(e) => mudar(f.id, { uf: e.target.value.toUpperCase() })}
                  />
                  <input
                    className={`${inputCls} text-right`}
                    inputMode="decimal"
                    value={r.area}
                    onChange={(e) => mudar(f.id, { area: e.target.value })}
                  />
                  <div className="flex justify-end gap-1">
                    {alterada && (
                      <button
                        title="Salvar"
                        disabled={pendente || !r.nome.trim()}
                        onClick={() => executar(() => atualizarFazenda(f.id, paraInput(r)))}
                        className="rounded p-1 text-accent hover:bg-zinc-800 disabled:opacity-40"
                      >
                        <Check size={16} />
                      </button>
                    )}
                    {ehAdmin && (
                      <button
                        title="Excluir"
                        disabled={pendente}
                        onClick={async () => {
                          if (await confirmar({ mensagem: `Excluir a fazenda "${f.nome}"? Os relatórios dela ficam sem fazenda.`, confirmarLabel: "Excluir fazenda", variante: "perigo" })) {
                            executar(() => excluirFazenda(f.id));
                          }
                        }}
                        className="rounded p-1 text-secondary hover:bg-zinc-800 hover:text-red-400"
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="rounded-lg border border-surface-border p-3">
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted">Nova fazenda</p>
          <div className="grid grid-cols-[1fr_8rem_3.5rem_5.5rem] gap-2">
            <input
              className={inputCls}
              placeholder="Nome da fazenda"
              value={nova.nome}
              onChange={(e) => setNova({ ...nova, nome: e.target.value })}
            />
            <input
              className={inputCls}
              placeholder="Cidade"
              value={nova.cidade}
              onChange={(e) => setNova({ ...nova, cidade: e.target.value })}
            />
            <input
              className={inputCls}
              placeholder="UF"
              maxLength={2}
              value={nova.uf}
              onChange={(e) => setNova({ ...nova, uf: e.target.value.toUpperCase() })}
            />
            <input
              className={`${inputCls} text-right`}
              placeholder="Área"
              inputMode="decimal"
              value={nova.area}
              onChange={(e) => setNova({ ...nova, area: e.target.value })}
            />
          </div>
          <div className="mt-3 flex justify-end">
            <Button
              variant="primary"
              disabled={pendente || !nova.nome.trim()}
              onClick={() => executar(() => criarFazenda(clienteId, paraInput(nova)), () => setNova(VAZIO))}
            >
              <Plus size={15} /> Adicionar fazenda
            </Button>
          </div>
        </div>

        {erro && <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-red-400">{erro}</p>}
      </div>
    </Modal>
  );
}
