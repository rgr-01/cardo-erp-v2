-- CreateTable
CREATE TABLE "historico" (
    "id" TEXT NOT NULL,
    "usuarioNome" TEXT NOT NULL,
    "acao" TEXT NOT NULL,
    "entidade" TEXT NOT NULL,
    "detalhes" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "historico_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "historico_createdAt_idx" ON "historico"("createdAt");
