-- AlterTable
ALTER TABLE "relatorios_visita"
  ADD COLUMN IF NOT EXISTS "statusDocumento" TEXT NOT NULL DEFAULT 'RASCUNHO',
  ADD COLUMN IF NOT EXISTS "aprovadoEm" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "tokenCompartilhamento" TEXT;

-- CreateTable
CREATE TABLE IF NOT EXISTS "relatorios_visita_versoes" (
  "id" TEXT NOT NULL,
  "relatorioId" TEXT NOT NULL,
  "numero" INTEGER NOT NULL,
  "titulo" TEXT,
  "texto" TEXT NOT NULL,
  "conteudo" JSONB,
  "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "relatorios_visita_versoes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "relatorios_visita_tokenCompartilhamento_key" ON "relatorios_visita"("tokenCompartilhamento");
CREATE UNIQUE INDEX IF NOT EXISTS "relatorios_visita_versoes_relatorioId_numero_key" ON "relatorios_visita_versoes"("relatorioId", "numero");
CREATE INDEX IF NOT EXISTS "relatorios_visita_versoes_relatorioId_criadoEm_idx" ON "relatorios_visita_versoes"("relatorioId", "criadoEm");

-- AddForeignKey
ALTER TABLE "relatorios_visita_versoes"
  ADD CONSTRAINT "relatorios_visita_versoes_relatorioId_fkey"
  FOREIGN KEY ("relatorioId") REFERENCES "relatorios_visita"("id") ON DELETE CASCADE ON UPDATE CASCADE;
