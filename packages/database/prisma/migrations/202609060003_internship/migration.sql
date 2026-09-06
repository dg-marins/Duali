-- CreateTable
CREATE TABLE "InstituicaoEnsino" (
    "id" UUID NOT NULL,
    "nome" TEXT NOT NULL,
    "sigla" TEXT,
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "observacoes" TEXT,

    CONSTRAINT "InstituicaoEnsino_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Estagio" (
    "id" UUID NOT NULL,
    "vinculoId" UUID NOT NULL,
    "instituicaoEnsinoId" UUID,
    "matriculaAcademica" TEXT,
    "curso" TEXT,
    "periodoAcademico" TEXT,
    "valorBolsa" DECIMAL(12,2),
    "observacoes" TEXT,

    CONSTRAINT "Estagio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentoVinculo" (
    "id" UUID NOT NULL,
    "vinculoId" UUID NOT NULL,
    "tipo" TEXT NOT NULL,
    "numero" TEXT,
    "inicioVigencia" DATE,
    "fimVigencia" DATE,
    "status" TEXT NOT NULL DEFAULT 'PENDENTE',
    "observacoes" TEXT,

    CONSTRAINT "DocumentoVinculo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SeguroEstagio" (
    "id" UUID NOT NULL,
    "vinculoId" UUID NOT NULL,
    "seguradora" TEXT NOT NULL,
    "numeroApolice" TEXT,
    "inicioVigencia" DATE,
    "fimVigencia" DATE,
    "status" TEXT NOT NULL DEFAULT 'PENDENTE',
    "observacoes" TEXT,

    CONSTRAINT "SeguroEstagio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SeguroMovimentacao" (
    "id" UUID NOT NULL,
    "seguroEstagioId" UUID NOT NULL,
    "tipo" TEXT NOT NULL,
    "dataMovimentacao" DATE NOT NULL,
    "observacoes" TEXT,

    CONSTRAINT "SeguroMovimentacao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Estagio_vinculoId_key" ON "Estagio"("vinculoId");

-- CreateIndex
CREATE INDEX "DocumentoVinculo_vinculoId_fimVigencia_idx" ON "DocumentoVinculo"("vinculoId", "fimVigencia");

-- CreateIndex
CREATE INDEX "SeguroEstagio_vinculoId_fimVigencia_idx" ON "SeguroEstagio"("vinculoId", "fimVigencia");

-- CreateIndex
CREATE INDEX "SeguroMovimentacao_seguroEstagioId_dataMovimentacao_idx" ON "SeguroMovimentacao"("seguroEstagioId", "dataMovimentacao");

-- AddForeignKey
ALTER TABLE "Estagio" ADD CONSTRAINT "Estagio_vinculoId_fkey" FOREIGN KEY ("vinculoId") REFERENCES "Vinculo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Estagio" ADD CONSTRAINT "Estagio_instituicaoEnsinoId_fkey" FOREIGN KEY ("instituicaoEnsinoId") REFERENCES "InstituicaoEnsino"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentoVinculo" ADD CONSTRAINT "DocumentoVinculo_vinculoId_fkey" FOREIGN KEY ("vinculoId") REFERENCES "Vinculo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeguroEstagio" ADD CONSTRAINT "SeguroEstagio_vinculoId_fkey" FOREIGN KEY ("vinculoId") REFERENCES "Vinculo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeguroMovimentacao" ADD CONSTRAINT "SeguroMovimentacao_seguroEstagioId_fkey" FOREIGN KEY ("seguroEstagioId") REFERENCES "SeguroEstagio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
