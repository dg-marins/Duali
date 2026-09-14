# Diagnóstico de escalas legadas

Data: 14/09/2026. Método: consulta somente leitura à tabela de vínculos.

Resultado: os 75 vínculos atuais não possuem valor preenchido em `Vinculo.escala`. Não foram encontrados formatos numéricos, dias da semana ou descrições que pudessem ser migrados sem inferência.

Decisão: `Vinculo.escala` permanece como campo textual legado. Não foi criada estrutura de escala nem foram atribuídos dias de benefício a partir dele. Dias de alimentação e transporte continuam sendo confirmados em cada competência, com alteração manual auditável.
