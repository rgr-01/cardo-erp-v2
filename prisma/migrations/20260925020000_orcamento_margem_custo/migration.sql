-- CreateEnum
CREATE TYPE "CondicaoPagamentoTipo" AS ENUM ('AVISTA', 'APRAZO');

-- CreateEnum
CREATE TYPE "StatusMargem" AS ENUM ('OK', 'AGUARDANDO_APROVACAO', 'APROVADA_GESTOR', 'RECUSADA_GESTOR');

-- AlterTable
ALTER TABLE "produtos" ADD COLUMN     "custoAprazo" DOUBLE PRECISION,
ADD COLUMN     "custoAvista" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "proposta_itens" ADD COLUMN     "custoUnitario" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "propostas" ADD COLUMN     "condicaoPagamentoTipo" "CondicaoPagamentoTipo" NOT NULL DEFAULT 'AVISTA',
ADD COLUMN     "margemAprovadaEm" TIMESTAMP(3),
ADD COLUMN     "margemAprovadorId" TEXT,
ADD COLUMN     "margemMotivoRecusa" TEXT,
ADD COLUMN     "margemPct" DOUBLE PRECISION,
ADD COLUMN     "statusMargem" "StatusMargem" NOT NULL DEFAULT 'OK';

-- AddForeignKey
ALTER TABLE "propostas" ADD CONSTRAINT "propostas_margemAprovadorId_fkey" FOREIGN KEY ("margemAprovadorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
