import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("Configure DATABASE_URL no .env.");
  const url = new URL(connectionString);
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || url.pathname !== "/cardo_erp") {
    throw new Error("Este script exige o banco local cardo_erp.");
  }
  const email = process.env.LOCAL_ADMIN_EMAIL?.trim().toLowerCase();
  const senha = process.env.LOCAL_ADMIN_PASSWORD;
  if (!email || !senha || senha.length < 12) {
    throw new Error("Configure LOCAL_ADMIN_EMAIL e LOCAL_ADMIN_PASSWORD (12 caracteres ou mais).");
  }
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  try {
    const existente = await prisma.user.findUnique({ where: { email } });
    if (existente) {
      console.log("Administrador ja existe; senha e dados preservados.");
      return;
    }
    const senhaHash = await bcrypt.hash(senha, 12);
    await prisma.$transaction(async (tx) => {
      const empresa = await tx.empresa.upsert({
        where: { id: "empresa_local" },
        update: {},
        create: { id: "empresa_local", nomeFantasia: "Cardo Local" },
      });
      await tx.user.create({
        data: {
          nome: "Administrador Local", email, senhaHash,
          role: "ADMIN", empresaId: empresa.id,
        },
      });
      await tx.safra.upsert({
        where: { empresaId_nome: { empresaId: empresa.id, nome: "26/27" } },
        update: {},
        create: { nome: "26/27", empresaId: empresa.id },
      });
    });
    console.log(`Empresa e administrador local criados: ${email}`);
    console.log("A senha esta em LOCAL_ADMIN_PASSWORD no arquivo .env.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Falha na inicializacao local.");
  process.exitCode = 1;
});
