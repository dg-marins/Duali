ALTER TABLE "Estagio"
  ADD COLUMN "dataTerminoPrevista" DATE,
  ADD COLUMN "horario" TEXT,
  ADD COLUMN "area" TEXT,
  ADD COLUMN "representanteTce" TEXT,
  ADD COLUMN "dadosBancarios" TEXT,
  ADD COLUMN "agenteIntegracao" TEXT;

ALTER TABLE "DocumentoVinculo"
  ADD COLUMN "dataReferencia" DATE;
