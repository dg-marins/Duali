-- CreateTable
CREATE TABLE "Fornecedor" (
    "id" UUID NOT NULL,
    "nome" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Fornecedor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConfiguracaoBeneficio" (
    "id" UUID NOT NULL,
    "unidadeId" UUID NOT NULL,
    "tipo" TEXT NOT NULL,
    "fornecedorId" UUID NOT NULL,
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "observacoes" TEXT,

    CONSTRAINT "ConfiguracaoBeneficio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BeneficioVinculo" (
    "id" UUID NOT NULL,
    "vinculoId" UUID NOT NULL,
    "tipo" TEXT NOT NULL,
    "inicioVigencia" DATE NOT NULL,
    "fimVigencia" DATE,
    "status" TEXT NOT NULL DEFAULT 'ATIVO',
    "observacoes" TEXT,

    CONSTRAINT "BeneficioVinculo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BeneficioCompetencia" (
    "id" UUID NOT NULL,
    "beneficioVinculoId" UUID NOT NULL,
    "configuracaoId" UUID NOT NULL,
    "componente" TEXT NOT NULL DEFAULT 'Principal',
    "competencia" DATE NOT NULL,
    "quantidadeDias" DECIMAL(7,2),
    "quantidade" DECIMAL(7,2),
    "valorUnitario" DECIMAL(12,2),
    "valorInformado" DECIMAL(12,2),
    "status" TEXT NOT NULL DEFAULT 'PENDENTE',
    "observacoes" TEXT,

    CONSTRAINT "BeneficioCompetencia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BeneficioAjuste" (
    "id" UUID NOT NULL,
    "competenciaId" UUID NOT NULL,
    "tipo" TEXT NOT NULL,
    "valor" DECIMAL(12,2) NOT NULL,
    "motivo" TEXT NOT NULL,
    "criadoPor" UUID NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BeneficioAjuste_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Fornecedor_nome_key" ON "Fornecedor"("nome");

-- CreateIndex
CREATE UNIQUE INDEX "ConfiguracaoBeneficio_unidadeId_tipo_fornecedorId_key" ON "ConfiguracaoBeneficio"("unidadeId", "tipo", "fornecedorId");

-- CreateIndex
CREATE INDEX "BeneficioVinculo_vinculoId_tipo_idx" ON "BeneficioVinculo"("vinculoId", "tipo");

-- CreateIndex
CREATE INDEX "BeneficioCompetencia_competencia_status_idx" ON "BeneficioCompetencia"("competencia", "status");

-- CreateIndex
CREATE UNIQUE INDEX "BeneficioCompetencia_beneficioVinculoId_configuracaoId_comp_key" ON "BeneficioCompetencia"("beneficioVinculoId", "configuracaoId", "competencia", "componente");

-- CreateIndex
CREATE INDEX "BeneficioAjuste_competenciaId_idx" ON "BeneficioAjuste"("competenciaId");

-- AddForeignKey
ALTER TABLE "ConfiguracaoBeneficio" ADD CONSTRAINT "ConfiguracaoBeneficio_unidadeId_fkey" FOREIGN KEY ("unidadeId") REFERENCES "Unidade"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConfiguracaoBeneficio" ADD CONSTRAINT "ConfiguracaoBeneficio_fornecedorId_fkey" FOREIGN KEY ("fornecedorId") REFERENCES "Fornecedor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BeneficioVinculo" ADD CONSTRAINT "BeneficioVinculo_vinculoId_fkey" FOREIGN KEY ("vinculoId") REFERENCES "Vinculo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BeneficioCompetencia" ADD CONSTRAINT "BeneficioCompetencia_beneficioVinculoId_fkey" FOREIGN KEY ("beneficioVinculoId") REFERENCES "BeneficioVinculo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BeneficioCompetencia" ADD CONSTRAINT "BeneficioCompetencia_configuracaoId_fkey" FOREIGN KEY ("configuracaoId") REFERENCES "ConfiguracaoBeneficio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BeneficioAjuste" ADD CONSTRAINT "BeneficioAjuste_competenciaId_fkey" FOREIGN KEY ("competenciaId") REFERENCES "BeneficioCompetencia"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BeneficioAjuste" ADD CONSTRAINT "BeneficioAjuste_criadoPor_fkey" FOREIGN KEY ("criadoPor") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
