import { auth } from "@/auth";
import { whatsappConfigurado, numeroDoBot } from "@/lib/whatsapp/transporte";
import { listarVinculos, normalizarModoResposta } from "@/lib/whatsapp/vinculo";
import { WhatsappPainel } from "@/components/whatsapp/whatsapp-painel";

export const metadata = { title: "WhatsApp" };

export default async function WhatsappPage() {
  const session = await auth();
  const ehAdmin = session!.user.role === "ADMIN";
  const vinculos = await listarVinculos(session!.user.id);

  return (
    <WhatsappPainel
      numeros={vinculos.map((v) => ({
        id: v.id,
        waId: v.waId!,
        modoResposta: normalizarModoResposta(v.modoResposta),
        receberRelatorioMensal: v.receberRelatorioMensal,
        receberAlertasSeguranca: v.receberAlertasSeguranca,
        receberAlertasMargem: v.receberAlertasMargem,
        receberNotificacoesPedidos: v.receberNotificacoesPedidos,
      }))}
      ehAdmin={ehAdmin}
      // Admin vincula quantos números quiser; consultor, um só.
      podeVincularOutro={ehAdmin || vinculos.length === 0}
      numeroConfigurado={whatsappConfigurado()}
      numeroDoBot={numeroDoBot()}
    />
  );
}
