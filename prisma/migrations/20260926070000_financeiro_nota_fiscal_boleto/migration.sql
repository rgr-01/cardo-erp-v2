-- CreateEnum
CREATE TYPE "StatusNotaFiscal" AS ENUM ('PENDENTE', 'EMITIDA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "StatusBoleto" AS ENUM ('PENDENTE', 'EMITIDO', 'PAGO', 'CANCELADO');

-- CreateTable
CREATE TABLE "notas_fiscais" (
    "id" TEXT NOT NULL,
    "propostaId" TEXT NOT NULL,
    "status" "StatusNotaFiscal" NOT NULL DEFAULT 'PENDENTE',
    "numero" TEXT,
    "serie" TEXT,
    "chaveAcesso" TEXT,
    "valor" DOUBLE PRECISION,
    "dataEmissao" TIMESTAMP(3),
    "pdfUrl" TEXT,
    "xmlUrl" TEXT,
    "observacoes" TEXT,
    "criadoPor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notas_fiscais_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "boletos" (
    "id" TEXT NOT NULL,
    "propostaId" TEXT NOT NULL,
    "status" "StatusBoleto" NOT NULL DEFAULT 'PENDENTE',
    "numeroDocumento" TEXT,
    "valor" DOUBLE PRECISION,
    "vencimento" TIMESTAMP(3),
    "dataPagamento" TIMESTAMP(3),
    "linhaDigitavel" TEXT,
    "pdfUrl" TEXT,
    "observacoes" TEXT,
    "criadoPor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "boletos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "notas_fiscais_propostaId_key" ON "notas_fiscais"("propostaId");

-- CreateIndex
CREATE INDEX "notas_fiscais_status_idx" ON "notas_fiscais"("status");

-- CreateIndex
CREATE UNIQUE INDEX "boletos_propostaId_key" ON "boletos"("propostaId");

-- CreateIndex
CREATE INDEX "boletos_status_idx" ON "boletos"("status");

-- AddForeignKey
ALTER TABLE "notas_fiscais" ADD CONSTRAINT "notas_fiscais_propostaId_fkey" FOREIGN KEY ("propostaId") REFERENCES "propostas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "boletos" ADD CONSTRAINT "boletos_propostaId_fkey" FOREIGN KEY ("propostaId") REFERENCES "propostas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
