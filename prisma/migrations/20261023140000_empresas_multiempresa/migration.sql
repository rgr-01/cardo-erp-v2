-- DropIndex
DROP INDEX "clientes_nome_key";

-- DropIndex
DROP INDEX "safras_nome_key";

-- DropIndex
DROP INDEX "fornecedores_nome_key";

-- DropIndex
DROP INDEX "contas_despesa_codigo_key";

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "empresaId" TEXT NOT NULL DEFAULT 'empresa_redeagro',
ADD COLUMN     "superAdmin" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "clientes" ADD COLUMN     "empresaId" TEXT NOT NULL DEFAULT 'empresa_redeagro';

-- AlterTable
ALTER TABLE "fazendas" ADD COLUMN     "empresaId" TEXT NOT NULL DEFAULT 'empresa_redeagro';

-- AlterTable
ALTER TABLE "safras" ADD COLUMN     "empresaId" TEXT NOT NULL DEFAULT 'empresa_redeagro';

-- AlterTable
ALTER TABLE "fornecedores" ADD COLUMN     "empresaId" TEXT NOT NULL DEFAULT 'empresa_redeagro';

-- AlterTable
ALTER TABLE "produtos" ADD COLUMN     "empresaId" TEXT NOT NULL DEFAULT 'empresa_redeagro';

-- AlterTable
ALTER TABLE "vendas" ADD COLUMN     "empresaId" TEXT NOT NULL DEFAULT 'empresa_redeagro';

-- AlterTable
ALTER TABLE "propostas" ADD COLUMN     "empresaId" TEXT NOT NULL DEFAULT 'empresa_redeagro';

-- AlterTable
ALTER TABLE "notas_fiscais" ADD COLUMN     "empresaId" TEXT NOT NULL DEFAULT 'empresa_redeagro';

-- AlterTable
ALTER TABLE "boletos" ADD COLUMN     "empresaId" TEXT NOT NULL DEFAULT 'empresa_redeagro';

-- AlterTable
ALTER TABLE "proposta_itens" ADD COLUMN     "empresaId" TEXT NOT NULL DEFAULT 'empresa_redeagro';

-- AlterTable
ALTER TABLE "metas" ADD COLUMN     "empresaId" TEXT NOT NULL DEFAULT 'empresa_redeagro';

-- AlterTable
ALTER TABLE "relatorios_visita" ADD COLUMN     "empresaId" TEXT NOT NULL DEFAULT 'empresa_redeagro';

-- AlterTable
ALTER TABLE "relatorios_visita_versoes" ADD COLUMN     "empresaId" TEXT NOT NULL DEFAULT 'empresa_redeagro';

-- AlterTable
ALTER TABLE "trabalhos" ADD COLUMN     "empresaId" TEXT NOT NULL DEFAULT 'empresa_redeagro';

-- AlterTable
ALTER TABLE "fotos_visita" ADD COLUMN     "empresaId" TEXT NOT NULL DEFAULT 'empresa_redeagro';

-- AlterTable
ALTER TABLE "despesas" ADD COLUMN     "empresaId" TEXT NOT NULL DEFAULT 'empresa_redeagro';

-- AlterTable
ALTER TABLE "grupos_despesa" ADD COLUMN     "empresaId" TEXT NOT NULL DEFAULT 'empresa_redeagro';

-- AlterTable
ALTER TABLE "contas_despesa" ADD COLUMN     "empresaId" TEXT NOT NULL DEFAULT 'empresa_redeagro';

-- AlterTable
ALTER TABLE "orcamentos_conta_despesa" ADD COLUMN     "empresaId" TEXT NOT NULL DEFAULT 'empresa_redeagro';

-- AlterTable
ALTER TABLE "fotos_despesa" ADD COLUMN     "empresaId" TEXT NOT NULL DEFAULT 'empresa_redeagro';

-- AlterTable
ALTER TABLE "whatsapp_vinculos" ADD COLUMN     "empresaId" TEXT NOT NULL DEFAULT 'empresa_redeagro';

-- AlterTable
ALTER TABLE "whatsapp_sessoes" ADD COLUMN     "empresaId" TEXT NOT NULL DEFAULT 'empresa_redeagro';

-- AlterTable
ALTER TABLE "monitoramento_saude" ADD COLUMN     "empresaId" TEXT NOT NULL DEFAULT 'empresa_redeagro';

-- AlterTable
ALTER TABLE "whatsapp_mensagens_recebidas" ADD COLUMN     "empresaId" TEXT NOT NULL DEFAULT 'empresa_redeagro';

-- AlterTable
ALTER TABLE "historico" ADD COLUMN     "empresaId" TEXT NOT NULL DEFAULT 'empresa_redeagro';

-- CreateTable
CREATE TABLE "empresas" (
    "id" TEXT NOT NULL,
    "nomeFantasia" TEXT NOT NULL,
    "razaoSocial" TEXT,
    "cnpj" TEXT,
    "regimeTributario" TEXT,
    "endereco" TEXT,
    "cidadeUfCep" TEXT,
    "logoPath" TEXT,
    "logoEscuroPath" TEXT,
    "corPrimaria" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "empresas_pkey" PRIMARY KEY ("id")
);

-- Rede Agro: primeira empresa, dona de todos os registros já existentes
-- (as colunas empresaId abaixo nascem com ela como padrão).
INSERT INTO "empresas" ("id", "nomeFantasia", "razaoSocial", "cnpj", "regimeTributario", "endereco", "cidadeUfCep", "updatedAt")
VALUES ('empresa_redeagro', 'REDE AGRO', 'REDE AGRO LTDA', '17.795.702/0001-01', 'Simples Nacional',
        'Juscelino Kubistchek, 1850 - Jardim Paraíso 2 Etapa', 'Luís Eduardo Magalhães/BA - CEP 47850-000', CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;


-- CreateIndex
CREATE INDEX "users_empresaId_idx" ON "users"("empresaId");

-- CreateIndex
CREATE INDEX "clientes_empresaId_idx" ON "clientes"("empresaId");

-- CreateIndex
CREATE UNIQUE INDEX "clientes_empresaId_nome_key" ON "clientes"("empresaId", "nome");

-- CreateIndex
CREATE INDEX "fazendas_empresaId_idx" ON "fazendas"("empresaId");

-- CreateIndex
CREATE INDEX "safras_empresaId_idx" ON "safras"("empresaId");

-- CreateIndex
CREATE UNIQUE INDEX "safras_empresaId_nome_key" ON "safras"("empresaId", "nome");

-- CreateIndex
CREATE INDEX "fornecedores_empresaId_idx" ON "fornecedores"("empresaId");

-- CreateIndex
CREATE UNIQUE INDEX "fornecedores_empresaId_nome_key" ON "fornecedores"("empresaId", "nome");

-- CreateIndex
CREATE INDEX "produtos_empresaId_idx" ON "produtos"("empresaId");

-- CreateIndex
CREATE INDEX "vendas_empresaId_idx" ON "vendas"("empresaId");

-- CreateIndex
CREATE INDEX "propostas_empresaId_idx" ON "propostas"("empresaId");

-- CreateIndex
CREATE INDEX "notas_fiscais_empresaId_idx" ON "notas_fiscais"("empresaId");

-- CreateIndex
CREATE INDEX "boletos_empresaId_idx" ON "boletos"("empresaId");

-- CreateIndex
CREATE INDEX "proposta_itens_empresaId_idx" ON "proposta_itens"("empresaId");

-- CreateIndex
CREATE INDEX "metas_empresaId_idx" ON "metas"("empresaId");

-- CreateIndex
CREATE INDEX "relatorios_visita_empresaId_idx" ON "relatorios_visita"("empresaId");

-- CreateIndex
CREATE INDEX "relatorios_visita_versoes_empresaId_idx" ON "relatorios_visita_versoes"("empresaId");

-- CreateIndex
CREATE INDEX "trabalhos_empresaId_idx" ON "trabalhos"("empresaId");

-- CreateIndex
CREATE INDEX "fotos_visita_empresaId_idx" ON "fotos_visita"("empresaId");

-- CreateIndex
CREATE INDEX "despesas_empresaId_idx" ON "despesas"("empresaId");

-- CreateIndex
CREATE INDEX "grupos_despesa_empresaId_idx" ON "grupos_despesa"("empresaId");

-- CreateIndex
CREATE INDEX "contas_despesa_empresaId_idx" ON "contas_despesa"("empresaId");

-- CreateIndex
CREATE UNIQUE INDEX "contas_despesa_empresaId_codigo_key" ON "contas_despesa"("empresaId", "codigo");

-- CreateIndex
CREATE INDEX "orcamentos_conta_despesa_empresaId_idx" ON "orcamentos_conta_despesa"("empresaId");

-- CreateIndex
CREATE INDEX "fotos_despesa_empresaId_idx" ON "fotos_despesa"("empresaId");

-- CreateIndex
CREATE INDEX "whatsapp_vinculos_empresaId_idx" ON "whatsapp_vinculos"("empresaId");

-- CreateIndex
CREATE INDEX "whatsapp_sessoes_empresaId_idx" ON "whatsapp_sessoes"("empresaId");

-- CreateIndex
CREATE INDEX "monitoramento_saude_empresaId_idx" ON "monitoramento_saude"("empresaId");

-- CreateIndex
CREATE INDEX "whatsapp_mensagens_recebidas_empresaId_idx" ON "whatsapp_mensagens_recebidas"("empresaId");

-- CreateIndex
CREATE INDEX "historico_empresaId_idx" ON "historico"("empresaId");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clientes" ADD CONSTRAINT "clientes_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fazendas" ADD CONSTRAINT "fazendas_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "safras" ADD CONSTRAINT "safras_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fornecedores" ADD CONSTRAINT "fornecedores_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "produtos" ADD CONSTRAINT "produtos_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendas" ADD CONSTRAINT "vendas_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "propostas" ADD CONSTRAINT "propostas_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notas_fiscais" ADD CONSTRAINT "notas_fiscais_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "boletos" ADD CONSTRAINT "boletos_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proposta_itens" ADD CONSTRAINT "proposta_itens_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "metas" ADD CONSTRAINT "metas_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "relatorios_visita" ADD CONSTRAINT "relatorios_visita_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "relatorios_visita_versoes" ADD CONSTRAINT "relatorios_visita_versoes_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trabalhos" ADD CONSTRAINT "trabalhos_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fotos_visita" ADD CONSTRAINT "fotos_visita_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "despesas" ADD CONSTRAINT "despesas_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grupos_despesa" ADD CONSTRAINT "grupos_despesa_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contas_despesa" ADD CONSTRAINT "contas_despesa_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orcamentos_conta_despesa" ADD CONSTRAINT "orcamentos_conta_despesa_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fotos_despesa" ADD CONSTRAINT "fotos_despesa_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_vinculos" ADD CONSTRAINT "whatsapp_vinculos_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_sessoes" ADD CONSTRAINT "whatsapp_sessoes_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monitoramento_saude" ADD CONSTRAINT "monitoramento_saude_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_mensagens_recebidas" ADD CONSTRAINT "whatsapp_mensagens_recebidas_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "historico" ADD CONSTRAINT "historico_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Filho sempre pertence à empresa do pai: cobre registros criados aninhados
-- (ex.: itens dentro da proposta), que o filtro do Prisma não alcança.
CREATE OR REPLACE FUNCTION "herdar_empresa_do_pai"() RETURNS trigger AS $$
DECLARE
  pai_id TEXT := to_jsonb(NEW) ->> TG_ARGV[1];
  empresa TEXT;
BEGIN
  IF pai_id IS NOT NULL THEN
    EXECUTE format('SELECT "empresaId" FROM %I WHERE "id" = $1', TG_ARGV[0]) INTO empresa USING pai_id;
    IF empresa IS NOT NULL THEN
      NEW."empresaId" := empresa;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "fazendas_herdar_empresa" BEFORE INSERT ON "fazendas"
  FOR EACH ROW EXECUTE FUNCTION "herdar_empresa_do_pai"('clientes', 'clienteId');

CREATE TRIGGER "proposta_itens_herdar_empresa" BEFORE INSERT ON "proposta_itens"
  FOR EACH ROW EXECUTE FUNCTION "herdar_empresa_do_pai"('propostas', 'propostaId');

CREATE TRIGGER "relatorios_visita_versoes_herdar_empresa" BEFORE INSERT ON "relatorios_visita_versoes"
  FOR EACH ROW EXECUTE FUNCTION "herdar_empresa_do_pai"('relatorios_visita', 'relatorioId');

CREATE TRIGGER "fotos_visita_herdar_empresa" BEFORE INSERT ON "fotos_visita"
  FOR EACH ROW EXECUTE FUNCTION "herdar_empresa_do_pai"('relatorios_visita', 'relatorioId');

CREATE TRIGGER "orcamentos_conta_despesa_herdar_empresa" BEFORE INSERT ON "orcamentos_conta_despesa"
  FOR EACH ROW EXECUTE FUNCTION "herdar_empresa_do_pai"('contas_despesa', 'contaId');

CREATE TRIGGER "fotos_despesa_herdar_empresa" BEFORE INSERT ON "fotos_despesa"
  FOR EACH ROW EXECUTE FUNCTION "herdar_empresa_do_pai"('despesas', 'despesaId');

CREATE TRIGGER "notas_fiscais_herdar_empresa" BEFORE INSERT ON "notas_fiscais"
  FOR EACH ROW EXECUTE FUNCTION "herdar_empresa_do_pai"('propostas', 'propostaId');

CREATE TRIGGER "boletos_herdar_empresa" BEFORE INSERT ON "boletos"
  FOR EACH ROW EXECUTE FUNCTION "herdar_empresa_do_pai"('propostas', 'propostaId');

CREATE TRIGGER "contas_despesa_herdar_empresa" BEFORE INSERT ON "contas_despesa"
  FOR EACH ROW EXECUTE FUNCTION "herdar_empresa_do_pai"('grupos_despesa', 'grupoId');

CREATE TRIGGER "whatsapp_vinculos_herdar_empresa" BEFORE INSERT ON "whatsapp_vinculos"
  FOR EACH ROW EXECUTE FUNCTION "herdar_empresa_do_pai"('users', 'userId');

-- Empresa da equipe Cardo AI: dona da conta super ADM (criada à parte, fora do git).
INSERT INTO "empresas" ("id", "nomeFantasia", "razaoSocial", "updatedAt")
VALUES ('empresa_cardoai', 'Cardo AI', 'Cardo AI', CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
