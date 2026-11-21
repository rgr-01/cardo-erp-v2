-- Plano de contas, orçamento por safra e campos de contas a pagar nas despesas.
CREATE TYPE "SituacaoDespesa" AS ENUM ('PAGO', 'A_PAGAR');

CREATE TABLE "grupos_despesa" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "grupos_despesa_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "contas_despesa" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "grupoId" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "orcamentoPadrao" DECIMAL(16,4) NOT NULL DEFAULT 0,
    CONSTRAINT "contas_despesa_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "orcamentos_conta_despesa" (
    "id" TEXT NOT NULL,
    "contaId" TEXT NOT NULL,
    "safraId" TEXT NOT NULL,
    "valorMensal" DECIMAL(16,4) NOT NULL,
    CONSTRAINT "orcamentos_conta_despesa_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "contas_despesa_codigo_key" ON "contas_despesa"("codigo");
CREATE INDEX "contas_despesa_grupoId_idx" ON "contas_despesa"("grupoId");
CREATE UNIQUE INDEX "orcamentos_conta_despesa_contaId_safraId_key" ON "orcamentos_conta_despesa"("contaId", "safraId");

ALTER TABLE "contas_despesa" ADD CONSTRAINT "contas_despesa_grupoId_fkey" FOREIGN KEY ("grupoId") REFERENCES "grupos_despesa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "orcamentos_conta_despesa" ADD CONSTRAINT "orcamentos_conta_despesa_contaId_fkey" FOREIGN KEY ("contaId") REFERENCES "contas_despesa"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "orcamentos_conta_despesa" ADD CONSTRAINT "orcamentos_conta_despesa_safraId_fkey" FOREIGN KEY ("safraId") REFERENCES "safras"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "despesas"
    ADD COLUMN "contaId" TEXT,
    ADD COLUMN "documento" TEXT,
    ADD COLUMN "vencimento" TIMESTAMP(3),
    ADD COLUMN "situacao" "SituacaoDespesa" NOT NULL DEFAULT 'PAGO',
    ADD COLUMN "filial" TEXT;
CREATE INDEX "despesas_contaId_idx" ON "despesas"("contaId");
ALTER TABLE "despesas" ADD CONSTRAINT "despesas_contaId_fkey" FOREIGN KEY ("contaId") REFERENCES "contas_despesa"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "grupos_despesa" ("id","nome","ordem") VALUES ('G1','Pessoal administrativo',0);
INSERT INTO "contas_despesa" ("id","codigo","nome","grupoId","ordem","orcamentoPadrao") VALUES ('C3.1.01','3.1.01','Salários administrativos','G1',0,48000);
INSERT INTO "contas_despesa" ("id","codigo","nome","grupoId","ordem","orcamentoPadrao") VALUES ('C3.1.02','3.1.02','Encargos sociais (INSS e FGTS)','G1',1,18500);
INSERT INTO "contas_despesa" ("id","codigo","nome","grupoId","ordem","orcamentoPadrao") VALUES ('C3.1.03','3.1.03','Benefícios (VR, VT e saúde)','G1',2,9200);
INSERT INTO "contas_despesa" ("id","codigo","nome","grupoId","ordem","orcamentoPadrao") VALUES ('C3.1.04','3.1.04','Pró-labore','G1',3,15000);
INSERT INTO "grupos_despesa" ("id","nome","ordem") VALUES ('G2','Ocupação',1);
INSERT INTO "contas_despesa" ("id","codigo","nome","grupoId","ordem","orcamentoPadrao") VALUES ('C3.2.01','3.2.01','Aluguel','G2',0,12000);
INSERT INTO "contas_despesa" ("id","codigo","nome","grupoId","ordem","orcamentoPadrao") VALUES ('C3.2.02','3.2.02','Energia elétrica','G2',1,6800);
INSERT INTO "contas_despesa" ("id","codigo","nome","grupoId","ordem","orcamentoPadrao") VALUES ('C3.2.03','3.2.03','Água e esgoto','G2',2,950);
INSERT INTO "contas_despesa" ("id","codigo","nome","grupoId","ordem","orcamentoPadrao") VALUES ('C3.2.04','3.2.04','IPTU','G2',3,1100);
INSERT INTO "contas_despesa" ("id","codigo","nome","grupoId","ordem","orcamentoPadrao") VALUES ('C3.2.05','3.2.05','Manutenção predial','G2',4,2500);
INSERT INTO "contas_despesa" ("id","codigo","nome","grupoId","ordem","orcamentoPadrao") VALUES ('C3.2.06','3.2.06','Vigilância e monitoramento','G2',5,3200);
INSERT INTO "grupos_despesa" ("id","nome","ordem") VALUES ('G3','Tecnologia e comunicação',2);
INSERT INTO "contas_despesa" ("id","codigo","nome","grupoId","ordem","orcamentoPadrao") VALUES ('C3.3.01','3.3.01','Sistema de gestão (ERP)','G3',0,2900);
INSERT INTO "contas_despesa" ("id","codigo","nome","grupoId","ordem","orcamentoPadrao") VALUES ('C3.3.02','3.3.02','Internet e links','G3',1,1200);
INSERT INTO "contas_despesa" ("id","codigo","nome","grupoId","ordem","orcamentoPadrao") VALUES ('C3.3.03','3.3.03','Telefonia','G3',2,1400);
INSERT INTO "contas_despesa" ("id","codigo","nome","grupoId","ordem","orcamentoPadrao") VALUES ('C3.3.04','3.3.04','Certificado digital e emissor NF-e','G3',3,380);
INSERT INTO "grupos_despesa" ("id","nome","ordem") VALUES ('G4','Serviços profissionais',3);
INSERT INTO "contas_despesa" ("id","codigo","nome","grupoId","ordem","orcamentoPadrao") VALUES ('C3.4.01','3.4.01','Honorários contábeis','G4',0,4800);
INSERT INTO "contas_despesa" ("id","codigo","nome","grupoId","ordem","orcamentoPadrao") VALUES ('C3.4.02','3.4.02','Assessoria jurídica','G4',1,2500);
INSERT INTO "contas_despesa" ("id","codigo","nome","grupoId","ordem","orcamentoPadrao") VALUES ('C3.4.03','3.4.03','Auditoria e consultoria','G4',2,1500);
INSERT INTO "grupos_despesa" ("id","nome","ordem") VALUES ('G5','Veículos e deslocamento',4);
INSERT INTO "contas_despesa" ("id","codigo","nome","grupoId","ordem","orcamentoPadrao") VALUES ('C3.5.01','3.5.01','Combustível administrativo','G5',0,3800);
INSERT INTO "contas_despesa" ("id","codigo","nome","grupoId","ordem","orcamentoPadrao") VALUES ('C3.5.02','3.5.02','Manutenção de veículos','G5',1,2200);
INSERT INTO "contas_despesa" ("id","codigo","nome","grupoId","ordem","orcamentoPadrao") VALUES ('C3.5.03','3.5.03','Seguro de veículos','G5',2,1600);
INSERT INTO "contas_despesa" ("id","codigo","nome","grupoId","ordem","orcamentoPadrao") VALUES ('C3.5.04','3.5.04','Viagens e hospedagem','G5',3,2000);
INSERT INTO "grupos_despesa" ("id","nome","ordem") VALUES ('G6','Despesas gerais',5);
INSERT INTO "contas_despesa" ("id","codigo","nome","grupoId","ordem","orcamentoPadrao") VALUES ('C3.6.01','3.6.01','Material de escritório','G6',0,900);
INSERT INTO "contas_despesa" ("id","codigo","nome","grupoId","ordem","orcamentoPadrao") VALUES ('C3.6.02','3.6.02','Limpeza e copa','G6',1,1300);
INSERT INTO "contas_despesa" ("id","codigo","nome","grupoId","ordem","orcamentoPadrao") VALUES ('C3.6.03','3.6.03','Correios e malotes','G6',2,450);
INSERT INTO "contas_despesa" ("id","codigo","nome","grupoId","ordem","orcamentoPadrao") VALUES ('C3.6.04','3.6.04','Taxas, alvarás e registros','G6',3,1200);
INSERT INTO "contas_despesa" ("id","codigo","nome","grupoId","ordem","orcamentoPadrao") VALUES ('C3.6.05','3.6.05','Seguro patrimonial','G6',4,1900);
INSERT INTO "contas_despesa" ("id","codigo","nome","grupoId","ordem","orcamentoPadrao") VALUES ('C3.6.06','3.6.06','Tarifas bancárias','G6',5,1600);
INSERT INTO "contas_despesa" ("id","codigo","nome","grupoId","ordem","orcamentoPadrao") VALUES ('C3.6.99','3.6.99','Outras despesas','G6',6,0);

-- Orçamento inicial das safras existentes = valor padrão da conta (editável no site).
INSERT INTO "orcamentos_conta_despesa" ("id","contaId","safraId","valorMensal")
SELECT 'O' || c."id" || s."id", c."id", s."id", c."orcamentoPadrao" FROM "contas_despesa" c CROSS JOIN "safras" s;

-- Despesas antigas (categorias fixas) passam a apontar para uma conta.
UPDATE "despesas" SET "contaId" = CASE "categoria"
    WHEN 'COMBUSTIVEL' THEN 'C3.5.01'
    WHEN 'ALIMENTACAO' THEN 'C3.5.04'
    WHEN 'HOSPEDAGEM' THEN 'C3.5.04'
    WHEN 'PEDAGIO' THEN 'C3.5.04'
    WHEN 'MANUTENCAO_VEICULO' THEN 'C3.5.02'
    WHEN 'MATERIAL_ESCRITORIO' THEN 'C3.6.01'
    ELSE 'C3.6.99' END;
