-- Marca da Rede Agro na tela de login e no menu: arquivos já publicados em public/marca.
UPDATE "empresas"
SET "logoPath" = '/marca/logo.svg', "logoEscuroPath" = '/marca/logo-branco.svg', "corPrimaria" = '#19323b'
WHERE "id" = 'empresa_redeagro';
