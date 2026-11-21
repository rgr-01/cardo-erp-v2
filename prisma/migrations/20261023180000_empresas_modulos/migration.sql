-- Módulos contratados por empresa; as existentes (Rede Agro, Cardo AI) ficam com todos.
ALTER TABLE "empresas" ADD COLUMN "modulos" TEXT[] NOT NULL DEFAULT ARRAY['VENDAS', 'ERP', 'VISITAS']::TEXT[];
