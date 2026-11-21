-- CreateTable
CREATE TABLE "whatsapp_mensagens_recebidas" (
    "id" TEXT NOT NULL,
    "waId" TEXT NOT NULL,
    "mensagem" JSONB NOT NULL,
    "enviadaEm" TIMESTAMP(3) NOT NULL,
    "recebidaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processandoDesde" TIMESTAMP(3),
    "processadaEm" TIMESTAMP(3),
    "tentativas" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "whatsapp_mensagens_recebidas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "whatsapp_mensagens_recebidas_waId_processadaEm_idx" ON "whatsapp_mensagens_recebidas"("waId", "processadaEm");

-- CreateIndex
CREATE INDEX "whatsapp_mensagens_recebidas_processadaEm_recebidaEm_idx" ON "whatsapp_mensagens_recebidas"("processadaEm", "recebidaEm");
