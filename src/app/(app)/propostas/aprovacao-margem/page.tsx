import { redirect } from "next/navigation";
import { auth } from "@/auth";
import {
  listarOrcamentosAguardandoMargem,
  listarPropostasAguardandoConferencia,
} from "@/lib/servicos/propostas";
import { AprovacaoMargemPainel } from "@/components/propostas/aprovacao-margem-painel";
import { assinarUrlArmazenada } from "@/lib/storage";
import { getSafraAtualId } from "@/lib/safra-atual";
import { numeroDecimal, numeroDecimalOuNulo } from "@/lib/dinheiro";

export const metadata = { title: "Aprovações" };

export default async function AprovacaoMargemPage() {
  const session = await auth();
  const user = session!.user;
  if (user.role !== "ADMIN") redirect("/propostas");

  const sessao = { id: user.id, nome: user.nome, role: user.role };
  const safraId = await getSafraAtualId();
  const [pedidos, aguardandoConferencia] = await Promise.all([
    listarOrcamentosAguardandoMargem(sessao, { safraId }),
    listarPropostasAguardandoConferencia(sessao, { safraId }),
  ]);

  return (
    <AprovacaoMargemPainel
      pedidos={pedidos.map((p) => ({
        id: p.id,
        codigo: p.codigo,
        clienteNome: p.cliente.nome,
        consultorNome: p.consultor.nome,
        safraNome: p.safra.nome,
        validade: p.validade,
        total: numeroDecimal(p.total),
        margemPct: p.margemPct,
        itens: p.itens.map((item) => ({
          id: item.id,
          produtoNome: item.produtoNome,
          fornecedorNome: item.fornecedorNome,
          cultura: item.cultura,
          volume: item.volume,
          valorUnitario: numeroDecimal(item.valorUnitario),
          custoUnitario: numeroDecimalOuNulo(item.custoUnitario),
          total: numeroDecimal(item.total),
        })),
      }))}
      aguardandoConferencia={await Promise.all(aguardandoConferencia.map(async (p) => ({
        id: p.id,
        codigo: p.codigo,
        clienteNome: p.cliente.nome,
        consultorNome: p.consultor.nome,
        total: numeroDecimal(p.total),
        statusAssinatura: p.statusAssinatura,
        pdfAssinadoUrl: p.pdfAssinadoUrl ? await assinarUrlArmazenada({ url: p.pdfAssinadoUrl }) : null,
      })))}
    />
  );
}
