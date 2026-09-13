CREATE TYPE "StatusAquisicaoBeneficio" AS ENUM ('PENDENTE', 'CONFIRMADA', 'CANCELADA');
CREATE TYPE "StatusItemAquisicaoBeneficio" AS ENUM ('PENDENTE', 'CONFIRMADO', 'REJEITADO', 'CANCELADO');
CREATE TYPE "TipoMovimentacaoAquisicaoBeneficio" AS ENUM ('CONFIRMACAO', 'REVERSAO');

ALTER TABLE "BeneficioVinculo" ADD COLUMN "configuracaoRecorrenteId" UUID;
ALTER TABLE "BeneficioVinculo" ADD COLUMN "valorDiario" DECIMAL(12,2);
ALTER TABLE "BeneficioVinculo" ADD CONSTRAINT "BeneficioVinculo_configuracaoRecorrenteId_fkey" FOREIGN KEY ("configuracaoRecorrenteId") REFERENCES "ConfiguracaoBeneficio"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "AquisicaoBeneficio" (
  "id" UUID NOT NULL,
  "unidadeId" UUID NOT NULL,
  "competencia" DATE NOT NULL,
  "tipo" "TipoBeneficio" NOT NULL,
  "fornecedorId" UUID NOT NULL,
  "cartaoTransporteId" UUID,
  "status" "StatusAquisicaoBeneficio" NOT NULL DEFAULT 'PENDENTE',
  "referenciaExterna" VARCHAR(180),
  "dataCompra" DATE,
  "observacoes" TEXT,
  "criadoPorId" UUID NOT NULL,
  "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizadoEm" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AquisicaoBeneficio_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AquisicaoBeneficio_unidadeId_competencia_tipo_status_idx" ON "AquisicaoBeneficio"("unidadeId", "competencia", "tipo", "status");
CREATE INDEX "AquisicaoBeneficio_fornecedorId_cartaoTransporteId_idx" ON "AquisicaoBeneficio"("fornecedorId", "cartaoTransporteId");
ALTER TABLE "AquisicaoBeneficio" ADD CONSTRAINT "AquisicaoBeneficio_unidadeId_fkey" FOREIGN KEY ("unidadeId") REFERENCES "Unidade"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AquisicaoBeneficio" ADD CONSTRAINT "AquisicaoBeneficio_fornecedorId_fkey" FOREIGN KEY ("fornecedorId") REFERENCES "Fornecedor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AquisicaoBeneficio" ADD CONSTRAINT "AquisicaoBeneficio_cartaoTransporteId_fkey" FOREIGN KEY ("cartaoTransporteId") REFERENCES "CartaoTransporte"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AquisicaoBeneficio" ADD CONSTRAINT "AquisicaoBeneficio_criadoPorId_fkey" FOREIGN KEY ("criadoPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "AquisicaoBeneficioItem" (
  "id" UUID NOT NULL,
  "aquisicaoId" UUID NOT NULL,
  "competenciaId" UUID NOT NULL,
  "vinculoId" UUID NOT NULL,
  "pessoaNome" VARCHAR(180) NOT NULL,
  "equipeNome" VARCHAR(180),
  "destino" VARCHAR(180) NOT NULL,
  "valorPrevisto" DECIMAL(12,2) NOT NULL,
  "valorReservado" DECIMAL(12,2) NOT NULL,
  "status" "StatusItemAquisicaoBeneficio" NOT NULL DEFAULT 'PENDENTE',
  "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AquisicaoBeneficioItem_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AquisicaoBeneficioItem_competenciaId_status_idx" ON "AquisicaoBeneficioItem"("competenciaId", "status");
CREATE INDEX "AquisicaoBeneficioItem_vinculoId_idx" ON "AquisicaoBeneficioItem"("vinculoId");
ALTER TABLE "AquisicaoBeneficioItem" ADD CONSTRAINT "AquisicaoBeneficioItem_aquisicaoId_fkey" FOREIGN KEY ("aquisicaoId") REFERENCES "AquisicaoBeneficio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AquisicaoBeneficioItem" ADD CONSTRAINT "AquisicaoBeneficioItem_competenciaId_fkey" FOREIGN KEY ("competenciaId") REFERENCES "BeneficioCompetencia"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "MovimentacaoAquisicaoBeneficio" (
  "id" UUID NOT NULL,
  "itemId" UUID NOT NULL,
  "tipo" "TipoMovimentacaoAquisicaoBeneficio" NOT NULL,
  "valor" DECIMAL(12,2) NOT NULL,
  "data" DATE NOT NULL,
  "motivo" TEXT,
  "criadoPorId" UUID NOT NULL,
  "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MovimentacaoAquisicaoBeneficio_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "MovimentacaoAquisicaoBeneficio_itemId_tipo_idx" ON "MovimentacaoAquisicaoBeneficio"("itemId", "tipo");
ALTER TABLE "MovimentacaoAquisicaoBeneficio" ADD CONSTRAINT "MovimentacaoAquisicaoBeneficio_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "AquisicaoBeneficioItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MovimentacaoAquisicaoBeneficio" ADD CONSTRAINT "MovimentacaoAquisicaoBeneficio_criadoPorId_fkey" FOREIGN KEY ("criadoPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
