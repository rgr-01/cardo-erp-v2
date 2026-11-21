-- AlterTable
ALTER TABLE "propostas" ADD COLUMN IF NOT EXISTS "signatarios" JSONB;
