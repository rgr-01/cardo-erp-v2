import { ClientesConteudo } from "@/components/clientes/clientes-conteudo";

export const metadata = { title: "Localização" };

export default function LocalizacaoPage() {
  return <ClientesConteudo modo="mapa" />;
}
