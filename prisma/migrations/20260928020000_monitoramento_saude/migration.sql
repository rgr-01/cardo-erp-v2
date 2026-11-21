CREATE TABLE "monitoramento_saude" (
  "componente" TEXT NOT NULL,
  "saudavel" BOOLEAN NOT NULL DEFAULT true,
  "detalhe" TEXT,
  "alteradoEm" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "monitoramento_saude_pkey" PRIMARY KEY ("componente")
);

ALTER TABLE "whatsapp_vinculos" ADD COLUMN "receberAlertasSeguranca" BOOLEAN NOT NULL DEFAULT false;
