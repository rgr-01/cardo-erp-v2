-- DropIndex
DROP INDEX "whatsapp_vinculos_userId_key";

-- AlterTable
ALTER TABLE "whatsapp_vinculos" ADD COLUMN     "receberRelatorioMensal" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "whatsapp_vinculos_userId_idx" ON "whatsapp_vinculos"("userId");


-- Números de admin já vinculados continuam recebendo o relato mensal, como
-- antes; os vinculados daqui pra frente começam desmarcados.
UPDATE "whatsapp_vinculos" v
SET "receberRelatorioMensal" = true
FROM "users" u
WHERE u."id" = v."userId" AND u."role" = 'ADMIN' AND v."waId" IS NOT NULL;
