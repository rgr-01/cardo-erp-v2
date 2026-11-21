ALTER TABLE "produtos"
ADD COLUMN "margemPct" DECIMAL(6,4);

-- Produtos que ja tem preco cadastrado partem da margem padrao de 30%;
-- os sem preco ficam em branco.
UPDATE "produtos"
SET "margemPct" = 0.3
WHERE "custoAvista" IS NOT NULL OR "custoAprazo" IS NOT NULL;
