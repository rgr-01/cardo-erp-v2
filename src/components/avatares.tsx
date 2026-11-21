// Bonequinhos para a foto de perfil: desenhados em SVG, sem imagens externas.

type Cabelo = "curto" | "longo" | "careca" | "cacheado" | "topete";
type Chapeu = "palha" | "bone" | null;

export type Boneco = {
  id: string;
  fundo: string;
  pele: string;
  cabelo: Cabelo;
  corCabelo: string;
  camisa: string;
  chapeu?: Chapeu;
  barba?: boolean;
  oculos?: boolean;
};

export const BONECOS: Boneco[] = [
  { id: "b1", fundo: "#bbf7d0", pele: "#f1c9a5", cabelo: "curto", corCabelo: "#3b2a1e", camisa: "#16a34a", chapeu: "palha" },
  { id: "b2", fundo: "#fde68a", pele: "#8d5a3b", cabelo: "curto", corCabelo: "#1f1611", camisa: "#2563eb", chapeu: "bone" },
  { id: "b3", fundo: "#bfdbfe", pele: "#f5d5b8", cabelo: "longo", corCabelo: "#a5612c", camisa: "#db2777" },
  { id: "b4", fundo: "#fecaca", pele: "#c68a5f", cabelo: "cacheado", corCabelo: "#1f1611", camisa: "#f59e0b" },
  { id: "b5", fundo: "#ddd6fe", pele: "#f1c9a5", cabelo: "topete", corCabelo: "#d6a54a", camisa: "#0f766e", oculos: true },
  { id: "b6", fundo: "#a7f3d0", pele: "#6b4129", cabelo: "careca", corCabelo: "#1f1611", camisa: "#7c3aed", barba: true },
  { id: "b7", fundo: "#fed7aa", pele: "#f5d5b8", cabelo: "curto", corCabelo: "#8a8a8a", camisa: "#334155", barba: true, chapeu: "palha" },
  { id: "b8", fundo: "#bae6fd", pele: "#c68a5f", cabelo: "longo", corCabelo: "#1f1611", camisa: "#16a34a", oculos: true },
  { id: "b9", fundo: "#fbcfe8", pele: "#f1c9a5", cabelo: "cacheado", corCabelo: "#7c2d12", camisa: "#0ea5e9" },
  { id: "b10", fundo: "#d9f99d", pele: "#8d5a3b", cabelo: "topete", corCabelo: "#1f1611", camisa: "#dc2626", chapeu: "bone" },
  { id: "b11", fundo: "#e9d5ff", pele: "#f5d5b8", cabelo: "curto", corCabelo: "#d6a54a", camisa: "#ea580c", oculos: true },
  { id: "b12", fundo: "#99f6e4", pele: "#6b4129", cabelo: "curto", corCabelo: "#0f0a07", camisa: "#facc15", chapeu: "palha", barba: true },
];

const CACHOS: [number, number][] = [[32, 36], [40, 28], [50, 25], [60, 28], [68, 36], [30, 46], [70, 46]];

function cabeloAtras(b: Boneco) {
  if (b.cabelo === "longo") return <path d="M28 52c-4-26 8-38 22-38s26 12 22 38l-2 22H30z" fill={b.corCabelo} />;
  return null;
}

function cabeloFrente(b: Boneco) {
  const c = b.corCabelo;
  switch (b.cabelo) {
    case "curto":
      return <path d="M30 42c-1-16 9-24 20-24s21 8 20 24c-4-8-10-11-20-11s-16 3-20 11z" fill={c} />;
    case "longo":
      return <path d="M30 46c-2-18 8-28 20-28s22 10 20 28c-5-10-11-14-20-14s-15 4-20 14z" fill={c} />;
    case "topete":
      return <path d="M30 42c-3-14 6-26 22-26 9 0 16 5 18 12-6-4-14-3-20-1-8 2-14 7-20 15z" fill={c} />;
    case "cacheado":
      return (
        <g fill={c}>
          {CACHOS.map(([x, y]) => (
            <circle key={`${x}-${y}`} cx={x} cy={y} r="9" />
          ))}
        </g>
      );
    default:
      return null;
  }
}

function chapeu(b: Boneco) {
  if (b.chapeu === "palha")
    return (
      <g>
        <ellipse cx="50" cy="32" rx="34" ry="8" fill="#e6c373" />
        <path d="M32 32c0-14 8-20 18-20s18 6 18 20z" fill="#f0d489" />
        <rect x="32" y="27" width="36" height="4" fill="#b8532a" />
      </g>
    );
  if (b.chapeu === "bone")
    return (
      <g>
        <path d="M30 36c0-14 8-20 20-20s20 6 20 20z" fill="#16a34a" />
        <path d="M44 36h40c0 4-8 6-20 5z" fill="#15803d" />
      </g>
    );
  return null;
}

export function BonecoSvg({ boneco: b, tamanho }: { boneco: Boneco; tamanho?: number }) {
  return (
    <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" width={tamanho ?? "100%"} height={tamanho ?? "100%"}>
      <rect width="100" height="100" fill={b.fundo} />
      {cabeloAtras(b)}
      <path d="M12 100c0-18 16-26 38-26s38 8 38 26z" fill={b.camisa} />
      <rect x="43" y="62" width="14" height="14" rx="4" fill={b.pele} />
      <circle cx="50" cy="48" r="21" fill={b.pele} />
      <circle cx="29.5" cy="50" r="4" fill={b.pele} />
      <circle cx="70.5" cy="50" r="4" fill={b.pele} />
      {b.barba && <path d="M31 52c2 20 38 20 38 0-4 8-10 10-19 10s-15-2-19-10z" fill={b.corCabelo} opacity="0.9" />}
      {cabeloFrente(b)}
      <circle cx="42" cy="48" r="2.4" fill="#2a1d14" />
      <circle cx="58" cy="48" r="2.4" fill="#2a1d14" />
      {b.oculos && (
        <g fill="none" stroke="#1f2937" strokeWidth="1.8">
          <circle cx="42" cy="48" r="6.5" />
          <circle cx="58" cy="48" r="6.5" />
          <path d="M48.5 48h3" />
        </g>
      )}
      <path d="M43 58c3 4 11 4 14 0" fill="none" stroke="#2a1d14" strokeWidth="2" strokeLinecap="round" />
      {chapeu(b)}
    </svg>
  );
}

// Renderiza o boneco num JPEG quadrado, no mesmo formato da foto enviada.
export async function bonecoParaBlob(b: Boneco, lado = 256): Promise<Blob> {
  const { renderToStaticMarkup } = await import("react-dom/server");
  const svg = renderToStaticMarkup(<BonecoSvg boneco={b} tamanho={lado} />);
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  try {
    const img = new Image();
    await new Promise<void>((ok, erro) => {
      img.onload = () => ok();
      img.onerror = () => erro(new Error("Não foi possível desenhar o avatar."));
      img.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = lado;
    canvas.height = lado;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Não foi possível processar a imagem.");
    ctx.drawImage(img, 0, 0, lado, lado);
    return await new Promise<Blob>((ok, erro) =>
      canvas.toBlob((r) => (r ? ok(r) : erro(new Error("Falha ao processar a imagem."))), "image/jpeg", 0.92),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}
