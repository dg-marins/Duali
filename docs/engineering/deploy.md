# Deploy Linux e recuperação

Preparação: Node 22.12+, pnpm 9.15.4, PostgreSQL 17, Nginx e certificado HTTPS. Execute a aplicação com usuário de sistema dedicado, sem privilégios administrativos.

## Instalação

1. Instale o release em /opt/duali. Configure o arquivo de ambiente protegido com permissão 600 e proprietário do serviço.
2. Defina NODE_ENV=production, API_HOST=127.0.0.1, API_PORT=3000, APP_ORIGIN=https://seu-dominio e DATABASE_URL. SESSION_HOURS tem padrão 8.
3. Execute pnpm install --frozen-lockfile, pnpm db:generate, pnpm db:migrate e pnpm build.
4. Crie o administrador com pnpm admin:create. A senha é solicitada sem eco. pnpm admin:reset redefine a senha e revoga sessões.
5. Use systemd para executar node apps/api/dist/server.js com WorkingDirectory=/opt/duali e EnvironmentFile apontando ao arquivo protegido. Configure Restart=on-failure e User=duali.
6. Nginx deve servir apps/web/dist, encaminhar /api/ e /health ao endereço local da API, preservar Host/Origin, definir X-Forwarded-For com o IP remoto e X-Forwarded-Proto. Não exponha PostgreSQL.
7. Configure client_max_body_size 11m e proxy_read_timeout 150s para importações. Nas rotas React use try_files $uri /index.html. Desative access_log para /api/ para evitar consultas com dados pessoais.
8. Valide nginx -t, HTTPS, login/logout e GET /health. O health retorna 503 quando o banco não responde.

## Backup

Use pg_dump --format=custom --file=backup.dump com conexão via serviço PostgreSQL ou .pgpass protegido. O dump inclui arquivos originais, staging, auditoria e dados operacionais. Não passe senhas na linha de comando.

Antes de atualizar, faça backup e mantenha o release anterior. Copie backups para armazenamento separado, protegido e com acesso restrito. Frequência, retenção, RPO e RTO definitivos precisam ser definidos antes da produção.

## Restauração

Crie um banco vazio separado. Execute pg_restore --exit-on-error --dbname=BANCO_NOVO backup.dump. Compare contagens, migrations e amostras de registros/auditoria/importações. Invalide sessões no banco restaurado antes de disponibilizar a aplicação.

Para recuperação, pare o serviço, preserve o banco atual, configure o release compatível e a conexão para o banco restaurado, valide health/login/consultas e reative o serviço. Não restaure por cima do banco atual nem reverta migrations destrutivamente.

## Limites da validação

A implantação em VPS, certificado real, systemd/Nginx e homologação pelo RH não foram executados nesta entrega local. Os procedimentos precisam ser exercitados no ambiente de homologação antes da produção.
