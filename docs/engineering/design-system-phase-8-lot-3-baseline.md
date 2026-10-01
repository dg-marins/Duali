# Design System — Fase 8, Lote 3 — Baseline

## Estado inicial

- Branch: `main`.
- Commit-base: `11f4236b6f60a9ddbbc5e596f7840078c450a496`.
- O worktree contém os Lotes 1 e 2 ainda não commitados. O checkpoint local em
  `artifacts/design-system-phase-8-lot-3/checkpoint/` preserva o diff binário,
  os arquivos não rastreados e o manifesto SHA-256 desse estado.
- Nenhum checkpoint anterior foi alterado.

## Dashboard antes do Lote 3

- Implementado em `Reporting.tsx` e consumido na rota `/app`.
- Consulta `GET /api/dashboard` com `unidadeId` e `competencia`; `categoria`
  permanece como contexto do gráfico e da URL.
- Mantém seis KPIs: custo de benefícios, pendências críticas, contratos
  vencendo, TCEs aguardando assinatura, férias exigindo atenção e divergências
  de benefícios.
- O detalhamento dos KPIs usa `kpiDetalhes` da mesma resposta.
- O gráfico é o `MonthlyBenefitChart` compartilhado com Benefícios.
- O painel de atenção usa `pendenciasPrioritarias`, limitado no consumer aos
  cinco primeiros itens.
- `LegacyDashboard` permanece exportado, sem consumidor encontrado.

## Pendências antes do Lote 3

- Implementada em `features/pendings/PendingsPage.tsx`.
- Consulta `GET /api/pendencias` com filtros locais de módulo e severidade e
  `pageSize=100`.
- Consulta `GET /api/pendencias/resumo` separadamente; os quatro totais são
  globais e independentes dos filtros da lista.
- A API devolve `total`, mas a página anterior usa somente `items` e não possui
  paginação ou aviso de truncamento.
- A ação navega diretamente para o `item.href` produzido pelo backend.
- Não há parâmetros de URL próprios da página.

## Limites

O lote não altera APIs, domínio, banco, cálculos, rotas, Relatórios, Auditoria,
`LegacyDashboard`, `MonthlyBenefitChart` ou páginas dos lotes anteriores.
