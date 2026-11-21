import { exigirModuloPagina } from "@/lib/modulos-servidor";

export default async function Layout({ children }: { children: React.ReactNode }) {
  await exigirModuloPagina("VENDAS");
  return children;
}
