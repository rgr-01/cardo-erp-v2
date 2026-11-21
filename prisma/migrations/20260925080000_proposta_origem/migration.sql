-- CreateEnum
CREATE TYPE "OrigemProposta" AS ENUM ('WEB', 'BOT');

-- AlterTable
ALTER TABLE "propostas" ADD COLUMN     "origem" "OrigemProposta" NOT NULL DEFAULT 'WEB';
