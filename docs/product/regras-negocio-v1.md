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

O TCE é o documento inicial do estágio. Não existe PCA no domínio do Duali. As renovações posteriores são aditivos ao TCE; documentos legados classificados como `RENOVACAO` continuam preservados como histórico.

Um ciclo documental tem início e fim de vigência. A periodicidade sugerida é de seis meses, mas pode ser escolhida no cadastro ou definida por regra ativa da instituição e unidade. A alteração dessa regra só afeta documentos novos; documentos já materializados não são recalculados.

O fim da vigência é a data calculada de início mais a periodicidade: por exemplo, `01/08 + 6 meses = 01/02`. Um documento futuro é apresentado como planejado; ao iniciar a vigência, permanece aguardando assinatura enquanto estiver pendente e só pode ser apresentado como assinado após validação manual. A assinatura não altera o contrato, o desligamento ou as datas de vigência.

O documento atual é aquele cuja vigência contém a data de consulta. Sobreposição, falta de datas ou um ciclo vencido sem sucessor geram pendência para revisão, sem alteração automática de registros históricos.

## RN-009.1 — Contrato de estágio

`Estagio.dataTerminoPrevista` representa o fim planejado do contrato e `Vinculo.dataDesligamento` representa somente o encerramento efetivo do vínculo. Os ciclos contratuais e documentais são independentes. A ausência de instituição não bloqueia a admissão, mas gera pendência operacional.

Alertas de contrato são emitidos para 90, 60 e 30 dias, além de término ultrapassado. Um documento pode terminar depois do contrato sem bloqueio automático, pois o contrato é a referência do término efetivo.

## RN-010 — Seguro de estágio

O seguro deve permitir histórico de vigência e movimentações, incluindo inclusão e exclusão.

## RN-011 — Benefícios

Benefícios devem ser registrados por vínculo e competência mensal. Janeiro, fevereiro etc. não serão colunas do banco.

O cadastro em lote deve selecionar categoria, unidade, competência e fornecedor ativo configurado para a unidade. Apenas vínculos ativos participam. Alterar uma adesão em lote cria nova vigência no mês escolhido e encerra a anterior, preservando o histórico.

Alimentação e transporte são calculados por dias; transporte mantém condução e cartão. Cesta básica, premiação e outros são calculados por quantidade e valor unitário. Valores ausentes devem permanecer como pendência explícita.

O modelo deve suportar diferentes tipos/meios utilizados atualmente, como transporte, alimentação, premiação, Flash, Riocard, JAÉ, SPTrans, TDMax e Mobilidade, sem transformar cada fornecedor em uma coluna permanente.

## RN-011.1 — Preparação e aquisição mensal

Uma competência é preparada quando as categorias aplicáveis estão sem impedimentos. Transporte e alimentação são operados e fechados independentemente por unidade e categoria. Cada categoria pode estar não preparada, com pendências, preparada, com pedido emitido, parcialmente confirmada, confirmada ou fechada. Categoria sem adesão elegível é não aplicável.

Dias de alimentação são definidos na competência e podem ser ajustados manualmente com auditoria. Escala registrada no vínculo é uma referência operacional de dias trabalhados, mas não altera automaticamente competências já preparadas. Férias, faltas, feriados, admissões e afastamentos não aplicam descontos automáticos: a correção mensal é explícita e auditada.

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
