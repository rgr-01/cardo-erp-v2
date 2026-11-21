-- Plano contratado e limites da empresa (painel master). Nulo = sem limite.
ALTER TABLE "empresas" ADD COLUMN IF NOT EXISTS "plano" TEXT;
ALTER TABLE "empresas" ADD COLUMN IF NOT EXISTS "limiteUsuarios" INTEGER;
ALTER TABLE "empresas" ADD COLUMN IF NOT EXISTS "limiteRelatoriosMes" INTEGER;
ALTER TABLE "empresas" ADD COLUMN IF NOT EXISTS "limiteArmazenamentoGb" DOUBLE PRECISION;
ALTER TABLE "empresas" ADD COLUMN IF NOT EXISTS "observacoesPlano" TEXT;
