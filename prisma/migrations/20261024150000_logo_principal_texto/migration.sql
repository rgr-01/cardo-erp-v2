-- Texto ao lado da logo da esquerda na capa (ex.: "PROGRAMA / Difusão de Tecnologia").
ALTER TABLE "relatorios_visita" ADD COLUMN IF NOT EXISTS "logoPrincipalTexto" TEXT;
