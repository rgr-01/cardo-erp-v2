-- Novo status de margem: conferencia final (pos-assinatura) recusada pelo
-- administrativo. Ao contrario de cancelar o negocio, o pedido volta pro
-- consultor corrigir (ver recusarConferenciaFinal em lib/servicos/propostas.ts).
--
-- ALTER TYPE ... ADD VALUE nao pode ser usado dentro da mesma transacao que
-- referencia o valor novo -- por isso fica sozinho nesta migration.
ALTER TYPE "StatusMargem" ADD VALUE 'RECUSADA_CONFERENCIA';
