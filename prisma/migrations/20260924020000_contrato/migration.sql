-- CreateTable
CREATE TABLE "contratos" (
    "id" TEXT NOT NULL,
    "numero" SERIAL NOT NULL,
    "propostaId" TEXT NOT NULL,
    "d4signDocumentoId" TEXT,
    "statusAssinatura" "StatusAssinatura" NOT NULL DEFAULT 'NAO_ENVIADA',
    "pdfAssinadoUrl" TEXT,
    "assinadaEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contratos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "contratos_numero_key" ON "contratos"("numero");

-- CreateIndex
CREATE UNIQUE INDEX "contratos_propostaId_key" ON "contratos"("propostaId");

-- CreateIndex
CREATE UNIQUE INDEX "contratos_d4signDocumentoId_key" ON "contratos"("d4signDocumentoId");

-- AddForeignKey
ALTER TABLE "contratos" ADD CONSTRAINT "contratos_propostaId_fkey" FOREIGN KEY ("propostaId") REFERENCES "propostas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
