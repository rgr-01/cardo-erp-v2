-- Financeiro avulso: notas fiscais sem pedido e titulos a receber/a pagar.
-- CreateEnum
CREATE TYPE "TipoTitulo" AS ENUM ('RECEBER', 'PAGAR');

-- CreateEnum
CREATE TYPE "StatusTitulo" AS ENUM ('ABERTO', 'PAGO', 'CANCELADO');

-- CreateTable
CREATE TABLE "notas_avulsas" (
    "id" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "naturezaOperacao" TEXT NOT NULL,
    "cfop" TEXT,
    "itens" JSONB NOT NULL,
    "valorTotal" DECIMAL(16,4) NOT NULL,
    "status" "StatusNotaFiscal" NOT NULL DEFAULT 'PENDENTE',
    "numero" TEXT,
    "serie" TEXT,
    "chaveAcesso" TEXT,
    "dataEmissao" TIMESTAMP(3),
    "pdfUrl" TEXT,
    "xmlUrl" TEXT,
    "observacoes" TEXT,
    "provedor" TEXT NOT NULL DEFAULT 'MANUAL',
    "referenciaExterna" TEXT,
    "mensagemErro" TEXT,
    "criadoPor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "empresaId" TEXT NOT NULL DEFAULT 'empresa_redeagro',

    CONSTRAINT "notas_avulsas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "titulos_financeiros" (
    "id" TEXT NOT NULL,
    "tipo" "TipoTitulo" NOT NULL,
    "status" "StatusTitulo" NOT NULL DEFAULT 'ABERTO',
    "descricao" TEXT NOT NULL,
    "clienteId" TEXT,
    "favorecido" TEXT,
    "categoria" TEXT,
    "documento" TEXT,
    "valor" DECIMAL(16,4) NOT NULL,
    "vencimento" TIMESTAMP(3) NOT NULL,
    "dataPagamento" TIMESTAMP(3),
    "parcela" INTEGER NOT NULL DEFAULT 1,
    "totalParcelas" INTEGER NOT NULL DEFAULT 1,
    "linhaDigitavel" TEXT,
    "boletoPdfUrl" TEXT,
    "provedorBoleto" TEXT,
    "referenciaExterna" TEXT,
    "notaAvulsaId" TEXT,
    "observacoes" TEXT,
    "criadoPor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "empresaId" TEXT NOT NULL DEFAULT 'empresa_redeagro',

    CONSTRAINT "titulos_financeiros_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notas_avulsas_empresaId_idx" ON "notas_avulsas"("empresaId");

-- CreateIndex
CREATE INDEX "titulos_financeiros_empresaId_tipo_status_idx" ON "titulos_financeiros"("empresaId", "tipo", "status");

-- AddForeignKey
ALTER TABLE "notas_avulsas" ADD CONSTRAINT "notas_avulsas_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "clientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notas_avulsas" ADD CONSTRAINT "notas_avulsas_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "titulos_financeiros" ADD CONSTRAINT "titulos_financeiros_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "clientes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "titulos_financeiros" ADD CONSTRAINT "titulos_financeiros_notaAvulsaId_fkey" FOREIGN KEY ("notaAvulsaId") REFERENCES "notas_avulsas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "titulos_financeiros" ADD CONSTRAINT "titulos_financeiros_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

