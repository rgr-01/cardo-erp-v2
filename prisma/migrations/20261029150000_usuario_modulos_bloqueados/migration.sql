-- Módulos da empresa desligados pelo admin para cada usuário.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "modulosBloqueados" TEXT[] DEFAULT ARRAY[]::TEXT[];
