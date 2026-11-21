-- CreateEnum
CREATE TYPE "StatusProposta" AS ENUM ('RASCUNHO', 'ENVIADA', 'ACEITA', 'RECUSADA', 'CANCELADA');

-- AlterTable
ALTER TABLE "clientes" ADD COLUMN "documento" TEXT,
ADD COLUMN "razaoSocial" TEXT,
ADD COLUMN "inscricaoEstadual" TEXT,
ADD COLUMN "telefone" TEXT,
ADD COLUMN "email" TEXT,
ADD COLUMN "endereco" TEXT,
ADD COLUMN "cidade" TEXT,
ADD COLUMN "uf" TEXT,
ADD COLUMN "cep" TEXT;

-- CreateTable
CREATE TABLE "propostas" (
    "id" TEXT NOT NULL,
    "numero" SERIAL NOT NULL,
    "clienteId" TEXT NOT NULL,
    "consultorId" TEXT NOT NULL,
    "status" "StatusProposta" NOT NULL DEFAULT 'RASCUNHO',
    "safra" TEXT NOT NULL DEFAULT '24/27',
    "validade" TIMESTAMP(3),
    "previsaoEntrega" TIMESTAMP(3),
    "condicaoPagamento" TEXT,
    "observacoes" TEXT,
    "subtotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "desconto" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "total" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "propostas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proposta_itens" (
    "id" TEXT NOT NULL,
    "propostaId" TEXT NOT NULL,
    "produtoId" TEXT NOT NULL,
    "vendaId" TEXT,
    "cultura" TEXT,
    "volume" DOUBLE PRECISION,
    "valorUnitario" DOUBLE PRECISION,
    "total" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ordem" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "proposta_itens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "propostas_numero_key" ON "propostas"("numero");

-- CreateIndex
CREATE INDEX "propostas_clienteId_idx" ON "propostas"("clienteId");

-- CreateIndex
CREATE INDEX "propostas_consultorId_idx" ON "propostas"("consultorId");

-- CreateIndex
CREATE INDEX "propostas_status_idx" ON "propostas"("status");

-- CreateIndex
CREATE INDEX "proposta_itens_propostaId_idx" ON "proposta_itens"("propostaId");

-- CreateIndex
CREATE INDEX "proposta_itens_vendaId_idx" ON "proposta_itens"("vendaId");

-- AddForeignKey
ALTER TABLE "propostas" ADD CONSTRAINT "propostas_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "clientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "propostas" ADD CONSTRAINT "propostas_consultorId_fkey" FOREIGN KEY ("consultorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proposta_itens" ADD CONSTRAINT "proposta_itens_propostaId_fkey" FOREIGN KEY ("propostaId") REFERENCES "propostas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proposta_itens" ADD CONSTRAINT "proposta_itens_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "produtos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proposta_itens" ADD CONSTRAINT "proposta_itens_vendaId_fkey" FOREIGN KEY ("vendaId") REFERENCES "vendas"("id") ON DELETE SET NULL ON UPDATE CASCADE;
