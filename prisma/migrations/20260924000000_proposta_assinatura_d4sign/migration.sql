-- CreateEnum
CREATE TYPE "StatusAssinatura" AS ENUM ('NAO_ENVIADA', 'AGUARDANDO_ASSINATURA', 'ASSINADA', 'RECUSADA');

-- AlterTable
ALTER TABLE "propostas" ADD COLUMN "d4signDocumentoId" TEXT;
ALTER TABLE "propostas" ADD COLUMN "statusAssinatura" "StatusAssinatura" NOT NULL DEFAULT 'NAO_ENVIADA';
ALTER TABLE "propostas" ADD COLUMN "pdfAssinadoUrl" TEXT;
ALTER TABLE "propostas" ADD COLUMN "assinadaEm" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "propostas_d4signDocumentoId_key" ON "propostas"("d4signDocumentoId");
