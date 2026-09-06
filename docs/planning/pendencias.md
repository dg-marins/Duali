# Pendências conhecidas — Duali MVP

Este documento registra decisões ainda abertas para evitar que agentes preencham lacunas por conta própria.

## Não bloqueiam o início do desenvolvimento

### Férias CLT — detalhamento jurídico

O MVP implementará a regra operacional base de 30 dias a cada 12 meses e alertas de pendência/prazo. Regras trabalhistas especiais, convenções coletivas e exceções jurídicas detalhadas não serão inferidas pelo sistema sem nova decisão.

### Gestor

Gestor permanece informação secundária e opcional. Equipe é o conceito organizacional prioritário. Caso surja necessidade operacional de histórico detalhado de gestores, revisar a modelagem.

### Recuperação de senha por e-mail

Fora do MVP inicial. Redefinição será administrativa.

### Perfis adicionais

Somente `ADMINISTRADOR` no MVP. Novos perfis e matriz de permissões serão definidos quando houver necessidade real de múltiplos papéis.

### Layout final e identidade visual

A interface deve ser limpa, responsiva e operacional. Refinamento visual final não bloqueia a implementação dos fluxos.

### Infraestrutura final de produção

Domínio, sizing final da VPS, política definitiva de backup, RPO/RTO e observabilidade avançada serão fechados antes da homologação produtiva.

### PDFs

Exportação PDF será criada somente para relatórios em que houver necessidade operacional comprovada. Excel/CSV são prioridades para dados tabulares.

### Notificações e integrações

E-mail, WhatsApp e demais integrações não fazem parte do núcleo inicial do MVP salvo decisão posterior.

## Regra para novas pendências

Uma pendência deve ser registrada aqui quando:

- existe dúvida real de produto;
- a escolha pode alterar comportamento futuro;
- não é necessário decidir para concluir a task atual.

Pendências não autorizam o agente a inventar requisitos.
