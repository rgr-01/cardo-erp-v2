-- Contratos criados ANTES da migration 20260925050000_contrato_aprovacao ja
-- foram enviados/assinados pelo fluxo antigo (direto pro D4Sign, sem etapa
-- de aprovacao do gestor). A coluna nova nasceu com o default
-- AGUARDANDO_APROVACAO em todo mundo, o que fez esses contratos legados
-- aparecerem incorretamente na fila de aprovacao. Aqui marca como APROVADO
-- quem ja tinha sido enviado pro D4Sign (d4signDocumentoId preenchido).
UPDATE "contratos"
SET "statusAprovacao" = 'APROVADO'
WHERE "statusAprovacao" = 'AGUARDANDO_APROVACAO'
  AND "d4signDocumentoId" IS NOT NULL;
