# Sprint 0 — Fundação do Duali

## Objetivo

Criar uma base executável, testável e segura o suficiente para iniciar o desenvolvimento funcional sem antecipar complexidade.

## Resultado esperado

Ao final da Sprint 0:

```text
PostgreSQL sobe
      ↓
migrations executam
      ↓
API sobe
      ↓
GET /health retorna 200
      ↓
Web sobe
      ↓
CI valida o projeto
```

Nenhuma tela de negócio completa é requisito desta sprint.

## S0-01 — Inicializar monorepo

Criar configuração raiz com pnpm workspaces e TypeScript compartilhado.

Critérios de aceite:
- instalação de dependências executável a partir da raiz;
- `apps/` e `packages/` reconhecidos pelo workspace;
- scripts básicos documentados;
- nenhuma credencial versionada.

## S0-02 — Inicializar frontend

Criar `apps/web` com React, TypeScript e Vite.

Critérios de aceite:
- aplicação executa localmente;
- TypeScript sem erros na baseline;
- estrutura preparada para Tailwind/shadcn;
- página inicial mínima sem implementar dashboard funcional.

## S0-03 — Inicializar API

Criar `apps/api` com Fastify e TypeScript.

Critérios de aceite:
- servidor executa localmente;
- `GET /health` retorna HTTP 200 e payload previsível;
- configuração é carregada por ambiente;
- encerramento do processo trata conexões de forma adequada.

## S0-04 — Banco de desenvolvimento

Preparar PostgreSQL para ambiente local e documentar configuração.

Critérios de aceite:
- banco pode ser iniciado de forma reproduzível;
- credenciais locais usam arquivo ignorado pelo Git ou variáveis de ambiente;
- existe `.env.example` sem segredos reais;
- API consegue estabelecer conexão.

## S0-05 — Prisma e migration inicial

Criar `packages/database` e primeira migration.

Escopo inicial mínimo:
- Pessoa;
- Vinculo;
- Unidade;
- Equipe;
- Usuario.

Critérios de aceite:
- schema versionado;
- migration executa em banco vazio;
- geração do client funciona;
- relacionamentos e restrições básicas correspondem ao modelo documentado.

## S0-06 — Qualidade automatizada

Configurar scripts de qualidade.

Critérios de aceite:
- typecheck executável pela raiz;
- lint executável pela raiz;
- testes executáveis pela raiz;
- falha em qualquer etapa retorna código de saída diferente de zero.

## S0-07 — CI

Criar GitHub Actions para validar alterações.

Critérios de aceite:
- instalação reproduzível com lockfile;
- typecheck, lint e testes executam no CI;
- build de web/API é validado;
- nenhuma secret de produção é necessária para validações básicas.

## S0-08 — Baseline de segurança

Preparar decisões necessárias para autenticação sem implementar atalhos inseguros.

Critérios de aceite:
- estratégia de sessão/cookie documentada;
- senha nunca armazenada em texto puro;
- secrets fora do repositório;
- logging não registra senha/token;
- dependências sensíveis não são adicionadas sem necessidade.

## S0-09 — Documentação operacional inicial

Atualizar README com pré-requisitos e comandos conforme forem implementados.

Critérios de aceite:
- novo desenvolvedor consegue identificar versões/ferramentas necessárias;
- comandos de instalação, desenvolvimento, teste e migration estão documentados;
- limitações conhecidas estão registradas.

## Ordem sugerida

1. S0-01 Monorepo
2. S0-02 Web e S0-03 API
3. S0-04 Banco
4. S0-05 Prisma/migration
5. S0-06 Qualidade
6. S0-07 CI
7. S0-08 Segurança
8. S0-09 Documentação final da sprint

## Definition of Done da Sprint 0

- clone limpo consegue instalar o projeto seguindo o README;
- banco de desenvolvimento pode ser criado de forma reproduzível;
- migration inicial funciona;
- web e API iniciam;
- health check responde;
- CI está verde;
- não há credenciais reais no Git;
- decisões que ficaram abertas estão documentadas em vez de implementadas por suposição.

## Próxima etapa

Após a Sprint 0, iniciar uma Sprint 1 focada em autenticação/autorização e no primeiro fluxo vertical de cadastro de pessoa + vínculo, antes de avançar para benefícios e importações complexas.
