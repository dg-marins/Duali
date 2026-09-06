-- CreateTable
CREATE TABLE "Importacao" (
    "id" UUID NOT NULL,
    "usuarioId" UUID NOT NULL,
    "nomeArquivo" TEXT NOT NULL,
    "arquivo" BYTEA NOT NULL,
    "planilhas" JSONB NOT NULL,
    "mapeamento" JSONB,
    "status" TEXT NOT NULL DEFAULT 'UPLOAD',
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmadaEm" TIMESTAMP(3),

    CONSTRAINT "Importacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportacaoItem" (
    "id" UUID NOT NULL,
    "importacaoId" UUID NOT NULL,
    "ordem" INTEGER NOT NULL,
    "grupo" TEXT NOT NULL,
    "dominio" TEXT NOT NULL,
    "aba" TEXT NOT NULL,
    "numeroLinha" INTEGER NOT NULL,
    "dadosOriginais" JSONB NOT NULL,
    "dadosNormalizados" JSONB NOT NULL,
    "referencias" JSONB NOT NULL,
    "dadosAnteriores" JSONB,
    "status" TEXT NOT NULL,
    "acao" TEXT NOT NULL DEFAULT 'PENDENTE',
    "mensagens" JSONB NOT NULL,
    "candidatos" JSONB NOT NULL,
    "revisado" BOOLEAN NOT NULL DEFAULT false,
    "motivo" TEXT,
    "destinoId" UUID NOT NULL,
    "alvoId" UUID,
    "persistidoId" UUID,

    CONSTRAINT "ImportacaoItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Importacao_criadoEm_idx" ON "Importacao"("criadoEm");

-- CreateIndex
CREATE INDEX "ImportacaoItem_importacaoId_status_idx" ON "ImportacaoItem"("importacaoId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ImportacaoItem_importacaoId_ordem_key" ON "ImportacaoItem"("importacaoId", "ordem");

-- AddForeignKey
ALTER TABLE "Importacao" ADD CONSTRAINT "Importacao_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportacaoItem" ADD CONSTRAINT "ImportacaoItem_importacaoId_fkey" FOREIGN KEY ("importacaoId") REFERENCES "Importacao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
