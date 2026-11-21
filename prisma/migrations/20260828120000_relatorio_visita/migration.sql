-- CreateTable
CREATE TABLE "relatorios_visita" (
    "id" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "consultorId" TEXT NOT NULL,
    "safraId" TEXT NOT NULL,
    "dataVisita" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "titulo" TEXT,
    "texto" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "relatorios_visita_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fotos_visita" (
    "id" TEXT NOT NULL,
    "relatorioId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "legenda" TEXT,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fotos_visita_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "relatorios_visita_clienteId_idx" ON "relatorios_visita"("clienteId");

-- CreateIndex
CREATE INDEX "relatorios_visita_consultorId_idx" ON "relatorios_visita"("consultorId");

-- CreateIndex
CREATE INDEX "relatorios_visita_safraId_idx" ON "relatorios_visita"("safraId");

-- CreateIndex
CREATE INDEX "relatorios_visita_dataVisita_idx" ON "relatorios_visita"("dataVisita");

-- CreateIndex
CREATE INDEX "fotos_visita_relatorioId_idx" ON "fotos_visita"("relatorioId");

-- AddForeignKey
ALTER TABLE "relatorios_visita" ADD CONSTRAINT "relatorios_visita_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "clientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "relatorios_visita" ADD CONSTRAINT "relatorios_visita_consultorId_fkey" FOREIGN KEY ("consultorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "relatorios_visita" ADD CONSTRAINT "relatorios_visita_safraId_fkey" FOREIGN KEY ("safraId") REFERENCES "safras"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fotos_visita" ADD CONSTRAINT "fotos_visita_relatorioId_fkey" FOREIGN KEY ("relatorioId") REFERENCES "relatorios_visita"("id") ON DELETE CASCADE ON UPDATE CASCADE;
