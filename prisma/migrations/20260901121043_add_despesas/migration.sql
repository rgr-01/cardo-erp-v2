-- CreateEnum
CREATE TYPE "CategoriaDespesa" AS ENUM ('COMBUSTIVEL', 'ALIMENTACAO', 'HOSPEDAGEM', 'MANUTENCAO_VEICULO', 'PEDAGIO', 'MATERIAL_ESCRITORIO', 'OUTROS');

-- CreateTable
CREATE TABLE "despesas" (
    "id" TEXT NOT NULL,
    "consultorId" TEXT NOT NULL,
    "clienteId" TEXT,
    "safraId" TEXT NOT NULL,
    "categoria" "CategoriaDespesa" NOT NULL DEFAULT 'OUTROS',
    "valor" DOUBLE PRECISION NOT NULL,
    "data" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "estabelecimento" TEXT,
    "descricao" TEXT,
    "origemOcr" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "despesas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fotos_despesa" (
    "id" TEXT NOT NULL,
    "despesaId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fotos_despesa_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "despesas_consultorId_idx" ON "despesas"("consultorId");

-- CreateIndex
CREATE INDEX "despesas_clienteId_idx" ON "despesas"("clienteId");

-- CreateIndex
CREATE INDEX "despesas_safraId_idx" ON "despesas"("safraId");

-- CreateIndex
CREATE INDEX "despesas_data_idx" ON "despesas"("data");

-- CreateIndex
CREATE INDEX "fotos_despesa_despesaId_idx" ON "fotos_despesa"("despesaId");

-- AddForeignKey
ALTER TABLE "despesas" ADD CONSTRAINT "despesas_consultorId_fkey" FOREIGN KEY ("consultorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "despesas" ADD CONSTRAINT "despesas_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "clientes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "despesas" ADD CONSTRAINT "despesas_safraId_fkey" FOREIGN KEY ("safraId") REFERENCES "safras"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fotos_despesa" ADD CONSTRAINT "fotos_despesa_despesaId_fkey" FOREIGN KEY ("despesaId") REFERENCES "despesas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
