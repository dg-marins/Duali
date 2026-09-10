-- Garante um TCE pendente para cada vínculo de estágio legado sem TCE.
INSERT INTO "DocumentoVinculo" ("id", "vinculoId", "tipo", "status")
SELECT gen_random_uuid(), v."id", 'TCE'::"TipoDocumentoVinculo", 'PENDENTE'::"StatusDocumentoVinculo"
FROM "Vinculo" v
WHERE v."tipo" = 'ESTAGIO'::"TipoVinculo"
  AND NOT EXISTS (
    SELECT 1 FROM "DocumentoVinculo" d
    WHERE d."vinculoId" = v."id" AND d."tipo" = 'TCE'::"TipoDocumentoVinculo"
  );
