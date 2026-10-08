# Homologação do Duali em VPS

Este runbook prepara uma primeira publicação para uma equipe interna pequena. Ele não substitui a escolha do provedor, o teste de restauração nem a homologação funcional. O modelo inicial recomendado acompanha o deploy Linux existente: Ubuntu 24.04 LTS, Nginx, systemd, Node 22 e PostgreSQL 17.

## Capacidade inicial

Use como ponto de partida 2 vCPU, 4 GB de RAM e 60 a 80 GB de SSD ou NVMe. Essa estimativa deve ser revista depois de medir o volume do banco, a concorrência e as importações reais. Se o build ocorrer na própria VPS, configure swap e monitore memória e disco.

Arquivos originais de importação, staging e auditoria ficam no PostgreSQL. O crescimento desses dados afeta o banco e o tamanho dos backups. Configure alertas de disco antes de liberar o uso.

## Rede e sistema operacional

- Publique somente as portas 80 e 443. Restrinja a porta 22 a IPs administrativos quando for viável.
- Mantenha a API em `127.0.0.1:3000` e o PostgreSQL em loopback ou rede privada sem exposição pública.
- Use autenticação SSH por chave. Desabilite login remoto de `root` e autenticação SSH por senha depois de validar um acesso administrativo alternativo.
- Ative atualizações automáticas de segurança e mantenha uma janela controlada para reinícios.
- Execute o Duali com usuário de sistema dedicado, sem shell administrativo e sem privilégios de `root`.

## Domínio, HTTPS e configuração

1. Aponte um subdomínio de homologação para a VPS.
2. Emita um certificado HTTPS e habilite renovação automática. Monitore sua expiração.
3. Defina `NODE_ENV=production`, `API_HOST=127.0.0.1`, `API_PORT=3000`, `DATABASE_URL`, `SESSION_HOURS` e `APP_ORIGIN`.
4. `APP_ORIGIN` deve ser exatamente a origem acessada pelo navegador, por exemplo `https://homologacao.example.com`, sem caminho ou barra final.
5. Use senhas exclusivas e aleatórias para o banco e para qualquer integração. Armazene o ambiente fora do repositório, com proprietário do serviço e permissão `600`.

O Nginx deve servir `apps/web/dist`, encaminhar `/api/` e `/health` para a API local e aplicar `client_max_body_size 11m` e `proxy_read_timeout 150s`. Preserve os cabeçalhos descritos em [deploy.md](deploy.md) e não registre URLs de API contendo dados pessoais.

## Serviço e releases

- Configure uma unidade systemd com `WorkingDirectory`, `EnvironmentFile`, `User=duali` e `Restart=on-failure`.
- Aplique limites razoáveis de reinício para evitar loops e configure rotação/retenção dos logs do journal.
- Instale releases em diretórios versionados e aponte um symlink estável para o release ativo.
- Antes de publicar, crie e valide um backup. Depois execute `pnpm install --frozen-lockfile`, `pnpm db:generate`, `pnpm db:migrate` e `pnpm build`.
- Reinicie o serviço e valide `/health`, login e uma leitura autenticada. Mantenha o release anterior para rollback do código.
- Não reverta migrations destrutivamente. Se uma migration impedir a operação, preserve o banco e siga o procedimento de restauração testado.

## Backup e recuperação

Para homologação, adote inicialmente:

- `pg_dump` diário em formato custom;
- cópia criptografada fora da VPS;
- retenção de 7 backups diários e 4 semanais;
- RPO de 24 horas e RTO de 4 horas;
- alerta para falha ou backup com idade superior a 26 horas.

Antes do uso real, restaure um backup em banco separado, valide migrations, contagens, auditoria, importações e login, e registre o tempo consumido. Repita o teste de restauração ao menos trimestralmente e sempre que o processo de backup mudar. Nunca restaure diretamente sobre o banco ativo.

## Monitoramento mínimo

Configure alertas para:

- indisponibilidade externa e resposta não saudável de `/health`;
- falhas e reinícios repetidos do serviço systemd;
- uso de CPU, memória e swap;
- disco acima de 75% e 85%;
- indisponibilidade, conexões e crescimento do PostgreSQL;
- certificado próximo da expiração;
- falha, tamanho anormal ou atraso do backup.

Evite incluir CPF, RG, contatos, cookies, tokens, senhas ou payloads de importação nos logs e alertas.

## Acesso e recuperação administrativa

O MVP possui apenas o perfil `ADMINISTRADOR`. Conceda contas individuais somente a quem precisa de acesso integral e desative imediatamente acessos que deixarem de ser necessários.

Não existe recuperação de senha por e-mail. O procedimento de recuperação é executar `pnpm admin:reset` em sessão administrativa protegida; a operação redefine a senha e revoga as sessões do usuário.

## Checklist de homologação

Antes de liberar a equipe, valide e registre evidências de:

- login, logout, expiração e revogação de sessão;
- criação com senha de 8 caracteres, rejeição com 7 e edição sem troca de senha;
- Pessoas, Férias, Benefícios, Competências e Fechamento;
- importações CSV/XLSX próximas do limite de 10 MB e exportações;
- uso simultâneo representativo da equipe;
- desktop e mobile nos navegadores utilizados;
- reinício da aplicação e da VPS;
- resposta `503` do health durante indisponibilidade controlada do banco e recuperação posterior;
- backup, restauração isolada e invalidação das sessões restauradas;
- renovação do certificado em modo de teste;
- firewall sem exposição pública da API ou do PostgreSQL.

## Decisões antes da produção

Depois da homologação, confirme provedor, região, capacidade, domínio definitivo, responsáveis por incidentes, retenção, RPO/RTO e o modelo de deploy. A escolha entre systemd nativo e containers deve ocorrer com medições da homologação; este runbook não introduz Dockerfile ou Compose de produção.
