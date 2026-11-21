import { auth } from "@/auth";
import { getDashboardData } from "@/lib/dashboard";
import { getSafraAtualId } from "@/lib/safra-atual";
import { ApresentacaoSlideshow } from "@/components/apresentacao/ApresentacaoSlideshow";

export const metadata = { title: "Apresentação" };

export default async function ApresentacaoPage() {
  const session = await auth();
  const user = session!.user;
  const ehAdmin = user.role === "ADMIN";
  const safraId = await getSafraAtualId();
  const dados = await getDashboardData(safraId, ehAdmin ? undefined : user.id);

  return <ApresentacaoSlideshow dados={dados} isAdmin={ehAdmin} />;
}
