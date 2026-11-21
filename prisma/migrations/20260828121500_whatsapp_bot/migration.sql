-- CreateTable
CREATE TABLE "whatsapp_vinculos" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "waId" TEXT,
    "codigo" TEXT,
    "codigoExpiraEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_vinculos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsapp_sessoes" (
    "waId" TEXT NOT NULL,
    "estado" JSONB NOT NULL,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_sessoes_pkey" PRIMARY KEY ("waId")
);

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_vinculos_userId_key" ON "whatsapp_vinculos"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_vinculos_waId_key" ON "whatsapp_vinculos"("waId");

-- AddForeignKey
ALTER TABLE "whatsapp_vinculos" ADD CONSTRAINT "whatsapp_vinculos_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
