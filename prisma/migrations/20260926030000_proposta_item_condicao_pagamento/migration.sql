ALTER TABLE "proposta_itens"
ADD COLUMN "condicaoPagamentoTipo" "CondicaoPagamentoTipo" NOT NULL DEFAULT 'AVISTA';

-- Backfill: itens ja existentes herdam a condicao que ate agora era unica
-- pro orcamento inteiro, pra nao mudar o custo/margem congelados de itens
-- ja salvos.
UPDATE "proposta_itens" pi
SET "condicaoPagamentoTipo" = p."condicaoPagamentoTipo"
FROM "propostas" p
WHERE p.id = pi."propostaId";
