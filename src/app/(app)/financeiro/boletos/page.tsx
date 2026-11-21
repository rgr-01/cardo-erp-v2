import { usaFinanceiroAvulso } from "@/lib/servicos/financeiro-avulso";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { listarPedidosEmCarteira } from "@/lib/servicos/financeiro";
import { getSafraAtualId } from "@/lib/safra-atual";
import { numeroDecimal, numeroDecimalOuNulo } from "@/lib/dinheiro";
import { BoletosPainel } from "@/components/financeiro/boletos-painel";

export const metadata = { title: "Boletos" };

export default async function BoletosPage() {
  const session = await auth();
  const user = session!.user;
  if (user.role !== "ADMIN") redirect("/dashboard");
  // Só Financeiro (sem pedidos): notas e boletos ficam nas telas avulsas.
  if (await usaFinanceiroAvulso(user.id)) redirect("/financeiro/notas-avulsas");

  const sessao = { id: user.id, nome: user.nome, role: user.role };
  const pedidos = await listarPedidosEmCarteira(sessao, { safraId: await getSafraAtualId() });

  return (
    <BoletosPainel
      pedidos={pedidos.map((p) => ({
        id: p.id,
        codigo: p.codigo,
        clienteNome: p.clienteNome,
        consultorNome: p.consultorNome,
        total: numeroDecimal(p.total),
        boleto: p.boleto
          ? {
              status: p.boleto.status,
              numeroDocumento: p.boleto.numeroDocumento,
              valor: numeroDecimalOuNulo(p.boleto.valor),
              vencimento: p.boleto.vencimento?.toISOString() ?? null,
              dataPagamento: p.boleto.dataPagamento?.toISOString() ?? null,
              linhaDigitavel: p.boleto.linhaDigitavel,
              pdfUrl: p.boleto.pdfUrl,
              observacoes: p.boleto.observacoes,
            }
          : null,
      }))}
    />
  );
}
