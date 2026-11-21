-- Valores financeiros exigem representacao decimal exata. Quatro casas
-- preservam o preco unitario e o custo; a tela continua exibindo centavos.
ALTER TABLE "produtos"
  ALTER COLUMN "custoAvista" TYPE DECIMAL(16, 4) USING ROUND("custoAvista"::numeric, 4),
  ALTER COLUMN "custoAprazo" TYPE DECIMAL(16, 4) USING ROUND("custoAprazo"::numeric, 4),
  ALTER COLUMN "custoCompra" TYPE DECIMAL(16, 4) USING ROUND("custoCompra"::numeric, 4);

ALTER TABLE "vendas"
  ALTER COLUMN "valorUnitario" TYPE DECIMAL(16, 4) USING ROUND("valorUnitario"::numeric, 4),
  ALTER COLUMN "valorTotal" TYPE DECIMAL(16, 4) USING ROUND("valorTotal"::numeric, 4);

ALTER TABLE "propostas"
  ALTER COLUMN "subtotal" TYPE DECIMAL(16, 4) USING ROUND("subtotal"::numeric, 4),
  ALTER COLUMN "desconto" TYPE DECIMAL(16, 4) USING ROUND("desconto"::numeric, 4),
  ALTER COLUMN "total" TYPE DECIMAL(16, 4) USING ROUND("total"::numeric, 4);

ALTER TABLE "proposta_itens"
  ALTER COLUMN "valorUnitario" TYPE DECIMAL(16, 4) USING ROUND("valorUnitario"::numeric, 4),
  ALTER COLUMN "total" TYPE DECIMAL(16, 4) USING ROUND("total"::numeric, 4),
  ALTER COLUMN "custoUnitario" TYPE DECIMAL(16, 4) USING ROUND("custoUnitario"::numeric, 4);

ALTER TABLE "metas"
  ALTER COLUMN "valor" TYPE DECIMAL(16, 4) USING ROUND("valor"::numeric, 4);

ALTER TABLE "despesas"
  ALTER COLUMN "valor" TYPE DECIMAL(16, 4) USING ROUND("valor"::numeric, 4);

ALTER TABLE "notas_fiscais"
  ALTER COLUMN "valor" TYPE DECIMAL(16, 4) USING ROUND("valor"::numeric, 4);

ALTER TABLE "boletos"
  ALTER COLUMN "valor" TYPE DECIMAL(16, 4) USING ROUND("valor"::numeric, 4);
