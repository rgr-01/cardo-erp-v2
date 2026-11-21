"use client";

import { useMarcaEmpresa } from "@/components/marca-empresa";

// Logo da empresa do contexto (MarcaEmpresaProvider). Sem provedor, a logo
// oficial da Rede Agro (vetores do manual, em public/marca).
// "claro" = para fundo claro; "escuro" = versão branca.
export function Logo({
  fundo = "escuro",
  variante = "horizontal",
  className,
}: {
  fundo?: "claro" | "escuro";
  variante?: "horizontal" | "empilhada";
  className?: string;
}) {
  const marca = useMarcaEmpresa();
  if (marca) {
    const src = fundo === "escuro" ? (marca.escuro ?? marca.claro) : (marca.claro ?? marca.escuro);
    if (!src) {
      return <span className={`inline-flex items-center font-bold ${fundo === "escuro" ? "text-white" : "text-marca-azul"} ${className ?? ""}`}>{marca.nome}</span>;
    }
    // A empilhada só existe nos arquivos da Rede Agro; as demais usam a horizontal.
    const final = variante === "empilhada" && src.startsWith("/marca/logo") ? src.replace("/marca/logo", "/marca/logo-empilhado") : src;
    // eslint-disable-next-line @next/next/no-img-element -- logo da empresa (SVG/PNG de tamanho livre)
    return <img src={final} alt={marca.nome} className={`${className ?? ""} object-contain`} />;
  }
  const arquivo = variante === "empilhada" ? "logo-empilhado" : "logo";
  const sufixo = fundo === "escuro" ? "-branco" : "";
  return (
    // eslint-disable-next-line @next/next/no-img-element -- SVG estático, sem ganho no next/image
    <img src={`/marca/${arquivo}${sufixo}.svg`} alt="Rede Agro" className={className} />
  );
}
