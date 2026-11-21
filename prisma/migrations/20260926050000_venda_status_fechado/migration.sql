-- Novo status intermediario de Venda: negocio fechado (orcamento -> Pedido,
-- com ou sem assinatura concluida) mas ainda sem a conferencia final do
-- administrativo. So depois dessa conferencia manual a venda vira
-- EM_CARTEIRA de fato (ver aprovarConferenciaFinal em lib/servicos/propostas.ts).
--
-- ALTER TYPE ... ADD VALUE nao pode ser usado dentro da mesma transacao que
-- referencia o valor novo -- por isso fica sozinho nesta migration.
ALTER TYPE "StatusVenda" ADD VALUE 'FECHADO' BEFORE 'EM_CARTEIRA';
