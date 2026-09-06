-- CreateTable
CREATE TABLE "DescansoDireito" (
    "id" UUID NOT NULL,
    "vinculoId" UUID NOT NULL,
    "dataAquisicao" DATE NOT NULL,
    "inicioAquisitivo" DATE,
    "fimAquisitivo" DATE,
    "quantidadeDias" DECIMAL(5,2) NOT NULL,
    "origem" TEXT NOT NULL DEFAULT 'AUTOMATICA',
    "prazoConcessivo" DATE,
    "observacoes" TEXT,

    CONSTRAINT "DescansoDireito_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DescansoPeriodo" (
    "id" UUID NOT NULL,
    "vinculoId" UUID NOT NULL,
    "dataInicio" DATE NOT NULL,
    "dataFim" DATE NOT NULL,
    "quantidadeDias" DECIMAL(5,2) NOT NULL,
    "tipo" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PROGRAMADO',
    "motivo" TEXT,
    "observacoes" TEXT,

    CONSTRAINT "DescansoPeriodo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DescansoAjuste" (
    "id" UUID NOT NULL,
    "vinculoId" UUID NOT NULL,
    "tipo" TEXT NOT NULL,
    "quantidadeDias" DECIMAL(5,2) NOT NULL,
    "dataReferencia" DATE,
    "motivo" TEXT NOT NULL,
    "criadoPor" UUID NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DescansoAjuste_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DescansoConsumo" (
    "id" UUID NOT NULL,
    "periodoId" UUID NOT NULL,
    "direitoId" UUID,
    "quantidadeDias" DECIMAL(5,2) NOT NULL,
    "motivo" TEXT,
    "criadoPor" UUID NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DescansoConsumo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DescansoDireito_prazoConcessivo_idx" ON "DescansoDireito"("prazoConcessivo");

-- CreateIndex
CREATE UNIQUE INDEX "DescansoDireito_vinculoId_dataAquisicao_key" ON "DescansoDireito"("vinculoId", "dataAquisicao");

-- CreateIndex
CREATE INDEX "DescansoPeriodo_vinculoId_dataInicio_dataFim_idx" ON "DescansoPeriodo"("vinculoId", "dataInicio", "dataFim");

-- CreateIndex
CREATE INDEX "DescansoAjuste_vinculoId_idx" ON "DescansoAjuste"("vinculoId");

-- CreateIndex
CREATE INDEX "DescansoConsumo_periodoId_idx" ON "DescansoConsumo"("periodoId");

-- CreateIndex
CREATE INDEX "DescansoConsumo_direitoId_idx" ON "DescansoConsumo"("direitoId");

-- AddForeignKey
ALTER TABLE "DescansoDireito" ADD CONSTRAINT "DescansoDireito_vinculoId_fkey" FOREIGN KEY ("vinculoId") REFERENCES "Vinculo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DescansoPeriodo" ADD CONSTRAINT "DescansoPeriodo_vinculoId_fkey" FOREIGN KEY ("vinculoId") REFERENCES "Vinculo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DescansoAjuste" ADD CONSTRAINT "DescansoAjuste_vinculoId_fkey" FOREIGN KEY ("vinculoId") REFERENCES "Vinculo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DescansoAjuste" ADD CONSTRAINT "DescansoAjuste_criadoPor_fkey" FOREIGN KEY ("criadoPor") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DescansoConsumo" ADD CONSTRAINT "DescansoConsumo_periodoId_fkey" FOREIGN KEY ("periodoId") REFERENCES "DescansoPeriodo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DescansoConsumo" ADD CONSTRAINT "DescansoConsumo_direitoId_fkey" FOREIGN KEY ("direitoId") REFERENCES "DescansoDireito"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DescansoConsumo" ADD CONSTRAINT "DescansoConsumo_criadoPor_fkey" FOREIGN KEY ("criadoPor") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
