"use client";

import { useMemo, useState } from "react";
import { ClientesTable, type ClienteLinha, type ConsultorOpcao } from "@/components/clientes/clientes-table";
import dynamic from "next/dynamic";
import { coresPadrao } from "@/lib/cores-consultor";
import { FiltroConsultores } from "@/components/ui/filtro-consultores";
import { definirCorConsultor, restaurarCoresPadrao } from "@/app/actions/cores-consultor";

// Leaflet é pesado e depende de `window`: fica fora do bundle inicial e do SSR.
const ClientesMapa = dynamic(
  () => import("@/components/clientes/clientes-mapa").then((m) => m.ClientesMapa),
  {
    ssr: false,
    loading: () => (
      <div className="h-[calc(100vh-180px)] min-h-[420px] w-full animate-pulse rounded-xl border border-surface-border bg-zinc-900 md:h-[calc(100vh-120px)]" />
    ),
  }
);

type Modo = "mapa" | "lista";

export function ClientesPainel({
  clientes,
  ehAdmin,
  consultores,
  coresEscolhidas,
  modo,
}: {
  modo: Modo;
  clientes: ClienteLinha[];
  ehAdmin: boolean;
  consultores: ConsultorOpcao[];
  // Cores que o admin escolheu (consultorId -> #rrggbb); as demais usam a padrão.
  coresEscolhidas: Record<string, string>;
}) {
  const [filtroConsultores, setFiltroConsultores] = useState<string[]>([]);
  const [escolhidas, setEscolhidas] = useState(coresEscolhidas);
  const cores = useMemo(
    () => ({ ...coresPadrao(consultores.map((c) => c.id)), ...escolhidas }),
    [consultores, escolhidas]
  );

  // Atualiza na hora e grava; se a gravação falhar, volta ao que estava.
  async function mudarCor(consultorId: string, cor: string | null) {
    const antes = escolhidas;
    setEscolhidas((atual) => {
      const novo = { ...atual };
      if (cor) novo[consultorId] = cor;
      else delete novo[consultorId];
      return novo;
    });
    const r = await definirCorConsultor(consultorId, cor);
    if (!r.ok) setEscolhidas(antes);
  }

  async function restaurarTodas() {
    const antes = escolhidas;
    setEscolhidas({});
    const r = await restaurarCoresPadrao();
    if (!r.ok) setEscolhidas(antes);
  }

  const clientesFiltrados = useMemo(() => {
    if (filtroConsultores.length === 0) return clientes;
    const ids = new Set(filtroConsultores);
    return clientes.filter((c) => c.consultorId && ids.has(c.consultorId));
  }, [clientes, filtroConsultores]);

  // Clientes de cada consultor (mostrado na lista do filtro).
  const contagens = useMemo(() => {
    const mapa: Record<string, number> = {};
    for (const c of clientes) if (c.consultorId) mapa[c.consultorId] = (mapa[c.consultorId] ?? 0) + 1;
    return mapa;
  }, [clientes]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-white">{modo === "mapa" ? "Localização" : "Clientes"}</h1>
        {ehAdmin && (
          <FiltroConsultores
            consultores={consultores}
            selecionados={filtroConsultores}
            aoMudar={setFiltroConsultores}
            cores={cores}
            contagens={contagens}
          />
        )}
      </div>

      {modo === "mapa" ? (
        <ClientesMapa
          clientes={clientesFiltrados}
          ehAdmin={ehAdmin}
          cores={cores}
          escolhidas={escolhidas}
          aoMudarCor={mudarCor}
          aoRestaurarCores={restaurarTodas}
        />
      ) : (
        <ClientesTable
          key={filtroConsultores.join(",")}
          clientes={clientesFiltrados}
          ehAdmin={ehAdmin}
          consultores={consultores}
          cores={cores}
        />
      )}
    </div>
  );
}
