# Duali — Gestão de Pessoas

Duali é um sistema web de gestão de pessoas criado para substituir controles operacionais mantidos em planilhas, centralizando dados de pessoas, vínculos, estagiários, férias/descanso, benefícios, equipes, relatórios e auditoria.

## Objetivo do produto

Substituir o controle fragmentado em planilhas por uma aplicação web multiusuário, acessível de qualquer lugar, com importação e exportação de dados, histórico e rastreabilidade.

## Diretrizes iniciais

- Planilha não é banco de dados.
- Pessoa e vínculo são entidades distintas.
- CLT e estágio compartilham o mesmo cadastro de pessoa.
- Ativos e desligados são estados do vínculo, não cadastros separados.
- RJ, SP e DF não geram estruturas de banco diferentes.
- Equipes serão mantidas inicialmente com a nomenclatura existente nas planilhas.
- Estagiários adquirem 15 dias de descanso a cada 6 meses de vínculo.
- Saldo negativo de férias/descanso é tratado como anomalia por padrão e deve ser revisado.
- Totais e saldos devem ser calculados pelo sistema sempre que possível.
- Alterações relevantes devem ser auditadas.
- Importações devem passar por pré-validação antes de gravar dados.

## Stack inicial

- Frontend: React + TypeScript + Vite
- UI: Tailwind CSS + shadcn/ui
- Backend: Node.js + Fastify
- Banco: PostgreSQL
- ORM: Prisma
- Validação: Zod
- Testes: Vitest + Playwright
- Monorepo: pnpm workspaces
- Autenticação: sessão com cookie HttpOnly
- Deploy: VPS Linux + Nginx + PostgreSQL

## Documentação

A documentação do produto, arquitetura, modelo de dados e planejamento fica em `docs/`.

## Status

Módulos do MVP implementados e validação local em andamento. Consulte [resultados e pendências](docs/planning/resultado-mvp.md).

## Executar

Consulte [execução local](docs/engineering/execucao-local.md), [importação assistida](docs/engineering/importacao.md) e [deploy e recuperação](docs/engineering/deploy.md).

Após configurar o banco e executar migrations/build, crie o primeiro administrador com `pnpm admin:create` e inicie com `pnpm dev`.
