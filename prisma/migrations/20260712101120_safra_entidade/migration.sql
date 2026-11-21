-- Cria a entidade Safra e migra os dados de Venda/Proposta/Meta da string livre "safra"
-- para uma referência real (safraId), com backfill para os registros existentes.

-- 1) Tabela safras
CREATE TABLE "safras" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "safras_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "safras_nome_key" ON "safras"("nome");

-- 2) Backfill: cria uma linha em safras para cada valor distinto já usado
--    em vendas, propostas e metas (normalmente só "24/27").
INSERT INTO "safras" ("id", "nome", "createdAt")
SELECT gen_random_uuid()::text, valores.safra, CURRENT_TIMESTAMP
FROM (
    SELECT DISTINCT "safra" FROM "vendas"
    UNION
    SELECT DISTINCT "safra" FROM "propostas"
    UNION
    SELECT DISTINCT "safra" FROM "metas"
) AS valores(safra)
ON CONFLICT ("nome") DO NOTHING;

-- 3) Vendas: adiciona safraId nullable, popula, depois torna NOT NULL
ALTER TABLE "vendas" ADD COLUMN "safraId" TEXT;

UPDATE "vendas" v
SET "safraId" = s."id"
FROM "safras" s
WHERE s."nome" = v."safra";

ALTER TABLE "vendas" ALTER COLUMN "safraId" SET NOT NULL;
ALTER TABLE "vendas" DROP COLUMN "safra";

CREATE INDEX "vendas_safraId_idx" ON "vendas"("safraId");
ALTER TABLE "vendas" ADD CONSTRAINT "vendas_safraId_fkey"
    FOREIGN KEY ("safraId") REFERENCES "safras"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 4) Propostas: mesmo padrão
ALTER TABLE "propostas" ADD COLUMN "safraId" TEXT;

UPDATE "propostas" p
SET "safraId" = s."id"
FROM "safras" s
WHERE s."nome" = p."safra";

ALTER TABLE "propostas" ALTER COLUMN "safraId" SET NOT NULL;
ALTER TABLE "propostas" DROP COLUMN "safra";

CREATE INDEX "propostas_safraId_idx" ON "propostas"("safraId");
ALTER TABLE "propostas" ADD CONSTRAINT "propostas_safraId_fkey"
    FOREIGN KEY ("safraId") REFERENCES "safras"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 5) Metas: troca a chave única de "safra" (string) para "safraId"
ALTER TABLE "metas" ADD COLUMN "safraId" TEXT;

UPDATE "metas" m
SET "safraId" = s."id"
FROM "safras" s
WHERE s."nome" = m."safra";

ALTER TABLE "metas" ALTER COLUMN "safraId" SET NOT NULL;
ALTER TABLE "metas" DROP COLUMN "safra";

CREATE UNIQUE INDEX "metas_safraId_key" ON "metas"("safraId");
ALTER TABLE "metas" ADD CONSTRAINT "metas_safraId_fkey"
    FOREIGN KEY ("safraId") REFERENCES "safras"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
