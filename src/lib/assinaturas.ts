import { prisma } from "@/lib/prisma";
import { baixarDocumento, consultarDocumento } from "@/lib/d4sign";
import { enviarBufferAssinatura } from "@/lib/storage";
import { avisarAssinaturaConcluida } from "@/lib/notificacoes-assinatura";

// A API é a fonte de verdade tanto para o webhook quanto para a recuperação.
// Não considera uma assinatura individual como documento finalizado.
// Documento unico: so existe Proposta (nao ha mais Contrato separado).
export async function sincronizarAssinatura(documentoUuid: string) {
  const proposta = await prisma.proposta.findUnique({
    where: { d4signDocumentoId: documentoUuid },
    select: {
      id: true,
      numero: true,
      cliente: { select: { nome: true } },
      consultorId: true,
      status: true,
      statusAssinatura: true,
      assinadaEm: true,
      pdfAssinadoUrl: true,
      itens: { select: { vendaId: true } },
    },
  });
  if (!proposta) return "NAO_ENCONTRADO";
  if (proposta.statusAssinatura === "RECUSADA") return "RECUSADA";
  if (proposta.statusAssinatura === "ASSINADA" && proposta.pdfAssinadoUrl) return "ASSINADA";

  const documento = await consultarDocumento(documentoUuid);
  const status = String(documento.statusId);
  if (status !== "4" && status !== "6") return "PENDENTE";

  // Atualização condicional evita sobrescrever uma transição concorrente.
  const where = { id: proposta.id, d4signDocumentoId: documentoUuid, statusAssinatura: proposta.statusAssinatura };
  if (status === "6") {
    if (proposta.statusAssinatura === "ASSINADA") return "ASSINADA";
    // Cliente recusou a assinatura: o status do Pedido acompanha sozinho —
    // sem isso ficava "Enviada" pra sempre até alguém marcar manualmente
    // (ver alterarStatusProposta em servicos/propostas.ts, mesma transição).
    await prisma.proposta.updateMany({ where, data: { statusAssinatura: "RECUSADA", status: "RECUSADA" } });
    return "RECUSADA";
  }

  // Salva a confirmação mesmo se o PDF falhar. A varredura retoma PDFs ausentes.
  const atualizado = await prisma.proposta.updateMany({
    where,
    data: { statusAssinatura: "ASSINADA", assinadaEm: proposta.assinadaEm ?? new Date(), status: "ACEITA" },
  });
  if (!atualizado.count) return "PENDENTE";
  await avisarAssinaturaConcluida({ numero: proposta.numero, clienteNome: proposta.cliente.nome, consultorId: proposta.consultorId });
  // Mesma transicao de vendas feita em alterarStatusProposta ao marcar
  // "Aceita" manualmente — assinatura confirmada pelo cliente tambem conta
  // como negocio fechado. Nao vai direto pra Em carteira: fica Fechado ate
  // a conferencia final do administrativo (ver aprovarConferenciaFinal em
  // lib/servicos/propostas.ts) — documento assinado nao dispensa essa
  // checagem manual.
  if (proposta.status !== "ACEITA") {
    const vendaIds = proposta.itens.map((i) => i.vendaId).filter((v): v is string => Boolean(v));
    if (vendaIds.length > 0) {
      await prisma.venda.updateMany({
        where: { id: { in: vendaIds }, status: { in: ["PROSPECCAO", "NEGOCIACAO"] } },
        data: { status: "FECHADO" },
      });
    }
  }
  if (!proposta.pdfAssinadoUrl) {
    const bytes = await baixarDocumento(documentoUuid);
    const upload = await enviarBufferAssinatura(Buffer.from(bytes), "application/pdf", `${documentoUuid}.pdf`, proposta.id);
    const filtro = { id: proposta.id, d4signDocumentoId: documentoUuid, statusAssinatura: "ASSINADA" as const, pdfAssinadoUrl: null };
    await prisma.proposta.updateMany({ where: filtro, data: { pdfAssinadoUrl: upload.url } });
  }
  console.info(`[D4Sign] assinatura sincronizada: ${documentoUuid}`);
  return "ASSINADA";
}

const globalAssinaturas = globalThis as unknown as { varreduraAssinaturas?: boolean };

// Lotes pequenos e sequenciais limitam a carga na API. O cursor avança mesmo
// quando um documento falha, para que ele não bloqueie os demais.
export function iniciarVarreduraAssinaturas() {
  if (globalAssinaturas.varreduraAssinaturas || !process.env.D4SIGN_TOKEN_API) return;
  globalAssinaturas.varreduraAssinaturas = true;
  let cursorProposta = "";
  const rodar = async () => {
    try {
      const where = {
        d4signDocumentoId: { not: null },
        OR: [
          { statusAssinatura: "AGUARDANDO_ASSINATURA" as const },
          { statusAssinatura: "ASSINADA" as const, pdfAssinadoUrl: null },
        ],
      };
      const select = { id: true, d4signDocumentoId: true };
      const propostas = await prisma.proposta.findMany({ where: { ...where, id: { gt: cursorProposta } }, select, orderBy: { id: "asc" }, take: 10 });
      cursorProposta = propostas.length === 10 ? propostas[9].id : "";
      for (const registro of propostas) {
        try {
          await sincronizarAssinatura(registro.d4signDocumentoId!);
        } catch (error) {
          console.error(`[D4Sign] falha na sincronização de ${registro.d4signDocumentoId}:`, error);
        }
      }
    } catch (error) {
      console.error("[D4Sign] falha na varredura de assinaturas:", error);
    } finally {
      // Agenda só depois de terminar, sem sobrepor ciclos lentos.
      setTimeout(rodar, 60_000).unref();
    }
  };
  setTimeout(rodar, 5_000).unref();
}
