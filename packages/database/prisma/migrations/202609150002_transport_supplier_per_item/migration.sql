ALTER TABLE "BeneficioTransporteItem"
ADD COLUMN "fornecedorId" UUID;

ALTER TABLE "BeneficioTransporteCompetenciaItem"
ADD COLUMN "fornecedorId" UUID;

ALTER TABLE "BeneficioTransporteItem"
ADD CONSTRAINT "BeneficioTransporteItem_fornecedorId_fkey"
FOREIGN KEY ("fornecedorId") REFERENCES "Fornecedor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "BeneficioTransporteCompetenciaItem"
ADD CONSTRAINT "BeneficioTransporteCompetenciaItem_fornecedorId_fkey"
FOREIGN KEY ("fornecedorId") REFERENCES "Fornecedor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "BeneficioTransporteItem_fornecedorId_ativo_inicioVigencia_idx"
ON "BeneficioTransporteItem"("fornecedorId", "ativo", "inicioVigencia");

CREATE INDEX "BeneficioTransporteCompetenciaItem_fornecedorId_cartaoTransporteId_idx"
ON "BeneficioTransporteCompetenciaItem"("fornecedorId", "cartaoTransporteId");

UPDATE "BeneficioCompetencia"
SET "transporteRevisaoPendente" = true
WHERE EXISTS (
  SELECT 1
  FROM "BeneficioTransporteCompetenciaItem" item
  WHERE item."competenciaId" = "BeneficioCompetencia"."id"
    AND item."fornecedorId" IS NULL
);
