import { ClientesConteudo } from "@/components/clientes/clientes-conteudo";

export const metadata = { title: "Clientes" };

export default function ClientesPage() {
  return <ClientesConteudo modo="lista" />;
}
