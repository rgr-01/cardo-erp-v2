import { prisma } from "@/lib/prisma";
import { numeroPedido } from "@/lib/propostas";
import { enviarMensagemTexto } from "@/lib/whatsapp/transporte";

// Admins recebem todos os pedidos; consultor só recebe o próprio pedido.
async function destinatariosDePedido(consultorId: string): Promise<string[]> {
  const usuarios = await prisma.user.findMany({
    where: { ativo: true, OR: [{ role: "ADMIN" }, { id: consultorId }] },
    select: {
      whatsappVinculos: {
        where: { waId: { not: null }, receberNotificacoesPedidos: true },
        select: { waId: true },
      },
    },
  });
  return [...new Set(usuarios.flatMap((usuario) => usuario.whatsappVinculos.map(({ waId }) => waId!).filter(Boolean)))];
}

async function enviarAvisoDePedido(texto: string, consultorId: string) {
  const numeros = await destinatariosDePedido(consultorId);
  await Promise.all(numeros.map(async (waId) => {
    try { await enviarMensagemTexto(waId, texto); } catch (erro) { console.error("[notificacoes-pedidos] falha ao avisar", erro); }
  }));
}

export async function avisarAssinaturaConcluida(pedido: { numero: number; clienteNome: string; consultorId: string }) {
  const texto = `✅ *${numeroPedido(pedido.numero)}* foi assinado por todos.\nCliente: ${pedido.clienteNome}\nStatus: aguardando sua aprovação para entrar em carteira.`;
  await enviarAvisoDePedido(texto, pedido.consultorId);
}

export async function avisarPedidoLiberadoParaFaturamento(pedido: { numero: number; clienteNome: string; consultorId: string }) {
  const texto = `✅ *${numeroPedido(pedido.numero)}* foi aprovado pelo financeiro.\nCliente: ${pedido.clienteNome}\nStatus: liberado para faturamento.`;
  await enviarAvisoDePedido(texto, pedido.consultorId);
}
