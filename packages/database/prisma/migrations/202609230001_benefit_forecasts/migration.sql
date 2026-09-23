ALTER TABLE "AquisicaoBeneficio"
  ADD COLUMN "previsaoVersaoId" UUID;

CREATE TABLE "PrevisaoBeneficioVersao" (
  "id" UUID NOT NULL,
  "unidadeId" UUID NOT NULL,
  "tipo" "TipoBeneficio" NOT NULL,
  "competencia" DATE NOT NULL,
  "competenciaBase" DATE NOT NULL,
  "numero" INTEGER NOT NULL,
  "vigente" BOOLEAN NOT NULL DEFAULT true,
  "congeladaEm" TIMESTAMP(3),
  "causa" VARCHAR(80) NOT NULL,
  "baseReaberta" BOOLEAN NOT NULL DEFAULT false,
  "composicaoIncompleta" BOOLEAN NOT NULL DEFAULT false,
  "fingerprint" VARCHAR(64) NOT NULL,
  "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PrevisaoBeneficioVersao_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PrevisaoBeneficioItem" (
  "id" UUID NOT NULL,
  "previsaoVersaoId" UUID NOT NULL,
  "origemAquisicaoItemId" UUID,
  "vinculoId" UUID NOT NULL,
  "pessoaNome" VARCHAR(180) NOT NULL,
  "fornecedorId" UUID NOT NULL,
  "fornecedorNome" VARCHAR(180) NOT NULL,
  "valorPrevisto" DECIMAL(12,2) NOT NULL,
  "composicao" JSONB,
  "incluido" BOOLEAN NOT NULL DEFAULT true,
  "motivoExclusao" VARCHAR(80),
  "impedimentos" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "origemValor" VARCHAR(40) NOT NULL DEFAULT 'VALOR_SOLICITADO',
  "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PrevisaoBeneficioItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PrevisaoBeneficioVersao_unidadeId_tipo_competencia_numero_key"
  ON "PrevisaoBeneficioVersao"("unidadeId", "tipo", "competencia", "numero");
CREATE UNIQUE INDEX "PrevisaoBeneficioVersao_vigente_key"
  ON "PrevisaoBeneficioVersao"("unidadeId", "tipo", "competencia")
  WHERE "vigente" = true;
CREATE INDEX "PrevisaoBeneficioVersao_unidadeId_competencia_tipo_vigente_idx"
  ON "PrevisaoBeneficioVersao"("unidadeId", "competencia", "tipo", "vigente");
CREATE INDEX "PrevisaoBeneficioItem_previsaoVersaoId_incluido_idx"
  ON "PrevisaoBeneficioItem"("previsaoVersaoId", "incluido");
CREATE INDEX "PrevisaoBeneficioItem_vinculoId_idx"
  ON "PrevisaoBeneficioItem"("vinculoId");
CREATE INDEX "PrevisaoBeneficioItem_fornecedorId_idx"
  ON "PrevisaoBeneficioItem"("fornecedorId");
CREATE INDEX "PrevisaoBeneficioItem_origemAquisicaoItemId_idx"
  ON "PrevisaoBeneficioItem"("origemAquisicaoItemId");
CREATE INDEX "AquisicaoBeneficio_previsaoVersaoId_idx"
  ON "AquisicaoBeneficio"("previsaoVersaoId");

ALTER TABLE "PrevisaoBeneficioVersao"
  ADD CONSTRAINT "PrevisaoBeneficioVersao_unidadeId_fkey"
  FOREIGN KEY ("unidadeId") REFERENCES "Unidade"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PrevisaoBeneficioItem"
  ADD CONSTRAINT "PrevisaoBeneficioItem_previsaoVersaoId_fkey"
  FOREIGN KEY ("previsaoVersaoId") REFERENCES "PrevisaoBeneficioVersao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PrevisaoBeneficioItem"
  ADD CONSTRAINT "PrevisaoBeneficioItem_origemAquisicaoItemId_fkey"
  FOREIGN KEY ("origemAquisicaoItemId") REFERENCES "AquisicaoBeneficioItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PrevisaoBeneficioItem"
  ADD CONSTRAINT "PrevisaoBeneficioItem_vinculoId_fkey"
  FOREIGN KEY ("vinculoId") REFERENCES "Vinculo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PrevisaoBeneficioItem"
  ADD CONSTRAINT "PrevisaoBeneficioItem_fornecedorId_fkey"
  FOREIGN KEY ("fornecedorId") REFERENCES "Fornecedor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AquisicaoBeneficio"
  ADD CONSTRAINT "AquisicaoBeneficio_previsaoVersaoId_fkey"
  FOREIGN KEY ("previsaoVersaoId") REFERENCES "PrevisaoBeneficioVersao"("id") ON DELETE SET NULL ON UPDATE CASCADE;
