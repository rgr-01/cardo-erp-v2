import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { listarNotasAvulsas, opcoesClientesFinanceiro, usaFinanceiroAvulso } from "@/lib/servicos/financeiro-avulso";
import { provedorNota } from "@/lib/fiscal/provedores";
import { NotasAvulsasPainel } from "@/components/financeiro/notas-avulsas-painel";

export const metadata = { title: "Notas avulsas" };

export default async function NotasAvulsasPage() {
  const session = await auth();
  const user = session!.user;
  if (user.role !== "ADMIN") redirect("/dashboard");
  if (!(await usaFinanceiroAvulso(user.id))) redirect("/financeiro/notas-fiscais");

  const sessao = { id: user.id, nome: user.nome, role: user.role };
  const [notas, clientes] = await Promise.all([listarNotasAvulsas(sessao), opcoesClientesFinanceiro()]);
  const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());

  return (
    <NotasAvulsasPainel
      hoje={hoje}
      clientes={clientes}
      provedorNota={provedorNota()?.nome ?? null}
      notas={notas.map((n) => ({
        id: n.id,
        clienteNome: n.cliente.nome,
        naturezaOperacao: n.naturezaOperacao,
        valorTotal: Number(n.valorTotal),
        status: n.status,
        numero: n.numero,
        serie: n.serie,
        dataEmissao: n.dataEmissao?.toISOString() ?? null,
        pdfUrl: n.pdfUrl,
        xmlUrl: n.xmlUrl,
        provedor: n.provedor,
        mensagemErro: n.mensagemErro,
        qtdParcelas: n.titulos.length,
        criadaEm: n.createdAt.toISOString(),
      }))}
    />
  );
}
