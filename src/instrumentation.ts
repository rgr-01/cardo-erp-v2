// Roda uma vez quando o servidor sobe: retoma as mensagens do WhatsApp que
// ficaram na fila se o serviço reiniciou no meio de uma rajada.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { iniciarVarreduraFila } = await import("@/lib/whatsapp/fila");
  iniciarVarreduraFila();
  const { iniciarVarreduraAssinaturas } = await import("@/lib/assinaturas");
  iniciarVarreduraAssinaturas();
  const { iniciarVarreduraNotasFiscais } = await import("@/lib/servicos/financeiro");
  iniciarVarreduraNotasFiscais();
}
