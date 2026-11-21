-- Clientes já eram compartilhados por todos os planos. Produtos pertenciam a VENDAS.
-- Preserva o acesso anterior ao desmembrar os módulos, sem remover os existentes.
UPDATE "empresas"
SET "modulos" = array_append("modulos", 'CADASTROS')
WHERE NOT ('CADASTROS' = ANY("modulos"));

UPDATE "empresas"
SET "modulos" = array_append("modulos", 'ESTOQUE')
WHERE 'VENDAS' = ANY("modulos") AND NOT ('ESTOQUE' = ANY("modulos"));

UPDATE "users"
SET "modulosBloqueados" = array_append("modulosBloqueados", 'ESTOQUE')
WHERE 'VENDAS' = ANY("modulosBloqueados") AND NOT ('ESTOQUE' = ANY("modulosBloqueados"));

ALTER TABLE "empresas" ALTER COLUMN "modulos"
SET DEFAULT ARRAY['CADASTROS', 'ESTOQUE', 'VENDAS', 'ERP', 'VISITAS']::TEXT[];
