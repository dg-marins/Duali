CREATE TYPE "TipoConducao" AS ENUM ('ONIBUS', 'ONIBUS_INTER', 'BARCA', 'METRO');

CREATE TABLE "CartaoTransporte" (
    "id" UUID NOT NULL,
    "nome" VARCHAR(120) NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CartaoTransporte_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CartaoTransporte_nome_key" ON "CartaoTransporte"("nome");

CREATE TABLE "BeneficioTransporteItem" (
    "id" UUID NOT NULL,
    "beneficioVinculoId" UUID NOT NULL,
    "tipoConducao" "TipoConducao" NOT NULL,
    "cartaoTransporteId" UUID NOT NULL,
    "valorDiario" DECIMAL(12,2) NOT NULL,
    "inicioVigencia" DATE NOT NULL,
    "fimVigencia" DATE,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BeneficioTransporteItem_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "BeneficioTransporteItem_beneficioVinculoId_ativo_inicioVigencia_idx" ON "BeneficioTransporteItem"("beneficioVinculoId", "ativo", "inicioVigencia");
CREATE INDEX "BeneficioTransporteItem_cartaoTransporteId_tipoConducao_idx" ON "BeneficioTransporteItem"("cartaoTransporteId", "tipoConducao");
ALTER TABLE "BeneficioTransporteItem" ADD CONSTRAINT "BeneficioTransporteItem_beneficioVinculoId_fkey" FOREIGN KEY ("beneficioVinculoId") REFERENCES "BeneficioVinculo"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BeneficioTransporteItem" ADD CONSTRAINT "BeneficioTransporteItem_cartaoTransporteId_fkey" FOREIGN KEY ("cartaoTransporteId") REFERENCES "CartaoTransporte"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "BeneficioTransporteCompetenciaItem" (
    "id" UUID NOT NULL,
    "competenciaId" UUID NOT NULL,
    "origemItemId" UUID,
    "tipoConducao" "TipoConducao" NOT NULL,
    "cartaoTransporteId" UUID NOT NULL,
    "valorDiario" DECIMAL(12,2) NOT NULL,
    CONSTRAINT "BeneficioTransporteCompetenciaItem_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "BeneficioTransporteCompetenciaItem_competenciaId_idx" ON "BeneficioTransporteCompetenciaItem"("competenciaId");
CREATE INDEX "BeneficioTransporteCompetenciaItem_cartaoTransporteId_tipoConducao_idx" ON "BeneficioTransporteCompetenciaItem"("cartaoTransporteId", "tipoConducao");
ALTER TABLE "BeneficioTransporteCompetenciaItem" ADD CONSTRAINT "BeneficioTransporteCompetenciaItem_competenciaId_fkey" FOREIGN KEY ("competenciaId") REFERENCES "BeneficioCompetencia"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BeneficioTransporteCompetenciaItem" ADD CONSTRAINT "BeneficioTransporteCompetenciaItem_origemItemId_fkey" FOREIGN KEY ("origemItemId") REFERENCES "BeneficioTransporteItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BeneficioTransporteCompetenciaItem" ADD CONSTRAINT "BeneficioTransporteCompetenciaItem_cartaoTransporteId_fkey" FOREIGN KEY ("cartaoTransporteId") REFERENCES "CartaoTransporte"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "BeneficioCompetencia" ADD COLUMN "transporteRevisaoPendente" BOOLEAN NOT NULL DEFAULT false;
UPDATE "BeneficioCompetencia" bc
SET "transporteRevisaoPendente" = true
FROM "BeneficioVinculo" bv
WHERE bc."beneficioVinculoId" = bv."id" AND bv."tipo" = 'TRANSPORTE';

INSERT INTO "CartaoTransporte" ("id", "nome", "atualizadoEm") VALUES
 ('00000000-0000-4000-8000-000000000001', 'RioCard', CURRENT_TIMESTAMP),
 ('00000000-0000-4000-8000-000000000002', 'JAÉ', CURRENT_TIMESTAMP),
 ('00000000-0000-4000-8000-000000000003', 'Flash', CURRENT_TIMESTAMP),
 ('00000000-0000-4000-8000-000000000004', 'SPTrans', CURRENT_TIMESTAMP),
 ('00000000-0000-4000-8000-000000000005', 'VilaNova', CURRENT_TIMESTAMP);
