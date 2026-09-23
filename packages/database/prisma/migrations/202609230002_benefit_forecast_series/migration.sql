CREATE TABLE "PrevisaoBeneficioSerie" (
  "id" UUID NOT NULL,
  "unidadeId" UUID NOT NULL,
  "tipo" "TipoBeneficio" NOT NULL,
  "competencia" DATE NOT NULL,
  "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PrevisaoBeneficioSerie_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PrevisaoBeneficioSerie_unidadeId_tipo_competencia_key"
  ON "PrevisaoBeneficioSerie"("unidadeId", "tipo", "competencia");
CREATE INDEX "PrevisaoBeneficioSerie_competencia_unidadeId_idx"
  ON "PrevisaoBeneficioSerie"("competencia", "unidadeId");

INSERT INTO "PrevisaoBeneficioSerie" ("id", "unidadeId", "tipo", "competencia")
SELECT gen_random_uuid(), "unidadeId", "tipo", "competencia"
FROM "PrevisaoBeneficioVersao"
GROUP BY "unidadeId", "tipo", "competencia";

ALTER TABLE "PrevisaoBeneficioVersao"
  ADD COLUMN "serieId" UUID;

UPDATE "PrevisaoBeneficioVersao" AS versao
SET "serieId" = serie."id"
FROM "PrevisaoBeneficioSerie" AS serie
WHERE serie."unidadeId" = versao."unidadeId"
  AND serie."tipo" = versao."tipo"
  AND serie."competencia" = versao."competencia";

ALTER TABLE "PrevisaoBeneficioVersao"
  ALTER COLUMN "serieId" SET NOT NULL;

CREATE UNIQUE INDEX "PrevisaoBeneficioVersao_serieId_numero_key"
  ON "PrevisaoBeneficioVersao"("serieId", "numero");
CREATE INDEX "PrevisaoBeneficioVersao_serieId_vigente_idx"
  ON "PrevisaoBeneficioVersao"("serieId", "vigente");

ALTER TABLE "PrevisaoBeneficioSerie"
  ADD CONSTRAINT "PrevisaoBeneficioSerie_unidadeId_fkey"
  FOREIGN KEY ("unidadeId") REFERENCES "Unidade"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PrevisaoBeneficioVersao"
  ADD CONSTRAINT "PrevisaoBeneficioVersao_serieId_fkey"
  FOREIGN KEY ("serieId") REFERENCES "PrevisaoBeneficioSerie"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
