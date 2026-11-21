-- Relatórios existentes continuam em retrato; os novos nascem em paisagem.
ALTER TABLE "relatorios_visita" ADD COLUMN IF NOT EXISTS "orientacao" TEXT NOT NULL DEFAULT 'RETRATO';
ALTER TABLE "relatorios_visita" ALTER COLUMN "orientacao" SET DEFAULT 'PAISAGEM';
ALTER TABLE "relatorios_visita" ADD COLUMN IF NOT EXISTS "logoParceiroRotulo" TEXT;
ALTER TABLE "relatorios_visita" ADD COLUMN IF NOT EXISTS "logoPrincipalPath" TEXT;
ALTER TABLE "relatorios_visita" ADD COLUMN IF NOT EXISTS "escalaLogoPrincipal" DOUBLE PRECISION NOT NULL DEFAULT 1;
ALTER TABLE "relatorios_visita" ADD COLUMN IF NOT EXISTS "escalaLogoPrincipalPaginas" DOUBLE PRECISION NOT NULL DEFAULT 1;
ALTER TABLE "relatorios_visita" ADD COLUMN IF NOT EXISTS "escalaLogoParceiro" DOUBLE PRECISION NOT NULL DEFAULT 1;
ALTER TABLE "relatorios_visita" ADD COLUMN IF NOT EXISTS "escalaLogoParceiroPaginas" DOUBLE PRECISION NOT NULL DEFAULT 1;
-- Logos enviadas antes desta versão eram sempre de parceiro.
UPDATE "relatorios_visita" SET "logoParceiroRotulo" = 'Em parceria com' WHERE "logoParceiroPath" IS NOT NULL AND "logoParceiroRotulo" IS NULL;

CREATE TABLE IF NOT EXISTS "logos_relatorio" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "tipo" TEXT NOT NULL DEFAULT 'PARCEIRO',
    "path" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "empresaId" TEXT NOT NULL DEFAULT 'empresa_redeagro',
    CONSTRAINT "logos_relatorio_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "logos_relatorio_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "logos_relatorio_empresaId_idx" ON "logos_relatorio"("empresaId");
