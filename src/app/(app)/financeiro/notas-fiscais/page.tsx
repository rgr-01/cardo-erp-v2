import { usaFinanceiroAvulso } from "@/lib/servicos/financeiro-avulso";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { listarPedidosEmCarteira } from "@/lib/servicos/financeiro";
import { getSafraAtualId } from "@/lib/safra-atual";
import { numeroDecimal, numeroDecimalOuNulo } from "@/lib/dinheiro";
import { NotasFiscaisPainel } from "@/components/financeiro/notas-fiscais-painel";

export const metadata = { title: "Notas fiscais" };

export default async function NotasFiscaisPage() {
  const session = await auth();
  const user = session!.user;
  if (user.role !== "ADMIN") redirect("/dashboard");
  // Só Financeiro (sem pedidos): notas e boletos ficam nas telas avulsas.
  if (await usaFinanceiroAvulso(user.id)) redirect("/financeiro/notas-avulsas");

  const sessao = { id: user.id, nome: user.nome, role: user.role };
  const pedidos = await listarPedidosEmCarteira(sessao, { safraId: await getSafraAtualId() });

  return (
    <NotasFiscaisPainel
      pedidos={pedidos.map((p) => ({
        id: p.id,
        codigo: p.codigo,
        clienteNome: p.clienteNome,
        consultorNome: p.consultorNome,
        total: numeroDecimal(p.total),
        notaFiscal: p.notaFiscal
          ? {
              status: p.notaFiscal.status,
              numero: p.notaFiscal.numero,
              serie: p.notaFiscal.serie,
              chaveAcesso: p.notaFiscal.chaveAcesso,
              valor: numeroDecimalOuNulo(p.notaFiscal.valor),
              dataEmissao: p.notaFiscal.dataEmissao?.toISOString() ?? null,
              pdfUrl: p.notaFiscal.pdfUrl,
              xmlUrl: p.notaFiscal.xmlUrl,
              observacoes: p.notaFiscal.observacoes,
              referencia: p.notaFiscal.referencia,
              mensagemErro: p.notaFiscal.mensagemErro,
            }
          : null,
      }))}
    />
  );
}
