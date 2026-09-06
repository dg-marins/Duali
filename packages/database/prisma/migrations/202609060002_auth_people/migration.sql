-- AlterTable
ALTER TABLE "Usuario" ADD COLUMN     "ultimoLoginEm" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "Sessao" (
    "tokenHash" TEXT NOT NULL,
    "csrf" TEXT NOT NULL,
    "usuarioId" UUID NOT NULL,
    "expiraEm" TIMESTAMP(3) NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Sessao_pkey" PRIMARY KEY ("tokenHash")
);

-- CreateTable
CREATE TABLE "Auditoria" (
    "id" UUID NOT NULL,
    "usuarioId" UUID,
    "acao" TEXT NOT NULL,
    "entidade" TEXT NOT NULL,
    "entidadeId" TEXT,
    "dadosAnteriores" JSONB,
    "dadosNovos" JSONB,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Auditoria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VinculoEquipeHistorico" (
    "id" UUID NOT NULL,
    "vinculoId" UUID NOT NULL,
    "equipeId" UUID NOT NULL,
    "inicioEm" TIMESTAMP(3) NOT NULL,
    "fimEm" TIMESTAMP(3),

    CONSTRAINT "VinculoEquipeHistorico_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Sessao_usuarioId_idx" ON "Sessao"("usuarioId");

-- CreateIndex
CREATE INDEX "Sessao_expiraEm_idx" ON "Sessao"("expiraEm");

-- CreateIndex
CREATE INDEX "Auditoria_entidade_entidadeId_idx" ON "Auditoria"("entidade", "entidadeId");

-- CreateIndex
CREATE INDEX "Auditoria_criadoEm_idx" ON "Auditoria"("criadoEm");

-- CreateIndex
CREATE INDEX "VinculoEquipeHistorico_vinculoId_inicioEm_idx" ON "VinculoEquipeHistorico"("vinculoId", "inicioEm");

-- AddForeignKey
ALTER TABLE "Sessao" ADD CONSTRAINT "Sessao_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Auditoria" ADD CONSTRAINT "Auditoria_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VinculoEquipeHistorico" ADD CONSTRAINT "VinculoEquipeHistorico_vinculoId_fkey" FOREIGN KEY ("vinculoId") REFERENCES "Vinculo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VinculoEquipeHistorico" ADD CONSTRAINT "VinculoEquipeHistorico_equipeId_fkey" FOREIGN KEY ("equipeId") REFERENCES "Equipe"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
