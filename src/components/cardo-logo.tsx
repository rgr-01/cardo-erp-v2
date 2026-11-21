// Marca do sistema (Cardo AI): duas setas » + nome. A cor do texto vem de
// `className` (currentColor); as setas usam o azul da Cardo.
// `produto`: mostra o nome do sistema ao lado (Cardo AI · Gestão Comercial Agro).
export function CardoLogo({
  className,
  mostrarNome = true,
  produto = false,
}: {
  className?: string;
  mostrarNome?: boolean;
  produto?: boolean;
}) {
  return (
    <span className={`inline-flex items-center gap-2 ${className ?? ""}`}>
      <svg viewBox="0 0 30 24" aria-hidden="true" className="h-[0.9em] w-auto">
        <path d="M3 3l9 9-9 9" fill="none" stroke="#2447E6" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
        <path
          d="M15 3l9 9-9 9"
          fill="none"
          stroke="#2447E6"
          strokeWidth="4.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.6"
        />
      </svg>
      {mostrarNome ? <span className="font-medium tracking-tight">Cardo AI</span> : <span className="sr-only">Cardo AI</span>}
      {produto && (
        <span className="font-normal opacity-70">
          <span aria-hidden className="mr-2 opacity-50">·</span>Gestão Comercial Agro
        </span>
      )}
    </span>
  );
}
