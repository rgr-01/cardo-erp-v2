-- Combinados das visitas (bot do WhatsApp) e origem das versões do relatório.
ALTER TABLE "relatorios_visita_versoes" ADD COLUMN IF NOT EXISTS "origem" TEXT;

CREATE TABLE IF NOT EXISTS "combinados" (
    "id" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "dataPrevista" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'PENDENTE',
    "concluidoEm" TIMESTAMP(3),
    "avisadoEm" TIMESTAMP(3),
    "clienteId" TEXT NOT NULL,
    "relatorioId" TEXT,
    "consultorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "empresaId" TEXT NOT NULL DEFAULT 'empresa_redeagro',
    CONSTRAINT "combinados_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "combinados_consultorId_status_dataPrevista_idx" ON "combinados"("consultorId", "status", "dataPrevista");
CREATE INDEX IF NOT EXISTS "combinados_clienteId_status_idx" ON "combinados"("clienteId", "status");
CREATE INDEX IF NOT EXISTS "combinados_empresaId_idx" ON "combinados"("empresaId");

ALTER TABLE "combinados" ADD CONSTRAINT "combinados_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "clientes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "combinados" ADD CONSTRAINT "combinados_relatorioId_fkey" FOREIGN KEY ("relatorioId") REFERENCES "relatorios_visita"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "combinados" ADD CONSTRAINT "combinados_consultorId_fkey" FOREIGN KEY ("consultorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "combinados" ADD CONSTRAINT "combinados_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
