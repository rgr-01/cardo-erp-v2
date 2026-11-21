BEGIN;

ALTER TABLE "clientes" ADD COLUMN "numero" INTEGER;
ALTER TABLE "fornecedores" ADD COLUMN "numero" INTEGER;

WITH numerados AS (
  SELECT "id", ROW_NUMBER() OVER (PARTITION BY "empresaId" ORDER BY "createdAt", "id")::INTEGER AS "numero"
  FROM "clientes"
)
UPDATE "clientes" AS c SET "numero" = n."numero" FROM numerados AS n WHERE c."id" = n."id";

-- Fornecedores antigos não possuem createdAt; a ordem é nome e ID.
WITH numerados AS (
  SELECT "id", ROW_NUMBER() OVER (PARTITION BY "empresaId" ORDER BY "nome", "id")::INTEGER AS "numero"
  FROM "fornecedores"
)
UPDATE "fornecedores" AS f SET "numero" = n."numero" FROM numerados AS n WHERE f."id" = n."id";

ALTER TABLE "clientes" ALTER COLUMN "numero" SET NOT NULL, ALTER COLUMN "numero" SET DEFAULT 0;
ALTER TABLE "fornecedores" ALTER COLUMN "numero" SET NOT NULL, ALTER COLUMN "numero" SET DEFAULT 0;
ALTER TABLE "clientes" ADD CONSTRAINT "clientes_numero_positivo" CHECK ("numero" > 0);
ALTER TABLE "fornecedores" ADD CONSTRAINT "fornecedores_numero_positivo" CHECK ("numero" > 0);
CREATE UNIQUE INDEX "clientes_empresaId_numero_key" ON "clientes"("empresaId", "numero");
CREATE UNIQUE INDEX "fornecedores_empresaId_numero_key" ON "fornecedores"("empresaId", "numero");

CREATE TABLE "numeracoes_cadastro" (
  "empresaId" TEXT NOT NULL,
  "tipo" TEXT NOT NULL,
  "ultimoNumero" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "numeracoes_cadastro_pkey" PRIMARY KEY ("empresaId", "tipo"),
  CONSTRAINT "numeracoes_cadastro_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

INSERT INTO "numeracoes_cadastro" ("empresaId", "tipo", "ultimoNumero")
SELECT "empresaId", 'CLIENTE', MAX("numero") FROM "clientes" GROUP BY "empresaId";
INSERT INTO "numeracoes_cadastro" ("empresaId", "tipo", "ultimoNumero")
SELECT "empresaId", 'FORNECEDOR', MAX("numero") FROM "fornecedores" GROUP BY "empresaId";

CREATE FUNCTION "atribuir_numero_cadastro"() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW."numero" IS DISTINCT FROM OLD."numero" OR NEW."empresaId" IS DISTINCT FROM OLD."empresaId" THEN
      RAISE EXCEPTION 'O numero e a empresa do cadastro nao podem ser alterados.';
    END IF;
    RETURN NEW;
  END IF;

  -- UPSERT bloqueia apenas o contador desta empresa/tipo, sem MAX+1 sujeito a corrida.
  INSERT INTO "numeracoes_cadastro" ("empresaId", "tipo", "ultimoNumero")
  VALUES (NEW."empresaId", TG_ARGV[0], 1)
  ON CONFLICT ("empresaId", "tipo") DO UPDATE
  SET "ultimoNumero" = "numeracoes_cadastro"."ultimoNumero" + 1
  RETURNING "ultimoNumero" INTO NEW."numero";
  RETURN NEW;
END;
$$;

CREATE TRIGGER "clientes_atribuir_numero" BEFORE INSERT OR UPDATE OF "numero", "empresaId" ON "clientes"
FOR EACH ROW EXECUTE FUNCTION "atribuir_numero_cadastro"('CLIENTE');
CREATE TRIGGER "fornecedores_atribuir_numero" BEFORE INSERT OR UPDATE OF "numero", "empresaId" ON "fornecedores"
FOR EACH ROW EXECUTE FUNCTION "atribuir_numero_cadastro"('FORNECEDOR');

COMMIT;
