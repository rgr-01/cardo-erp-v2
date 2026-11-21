-- Documento unico: nao existe mais um Contrato separado gerado depois do
-- Pedido assinado — as clausulas contratuais agora fazem parte do proprio
-- PDF do Pedido (ver gerarPdfProposta em lib/pdf.ts), assinado uma unica vez.
--
-- Antes de apagar a tabela "contratos", migra os dados de quem ja tinha
-- contrato REALMENTE assinado (documento com clausulas, o que o cliente de
-- fato assinou) pro proprio registro do Pedido em "propostas" — sem isso
-- perderiamos o d4signDocumentoId/PDF assinado que so existia no contrato.
UPDATE "propostas" p
SET
  "d4signDocumentoId" = c."d4signDocumentoId",
  "statusAssinatura" = c."statusAssinatura",
  "pdfAssinadoUrl" = c."pdfAssinadoUrl",
  "assinadaEm" = c."assinadaEm",
  "status" = 'ACEITA'
FROM "contratos" c
WHERE c."propostaId" = p.id
  AND c."d4signDocumentoId" IS NOT NULL;

ALTER TABLE "contratos" DROP CONSTRAINT IF EXISTS "contratos_propostaId_fkey";
ALTER TABLE "contratos" DROP CONSTRAINT IF EXISTS "contratos_aprovadorId_fkey";

DROP TABLE IF EXISTS "contratos";

DROP TYPE IF EXISTS "StatusAprovacaoContrato";
