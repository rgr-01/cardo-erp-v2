-- Relatório sem página de capa (aba Capa do editor). Padrão: com capa.
ALTER TABLE "relatorios_visita" ADD COLUMN IF NOT EXISTS "semCapa" BOOLEAN NOT NULL DEFAULT false;
