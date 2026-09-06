# Execução local

Requisitos: Node.js 22.12+ (validado também com 24), pnpm 9.15.4, Docker Compose.

1. Copie .env.example para .env e substitua os placeholders por uma senha local aleatória, igual na URL e em POSTGRES_PASSWORD.
2. Execute `pnpm install --frozen-lockfile`.
3. Execute `docker compose up -d --wait`.
4. Execute `pnpm db:generate`, `pnpm db:migrate` e `pnpm build`.
5. Execute `pnpm dev`. Web: http://localhost:5173. API: http://127.0.0.1:3000/health.

No PowerShell com Execution Policy restrita, use pnpm.cmd em vez de pnpm.

Validação: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`.

O banco Compose está isolado na porta 55432, com volume duali_data. Não use banco produtivo para testes. A API consulta o banco no healthcheck.
