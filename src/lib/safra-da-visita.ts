import { prisma } from "@/lib/prisma";
import { safraDaData } from "@/lib/visitas-categoria";

// A safra de uma visita é definida pelo ano da data dela (2025 = safra 25/26),
// não pela safra escolhida no seletor. Cria a safra se ainda não existir.
export async function safraIdDaVisita(data: Date): Promise<string> {
  const nome = safraDaData(data);
  // O nome é único por empresa; o filtro do Prisma já prende à empresa atual.
  const existente = await prisma.safra.findFirst({ where: { nome }, select: { id: true } });
  if (existente) return existente.id;
  const safra = await prisma.safra.create({
    // createdAt no início do ano: o app usa a data de criação pra achar a "mais recente".
    data: { nome, createdAt: new Date(`20${nome.slice(0, 2)}-01-01T12:00:00Z`) },
    select: { id: true },
  });
  return safra.id;
}
