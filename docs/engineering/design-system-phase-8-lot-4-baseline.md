# Design System — Fase 8, Lote 4 — Baseline

- Data: 2026-09-25
- Branch: `main`
- Commit-base: `11f4236b6f60a9ddbbc5e596f7840078c450a496`
- Escopo: Relatórios (`/app/relatorios`) e Auditoria (`/app/admin/auditoria`).
- Estado inicial: worktree com alterações intencionais e ainda não consolidadas dos Lotes 1–3.
- Checkpoint local: `artifacts/design-system-phase-8-lot-4/checkpoint/`.
- SHA-256 do manifesto inicial: `bc717f695f67cb2893f07c0f925b44e5240e76dfd36d23f93496930e6a0396ab`.

## Contratos preservados

- Relatórios continuam usando `GET /api/relatorios/:tipo` e exportações em `GET /api/exportacoes/:tipo/:formato`.
- Auditoria continua usando `GET /api/auditoria`.
- Filtros permanecem locais às páginas; nenhuma URL, API, permissão ou regra de domínio será alterada.
- Valores financeiros continuam calculados no backend. O frontend apenas apresenta strings decimais.
- O comportamento atual dos filtros não aplicados pelo backend em Aquisições permanece como dívida funcional conhecida.

## Isolamento

O checkpoint contém status, diff binário, inventário de arquivos não rastreados, cópia desses arquivos e manifesto. Nenhum arquivo herdado foi descartado, resetado ou consolidado automaticamente.
