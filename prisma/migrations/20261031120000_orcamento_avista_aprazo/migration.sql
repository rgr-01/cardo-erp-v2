-- Orcamento cotado a vista e a prazo: preco a prazo opcional por item.
ALTER TABLE "proposta_itens" ADD COLUMN "valorUnitarioAprazo" DECIMAL(16,4);
