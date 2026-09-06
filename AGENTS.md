# AGENTS.md — Duali

Este arquivo orienta agentes de programação que atuem no repositório Duali.

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
