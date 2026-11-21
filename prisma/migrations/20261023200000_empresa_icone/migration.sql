-- Ícone da aba por empresa; a Rede Agro usa o símbolo dela (public/marca).
ALTER TABLE "empresas" ADD COLUMN "iconePath" TEXT;
UPDATE "empresas" SET "iconePath" = '/marca/icone.svg' WHERE "id" = 'empresa_redeagro';
