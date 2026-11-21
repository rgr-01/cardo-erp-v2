-- AlterTable
ALTER TABLE "relatorios_visita" ADD COLUMN     "categoria" TEXT,
ADD COLUMN     "idExterno" TEXT,
ADD COLUMN     "linkExterno" TEXT,
ADD COLUMN     "trabalhoId" TEXT;

-- CreateTable
CREATE TABLE "trabalhos" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PLANEJADO',
    "produto" TEXT,
    "fornecedor" TEXT,
    "cultura" TEXT,
    "safraId" TEXT NOT NULL,
    "campos" INTEGER NOT NULL DEFAULT 1,
    "visitasPrevistas" INTEGER NOT NULL DEFAULT 0,
    "dataPrevista" TIMESTAMP(3),
    "observacao" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trabalhos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_ClienteToTrabalho" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_ClienteToTrabalho_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "trabalhos_safraId_status_idx" ON "trabalhos"("safraId", "status");

-- CreateIndex
CREATE INDEX "_ClienteToTrabalho_B_index" ON "_ClienteToTrabalho"("B");

-- CreateIndex
CREATE UNIQUE INDEX "relatorios_visita_idExterno_key" ON "relatorios_visita"("idExterno");

-- CreateIndex
CREATE INDEX "relatorios_visita_trabalhoId_idx" ON "relatorios_visita"("trabalhoId");

-- AddForeignKey
ALTER TABLE "relatorios_visita" ADD CONSTRAINT "relatorios_visita_trabalhoId_fkey" FOREIGN KEY ("trabalhoId") REFERENCES "trabalhos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trabalhos" ADD CONSTRAINT "trabalhos_safraId_fkey" FOREIGN KEY ("safraId") REFERENCES "safras"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ClienteToTrabalho" ADD CONSTRAINT "_ClienteToTrabalho_A_fkey" FOREIGN KEY ("A") REFERENCES "clientes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ClienteToTrabalho" ADD CONSTRAINT "_ClienteToTrabalho_B_fkey" FOREIGN KEY ("B") REFERENCES "trabalhos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

