import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { listarEmCarteira } from "@/lib/servicos/propostas";
import { getSafraAtual } from "@/lib/safra-atual";
import { assinarUrlArmazenada } from "@/lib/storage";
import { numeroDecimal, numeroDecimalOuNulo } from "@/lib/dinheiro";
import { EmCarteiraTable, type FaturamentoResumo } from "@/components/propostas/em-carteira-table";

export const metadata = { title: "Em carteira" };

const diaBrasilia = (d: Date) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(d);

function somar(notas: { valor: number }[]) {
  return notas.reduce((s, n) => s + n.valor, 0);
}

async function resumoFaturamento(
  sessao: { id: string; role: string },
  safraId: string,
  hoje: string,
  carteiraAFaturar: number
): Promise<FaturamentoResumo> {
  const [ano, mes, dia] = hoje.split("-").map(Number);
  const inicioMesAnterior = new Date(Date.UTC(ano, mes - 2, 1));
  const escopo = sessao.role === "ADMIN" ? {} : { proposta: { consultorId: sessao.id } };

  // Notas emitidas desde o mês anterior (para mês, dia e comparações) e as da
  // safra inteira. Valor da nota; se estiver vazio, o total do pedido.
  const [recentes, daSafra] = await Promise.all([
    prisma.notaFiscal.findMany({
      where: { status: "EMITIDA", dataEmissao: { gte: inicioMesAnterior }, proposta: { safraId, ...(escopo.proposta ?? {}) } },
      select: { valor: true, dataEmissao: true, proposta: { select: { total: true } } },
    }),
    prisma.notaFiscal.findMany({
      where: { status: "EMITIDA", proposta: { safraId, ...(escopo.proposta ?? {}) } },
      select: { valor: true, proposta: { select: { total: true } } },
    }),
  ]);

  const valorDe = (n: { valor: unknown; proposta: { total: unknown } }) =>
    numeroDecimalOuNulo(n.valor as never) ?? numeroDecimal(n.proposta.total as never);
  const notas = recentes
    .filter((n) => n.dataEmissao)
    .map((n) => ({ dia: diaBrasilia(n.dataEmissao!), valor: valorDe(n) }));

  const chaveMes = `${ano}-${String(mes).padStart(2, "0")}`;
  const anterior = new Date(Date.UTC(ano, mes - 2, 1));
  const chaveMesAnt = `${anterior.getUTCFullYear()}-${String(anterior.getUTCMonth() + 1).padStart(2, "0")}`;
  const semanaPassada = diaBrasilia(new Date(Date.UTC(ano, mes - 1, dia - 7, 12)));

  const doMes = notas.filter((n) => n.dia.startsWith(chaveMes));
  const mesAnterior = notas.filter((n) => n.dia.startsWith(chaveMesAnt) && Number(n.dia.slice(8)) <= dia);
  const doDia = notas.filter((n) => n.dia === hoje);
  const diaSemanaPassada = notas.filter((n) => n.dia === semanaPassada);
  const diasNoMes = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  const porDia = Array.from({ length: diasNoMes }, (_, i) =>
    somar(doMes.filter((n) => Number(n.dia.slice(8)) === i + 1))
  );

  return {
    safra: somar(daSafra.map((n) => ({ valor: valorDe(n) }))),
    notasSafra: daSafra.length,
    carteiraAFaturar,
    mes: somar(doMes),
    notasMes: doMes.length,
    mesAnterior: somar(mesAnterior),
    mesAnteriorRotulo: chaveMesAnt,
    porDia,
    dia: somar(doDia),
    notasDia: doDia.length,
    semanaPassada: somar(diaSemanaPassada),
  };
}

export default async function EmCarteiraPage() {
  const session = await auth();
  const user = session!.user;
  const sessao = { id: user.id, nome: user.nome, role: user.role };
  const safra = await getSafraAtual();
  const hoje = diaBrasilia(new Date());

  const todas = await listarEmCarteira(sessao);
  const propostas = todas.filter((p) => p.safra.id === safra.id);

  const linhas = await Promise.all(
    propostas.map(async (p) => ({
      id: p.id,
      codigo: p.codigo,
      clienteNome: p.cliente.nome,
      consultorNome: p.consultor.nome,
      total: p.total,
      statusAssinatura: p.statusAssinatura,
      pdfAssinadoUrl: p.pdfAssinadoUrl
        ? await assinarUrlArmazenada({ url: p.pdfAssinadoUrl })
        : null,
      criadoEm: p.criadoEm ?? "",
      previsaoEntrega: p.previsaoEntrega,
      condicaoPagamento: p.condicaoPagamento,
      localEntrega: p.localEntrega,
      frete: p.frete,
      autorizadoFaturarEm: p.autorizadoFaturarEm,
      vendaFaturada: p.vendaFaturada,
      itens: p.itens.map((i) => ({
        id: i.id,
        produtoNome: i.produtoNome,
        volume: i.volume,
        unidade: i.unidade,
        valorUnitario: i.valorUnitario,
        total: i.total,
      })),
    }))
  );

  const aFaturar = linhas
    .filter((l) => !l.vendaFaturada)
    .reduce((s, l) => s + l.total, 0);

  return (
    <EmCarteiraTable
      propostas={linhas}
      safraNome={safra.nome}
      hoje={hoje}
      faturamento={await resumoFaturamento(sessao, safra.id, hoje, aFaturar)}
    />
  );
}
