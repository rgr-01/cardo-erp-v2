import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { listarPedidosEmCarteira } from "@/lib/servicos/financeiro";
import { getSafraAtualId } from "@/lib/safra-atual";
import { numeroDecimal, numeroDecimalOuNulo } from "@/lib/dinheiro";
import { CobrancaPainel } from "@/components/financeiro/cobranca-painel";
import { linhasTitulos, opcoesClientesFinanceiro, usaFinanceiroAvulso } from "@/lib/servicos/financeiro-avulso";
import { provedorBoleto } from "@/lib/fiscal/provedores";
import { TitulosAvulsosPainel } from "@/components/financeiro/titulos-avulsos-painel";

export const metadata = { title: "Contas a receber" };

export default async function CobrancaPage() {
  const session = await auth();
  const user = session!.user;
  if (user.role !== "ADMIN") redirect("/dashboard");

  const sessao = { id: user.id, nome: user.nome, role: user.role };
  const pedidos = await listarPedidosEmCarteira(sessao, { safraId: await getSafraAtualId() });

  // Todos os boletos da safra (menos cancelados): a tela filtra em aberto,
  // vencidos e pagos.
  const cobrancas = pedidos
    .filter((p) => p.boleto && p.boleto.status !== "CANCELADO")
    .map((p) => ({
      id: p.id,
      codigo: p.codigo,
      clienteNome: p.clienteNome,
      consultorNome: p.consultorNome,
      total: numeroDecimal(p.total),
      vencimento: p.boleto!.vencimento?.toISOString() ?? null,
      valor: numeroDecimalOuNulo(p.boleto!.valor),
      status: p.boleto!.status,
      dataPagamento: p.boleto!.dataPagamento?.toISOString() ?? null,
    }));

  const avulso = await usaFinanceiroAvulso(user.id);
  const [titulos, clientes] = avulso ? await Promise.all([linhasTitulos(sessao, "RECEBER"), opcoesClientesFinanceiro()]) : [[], []];
  const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());

  return (
    <div className="space-y-6">
      {!avulso && <CobrancaPainel cobrancas={cobrancas} />}
      {avulso && <TitulosAvulsosPainel tipo="RECEBER" titulos={titulos} clientes={clientes} hoje={hoje} provedorBoleto={provedorBoleto()?.nome ?? null} />}
    </div>
  );
}
