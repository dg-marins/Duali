# Resultado da implementação — 2026-09-06

## Implementado

Monorepo executável React/Fastify/PostgreSQL; autenticação administrativa por sessão com Argon2id, CSRF, revogação e auditoria; cadastros de pessoas, vínculos, unidades e equipes; estágios, instituições, documentos e seguros históricos; direitos, programação, consumo e ajustes de descanso; benefícios por unidade/fornecedor/componente/competência; importação XLSX/CSV com staging e revisão; dashboard, auditoria e relatórios Excel/CSV.

## Commits funcionais

- 0420982: fundação.
- 627deab: autenticação e pessoas.
- 9969ead: estágios.
- 0ba8a05: férias/descanso.
- a29c49d: benefícios.
- 4234010: importação.
- 0c0754d: relatórios.

As alterações finais de segurança, apresentação, testes e documentação estão no commit de hardening posterior a estes.

## Migrations

202609060001_foundation, 202609060002_auth_people, 202609060003_internship, 202609060004_leave, 202609060005_benefits, 202609060006_imports. Aplicadas nos bancos locais duali e duali_test; a sequência foi aplicada inicialmente em banco de teste vazio.

## Evidências executadas

- pnpm install --frozen-lockfile: passou.
- pnpm build, pnpm lint, pnpm typecheck: passaram.
- pnpm format:check: passou após formatação.
- pnpm test: 18 testes em 9 arquivos passaram.
- pnpm test:e2e: login, pessoa, vínculo, estágio, descanso, benefício, menu agrupado, importação parcial, exportação e logout passaram.
- pnpm audit --prod: nenhuma vulnerabilidade conhecida encontrada.
- GET /health consultando PostgreSQL: respondeu 200.
- pg_dump custom e pg_restore --exit-on-error: passaram em banco novo duali_restore_20260906182708; seis migrations recuperadas.
- Capturas desktop e mobile geradas em artifacts, fora do Git.

## Operação

Consulte docs/engineering/execucao-local.md, importacao.md e deploy.md. Primeiro administrador: pnpm admin:create. Redefinição: pnpm admin:reset. Nenhum administrador com senha padrão foi criado no banco operacional.

Configuração: DATABASE_URL, NODE_ENV, API_HOST, API_PORT, APP_ORIGIN, SESSION_HOURS e POSTGRES_PASSWORD para Compose. UPLOAD_DIR não é utilizado: os arquivos de origem ficam no PostgreSQL. O .env local contém senha gerada e está ignorado pelo Git.

## Pendências e limites de cobertura

O perfil real `Listagem Estagiários Geral` foi validado em staging e recebeu publicação parcial idempotente. No lote operacional de 2026-09-07, 1.369 itens foram publicados, 85 ficaram para revisão e 45 aguardam dependências; uma segunda execução publicou zero itens, comprovando a idempotência. As contagens definitivas após a publicação foram 273 pessoas, 246 vínculos, 235 estágios, 44 instituições, 314 documentos, 195 seguros e 59 movimentações.

O MVP ainda não deve ser declarado totalmente homologado. Os fluxos principais possuem E2E, mas a revisão manual de duplicidade no navegador continua coberta apenas por integração. Os testes atuais não substituem homologação funcional completa.

CI remoto, implantação Linux/Nginx, ensaio produtivo de recuperação e homologação pelo RH não foram executados. O restore local comprovou execução e migrations. A conferência automatizada da planilha real valida abas, staging e existência dos destinos; uma comparação semântica integral de cada célula ainda depende da homologação operacional.

O pnpm instalado emite aviso de compatibilidade sobre overrides no package.json, embora instalação congelada e auditoria tenham passado. Padronizar essa configuração antes de atualizar a versão do gerenciador.

Continuam pendentes de produto/infraestrutura: domínio, dimensionamento, retenção de backup, RPO/RTO e regras especiais de férias. PDF, integrações e recuperação de senha por e-mail ficam fora do escopo aprovado.

## Reformulação operacional — 2026-09-07

A aplicação passou a usar rotas navegáveis e uma experiência orientada à pessoa. Foram entregues sidebar retrátil e drawer móvel, dashboard com primeiro uso, busca combinada de pessoas, perfil consolidado com abas e timelines, listagens especializadas de estagiários, férias/descanso e benefícios, ações contextuais, fluxo guiado de importação, relatórios e auditoria com filtros. Unidades, equipes, instituições e fornecedores possuem detalhe com relacionamentos operacionais.

O endpoint `GET /api/pessoas/:id/perfil` agrega vínculos, estágio, saldos reconstruídos, benefícios, documentos, seguros, alertas e histórico. As listagens especializadas usam paginação, filtros validados e ordenação. O vínculo atual é o ativo mais recente e múltiplos vínculos ativos são sinalizados.

A migration `202609070002_structured_person_address` adicionou endereço estruturado nullable e foi aplicada nos bancos `duali` e `duali_test`, mantendo o texto legado. O Prisma foi atualizado de 6.19.0 para 6.19.3 e o pnpm para 10.34.5; overrides transitivos corrigiram os avisos de segurança de `deepmerge-ts` e `uuid`.

Validação desta entrega: instalação congelada reproduzível, migrations, build, lint, typecheck, 19 testes em 10 arquivos, E2E operacional completo, `format:check` e auditoria de dependências passaram. A planilha real foi novamente verificada: 1.369 itens publicados, 85 pendentes e 45 aguardando dependência, sem perda dos destinos já publicados.
