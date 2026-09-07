# Arquitetura Inicial — Duali

## 1. Objetivo

Definir uma arquitetura simples para a V1, com baixo custo operacional, boa testabilidade e possibilidade de evolução sem introduzir complexidade prematura.

## 2. Estilo arquitetural

A V1 será construída como monorepo e backend modular. Não há necessidade inicial de microserviços.

```text
Browser
   |
   v
Nginx / HTTPS
   |
   +--> Web React
   |
   +--> API Fastify
             |
             +--> módulos de domínio
             |
             +--> Prisma
                     |
                     v
                PostgreSQL
```

## 3. Stack

### Frontend

- React
- TypeScript
- Vite
- Tailwind CSS
- shadcn/ui
- Zod para schemas compartilháveis quando adequado

### Backend

- Node.js
- TypeScript
- Fastify
- Zod para validação de entrada/saída
- Prisma como ORM e ferramenta de migrations

### Banco

- PostgreSQL

### Testes

- Vitest para testes unitários e de integração adequados ao projeto
- Playwright para fluxos E2E críticos

### Workspace

- pnpm workspaces

### Produção

- VPS Linux
- Nginx
- HTTPS
- processo da aplicação gerenciado pelo ambiente de deploy
- PostgreSQL com rotina de backup definida antes da entrada em produção

## 4. Estrutura proposta

```text
Duali/
├── apps/
│   ├── web/
│   └── api/
├── packages/
│   ├── database/
│   ├── shared/
│   └── ui/
├── docs/
│   ├── product/
│   ├── architecture/
│   ├── data/
│   └── planning/
├── .github/
│   └── workflows/
├── package.json
├── pnpm-workspace.yaml
└── tsconfig.base.json
```

Diretórios vazios não são versionados pelo Git; serão criados quando os respectivos projetos/arquivos forem inicializados.

## 5. Organização da API

A API deve ser modular por domínio, evitando uma divisão puramente técnica por controllers/services globais.

Exemplo:

```text
apps/api/src/
├── modules/
│   ├── auth/
│   ├── pessoas/
│   ├── vinculos/
│   ├── equipes/
│   ├── unidades/
│   ├── estagios/
│   ├── descansos/
│   ├── beneficios/
│   ├── importacoes/
│   └── auditoria/
├── plugins/
├── config/
└── server.ts
```

A separação não implica microserviços; todos os módulos pertencem à mesma aplicação na V1.

## 6. Autenticação

Para a aplicação web, a baseline será autenticação baseada em sessão com cookie seguro `HttpOnly`, `Secure` em produção e política `SameSite` adequada.

Senhas nunca serão armazenadas em texto puro. A implementação deve utilizar algoritmo de hash de senha apropriado e proteção contra abuso/tentativas repetidas.

Autenticação e autorização são problemas distintos: além de estar autenticado, o usuário deve possuir permissão para a ação solicitada.

## 7. Segurança

Baseline:

- HTTPS obrigatório em produção.
- Cookies de autenticação não acessíveis por JavaScript.
- Validação server-side de todas as entradas.
- Autorização server-side em rotas protegidas.
- Segredos somente por configuração segura/variáveis de ambiente; nunca no Git.
- Auditoria para operações sensíveis.
- Dados pessoais retornados apenas quando necessários ao fluxo/perfil.
- Rate limiting nos endpoints sensíveis, especialmente autenticação.
- Dependências atualizadas e CI executando verificações automatizadas.

## 8. Banco e migrations

O schema do PostgreSQL será versionado por migrations. Alterações de estrutura não devem ser aplicadas manualmente em produção sem uma migration correspondente.

Dados calculados, como determinados saldos, não devem virar fonte de verdade duplicada sem necessidade comprovada.

## 9. Importação

Importação é um fluxo de domínio e não um script descartável. O desenho deve contemplar:

1. upload;
2. leitura;
3. normalização inequívoca;
4. validação;
5. detecção de duplicidade;
6. staging;
7. revisão;
8. confirmação;
9. persistência transacional;
10. relatório da importação.

## 10. Observabilidade

Desde a Sprint 0, a API deve possuir health check. Logs de aplicação devem ser estruturados e não devem expor senhas, tokens ou dados pessoais desnecessários.

## 11. Decisões de simplicidade

- Monólito modular antes de microserviços.
- PostgreSQL único na V1.
- Um único repositório.
- Sem event bus distribuído inicialmente.
- Sem CQRS como requisito inicial.
- Sem abstrações genéricas antes de existir necessidade concreta.

Essas decisões podem ser revisitadas com evidência de necessidade, não por antecipação.

## 12. Consultas operacionais

O módulo `operational` concentra consultas agregadas somente de leitura para a experiência orientada à pessoa. Ele expõe listagens paginadas de pessoas, estagiários, férias/descanso e benefícios, além do perfil consolidado em `GET /api/pessoas/:id/perfil`.

Os comandos continuam nos módulos de domínio existentes e preservam validação, transação e auditoria. Essa separação evita replicar regras de gravação nas telas agregadas.
