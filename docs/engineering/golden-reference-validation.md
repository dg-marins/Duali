# Golden Reference — validação

## Diagnóstico anterior ao rollout

Banco de uso: 74 pessoas com vínculo ATIVO/AFASTADO; zero conflitos encontrados na consulta somente leitura de 16/09/2026. A migration não foi aplicada ao banco de uso nesta rodada.

O banco de teste antigo contém fixtures acumuladas incompatíveis com a nova regra. A validação usou bancos locais isolados `duali_golden_test` e `duali_golden_clean_test`, sem limpar ou alterar o banco de uso. A migration foi aplicada em schema vazio e em upgrade com fixture de vínculo histórico; o índice rejeitou dois vínculos atuais da mesma pessoa.

## Contratos

- GET /api/pessoas-operacional mantém parâmetros existentes e aceita segmento (ou tipo para compatibilidade), retornando segmentos e totalPopulacao antes da paginação.
- POST /api/configuracoes-beneficios/multiunidade aceita tipo, fornecedorId, unidadeIds e os campos existentes de configuração. Cria as associações ausentes atomicamente, preservando as existentes.
- Nenhuma alteração de cálculo financeiro, competência, pedido ou aquisição.

## Homologação visual

Conferir sidebar expandida/recolhida, Pessoas Geral/CLT/Estágio separadamente, Perfil, Cadastros > Benefícios e mobile. Conferir também retorno com filtros e foco, criação sem vínculo, documentos e benefícios históricos.

Evidências sintéticas em `artifacts/golden-reference`: sidebar expandida e recolhida, Pessoas geral/CLT/Estágio, perfil, Cadastros > Benefícios e Pessoas/menu no mobile. Capturas verificadas visualmente após a última correção de layout.

O flyout da sidebar recolhida foi verificado também em `sidebar-recolhida-flyout.png`: o menu fica acima do conteúdo, e o E2E navega pelo subitem Benefícios sem perder o clique no fechamento por `mousedown`.

## Gates de 16/09/2026

- `pnpm lint`, `pnpm typecheck`, `pnpm test` (79 testes), `pnpm build`, `pnpm format:check`: aprovados no banco de teste isolado.
- `pnpm test:e2e`: 14 testes aprovados após o ajuste mobile. Uma execução intermediária teve falha intermitente no teste antigo de expiração de sessão por download; o arquivo de autenticação passou isoladamente (6/6) e a suíte completa passou na repetição (14/14). A causa da intermitência não foi estabelecida.
- `pnpm audit --prod --audit-level high`: aprovado; uma vulnerabilidade moderada foi informada, abaixo do nível de bloqueio solicitado.
- Revisão independente: solicitada duas vezes, mas os agentes revisores retornaram limite de uso antes de produzir parecer. Esse gate não recebeu aprovação independente nesta rodada.

O banco de uso permanece sem a nova migration; aplicar apenas após confirmar novamente que não há pessoas com vínculos atuais simultâneos. Os artefatos visuais são sintéticos e não exibem dados reais.
