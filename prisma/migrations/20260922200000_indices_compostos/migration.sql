-- DropIndex
DROP INDEX "vendas_safraId_idx";

-- DropIndex
DROP INDEX "propostas_safraId_idx";

-- DropIndex
DROP INDEX "relatorios_visita_clienteId_idx";

-- DropIndex
DROP INDEX "relatorios_visita_consultorId_idx";

-- DropIndex
DROP INDEX "despesas_consultorId_idx";

-- CreateIndex
CREATE INDEX "clientes_consultorId_idx" ON "clientes"("consultorId");

-- CreateIndex
CREATE INDEX "vendas_safraId_consultorId_idx" ON "vendas"("safraId", "consultorId");

-- CreateIndex
CREATE INDEX "propostas_safraId_tipo_idx" ON "propostas"("safraId", "tipo");

-- CreateIndex
CREATE INDEX "relatorios_visita_clienteId_dataVisita_idx" ON "relatorios_visita"("clienteId", "dataVisita");

-- CreateIndex
CREATE INDEX "relatorios_visita_consultorId_dataVisita_idx" ON "relatorios_visita"("consultorId", "dataVisita");

-- CreateIndex
CREATE INDEX "despesas_consultorId_data_idx" ON "despesas"("consultorId", "data");

