import { prisma } from "@/lib/prisma";
import { verificarStorage } from "@/lib/storage";
import { enviarMensagemTexto } from "@/lib/whatsapp/transporte";

type Componente = "banco" | "storage";
type Resultado = { componente: Componente; saudavel: boolean; detalhe?: string };

const detalheSeguro = (erro: unknown) =>
  erro instanceof Error ? erro.message.slice(0, 300) : "Falha sem detalhe disponível.";

async function avisarAdmins(texto: string) {
  let numeros: string[] = [];
  try {
    const admins = await prisma.user.findMany({
      where: { role: "ADMIN", ativo: true },
      select: { whatsappVinculos: { where: { waId: { not: null }, receberAlertasSeguranca: true }, select: { waId: true } } },
    });
    numeros = admins.flatMap((admin) => admin.whatsappVinculos.map((v) => v.waId!).filter(Boolean));
  } catch {
    // Em falha do banco, usa números de contingência configurados no servidor.
    numeros = (process.env.ALERTA_ADMIN_WA_IDS || "").split(",").map((v) => v.trim()).filter(Boolean);
  }
  await Promise.all(numeros.map(async (waId) => {
    try { await enviarMensagemTexto(waId, texto); } catch (erro) { console.error("[monitoramento] falha ao avisar admin", erro); }
  }));
}

async function registrar(resultado: Resultado) {
  const anterior = await prisma.monitoramentoSaude.findUnique({ where: { componente: resultado.componente } });
  await prisma.monitoramentoSaude.upsert({
    where: { componente: resultado.componente },
    create: { componente: resultado.componente, saudavel: resultado.saudavel, detalhe: resultado.detalhe ?? null },
    update: { saudavel: resultado.saudavel, detalhe: resultado.detalhe ?? null },
  });
  if (!anterior || anterior.saudavel === resultado.saudavel) return;
  const titulo = resultado.saudavel ? "✅ Serviço recuperado" : "🚨 Alerta de serviço";
  const texto = resultado.saudavel
    ? `${titulo}: *${resultado.componente}* voltou a funcionar.`
    : `${titulo}: *${resultado.componente}* está indisponível. Detalhe: ${resultado.detalhe}`;
  await avisarAdmins(texto);
}

export async function verificarSaude(): Promise<Resultado[]> {
  const resultados: Resultado[] = [];
  try {
    await prisma.$queryRaw`SELECT 1`;
    resultados.push({ componente: "banco", saudavel: true });
  } catch (erro) {
    const resultado = { componente: "banco" as const, saudavel: false, detalhe: detalheSeguro(erro) };
    resultados.push(resultado);
    await avisarAdmins(`🚨 Alerta de serviço: *banco* está indisponível. Detalhe: ${resultado.detalhe}`);
    return resultados;
  }
  try {
    await verificarStorage();
    resultados.push({ componente: "storage", saudavel: true });
  } catch (erro) {
    resultados.push({ componente: "storage", saudavel: false, detalhe: detalheSeguro(erro) });
  }
  await Promise.all(resultados.map(registrar));
  return resultados;
}
