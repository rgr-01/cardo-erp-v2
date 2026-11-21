-- AlterTable
ALTER TABLE "clientes"
  ADD COLUMN "latitude" DOUBLE PRECISION,
  ADD COLUMN "longitude" DOUBLE PRECISION,
  ADD COLUMN "consultorId" TEXT;

-- AddForeignKey
ALTER TABLE "clientes" ADD CONSTRAINT "clientes_consultorId_fkey"
  FOREIGN KEY ("consultorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
