CREATE TYPE "TipoEscalaVinculo" AS ENUM ('DIAS_SEMANA', 'QUANTIDADE_SEMANAL');
CREATE TYPE "DiaSemana" AS ENUM ('SEGUNDA', 'TERCA', 'QUARTA', 'QUINTA', 'SEXTA', 'SABADO', 'DOMINGO');

ALTER TABLE "Vinculo"
  ADD COLUMN "tipoEscala" "TipoEscalaVinculo",
  ADD COLUMN "diasSemana" "DiaSemana"[] NOT NULL DEFAULT ARRAY[]::"DiaSemana"[],
  ADD COLUMN "quantidadeDiasSemana" INTEGER;

ALTER TABLE "AquisicaoBeneficio"
  DROP CONSTRAINT IF EXISTS "AquisicaoBeneficio_cartaoTransporteId_fkey",
  DROP COLUMN IF EXISTS "cartaoTransporteId";
DROP INDEX IF EXISTS "AquisicaoBeneficio_fornecedorId_cartaoTransporteId_idx";
CREATE INDEX "AquisicaoBeneficio_fornecedorId_idx" ON "AquisicaoBeneficio"("fornecedorId");

ALTER TABLE "BeneficioTransporteItem"
  DROP CONSTRAINT IF EXISTS "BeneficioTransporteItem_cartaoTransporteId_fkey",
  DROP COLUMN IF EXISTS "cartaoTransporteId";
DROP INDEX IF EXISTS "BeneficioTransporteItem_cartaoTransporteId_tipoConducao_idx";
CREATE INDEX "BeneficioTransporteItem_tipoConducao_idx" ON "BeneficioTransporteItem"("tipoConducao");

ALTER TABLE "BeneficioTransporteCompetenciaItem"
  DROP CONSTRAINT IF EXISTS "BeneficioTransporteCompetenciaItem_cartaoTransporteId_fkey",
  DROP COLUMN IF EXISTS "cartaoTransporteId";
DROP INDEX IF EXISTS "BeneficioTransporteCompetenciaItem_cartaoTransporteId_tipoConducao_idx";
DROP INDEX IF EXISTS "BeneficioTransporteCompetenciaItem_fornecedorId_cartaoTransporteId_idx";
CREATE INDEX "BeneficioTransporteCompetenciaItem_tipoConducao_idx" ON "BeneficioTransporteCompetenciaItem"("tipoConducao");
CREATE INDEX "BeneficioTransporteCompetenciaItem_fornecedorId_idx" ON "BeneficioTransporteCompetenciaItem"("fornecedorId");

DROP TABLE IF EXISTS "CartaoTransporte";
