# Desenvolvimento — Duali

## Objetivo

Definir convenções mínimas para manter o desenvolvimento do MVP consistente, simples e previsível.

## Princípios

- Preferir simplicidade e clareza.
- Manter módulos coesos e com responsabilidades explícitas.
- Evitar abstrações prematuras.
- Não criar infraestrutura sem necessidade concreta.
- Regras de negócio devem ficar fora de componentes de UI.
- Validação externa deve ocorrer na borda da aplicação.

## Estrutura inicial

```text
apps/
  web/
  api/
packages/
  database/
  shared/
  ui/
```

### `apps/web`

React + TypeScript + Vite.

Responsável por interface, navegação, formulários e consumo da API.

### `apps/api`

Node.js + Fastify.

Responsável por autenticação, autorização, validação, regras de aplicação, acesso aos serviços de domínio e exposição da API.

### `packages/database`

Prisma schema, migrations e utilitários de acesso ao banco.

### `packages/shared`

Tipos e utilitários realmente compartilhados. Não transformar este pacote em depósito genérico.

### `packages/ui`

Componentes reutilizáveis da interface e composição sobre shadcn/ui quando necessário.

## Validação

Zod é o padrão inicial para validação de entrada e contratos compartilháveis.

Toda entrada externa deve ser validada, incluindo:

- body;
- params;
- querystring;
- arquivos/importações;
- variáveis de ambiente.

## API

- Usar rotas previsíveis e orientadas a recurso.
- Retornar status HTTP coerentes.
- Erros devem ter formato estável.
- Não expor detalhes internos.
- Regras críticas devem ser testáveis sem depender da camada HTTP.

## Banco e migrations

- Toda mudança de schema exige migration versionada.
- Não editar migrations já aplicadas em ambientes compartilhados.
- Seed deve ser idempotente quando possível.
- Dados de produção não podem depender de fixtures de teste.

## Dependências

Antes de adicionar dependência:

1. verificar se a plataforma ou stack existente já resolve o problema;
2. justificar o ganho;
3. evitar bibliotecas redundantes para o mesmo papel;
4. preferir bibliotecas maduras e bem mantidas.

## Commits

Commits devem ser pequenos e descrever a intenção da mudança.

Exemplos:

```text
feat: add person creation flow
fix: prevent duplicate cpf import
refactor: extract leave balance calculation
test: cover internship rest accrual
docs: document import rules
```

## Configuração

- Configuração variável deve vir de ambiente.
- `.env.example` pode conter apenas nomes de variáveis e valores não sensíveis de exemplo.
- Secrets nunca devem ser versionados.

## Logging

Logs devem ajudar diagnóstico sem expor PII desnecessária.

Evitar registrar:

- senha;
- hash de senha;
- cookie de sessão;
- token;
- documento completo quando não necessário;
- conteúdo integral de importações.

## UI

- Interface responsiva.
- Estados de loading, vazio e erro devem ser tratados.
- Ações destrutivas devem ser claramente diferenciadas, embora o MVP não use hard delete pela UI.
- Formulários devem apresentar erros próximos aos campos.
- Não esconder inconsistências operacionais importantes.

## Mudança de regra

Se uma implementação exigir alterar decisão de produto, interromper a alteração e atualizar/validar a documentação antes de consolidar o comportamento no código.
