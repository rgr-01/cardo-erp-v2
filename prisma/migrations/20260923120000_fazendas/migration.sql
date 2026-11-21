-- AlterTable
ALTER TABLE "relatorios_visita" ADD COLUMN     "fazendaId" TEXT;

-- CreateTable
CREATE TABLE "fazendas" (
    "id" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "cidade" TEXT,
    "uf" TEXT,
    "area" DOUBLE PRECISION,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fazendas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "fazendas_clienteId_nome_key" ON "fazendas"("clienteId", "nome");

-- CreateIndex
CREATE INDEX "relatorios_visita_fazendaId_idx" ON "relatorios_visita"("fazendaId");

-- AddForeignKey
ALTER TABLE "fazendas" ADD CONSTRAINT "fazendas_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "clientes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "relatorios_visita" ADD CONSTRAINT "relatorios_visita_fazendaId_fkey" FOREIGN KEY ("fazendaId") REFERENCES "fazendas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

