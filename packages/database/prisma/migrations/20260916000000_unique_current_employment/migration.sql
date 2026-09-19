-- Do not resolve conflicting historical data automatically.
DO $$ BEGIN
 IF EXISTS (SELECT "pessoaId" FROM "Vinculo" WHERE status IN ('ATIVO', 'AFASTADO') GROUP BY "pessoaId" HAVING count(*) > 1) THEN
  RAISE EXCEPTION 'RH must resolve multiple current employments before migration';
 END IF;
END $$;
CREATE UNIQUE INDEX "Vinculo_pessoaId_current_key" ON "Vinculo" ("pessoaId") WHERE status IN ('ATIVO', 'AFASTADO');
