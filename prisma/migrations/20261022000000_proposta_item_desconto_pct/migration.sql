-- AlterTable
ALTER TABLE "proposta_itens" ADD COLUMN IF NOT EXISTS "descontoPct" DECIMAL(7,4) NOT NULL DEFAULT 0;
