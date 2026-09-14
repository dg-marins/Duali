CREATE TABLE "BeneficioAjusteTransporteItem" (
  "id" UUID NOT NULL,
  "ajusteId" UUID NOT NULL,
  "transporteCompetenciaItemId" UUID NOT NULL,
  "valor" DECIMAL(12,2) NOT NULL,
  CONSTRAINT "BeneficioAjusteTransporteItem_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BeneficioAjusteTransporteItem_ajusteId_fkey" FOREIGN KEY ("ajusteId") REFERENCES "BeneficioAjuste"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "BeneficioAjusteTransporteItem_transporteCompetenciaItemId_fkey" FOREIGN KEY ("transporteCompetenciaItemId") REFERENCES "BeneficioTransporteCompetenciaItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "BeneficioAjusteTransporteItem_ajusteId_transporteCompetenciaItemId_key" UNIQUE ("ajusteId", "transporteCompetenciaItemId")
);
CREATE INDEX "BeneficioAjusteTransporteItem_transporteCompetenciaItemId_idx" ON "BeneficioAjusteTransporteItem"("transporteCompetenciaItemId");

CREATE TABLE "ChaveIdempotencia" (
  "id" UUID NOT NULL,
  "chave" VARCHAR(180) NOT NULL,
  "operacao" VARCHAR(80) NOT NULL,
  "hashPayload" VARCHAR(128) NOT NULL,
  "resposta" JSONB NOT NULL,
  "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ChaveIdempotencia_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ChaveIdempotencia_chave_key" UNIQUE ("chave")
);
CREATE INDEX "ChaveIdempotencia_operacao_criadoEm_idx" ON "ChaveIdempotencia"("operacao", "criadoEm");
