// Limites do plano da empresa (definidos no painel master). Nulo = sem limite.
// Chamado antes de criar usuário ou relatório: estoura com mensagem clara em
// vez de deixar passar do contratado.

import { prisma, empresaIdAtual } from "@/lib/prisma";

export function inicioDoMes(agora = new Date()): Date {
  return new Date(agora.getFullYear(), agora.getMonth(), 1);
}

// Uso atual da empresa, pro painel master mostrar ao lado dos limites.
// Conta a partir da Empresa (modelo sem filtro de tenant): vale tanto no painel
// master quanto dentro da própria empresa, sem depender do contexto.
export async function usoDaEmpresa(empresaId: string) {
  const empresa = await prisma.empresa.findUnique({
    where: { id: empresaId },
    select: {
      _count: {
        select: {
          users: { where: { ativo: true } },
          // Importados de outra plataforma (idExterno) não contam no plano.
          relatorioVisitas: { where: { createdAt: { gte: inicioDoMes() }, idExterno: null } },
        },
      },
    },
  });
  return { usuariosAtivos: empresa?._count.users ?? 0, relatoriosNoMes: empresa?._count.relatorioVisitas ?? 0 };
}

async function limitesDaEmpresaAtual() {
  const empresaId = await empresaIdAtual();
  if (!empresaId) return null;
  const empresa = await prisma.empresa.findUnique({
    where: { id: empresaId },
    select: { limiteUsuarios: true, limiteRelatoriosMes: true },
  });
  return empresa ? { empresaId, ...empresa } : null;
}

export async function exigirVagaDeUsuario(): Promise<void> {
  const limites = await limitesDaEmpresaAtual();
  if (!limites?.limiteUsuarios) return;
  const { usuariosAtivos } = await usoDaEmpresa(limites.empresaId);
  if (usuariosAtivos >= limites.limiteUsuarios) {
    throw new Error(`O plano permite ${limites.limiteUsuarios} usuários ativos. Fale com a Cardo AI para ampliar.`);
  }
}

export async function exigirVagaDeRelatorio(): Promise<void> {
  const limites = await limitesDaEmpresaAtual();
  if (!limites?.limiteRelatoriosMes) return;
  const { relatoriosNoMes } = await usoDaEmpresa(limites.empresaId);
  if (relatoriosNoMes >= limites.limiteRelatoriosMes) {
    throw new Error(`O plano permite ${limites.limiteRelatoriosMes} relatórios por mês e esse limite foi atingido. Fale com a Cardo AI para ampliar.`);
  }
}
