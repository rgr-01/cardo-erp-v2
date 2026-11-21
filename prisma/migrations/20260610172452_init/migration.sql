-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'CONSULTOR');

-- CreateEnum
CREATE TYPE "StatusVenda" AS ENUM ('PROSPECCAO', 'NEGOCIACAO', 'EM_CARTEIRA', 'FATURADO', 'CANCELADO');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "senhaHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'CONSULTOR',
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clientes" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "ctv" TEXT,
    "areaPlantio" DOUBLE PRECISION,
    "areaTotal" DOUBLE PRECISION,
    "pctIrrigada" DOUBLE PRECISION,
    "pctArroz" DOUBLE PRECISION,
    "pctSoja" DOUBLE PRECISION,
    "pctMilho" DOUBLE PRECISION,
    "pctAlgodao" DOUBLE PRECISION,
    "pctFeijao" DOUBLE PRECISION,
    "pctTrigo" DOUBLE PRECISION,
    "pctMilho2" DOUBLE PRECISION,
    "pctSorgo2" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clientes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fornecedores" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,

    CONSTRAINT "fornecedores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "produtos" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "fornecedorId" TEXT NOT NULL,

    CONSTRAINT "produtos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendas" (
    "id" TEXT NOT NULL,
    "consultorId" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "produtoId" TEXT NOT NULL,
    "cultura" TEXT,
    "volume" DOUBLE PRECISION,
    "valorUnitario" DOUBLE PRECISION,
    "valorTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" "StatusVenda" NOT NULL DEFAULT 'PROSPECCAO',
    "dataFechamento" TIMESTAMP(3),
    "previsaoEntrega" TIMESTAMP(3),
    "observacoes" TEXT,
    "safra" TEXT NOT NULL DEFAULT '24/27',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vendas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "metas" (
    "id" TEXT NOT NULL,
    "safra" TEXT NOT NULL,
    "valor" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "metas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "clientes_nome_key" ON "clientes"("nome");

-- CreateIndex
CREATE UNIQUE INDEX "fornecedores_nome_key" ON "fornecedores"("nome");

-- CreateIndex
CREATE UNIQUE INDEX "produtos_nome_fornecedorId_key" ON "produtos"("nome", "fornecedorId");

-- CreateIndex
CREATE INDEX "vendas_consultorId_idx" ON "vendas"("consultorId");

-- CreateIndex
CREATE INDEX "vendas_clienteId_idx" ON "vendas"("clienteId");

-- CreateIndex
CREATE INDEX "vendas_status_idx" ON "vendas"("status");

-- CreateIndex
CREATE UNIQUE INDEX "metas_safra_key" ON "metas"("safra");

-- AddForeignKey
ALTER TABLE "produtos" ADD CONSTRAINT "produtos_fornecedorId_fkey" FOREIGN KEY ("fornecedorId") REFERENCES "fornecedores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendas" ADD CONSTRAINT "vendas_consultorId_fkey" FOREIGN KEY ("consultorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendas" ADD CONSTRAINT "vendas_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "clientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendas" ADD CONSTRAINT "vendas_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "produtos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
