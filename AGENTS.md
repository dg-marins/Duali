# AGENTS.md — Duali

Este arquivo orienta agentes de programação que atuem no repositório Duali.

## 0. EngineeringOS

Este projeto utiliza a EngineeringOS como baseline global de engenharia.

Localização relativa da EngineeringOS a partir da raiz deste repositório:

`../../EngineeringOS`

Antes de iniciar uma tarefa, o agente deve carregar e respeitar o contexto aplicável da EngineeringOS.

Ordem inicial de leitura:

1. `../../EngineeringOS/README.md`
2. `../../EngineeringOS/constitution/engineering-constitution.md`
3. políticas aplicáveis em `../../EngineeringOS/policies/`
4. comportamentos aplicáveis em `../../EngineeringOS/behaviors/`
5. `../../EngineeringOS/risk/risk-model.md`
6. `../../EngineeringOS/orquestrador/decisoes-v0.1.md`
7. `../../EngineeringOS/workflows/fluxo-base-v0.1.md`
8. skills necessárias em `../../EngineeringOS/skills/`
9. contexto local em `.engineering/`
10. este `AGENTS.md` e a documentação do Duali.

Não é necessário carregar todas as skills em toda tarefa.
Carregue somente as skills relevantes para o trabalho atual.

### Precedência

Em caso de conflito:

1. regras explicitamente sobrescritas pelo Duali em `.engineering/`;
2. regras e decisões específicas documentadas do Duali;
3. Constituição e policies da EngineeringOS;
4. behaviors da EngineeringOS;
5. skills da EngineeringOS;
6. instruções da tarefa atual, desde que não contradigam regras superiores.

O projeto Duali é soberano sobre a baseline global quando uma sobrescrita estiver explicitamente documentada.

### Escopo

A EngineeringOS não autoriza expansão automática de escopo.

Problemas encontrados fora da tarefa devem ser registrados e reportados, mas não corrigidos automaticamente.

### Modo auditoria

Quando a tarefa declarar `modo: auditoria`:

- não modificar código;
- não modificar documentação;
- não criar migrations;
- não instalar dependências;
- não realizar commits;
- não corrigir automaticamente problemas encontrados;
- analisar o projeto e produzir somente relatório;
- diferenciar fato, evidência, inferência e recomendação;
- informar arquivos consultados;
- classificar riscos quando aplicável;
- registrar divergências entre o Duali e a EngineeringOS;
- respeitar sobrescritas locais.

## 1. Fontes de verdade

Antes de implementar qualquer funcionalidade, leia os documentos relevantes:

- `docs/product/visao-produto.md`
- `docs/product/regras-negocio-v1.md`
- `docs/product/decisoes-mvp.md`
- `docs/data/modelo-dados-v1.md`
- `docs/architecture/arquitetura-inicial.md`
- `docs/planning/roadmap-mvp.md`
- a sprint/task correspondente em `docs/planning/`

A documentação aprovada prevalece sobre inferências do agente.

## 2. Não inventar requisito

Se uma regra necessária não estiver documentada:

1. não invente comportamento de negócio;
2. escolha apenas um default técnico reversível quando isso não alterar regra de negócio;
3. registre a lacuna em documentação apropriada ou informe no encerramento da task.

Não transforme hipótese em regra definitiva.

## 3. Escopo da tarefa

Trabalhe apenas no escopo da task atual.

Não faça refatorações amplas, mudanças arquiteturais ou adoção de novas bibliotecas sem necessidade clara para a tarefa.

Não avance automaticamente para a próxima sprint.

## 4. Arquitetura

O Duali inicia como monólito modular em monorepo.

Não introduza microserviços, event bus distribuído, CQRS, filas externas ou infraestrutura adicional sem decisão arquitetural explícita.

## 5. Banco de dados

- PostgreSQL é a fonte de dados operacional.
- Prisma é o ORM inicial.
- Toda alteração de schema deve ser versionada por migration.
- Não edite dados históricos para "corrigir" resultados derivados sem regra explícita.
- Não use planilhas como banco de dados.

## 6. Segurança

- Nunca versione secrets, senhas, tokens ou chaves.
- Autenticação deve usar sessão segura com cookie HttpOnly.
- Não armazenar token de autenticação em `localStorage`.
- Validar autenticação e autorização no servidor.
- Validar toda entrada externa.
- Usar hash de senha apropriado.
- Dados pessoais não devem aparecer desnecessariamente em logs.
- Exportações e operações sensíveis devem respeitar auditoria.

Leia `docs/engineering/seguranca.md` antes de alterar autenticação, usuários, importação, exportação ou dados pessoais.

## 7. Qualidade

Novas funcionalidades devem incluir testes proporcionais ao risco.

Antes de concluir uma task, execute quando aplicável:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Testes E2E devem ser executados para fluxos críticos quando a infraestrutura correspondente existir.

## 8. Tratamento de erros

- Erros esperados devem ter resposta estruturada.
- Não exponha stack trace, SQL, secrets ou detalhes internos ao cliente.
- Falhas de validação devem ser explícitas e úteis.

## 9. Importação

Toda importação deve passar por staging, validação, detecção de duplicidade e revisão antes da confirmação.

Nunca corrija silenciosamente dado ambíguo da planilha.

Preserve o dado original no staging para rastreabilidade.

## 10. Exclusão e histórico

O MVP não possui hard delete pela interface.

Use inativação, cancelamento ou encerramento conforme o domínio.

Não apague histórico relevante.

## 11. Documentação

Atualize documentação quando uma mudança de código alterar comportamento, contrato, modelo de dados ou arquitetura.

Não altere decisão de produto apenas no código.

## 12. Definition of Done

Uma task só pode ser considerada concluída quando atende `docs/engineering/definition-of-done.md`.
