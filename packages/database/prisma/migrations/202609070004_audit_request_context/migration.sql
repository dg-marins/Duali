ALTER TABLE "Auditoria" ADD COLUMN "requestId" VARCHAR(100);
CREATE INDEX "Auditoria_requestId_idx" ON "Auditoria"("requestId");
