ALTER TABLE "ChaveIdempotencia" ADD COLUMN "escopo" VARCHAR(180) NOT NULL DEFAULT 'global';
ALTER TABLE "ChaveIdempotencia" ADD COLUMN "usuarioId" UUID;
ALTER TABLE "ChaveIdempotencia" DROP CONSTRAINT "ChaveIdempotencia_chave_key";
CREATE INDEX "ChaveIdempotencia_usuarioId_idx" ON "ChaveIdempotencia"("usuarioId");
CREATE UNIQUE INDEX "ChaveIdempotencia_usuarioId_operacao_escopo_chave_key"
  ON "ChaveIdempotencia"("usuarioId", "operacao", "escopo", "chave");
ALTER TABLE "ChaveIdempotencia"
  ADD CONSTRAINT "ChaveIdempotencia_usuarioId_fkey"
  FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
