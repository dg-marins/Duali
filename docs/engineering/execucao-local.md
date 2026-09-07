# Execução local

Requisitos: Node.js 22.12+ (validado também com 24), pnpm 10.34.5, Docker Compose. O Corepack usa automaticamente a versão registrada no `package.json`.

1. Copie .env.example para .env e substitua os placeholders por uma senha local aleatória, igual na URL e em POSTGRES_PASSWORD.
2. Execute `pnpm install --frozen-lockfile`.
3. Execute `docker compose up -d --wait`.
4. Execute `pnpm db:generate`, `pnpm db:migrate` e `pnpm build`.
5. Execute `pnpm dev`. A Web usa exatamente a origem definida em `APP_ORIGIN`; a API usa `API_HOST` e `API_PORT`.

Para usar a Web na porta 5001 e manter a API na porta 3000:

```env
APP_ORIGIN=http://localhost:5001
API_HOST=127.0.0.1
API_PORT=3000
```

`APP_ORIGIN` também é a origem permitida pela proteção CSRF, por isso deve coincidir com o endereço usado no navegador.

A API começa a atender antes da sincronização periódica de direitos, que continua em segundo plano. A mensagem `Sincronização de direitos concluída` no terminal confirma o fim dessa rotina; ela não precisa terminar para abrir a tela de login.

No PowerShell com Execution Policy restrita, use pnpm.cmd em vez de pnpm.

Validação: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`.

O banco Compose está isolado na porta 55432, com volume duali_data. Não use banco produtivo para testes. A API consulta o banco no healthcheck.
