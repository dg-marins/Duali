# Modelo de Dados V1 — Duali

Este documento registra o modelo lógico inicial. O schema Prisma e as migrations serão derivados desta baseline e podem introduzir detalhes técnicos adicionais.

## 1. Visão geral

```text
PESSOA
  |
  +--< VINCULO >-- UNIDADE
          |
          +-- EQUIPE (atual + histórico)
          |
          +-- ESTAGIO
          |     +-- INSTITUICAO_ENSINO
          |     +-- DOCUMENTO_VINCULO
          |     +-- SEGURO_ESTAGIO --< SEGURO_MOVIMENTACAO
          |
          +-- DESCANSO_DIREITO
          +-- DESCANSO_PERIODO
          +-- DESCANSO_AJUSTE
          |
          +-- BENEFICIO_VINCULO --< BENEFICIO_COMPETENCIA

USUARIO --< AUDITORIA
USUARIO --< IMPORTACAO --< IMPORTACAO_ITEM
```

## 2. Pessoa

`pessoa`

- `id`: UUID, PK
- `nome_completo`: varchar(180), obrigatório
- `nome_social`: varchar(180), opcional
- `cpf`: varchar(11), opcional, único quando preenchido
- `rg`: varchar(30), opcional
- `data_nascimento`: date, opcional
- `email`: varchar(180), opcional
- `telefone`: varchar(30), opcional
- endereço: campos opcionais na primeira versão; poderá ser extraído para entidade própria se surgir necessidade de múltiplos endereços
- `observacoes`: text, opcional
- timestamps de criação/alteração

CPF deve ser armazenado normalizado quando validado, preservando o valor original no staging de importação.

## 3. Vínculo

`vinculo`

- `id`: UUID, PK
- `pessoa_id`: FK obrigatória
- `tipo`: CLT | ESTAGIO | OUTRO
- `matricula`: opcional
- `data_admissao`: obrigatória
- `data_desligamento`: opcional
- `status`: ATIVO | AFASTADO | DESLIGADO
- `unidade_id`: FK
- `equipe_id`: FK opcional para equipe atual
- `cargo_funcao`: opcional
- `observacoes`: opcional
- timestamps

A consistência entre status e desligamento deverá ser validada na camada de domínio.

## 4. Unidade

`unidade`

- `id`: UUID
- `nome`
- `sigla`
- `cidade`: opcional
- `uf`
- `ativa`

## 5. Equipe

`equipe`

- `id`: UUID
- `nome`: obrigatório e único conforme regra de normalização definida
- `ativa`
- `observacoes`

`vinculo_equipe_historico`

- `id`
- `vinculo_id`
- `equipe_id`
- `inicio_em`
- `fim_em`: opcional

Na V1, a nomenclatura importada das planilhas deve ser preservada.

## 6. Estágio

`estagio`

- `id`
- `vinculo_id`: FK única
- `instituicao_ensino_id`: opcional
- `matricula_academica`: opcional
- `curso`: opcional
- `periodo_academico`: opcional
- `valor_bolsa`: decimal(12,2), opcional
- `data_termino_prevista`: date, opcional
- `horario`, `area`, `representante_tce`, `dados_bancarios` e `agente_integracao`: opcionais, preservados das fontes operacionais
- `observacoes`: opcional

`instituicao_ensino`

- `id`
- `nome`
- `sigla`: opcional
- `ativa`
- `observacoes`

Regras específicas por instituição, hoje presentes em observações de planilha, deverão evoluir para estrutura própria quando o fluxo for detalhado.

## 7. Documentos do vínculo

`documento_vinculo`

- `id`
- `vinculo_id`
- `tipo`: TCE | ADITIVO | RENOVACAO | DISTRATO | OUTRO
- `numero`: opcional
- `data_referencia`: opcional, para a data informada de renovação, aditivo ou distrato quando ela não representa uma vigência completa
- `inicio_vigencia`: opcional
- `fim_vigencia`: opcional
- `status`: PENDENTE | VIGENTE | VENCIDO | CANCELADO
- `observacoes`: opcional
- referência de arquivo: opcional/futura

Não há limite de quantidade por vínculo.

## 8. Seguro de estágio

`seguro_estagio`

- `id`
- `vinculo_id`
- `seguradora`
- `numero_apolice`: opcional
- `inicio_vigencia`: opcional
- `fim_vigencia`: opcional
- `status`: ATIVO | ENCERRADO | PENDENTE
- `observacoes`: opcional

`seguro_movimentacao`

- `id`
- `seguro_estagio_id`
- `tipo`: INCLUSAO | EXCLUSAO | ALTERACAO
- `data_movimentacao`
- `observacoes`: opcional

## 9. Política e direitos de descanso

`politica_descanso`

- `id`
- `nome`
- `tipo_vinculo`
- `periodicidade_meses`: opcional
- `dias_por_periodo`: opcional
- `ativa`

Baseline de estágio: 15 dias a cada 6 meses de vínculo.

`descanso_direito`

- `id`
- `vinculo_id`
- `politica_id`
- `data_aquisicao`
- `quantidade_dias`: decimal(5,2)
- `origem`: AUTOMATICA | IMPORTACAO | AJUSTE_MANUAL
- `observacoes`: opcional

## 10. Períodos de descanso

`descanso_periodo`

- `id`
- `vinculo_id`
- `data_inicio`
- `data_fim`
- `quantidade_dias`
- `tipo`: FERIAS | DESCANSO_ESTAGIO | OUTRO
- `status`: PROGRAMADO | APROVADO | EM_GOZO | CONCLUIDO | CANCELADO
- `observacoes`: opcional

A quantidade de dias não deve depender apenas da diferença matemática entre datas sem considerar a regra de negócio aplicável.

## 11. Ajustes de descanso

`descanso_ajuste`

- `id`
- `vinculo_id`
- `tipo`: CREDITO | DEBITO
- `quantidade_dias`
- `data_referencia`: opcional
- `motivo`: obrigatório
- `criado_por`: usuário responsável
- `autorizado_por`: opcional
- `criado_em`

## 12. Saldo de descanso

O saldo é derivado e não deve ser editado diretamente:

`direitos + créditos - períodos consumidos - débitos`

Saldo negativo deve gerar alerta de inconsistência, salvo exceção explicitamente autorizada e auditada.

## 13. Benefícios

`tipo_beneficio`

- `id`
- `nome`
- `ativo`

A taxonomia deverá distinguir conceito de benefício de fornecedor/meio quando a implementação detalhar o módulo. Ex.: transporte é um benefício; Riocard/JAÉ/SPTrans podem representar meios/fornecedores/componentes.

`beneficio_vinculo`

- `id`
- `vinculo_id`
- `tipo_beneficio_id`
- `inicio_vigencia`
- `fim_vigencia`: opcional
- `status`
- `observacoes`

`beneficio_competencia`

- `id`
- `beneficio_vinculo_id`
- `competencia`: date normalizada para o primeiro dia do mês
- `quantidade_dias`: opcional
- `quantidade`: opcional
- `valor_unitario`: decimal(12,2), opcional
- `valor_informado`: decimal(12,2), opcional
- `observacoes`: opcional

O valor calculado pode ser derivado quando existirem os componentes necessários.

## 14. Usuário

`usuario`

- `id`
- `nome`
- `email`: único
- `senha_hash`
- `ativo`
- `ultimo_login_em`: opcional
- timestamps

Usuário do sistema não é sinônimo de pessoa cadastrada no RH.

Perfis iniciais propostos: ADMINISTRADOR, RH e CONSULTA. A matriz final de permissões ainda será refinada.

## 15. Auditoria

`auditoria`

- `id`
- `usuario_id`
- `entidade`
- `entidade_id`
- `acao`
- `dados_anteriores`: JSONB opcional
- `dados_novos`: JSONB opcional
- metadados técnicos estritamente necessários
- `criado_em`

A auditoria deve evitar registrar segredos e minimizar exposição desnecessária de dados pessoais.

## 16. Importação

`importacao`

- `id`
- `usuario_id`
- `nome_arquivo`
- `tipo`
- `status`
- contadores de registros
- timestamps

`importacao_item`

- `id`
- `importacao_id`
- `numero_linha`
- `dados_originais`: JSONB
- `dados_normalizados`: JSONB opcional
- `status`
- `mensagens_validacao`: JSONB
- `pessoa_id`: opcional
- `vinculo_id`: opcional

O staging deve permitir revisão antes da gravação definitiva.

## 17. Índices e restrições esperadas

A implementação deve considerar, entre outros:

- unicidade/índice para CPF normalizado quando presente;
- unicidade de email de usuário;
- índices em vínculo por pessoa, status, unidade e equipe;
- índices em competências de benefício;
- índices em datas de aquisição e períodos de descanso;
- integridade referencial por FKs;
- restrições para quantidades e valores incompatíveis quando a regra estiver confirmada.

## 18. Dados derivados x persistidos

Preferencialmente derivados:

- saldo atual de férias/descanso;
- total de dias adquiridos;
- total de dias usufruídos;
- valor calculado de benefício quando a fórmula for determinística;
- status de vencimento quando puder ser inferido das datas.

Persistidos:

- eventos que originam o cálculo;
- valores efetivamente informados/pagos quando forem fatos de negócio;
- ajustes e justificativas;
- dados originais de importação necessários para rastreabilidade.

## 19. Endereço estruturado da pessoa

`pessoa` possui os campos opcionais `cep`, `logradouro`, `numero_endereco`, `complemento`, `bairro`, `cidade_endereco` e `uf_endereco`. O campo `endereco` permanece como texto legado para preservar importações anteriores sem inferir uma divisão potencialmente incorreta.

A migration `202609070002_structured_person_address` adiciona esses campos sem alterar os valores já armazenados.
