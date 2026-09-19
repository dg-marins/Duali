ALTER TABLE "BeneficioVinculo"
  ADD COLUMN "valorMensalRecorrente" DECIMAL(12,2);

ALTER TABLE "BeneficioCompetencia"
  ADD COLUMN "valorMensalBase" DECIMAL(12,2);

ALTER TABLE "AquisicaoBeneficioItem"
  ADD COLUMN "valorSolicitado" DECIMAL(12,2),
  ADD COLUMN "composicao" JSONB;
