-- AlterEnum
ALTER TYPE "StatusNotaFiscal" ADD VALUE 'PROCESSANDO';
ALTER TYPE "StatusNotaFiscal" ADD VALUE 'ERRO';

-- CreateEnum
CREATE TYPE "AmbienteNotaFiscal" AS ENUM ('HOMOLOGACAO', 'PRODUCAO');

-- AlterTable
ALTER TABLE "notas_fiscais" ADD COLUMN "referencia" TEXT,
ADD COLUMN "ambiente" "AmbienteNotaFiscal",
ADD COLUMN "mensagemErro" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "notas_fiscais_referencia_key" ON "notas_fiscais"("referencia");

-- AlterTable
ALTER TABLE "produtos" ADD COLUMN "ncm" TEXT,
ADD COLUMN "cfop" TEXT;
