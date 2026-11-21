-- AlterTable
ALTER TABLE "relatorios_visita" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'FECHADA',
ADD COLUMN "finalidade" TEXT,
ADD COLUMN "kmChegada" DOUBLE PRECISION,
ADD COLUMN "kmSaida" DOUBLE PRECISION,
ADD COLUMN "horaChegada" TIMESTAMP(3),
ADD COLUMN "horaSaida" TIMESTAMP(3),
ADD COLUMN "latitude" DOUBLE PRECISION,
ADD COLUMN "longitude" DOUBLE PRECISION;

-- CreateIndex
CREATE INDEX "relatorios_visita_consultorId_status_idx" ON "relatorios_visita"("consultorId", "status");
