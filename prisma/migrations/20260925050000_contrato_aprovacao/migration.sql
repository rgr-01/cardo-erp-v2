CREATE TYPE "StatusAprovacaoContrato" AS ENUM ('AGUARDANDO_APROVACAO', 'APROVADO', 'RECUSADO');

ALTER TABLE "contratos"
ADD COLUMN "statusAprovacao" "StatusAprovacaoContrato" NOT NULL DEFAULT 'AGUARDANDO_APROVACAO',
ADD COLUMN "aprovadorId" TEXT,
ADD COLUMN "aprovadoEm" TIMESTAMP(3),
ADD COLUMN "motivoRecusa" TEXT;

ALTER TABLE "contratos"
ADD CONSTRAINT "contratos_aprovadorId_fkey" FOREIGN KEY ("aprovadorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
