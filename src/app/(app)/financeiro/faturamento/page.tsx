import { usaFinanceiroAvulso } from "@/lib/servicos/financeiro-avulso";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getSafraAtualId } from "@/lib/safra-atual";
import { getResumoFinanceiro } from "@/lib/servicos/financeiro";
import { fmtBRL, fmtNum } from "@/lib/format";
import { Kpi } from "@/components/ui/kpi";
import { Card } from "@/components/ui/card";
import { EvolucaoFaturamento } from "@/components/dashboard/graficos-painel";
import { Wallet, CircleDollarSign, FileClock, CalendarClock } from "lucide-react";

export const metadata = { title: "Resumo do faturamento" };

export default async function FinanceiroPage() {
  const session = await auth();
  const user = session!.user;
  if (user.role !== "ADMIN") redirect("/dashboard");
  // Só Financeiro (sem pedidos): notas e boletos ficam nas telas avulsas.
  if (await usaFinanceiroAvulso(user.id)) redirect("/financeiro/notas-avulsas");

  const sessao = { id: user.id, nome: user.nome, role: user.role };
  const safraId = await getSafraAtualId();
  const resumo = await getResumoFinanceiro(sessao, safraId);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-white">Resumo do faturamento</h1>
        <p className="text-xs text-muted">Resumo financeiro dos pedidos em carteira</p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi rotulo="Em carteira" valor={fmtBRL(resumo.totalEmCarteira)} detalhe="Aguardando faturamento" icone={Wallet} />
        <Kpi rotulo="Faturado" valor={fmtBRL(resumo.totalFaturado)} detalhe="Nota + boleto em dia" icone={CircleDollarSign} />
        <Kpi
          rotulo="Notas pendentes"
          icone={FileClock}
          valor={fmtNum(resumo.qtdNotasPendentes)}
          detalhe="Com emissão solicitada sem NF"
        />
        <Kpi
          rotulo="Boletos vencidos"
          icone={CalendarClock}
          alerta={resumo.qtdBoletosVencidos > 0}
          valor={fmtNum(resumo.qtdBoletosVencidos)}
          detalhe={`${fmtNum(resumo.qtdBoletosPendentes)} ainda sem emitir`}
        />
      </div>

      <Card title="Evolução do faturamento">
        <EvolucaoFaturamento data={resumo.evolucaoFaturamento} />
      </Card>
    </div>
  );
}
