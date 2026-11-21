-- AlterTable
ALTER TABLE "relatorios_visita" ADD COLUMN IF NOT EXISTS "mostrarHorarios" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS "mostrarLocalizacao" BOOLEAN NOT NULL DEFAULT true;
