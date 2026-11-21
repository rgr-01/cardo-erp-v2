"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { FiltroConsultores } from "@/components/ui/filtro-consultores";

// Filtro de consultores do dashboard: guarda a escolha na URL (?consultor=a,b)
// para a página recarregar os dados no servidor.
export function FiltroConsultor({
  consultores,
}: {
  consultores: { id: string; nome: string }[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const validos = new Set(consultores.map((c) => c.id));
  const selecionados = (searchParams.get("consultor") ?? "").split(",").filter((id) => validos.has(id));

  function mudar(ids: string[]) {
    router.push(ids.length > 0 ? `/dashboard?consultor=${ids.join(",")}` : "/dashboard");
  }

  return <FiltroConsultores consultores={consultores} selecionados={selecionados} aoMudar={mudar} />;
}
