# Regras de Negócio V1 — Duali

Status: baseline inicial. Regras podem ser refinadas conforme validação com o RH.

## RN-001 — Pessoa e vínculo

Uma pessoa é o cadastro mestre. CLT e estágio são características do vínculo, não tipos distintos de pessoa.

Uma pessoa pode possuir mais de um vínculo ao longo do tempo. O histórico não deve ser perdido quando um vínculo for encerrado.

## RN-002 — Status do vínculo

Ativo, afastado e desligado são estados do vínculo. Pessoas desligadas não devem ser movidas para um cadastro separado.

## RN-003 — Unidade

RJ, SP e DF devem ser representados por unidades/localidades e não por estruturas de banco diferentes.

## RN-004 — Equipe

Equipe é uma entidade própria. Na V1, os nomes serão preservados conforme a nomenclatura existente nas planilhas, incluindo exemplos como `FELIPE MONNERAT`, `GOOGLE`, `TELEFÔNICA` e combinações existentes.

Não será feita, neste momento, interpretação automática desses nomes como gestor, cliente ou projeto. A modelagem poderá ser refinada futuramente.

Alterações de equipe devem permitir preservação de histórico.

## RN-005 — Descanso de estagiário

Conforme regra operacional informada pelo RH, o estagiário adquire 15 dias de descanso a cada 6 meses de vínculo.

Os marcos devem ser calculados a partir da admissão/regra aplicável e não armazenados como colunas `Novos 15 Dias 1`, `2`, `3` etc.

## RN-006 — Saldo de férias/descanso

O saldo deve ser derivado do histórico de direitos, períodos usufruídos e ajustes.

Regra conceitual:

`saldo = direitos adquiridos + créditos - períodos consumidos - débitos`

Saldo negativo não é considerado situação operacional normal. Quando ocorrer, o sistema deve sinalizar inconsistência para revisão.

Uma eventual exceção real deve ser registrada de forma explícita, justificada e auditada; não deve ser aceita silenciosamente.

## RN-007 — Períodos de férias/descanso

Não existe limite estrutural de primeiro, segundo ou terceiro período. Cada período deve ser um registro independente associado ao vínculo.

## RN-008 — Ajustes

Créditos ou débitos manuais de dias devem conter motivo e autoria. Quando aplicável, deve ser possível registrar a data relacionada ao ajuste.

Observações como `descontar 01 dia de férias` não devem permanecer apenas como texto livre após a migração.

## RN-009 — Documentos do estágio

TCE, renovação, aditivo, distrato e documentos semelhantes são registros históricos. Não haverá campos fixos `1ª renovação`, `2ª renovação`, `3ª renovação`.

## RN-010 — Seguro de estágio

O seguro deve permitir histórico de vigência e movimentações, incluindo inclusão e exclusão.

## RN-011 — Benefícios

Benefícios devem ser registrados por vínculo e competência mensal. Janeiro, fevereiro etc. não serão colunas do banco.

O modelo deve suportar diferentes tipos/meios utilizados atualmente, como transporte, alimentação, premiação, Flash, Riocard, JAÉ, SPTrans, TDMax e Mobilidade, sem transformar cada fornecedor em uma coluna permanente.

## RN-012 — Valores calculados e informados

Quando um valor puder ser calculado a partir de quantidade/dias e valor unitário, o sistema deve preservar a possibilidade de comparar o valor calculado com um valor efetivamente informado.

Diferenças relevantes devem ser visíveis para revisão e não corrigidas silenciosamente.

## RN-013 — Importação

Importações devem passar por staging/pré-validação antes de alterar dados definitivos.

Cada linha deve poder ser classificada como:

- válida;
- normalizável automaticamente;
- requer revisão;
- possível duplicidade;
- rejeitada.

O dado original deve ser preservado para rastreabilidade da importação.

## RN-014 — Qualidade dos dados

CPF, datas, nomes e demais dados vindos das planilhas podem conter formatos divergentes ou erros. Normalizações inequívocas podem ser automatizadas; alterações ambíguas exigem revisão humana.

## RN-015 — Exclusão e histórico

Registros com valor histórico não devem ser apagados fisicamente por padrão. O fluxo normal deve usar encerramento, cancelamento ou inativação conforme a entidade.

## RN-016 — Auditoria

Criações, alterações, ajustes, importações, exportações e demais ações sensíveis devem registrar usuário, data/hora e contexto suficiente para rastreabilidade.

## Pendências para discovery

- Confirmar detalhes legais/operacionais da política de férias CLT utilizada pela organização.
- Confirmar todas as situações reais em que antecipação ou saldo excepcional de descanso pode ser autorizada.
- Refinar o conceito de equipe caso o negócio futuramente queira separar equipe, gestor, cliente e projeto.
- Confirmar matriz final de perfis e permissões.
