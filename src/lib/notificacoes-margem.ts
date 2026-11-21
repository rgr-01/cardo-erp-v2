// Aviso automático no WhatsApp dos admins quando um Pedido (PROPOSTA) nasce
// ou é editado com margem abaixo de 27% (statusMargem AGUARDANDO_APROVACAO).
// Chamado por criarPedidoParaConsultor (lib/pedidos.ts) e atualizarProposta
// (lib/servicos/propostas.ts) — nunca bloqueia a operação principal, só avisa.

import { prisma } from "@/lib/prisma";
import type { Sessao } from "@/app/actions/helpers";
import { fmtBRL } from "@/lib/format";
import { numeroProposta } from "@/lib/propostas";
import { gerarPdfDaProposta } from "@/lib/servicos/propostas";
import { primeiraPaginaComoJpeg } from "@/lib/pdf-para-imagem";
import { enviarMensagemTexto, enviarImagem } from "@/lib/whatsapp/transporte";

// Sessão sintética só pra passar em exigirAcessoProposta (ehAdmin true libera
// acesso a qualquer pedido, sem checar dono) — não é usada em nenhum registro
// de histórico aqui.
const SESSAO_SISTEMA: Sessao = { id: "sistema", nome: "Sistema", role: "ADMIN" };

export async function avisarSolicitacaoMargem(pedido: {
  id: string;
  numero: number;
  total: number;
  margemPct: number | null;
  cliente: { nome: string };
  consultorNome: string;
}) {
  const admins = await prisma.user.findMany({
    where: { role: "ADMIN", ativo: true },
    select: {
      whatsappVinculos: {
        where: { waId: { not: null }, receberAlertasMargem: true },
        select: { waId: true },
      },
    },
  });
  const numeros = admins.flatMap((a) => a.whatsappVinculos.map((v) => v.waId!).filter(Boolean));
  if (numeros.length === 0) return;

  const margemTexto = pedido.margemPct != null ? `${(pedido.margemPct * 100).toFixed(1)}%` : "?";
  const texto = [
    `⚠️ O consultor *${pedido.consultorNome}* solicitou aprovação de margem, segue abaixo o pedido:`,
    `${numeroProposta(pedido.numero)} — ${pedido.cliente.nome}`,
    `Total: ${fmtBRL(pedido.total)} · Margem: ${margemTexto} (abaixo dos 27%)`,
    `Responda por aqui pra aprovar ou recusar (ex.: "aprova o ${numeroProposta(pedido.numero)}" ou "recusa o ${numeroProposta(pedido.numero)}, preço baixo demais").`,
  ].join("\n");

  // Foto da página de produtos do pedido, igual o que o bot já manda quando
  // pedem o orçamento/pedido em imagem (ver enviar_pdf_orcamento).
  let foto: Buffer | null = null;
  try {
    const { bytes } = await gerarPdfDaProposta(SESSAO_SISTEMA, pedido.id);
    foto = await primeiraPaginaComoJpeg(Buffer.from(bytes));
  } catch (error) {
    console.error("[notificacoes-margem] falha ao gerar foto do pedido", error);
  }

  await Promise.all(
    numeros.map(async (waId) => {
      try {
        await enviarMensagemTexto(waId, texto);
        if (foto) await enviarImagem(waId, foto, "image/jpeg", `Pedido — ${pedido.cliente.nome}`);
      } catch (error) {
        console.error("[notificacoes-margem] falha ao avisar", waId, error);
      }
    })
  );
}
