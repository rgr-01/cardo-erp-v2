import Link from "next/link";
import { ArrowDownLeft, ArrowUpRight, Wallet, Receipt } from "lucide-react";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { numeroDecimal } from "@/lib/dinheiro";
import { fmtBRL, fmtNum } from "@/lib/format";
import { Kpi } from "@/components/ui/kpi";
import { Card } from "@/components/ui/card";

export const metadata = { title: "Financeiro — Visão Geral" };

const MESES_ANTES = 2;
const MESES_DEPOIS = 3;

type Mes = { chave: string; rotulo: string; receber: number; recebido: number; pagar: number; pago: number };

function chaveMes(d: Date): string {
  return d.toISOString().slice(0, 7);
}

// Entradas = boletos dos pedidos e contas a receber avulsas (a receber pelo
// vencimento, recebido pela data de pagamento). Saídas = despesas e contas a
// pagar avulsas (a pagar pelo vencimento, pagas pela data do pagamento).
// Boleto sem valor usa o total do pedido.
export default async function FinanceiroVisaoGeralPage() {
  const session = await auth();
  if (session!.user.role !== "ADMIN") redirect("/dashboard");

  const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  const [ano, mes] = hoje.split("-").map(Number);
  const inicio = new Date(Date.UTC(ano, mes - 1 - MESES_ANTES, 1));
  const fim = new Date(Date.UTC(ano, mes + MESES_DEPOIS, 1));

  const [boletos, despesas, titulos] = await Promise.all([
    prisma.boleto.findMany({
      where: { status: { not: "CANCELADO" } },
      select: { status: true, valor: true, vencimento: true, dataPagamento: true, proposta: { select: { total: true } } },
    }),
    prisma.despesa.findMany({
      where: {
        OR: [
          { situacao: "A_PAGAR" },
          { situacao: "PAGO", data: { gte: inicio, lt: fim } },
        ],
      },
      select: { situacao: true, valor: true, vencimento: true, data: true },
    }),
    prisma.tituloFinanceiro.findMany({
      where: {
        OR: [
          { status: "ABERTO" },
          { status: "PAGO", dataPagamento: { gte: inicio, lt: fim } },
        ],
      },
      select: { tipo: true, status: true, valor: true, vencimento: true, dataPagamento: true },
    }),
  ]);

  const meses: Mes[] = [];
  for (let i = -MESES_ANTES; i <= MESES_DEPOIS; i++) {
    const d = new Date(Date.UTC(ano, mes - 1 + i, 1));
    meses.push({
      chave: chaveMes(d),
      rotulo: d.toLocaleDateString("pt-BR", { month: "short", year: "2-digit", timeZone: "UTC" }),
      receber: 0,
      recebido: 0,
      pagar: 0,
      pago: 0,
    });
  }
  const porChave = new Map(meses.map((m) => [m.chave, m]));

  let aReceber = 0;
  let receberVencido = 0;
  for (const b of boletos) {
    const valor = numeroDecimal(b.valor) || numeroDecimal(b.proposta.total);
    if (b.status === "PAGO") {
      if (b.dataPagamento) {
        const m = porChave.get(chaveMes(b.dataPagamento));
        if (m) m.recebido += valor;
      }
      continue;
    }
    aReceber += valor;
    if (b.vencimento) {
      if (b.vencimento.toISOString().slice(0, 10) < hoje) receberVencido += valor;
      const m = porChave.get(chaveMes(b.vencimento));
      if (m) m.receber += valor;
    }
  }

  let aPagar = 0;
  let pagarVencido = 0;
  for (const d of despesas) {
    const valor = numeroDecimal(d.valor);
    if (d.situacao === "PAGO") {
      const m = porChave.get(chaveMes(d.data));
      if (m) m.pago += valor;
      continue;
    }
    aPagar += valor;
    if (d.vencimento) {
      if (d.vencimento.toISOString().slice(0, 10) < hoje) pagarVencido += valor;
      const m = porChave.get(chaveMes(d.vencimento));
      if (m) m.pagar += valor;
    }
  }

  for (const t of titulos) {
    const valor = numeroDecimal(t.valor);
    const receber = t.tipo === "RECEBER";
    if (t.status === "PAGO") {
      const m = t.dataPagamento ? porChave.get(chaveMes(t.dataPagamento)) : undefined;
      if (m) {
        if (receber) m.recebido += valor;
        else m.pago += valor;
      }
      continue;
    }
    const vencido = t.vencimento.toISOString().slice(0, 10) < hoje;
    const m = porChave.get(chaveMes(t.vencimento));
    if (receber) {
      aReceber += valor;
      if (vencido) receberVencido += valor;
      if (m) m.receber += valor;
    } else {
      aPagar += valor;
      if (vencido) pagarVencido += valor;
      if (m) m.pagar += valor;
    }
  }

  const mesAtual = hoje.slice(0, 7);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-white">Visão geral</h1>
        <p className="text-xs text-muted">O que entra (boletos e contas a receber) e o que sai (despesas e contas a pagar), mês a mês</p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi rotulo="A receber" valor={fmtBRL(aReceber)} detalhe={`${fmtBRL(receberVencido)} vencido`} icone={ArrowDownLeft} />
        <Kpi rotulo="A pagar" valor={fmtBRL(aPagar)} detalhe={`${fmtBRL(pagarVencido)} vencido`} icone={ArrowUpRight} />
        <Kpi rotulo="Saldo previsto" valor={fmtBRL(aReceber - aPagar)} detalhe="A receber − a pagar" icone={Wallet} alerta={aReceber - aPagar < 0} />
        <Kpi
          rotulo="Boletos em aberto"
          icone={Receipt}
          valor={fmtNum(boletos.filter((b) => b.status !== "PAGO").length)}
          detalhe="Pendentes ou emitidos"
        />
      </div>

      <Card title="Fluxo por mês">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-surface-border text-left text-xs font-medium text-muted">
                <th className="px-3 py-2">Mês</th>
                <th className="px-3 py-2 text-right">Recebido</th>
                <th className="px-3 py-2 text-right">A receber</th>
                <th className="px-3 py-2 text-right">Pago</th>
                <th className="px-3 py-2 text-right">A pagar</th>
                <th className="px-3 py-2 text-right">Saldo do mês</th>
              </tr>
            </thead>
            <tbody>
              {meses.map((m) => {
                const saldo = m.recebido + m.receber - m.pago - m.pagar;
                return (
                  <tr
                    key={m.chave}
                    className={`border-b border-surface-border last:border-0 ${m.chave === mesAtual ? "bg-accent/5" : ""}`}
                  >
                    <td className="px-3 py-2 capitalize text-white">
                      {m.rotulo}
                      {m.chave === mesAtual && <span className="ml-2 text-xs text-accent">atual</span>}
                    </td>
                    <td className="px-3 py-2 text-right text-zinc-300">{fmtBRL(m.recebido)}</td>
                    <td className="px-3 py-2 text-right text-zinc-300">{fmtBRL(m.receber)}</td>
                    <td className="px-3 py-2 text-right text-zinc-300">{fmtBRL(m.pago)}</td>
                    <td className="px-3 py-2 text-right text-zinc-300">{fmtBRL(m.pagar)}</td>
                    <td className={`px-3 py-2 text-right font-semibold ${saldo < 0 ? "text-red-400" : "text-emerald-400"}`}>
                      {fmtBRL(saldo)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="flex flex-wrap gap-2 text-xs">
        <Link href="/financeiro/contas-a-pagar" className="rounded-lg border border-surface-border px-3 py-1.5 text-zinc-300 hover:border-accent hover:text-accent">
          Ver contas a pagar
        </Link>
        <Link href="/financeiro/cobranca" className="rounded-lg border border-surface-border px-3 py-1.5 text-zinc-300 hover:border-accent hover:text-accent">
          Ver contas a receber
        </Link>
        <Link href="/financeiro/faturamento" className="rounded-lg border border-surface-border px-3 py-1.5 text-zinc-300 hover:border-accent hover:text-accent">
          Resumo do faturamento
        </Link>
      </div>
    </div>
  );
}
