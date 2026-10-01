# Fase 8 — Lote 8: baseline

## Estado inicial

- Branch: `main`
- HEAD: `11f4236b6f60a9ddbbc5e596f7840078c450a496`
- Checkpoint: `artifacts/design-system-phase-8-lot-8/checkpoint/`
- SHA-256 do manifesto: `7e83591b52e9eaaf6ed9df4dd216db31002f3ad7ad2649959e7ada179c96622a`
- Arquivos não rastreados copiados: 110
- Entradas no manifesto: 119

O checkpoint contém status completo, diff textual, patch binário, estatísticas,
name-status, inventário e cópia dos arquivos não rastreados. O worktree inicial
corresponde ao acumulado aprovado dos Lotes 1–7 e não foi limpo ou resetado.

## Inventário de compatibilidade

- `/app/beneficios/lote`: alias funcional mantido sem alteração.
- `/app/estagiarios`: comportamento próprio mantido, incluindo `InternsPage` e
  `OperationalList`.
- `/app/beneficios/lancamentos?novo=1`: condição histórica preservada; o matching
  efetivo continua abrindo Lançamentos.
- `Operational.tsx`: permanece ativo por `InternsPage`, `OperationalList` e
  contratos ainda importados por `main.tsx`.
- `ui.tsx`: permanece como fachada ativa.
- `components.tsx`: permanece ativo por `Records`, `RecordForm`, `Lookup`,
  `buildRecordPayload` e `Notice`.

## Candidatos confirmados antes da execução

As buscas iniciais encontraram somente as próprias definições para
`LegacyDashboard`, `AuxiliaryPage`, `RecordFormHost`, o componente frontend
`Ledger` e `FormActions`. Documentação histórica não é consumidor executável.

As fachadas unitárias de Importações, Fazer pedido, Fechamento e Configurações de
Benefícios possuem como consumidor executável apenas `main.tsx`; serão removidas
individualmente depois da migração para os caminhos oficiais.

## Restrições

Nenhum endpoint, schema, serviço, migration, regra de domínio, rota ou ordem de
matching será alterado. A ordem de CSS permanece `style.css`, foundations,
shell, components e estilos de página. Snapshots históricos não serão atualizados.
