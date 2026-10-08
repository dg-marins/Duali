# Operação do Duali na VPS

Estado verificado em 2026-10-08. Este documento complementa [deploy.md](deploy.md) e o [runbook de homologação](vps-homologation.md).

## Instalação atual

- URL: `https://duali.habitaos.com.br` em virtual host próprio do Nginx. `habitaos.com.br` permanece em seus virtual hosts existentes.
- Ubuntu 22.04, Node 22, pnpm 10.34.5 via Corepack e PostgreSQL 17 nativo. O PostgreSQL e a API escutam somente em `127.0.0.1:5432` e `127.0.0.1:3001`.
- Serviço: `duali.service`, usuário de sistema `duali`, ambiente em `/etc/duali/duali.env` (`root:duali`, modo `640`). O ambiente de migrations fica separado em `/etc/duali/duali-migrate.env`, com a mesma proteção. Nunca copie esses arquivos para o repositório.
- Backend: `/opt/duali/releases/<commit>`; symlink ativo `/opt/duali/current`. Frontend: `/var/www/duali/releases/<commit>`; symlink ativo `/var/www/duali/current`. O primeiro release publicado é `075345d`.
- Arquivos de configuração versionados: `deploy/vps/`. O certificado está em `/etc/letsencrypt/live/duali.habitaos.com.br`; o Certbot usa o webroot `/var/www/duali-acme` e recarrega o Nginx após renovar.
- Banco `duali`: `duali_runtime` tem acesso de leitura e escrita aos dados da aplicação, sem permissão para criar objetos no schema; `duali_app` é dono dos objetos e executa migrations usando o ambiente separado. A migração inicial veio do banco local, com 87 pessoas e 26 migrations. As sessões da origem foram excluídas antes da publicação; a conta administrativa anterior foi preservada e uma conta individual foi criada para a usuária.

## Backup e verificação

`duali-backup.timer` executa `duali-backup.service` diariamente às 03h30. O script cria um `pg_dump` custom em `/var/backups/duali/daily`, valida sua leitura com `pg_restore --list`, retém sete diários e quatro semanais. Os arquivos e diretórios são acessíveis apenas ao usuário `postgres`.

Em 2026-10-08, um backup da VPS foi restaurado em banco separado e conferido: 87 pessoas, zero sessões e 26 migrations. Após criar a segunda conta administrativa, outro backup foi restaurado e conferido com 87 pessoas, duas contas e zero sessões; sua cópia foi transferida e conferida por SHA-256 fora da VPS. **A cópia automática externa para Drive ainda precisa ser configurada**; até lá, falha ou perda da VPS pode superar a retenção local. A liberação inicial com esse risco foi solicitada pelo responsável pelo produto.

Para verificar a rotina:

```bash
sudo systemctl start duali-backup.service
sudo systemctl status duali-backup.service --no-pager
sudo systemctl list-timers duali-backup.timer --no-pager
```

## Atualizar um release

Antes de trocar código, confirme o commit e os testes aplicáveis, faça backup e verifique espaço em disco. Não rode a suíte de testes contra o banco `duali`: o gate de testes só admite `duali_test` local na porta `55432`.

1. Clone o commit aprovado em `/opt/duali/releases/<commit>` como usuário `duali`. Confira `git rev-parse HEAD` contra o commit planejado.
2. Nesse diretório, execute `pnpm install --frozen-lockfile`, `pnpm db:generate` e `pnpm build` como `duali`.
3. Avalie a compatibilidade das migrations com o release ainda ativo. Carregue `/etc/duali/duali-migrate.env` como `duali` e execute `pnpm db:migrate` somente após o backup. Use `/etc/duali/duali.env` apenas para o serviço. Para migration incompatível, programe janela de manutenção.
4. Copie `apps/web/dist` para `/var/www/duali/releases/<commit>`, com proprietário `root:www-data`, diretórios `750` e arquivos `640`.
5. Troque atomicamente os dois symlinks `current` usando um symlink temporário e `mv -T`, reinicie apenas `duali.service` e confira `/health`, login e uma leitura autenticada. Verifique também `https://habitaos.com.br`.
6. Mantenha o release anterior até a validação funcional. Atualize os arquivos em `deploy/vps/` com `nginx -t` antes de recarregar o Nginx.

Se o código novo falhar e o schema continuar compatível, aponte os symlinks para o release anterior e reinicie `duali.service`. Não reverta migrations destrutivamente. Para falha de dados, preserve o banco atual e restaure o backup em um banco novo, seguindo [deploy.md](deploy.md).

## Pendências operacionais

- Configurar cópia automática criptografada dos backups fora da VPS, com alerta para falha ou atraso.
- Configurar alertas externos de indisponibilidade, disco, serviço, PostgreSQL e certificado.
- Trocar a senha SSH temporária utilizada na instalação. Não exclua a conta `habitaos` sem inventariar suas dependências: ela é proprietária de arquivos e serviços do HabitaOS.
- O CI remoto de qualidade e segurança passa. O E2E remoto ainda falha por imagens de referência disponíveis somente para Windows e por quatro verificações de layout no Chromium Linux; os 37 E2E executados localmente passaram, com um caso histórico intencionalmente ignorado. Resolver a cobertura visual Linux antes de tratar o CI completo como aprovado.
