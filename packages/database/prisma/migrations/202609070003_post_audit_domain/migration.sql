ALTER TYPE "TipoVinculo" ADD VALUE IF NOT EXISTS 'APRENDIZ';

CREATE TYPE "TipoDocumentoVinculo" AS ENUM ('TCE', 'ADITIVO', 'RENOVACAO', 'DISTRATO', 'OUTRO');
CREATE TYPE "StatusDocumentoVinculo" AS ENUM ('PENDENTE', 'VIGENTE', 'VENCIDO', 'CANCELADO');
CREATE TYPE "StatusSeguroEstagio" AS ENUM ('ATIVO', 'ENCERRADO', 'PENDENTE');
CREATE TYPE "TipoSeguroMovimentacao" AS ENUM ('INCLUSAO', 'EXCLUSAO', 'ALTERACAO');
CREATE TYPE "TipoDescansoPeriodo" AS ENUM ('FERIAS', 'DESCANSO_ESTAGIO');
CREATE TYPE "StatusDescansoPeriodo" AS ENUM ('PROGRAMADO', 'EM_GOZO', 'CONCLUIDO', 'CANCELADO');
CREATE TYPE "TipoAjuste" AS ENUM ('CREDITO', 'DEBITO');
CREATE TYPE "TipoBeneficio" AS ENUM ('TRANSPORTE', 'ALIMENTACAO', 'CESTA_BASICA', 'PREMIACAO', 'OUTRO');
CREATE TYPE "StatusBeneficioVinculo" AS ENUM ('ATIVO', 'ENCERRADO');
CREATE TYPE "StatusLancamentoBeneficio" AS ENUM ('PENDENTE', 'CONFERIDO', 'PAGO', 'CANCELADO');
CREATE TYPE "StatusFechamentoBeneficio" AS ENUM ('ABERTA', 'EM_REVISAO', 'FECHADA');
CREATE TYPE "StatusBeneficioPeriodo" AS ENUM ('PENDENTE', 'PREVISTO', 'PAGO', 'ATUALIZADO', 'CANCELADO');
CREATE TYPE "StatusImportacao" AS ENUM ('UPLOAD', 'REVISAO', 'PARCIAL', 'CONFIRMADA');
CREATE TYPE "StatusItemImportacao" AS ENUM ('VALIDO', 'NORMALIZAVEL', 'REVISAO', 'DUPLICIDADE', 'REJEITADO', 'AGUARDANDO_DEPENDENCIA', 'IMPORTADO');
CREATE TYPE "AcaoItemImportacao" AS ENUM ('PENDENTE', 'CRIAR', 'ATUALIZAR', 'VINCULAR', 'REJEITAR', 'IMPORTADO');

ALTER TABLE "Vinculo" ADD COLUMN "escala" TEXT;

ALTER TABLE "DocumentoVinculo" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "DocumentoVinculo" ALTER COLUMN "tipo" TYPE "TipoDocumentoVinculo" USING ("tipo"::text::"TipoDocumentoVinculo");
ALTER TABLE "DocumentoVinculo" ALTER COLUMN "status" TYPE "StatusDocumentoVinculo" USING ("status"::text::"StatusDocumentoVinculo");
ALTER TABLE "DocumentoVinculo" ALTER COLUMN "status" SET DEFAULT 'PENDENTE';

ALTER TABLE "SeguroEstagio" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "SeguroEstagio" ALTER COLUMN "status" TYPE "StatusSeguroEstagio" USING ("status"::text::"StatusSeguroEstagio");
ALTER TABLE "SeguroEstagio" ALTER COLUMN "status" SET DEFAULT 'PENDENTE';
ALTER TABLE "SeguroMovimentacao" ALTER COLUMN "tipo" TYPE "TipoSeguroMovimentacao" USING ("tipo"::text::"TipoSeguroMovimentacao");

ALTER TABLE "DescansoPeriodo" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "DescansoPeriodo" ALTER COLUMN "tipo" TYPE "TipoDescansoPeriodo" USING ("tipo"::text::"TipoDescansoPeriodo");
ALTER TABLE "DescansoPeriodo" ALTER COLUMN "status" TYPE "StatusDescansoPeriodo" USING ("status"::text::"StatusDescansoPeriodo");
ALTER TABLE "DescansoPeriodo" ALTER COLUMN "status" SET DEFAULT 'PROGRAMADO';
ALTER TABLE "DescansoAjuste" ALTER COLUMN "tipo" TYPE "TipoAjuste" USING ("tipo"::text::"TipoAjuste");

ALTER TABLE "ConfiguracaoBeneficio" ALTER COLUMN "tipo" TYPE "TipoBeneficio" USING ("tipo"::text::"TipoBeneficio");
ALTER TABLE "BeneficioVinculo" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "BeneficioVinculo" ALTER COLUMN "tipo" TYPE "TipoBeneficio" USING ("tipo"::text::"TipoBeneficio");
ALTER TABLE "BeneficioVinculo" ALTER COLUMN "status" TYPE "StatusBeneficioVinculo" USING ("status"::text::"StatusBeneficioVinculo");
ALTER TABLE "BeneficioVinculo" ALTER COLUMN "status" SET DEFAULT 'ATIVO';
ALTER TABLE "BeneficioCompetencia" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "BeneficioCompetencia" ALTER COLUMN "status" TYPE "StatusLancamentoBeneficio" USING ("status"::text::"StatusLancamentoBeneficio");
ALTER TABLE "BeneficioCompetencia" ALTER COLUMN "status" SET DEFAULT 'PENDENTE';
ALTER TABLE "BeneficioAjuste" ALTER COLUMN "tipo" TYPE "TipoAjuste" USING ("tipo"::text::"TipoAjuste");

ALTER TABLE "Importacao" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Importacao" ALTER COLUMN "status" TYPE "StatusImportacao" USING ("status"::text::"StatusImportacao");
ALTER TABLE "Importacao" ALTER COLUMN "status" SET DEFAULT 'UPLOAD';
ALTER TABLE "ImportacaoItem" ALTER COLUMN "acao" DROP DEFAULT;
ALTER TABLE "ImportacaoItem" ALTER COLUMN "status" TYPE "StatusItemImportacao" USING ("status"::text::"StatusItemImportacao");
ALTER TABLE "ImportacaoItem" ALTER COLUMN "acao" TYPE "AcaoItemImportacao" USING ("acao"::text::"AcaoItemImportacao");
ALTER TABLE "ImportacaoItem" ALTER COLUMN "acao" SET DEFAULT 'PENDENTE';
ALTER TABLE "ImportacaoItem" ADD COLUMN "inconsistencias" JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE "ImportacaoItem" ADD COLUMN "classificacoes" JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE TABLE "InstituicaoRegraEstagio" (
  "id" UUID NOT NULL,
  "instituicaoId" UUID NOT NULL,
  "unidadeId" UUID,
  "tipoRegra" VARCHAR(120) NOT NULL,
  "periodicidadeMeses" INTEGER,
  "duracaoMaximaMeses" INTEGER,
  "observacoes" TEXT,
  "ativa" BOOLEAN NOT NULL DEFAULT true,
  "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizadoEm" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "InstituicaoRegraEstagio_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "InstituicaoRegraEstagio_instituicaoId_unidadeId_ativa_idx" ON "InstituicaoRegraEstagio"("instituicaoId", "unidadeId", "ativa");
ALTER TABLE "InstituicaoRegraEstagio" ADD CONSTRAINT "InstituicaoRegraEstagio_instituicaoId_fkey" FOREIGN KEY ("instituicaoId") REFERENCES "InstituicaoEnsino"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InstituicaoRegraEstagio" ADD CONSTRAINT "InstituicaoRegraEstagio_unidadeId_fkey" FOREIGN KEY ("unidadeId") REFERENCES "Unidade"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "FechamentoCompetenciaBeneficio" (
  "id" UUID NOT NULL,
  "unidadeId" UUID NOT NULL,
  "competencia" DATE NOT NULL,
  "status" "StatusFechamentoBeneficio" NOT NULL DEFAULT 'ABERTA',
  "fechadoEm" TIMESTAMP(3),
  "fechadoPor" UUID,
  "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizadoEm" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FechamentoCompetenciaBeneficio_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "FechamentoCompetenciaBeneficio_unidadeId_competencia_key" ON "FechamentoCompetenciaBeneficio"("unidadeId", "competencia");
CREATE INDEX "FechamentoCompetenciaBeneficio_competencia_status_idx" ON "FechamentoCompetenciaBeneficio"("competencia", "status");
ALTER TABLE "FechamentoCompetenciaBeneficio" ADD CONSTRAINT "FechamentoCompetenciaBeneficio_unidadeId_fkey" FOREIGN KEY ("unidadeId") REFERENCES "Unidade"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FechamentoCompetenciaBeneficio" ADD CONSTRAINT "FechamentoCompetenciaBeneficio_fechadoPor_fkey" FOREIGN KEY ("fechadoPor") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "BeneficioPeriodoHistorico" (
  "id" UUID NOT NULL,
  "beneficioVinculoId" UUID NOT NULL,
  "anoInicio" INTEGER,
  "anoFim" INTEGER,
  "referenciaOriginal" TEXT NOT NULL,
  "valor" DECIMAL(12,2),
  "status" "StatusBeneficioPeriodo" NOT NULL DEFAULT 'PENDENTE',
  "dataEvento" DATE,
  "textoOriginal" TEXT NOT NULL,
  "observacoes" TEXT,
  "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BeneficioPeriodoHistorico_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "BeneficioPeriodoHistorico_beneficioVinculoId_anoInicio_anoFim_idx" ON "BeneficioPeriodoHistorico"("beneficioVinculoId", "anoInicio", "anoFim");
ALTER TABLE "BeneficioPeriodoHistorico" ADD CONSTRAINT "BeneficioPeriodoHistorico_beneficioVinculoId_fkey" FOREIGN KEY ("beneficioVinculoId") REFERENCES "BeneficioVinculo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
