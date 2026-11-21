import type { Metadata } from "next";
import { ICONE_CARDO } from "@/lib/empresa-marca";
import { Space_Grotesk, Geist_Mono, Inter, Montserrat, Roboto, Merriweather, Lora } from "next/font/google";
import "./globals.css";

// Tipografia da marca (manual Rede Agro).
const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space-grotesk",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
});

// Fontes que o usuário escolhe nos blocos de texto do relatório (FONTES_TEXTO).
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", preload: false });
const montserrat = Montserrat({ subsets: ["latin"], variable: "--font-montserrat", preload: false });
// Roboto e Merriweather são fontes variáveis no Google: pesos fixos geram faces
// 400/700 com o mesmo arquivo, o que quebra o next/font no Turbopack.
const roboto = Roboto({ subsets: ["latin"], style: ["normal", "italic"], variable: "--font-roboto", preload: false });
const merriweather = Merriweather({ subsets: ["latin"], style: ["normal", "italic"], variable: "--font-merriweather", preload: false });
const lora = Lora({ subsets: ["latin"], variable: "--font-lora", preload: false });

// Padrão do sistema (Cardo AI); a área logada troca o ícone pelo da empresa.
export const metadata: Metadata = {
  title: "Cardo AI · Gestão Comercial Agro",
  description: "Planejamento de vendas e dashboard comercial",
  icons: { icon: ICONE_CARDO },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pt-BR"
      className={`h-full antialiased ${spaceGrotesk.variable} ${geistMono.variable} ${inter.variable} ${montserrat.variable} ${roboto.variable} ${merriweather.variable} ${lora.variable}`}
    >
      <body className="min-h-full flex flex-col bg-zinc-950 text-zinc-100">
        {children}
      </body>
    </html>
  );
}
