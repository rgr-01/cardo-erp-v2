ALTER TABLE "contratos"
ADD COLUMN "cancelado" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "canceladoEm" TIMESTAMP(3),
ADD COLUMN "motivoCancelamento" TEXT;
