# Design System — Fase 8, Lote 7 — baseline

- Branch: `main`
- Commit-base: `11f4236b6f60a9ddbbc5e596f7840078c450a496`
- Escopo: Fazer pedido / Pedido mensal de benefícios.
- Checkpoint local: `artifacts/design-system-phase-8-lot-7/checkpoint/`
- Manifesto SHA-256: 8d23d07e5f84e369895c5b475de172cafa3a75462f26698e229542c0c61beb74

O worktree contém as alterações acumuladas e intencionalmente não consolidadas dos Lotes 1–6. No início do Lote 7 havia 25 entradas rastreadas modificadas e 40 entradas não rastreadas no `git status --short`. O checkpoint contém status, diff, estatísticas, inventário, patch binário e cópia dos arquivos não rastreados. Esse trabalho herdado não será limpo, resetado, descartado ou atribuído ao Lote 7.

## Contrato do lote

- Fazer pedido permanece uma página única.
- A única escrita consumida pela página continua sendo `POST /api/aquisicoes-beneficios/pedido/gerar`.
- APIs, Prisma, migrations, regras financeiras, rotas e dependências permanecem inalterados.
- A infraestrutura fail-closed de testes permanece inalterada.
- O alias `/app/beneficios/lote` e a dívida de `lancamentos?novo=1` permanecem para o Lote 8.
