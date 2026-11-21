-- CreateEnum
CREATE TYPE "TipoProposta" AS ENUM ('PEDIDO', 'PROPOSTA');

-- AlterTable
ALTER TABLE "propostas" ADD COLUMN "tipo" "TipoProposta" NOT NULL DEFAULT 'PROPOSTA';

-- CreateIndex
CREATE INDEX "propostas_tipo_idx" ON "propostas"("tipo");
