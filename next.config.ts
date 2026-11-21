import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  devIndicators: false,
  experimental: {
    // Relatórios aceitam fotos de até 8 MB; o limite padrão de Server Actions
    // é menor e interromperia a criação antes da validação da aplicação.
    serverActions: { bodySizeLimit: "10mb" },
  },
  // pdfjs-dist (usado por pdf-to-img pra converter orçamento em imagem no
  // bot) resolve arquivos de worker em runtime — empacotado pelo Turbopack
  // ele quebra tentando ler um path numérico. Mantido fora do bundle,
  // carregado direto do node_modules em runtime (Node, não Edge). "canvas"
  // é binário nativo (node-canvas) — além de ficar fora do bundle, precisa
  // das libs de sistema (cairo/pango/jpeg/gif/rsvg) declaradas em
  // railpack.json (deploy.aptPackages) pro binário pré-compilado carregar
  // em runtime no container do Railway.
  // puppeteer-core e @sparticuz/chromium (PDF do relatório a partir da página
  // web) trazem binário e arquivos .br lidos do disco em runtime: ficam de fora
  // do bundle.
  serverExternalPackages: ["pdf-to-img", "pdfjs-dist", "canvas", "puppeteer-core", "@sparticuz/chromium"],
};

export default nextConfig;
