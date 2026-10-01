# Fase 9 — Consolidação e regressão final

Data: 2026-10-01
Baseline: `a4f651955a515fe1518ec85e89f794c037aafbbb`

## Escopo e classificação

A auditoria consolidou o estado técnico produzido pelas Fases 1–8. Achados
foram classificados como:

- **A — bloqueador:** regressão funcional, estrutural, acessível, contratual ou
  documentação final incorreta;
- **B — dívida técnica:** problema real sem impedir a consolidação;
- **C — refinamento visual:** ajuste estético reservado para depois da Fase 9;
- **D — evolução funcional/domínio:** decisão de produto ou regra fora do
  escopo.

O único A encontrado foi a documentação de produto desatualizada. Ela foi
corrigida em `docs/product/design-system.md`. Não foi necessária alteração de
implementação.

## Matriz final

| Área | Rota | Design System | Responsividade/A11Y | Evidência | Status |
| --- | --- | --- | --- | --- | --- |
| AppShell | todas sob `/app` | shell oficial | desktop, recolhido, drawer mobile, foco | `appshell.spec.ts` | PASS |
| Dashboard | `/app` | PageHeader, filtros, métricas, DataTable | detalhes expansíveis/scroll e gráfico acessível | `dashboard-pendings-golden-reference.spec.ts` | PASS |
| Pendências | `/app/pendencias` | métricas, filtros, DataTable expansível | expansão separada de Revisar | mesma suíte | PASS |
| Pessoas | `/app/pessoas` | Golden Reference | grid responsivo e expansão mobile | `people-golden-reference.spec.ts` | PASS |
| Cadastro Pessoa | `/app/pessoas/nova` | Golden Reference, Stepper | guard, teclado e mobile | `person-create-golden-reference.spec.ts` | PASS |
| Perfil/Edição | `/app/pessoas/:id[/editar]` | tabs, tabelas, Timeline, forms | tabs, overlays, guard e mobile | `person-profile-golden-reference.spec.ts` | PASS |
| Férias | `/app/ferias` | Golden Reference | expandable, dialogs e programação | `leave-golden-reference.spec.ts` | PASS |
| Benefícios | `/app/beneficios` | Golden Reference e gráfico | tabela financeira com scroll | `benefits-golden-reference.spec.ts` | PASS |
| Competências | `/app/beneficios/competencias` | detalhe operacional oficial | desktop/mobile e ações | mesma suíte | PASS |
| Fazer pedido | `/app/beneficios/aquisicao` | página única, expandable, confirmação | guard, controles e transporte mobile | `benefit-order-golden-reference.spec.ts` | PASS |
| Lançamentos | `/app/beneficios/lancamentos` | expandable e Sheet | ação independente da expansão | `benefits-operations-design-system.spec.ts` | PASS |
| Fechamento | `/app/beneficios/fechamento` | métricas, scroll, dialogs | finanças no container | mesma suíte | PASS |
| Configurações | `/app/cadastros/configuracoes-beneficios` | priority, Dialog, RecordForm | desktop/mobile | mesma suíte | PASS |
| Cadastros/Usuários | rotas de cadastro e `/app/admin/usuarios` | Records e detalhes oficiais | priority, dialogs e mobile | `registries-golden-reference.spec.ts` | PASS |
| Relatórios | `/app/relatorios` | filtros, DataTable, paginação | estratégia por relatório | `reports-audit-golden-reference.spec.ts` | PASS |
| Auditoria | `/app/admin/auditoria` | expandable e Dialog de comparação | expansão/ação separadas | mesma suíte | PASS |
| Importações | `/app/importacoes` | Stepper apresentacional, tabelas, Sheet | scroll/expandable e mobile | `imports-golden-reference.spec.ts` | PASS |
| Estagiários legado | `/app/estagiarios` | compatibilidade ativa | comportamento preservado | `route-compatibility.spec.ts` | DEBT |
| Alias pedido | `/app/beneficios/lote` | compatibilidade ativa | query preservada | `route-compatibility.spec.ts` | DEBT |
| Matching `novo=1` | `/app/beneficios/lancamentos?novo=1` | comportamento histórico | sem mudança de matching | `route-compatibility.spec.ts` | DEBT |

## Arquitetura atual

- `components/ui/`: biblioteca oficial de ações, controles, dados, feedback,
  overlays, Stepper e Timeline.
- `features/`: páginas e composições por domínio.
- `styles/foundations/`, `styles/shell/`, `styles/components/` e
  `styles/pages/`: camadas de estilo atuais.
- `AppShell`: shell único para a área autenticada.
- `navigationGuard`: blocker singleton para fluxos com rascunho.
- `ui.tsx` e `components.tsx`: fachadas compatíveis ainda consumidas.
- `Operational.tsx`: mantém `InternsPage` e `OperationalList`.
- `MonthlyBenefitChart`: componente compartilhado entre os fluxos de
  benefícios.
- `main.tsx`: router manual preservado.

A cascade continua `style.css` → foundations → shell → components → page
styles. Nenhuma pasta, fachada ativa, rota ou import global foi reorganizado.

## Rotas e compatibilidade

O inventário real de `main.tsx` confirmou rotas para Pessoas, cadastro, perfil,
cadastros e detalhes, Dashboard, Pendências, Estagiários, Férias, Benefícios,
Lançamentos, Fechamento, Fazer pedido, Competências, Importações, Relatórios,
Auditoria, Configurações e fallback 404.

Foram preservados:

- `/app/beneficios/lote`, alias de Fazer pedido;
- `/app/estagiarios`, com redirect sem query e `InternsPage` no comportamento
  compatível restante;
- `/app/beneficios/lancamentos?novo=1`, ainda atendido por Lançamentos devido à
  ordem histórica de matching.

Reload, deep links, queries e fallback possuem cobertura dedicada em
`route-compatibility.spec.ts`.

## Componentes e consumidores

`TableToolbar` é exportado por `components/ui/data.tsx` e pela fachada
`ui.tsx`, mas não possui consumidor de página. Foi mantido como componente
oficial. `SummaryPanel` não existe e não foi criado.

`ui.tsx` permanece como fachada de exports. `components.tsx` mantém `Records`,
`RecordForm`, `Lookup`, `buildRecordPayload` e compatibilidade de `Notice`.
`Operational.tsx` permanece necessário. Não foi criada implementação paralela.

## DataTables

| Página/composição | Estratégia | Principais | Secundárias/desktop | Expansão e ações |
| --- | --- | --- | --- | --- |
| Records/Cadastros | priority | identificação/status/ação | campos do recurso | sem sorting artificial |
| Pessoas | expandable | pessoa/vínculo/situação/ação | organização e contexto | expansão isolada da ação |
| Férias | expandable | pessoa/vínculo/disponível/situação | saldo, comprometido, unidade, período | controles ARIA |
| Perfil | expandable | identificação e estado | detalhes do vínculo/documento | ação independente |
| Dashboard | scroll ou expandable | depende do KPI | detalhes financeiros/contextuais | estratégia semântica |
| Pendências | expandable | contexto/severidade/ação | código/origem/módulo/descrição | Revisar não expande |
| Relatórios | expandable ou scroll | por definição do relatório | dados pessoais/financeiros | sem sorting local |
| Auditoria | expandable; detalhe scroll | data/ação | usuário/entidade e valores | Ver alteração abre Dialog |
| Importações | priority, scroll e expandable | etapa e estado correspondente | preview/original/revisão | estados não fundidos |
| Lançamentos | expandable | pessoa/benefício/valor/situação | unidade/fornecedor/dias | menu independente |
| Fechamento | scroll | contexto financeiro | todas as colunas financeiras | scroll no container |
| Configurações | priority | benefício/situação/ação | fornecedor/unidade | edição preservada |
| Fazer pedido | expandable | incluir/pessoa/total/situação | fornecedor e editores | controles não expandem |
| Benefícios | scroll | comparação financeira | ciclo e fornecedores | container interno |

As colunas definem prioridades explicitamente. Não foi identificado sorting
visual sem suporte funcional, coluna essencial inacessível ou scroll horizontal
deliberado escapando do container.

## Formulários e proteção de navegação

Formulários em página, Dialog, Sheet e inline usam labels, obrigatoriedade,
erros associados, estados disabled/loading e bloqueio de submit concorrente.
Overlays usam focus trap, Escape, backdrop, scroll e restauração de foco.

Consumers reais de `navigationGuard`:

1. Cadastro de Pessoa;
2. Edição de Pessoa;
3. mapeamento de Importações;
4. Fazer pedido.

Todos registram o guard somente quando há alteração real e usam
`beforeunload`. Sucesso limpa dirty antes da navegação. A infraestrutura mantém
um único blocker ativo; não foi criado segundo sistema.

## Status e estados de interface

`StatusBadge` usa `STATUS_DEFINITIONS`, com mais de vinte estados explícitos e
fallback neutro coberto por teste. Estados de importação, item e decisão; ciclo,
pedido, item e lançamento; e fechamento administrativo permanecem dimensões
separadas.

As páginas migradas distinguem carregamento inicial, refreshing, vazio global,
vazio filtrado, erro inicial, erro de refresh e erro de mutação de acordo com o
contrato disponível. `RefreshingContent` preserva conteúdo quando solicitado e
mantém `inert` por padrão. Nenhuma indisponibilidade financeira ou de saldo é
representada como zero.

## Domínios consolidados

### Benefícios e dinheiro

O fluxo integrado continua Previsão → Fazer pedido → Pedido/Item → Lançamento →
Competências → Fechamento → N+1. Previsto/Solicitado/Concluído não foi fundido
com Pendente/Conferido/Pago/Cancelado nem com Aberta/Em revisão/Fechada.

Buscas por `Number`, `parseFloat`, `toFixed`, `reduce` e `Math.*` encontraram
usos legados de apresentação, paginação, geometria, datas e validação em
centavos. Não há matemática financeira nova da Fase 9. `Prisma.Decimal`, strings
decimais e `CurrencyInput` permanecem os contratos financeiros.

### Férias

`saldoContabil`, `diasComprometidos` e `saldoDisponivelParaProgramar` vêm do
backend. Timeline apresenta somente datas persistidas. Estados PROGRAMADO,
EM_GOZO, CONCLUIDO e CANCELADO permanecem distintos. A inconsistência de
Aprendiz/`DESCANSO_ESTAGIO` não foi alterada.

### Pessoas

Pessoas → Cadastro → Perfil → Edição preserva retorno, filtros, página, scroll,
foco, aba, competência e dirty state. Perfil compõe as Golden References sem
criar outra linguagem.

### Importações

Estado da importação, estado do item e decisão permanecem separados. O Stepper
representa o estágio persistido, sem simular transação frontend. Endpoints
históricos sem consumidor continuam preservados.

## CSS, tokens e performance

Não foi executada nova limpeza de CSS. `style.css` continua sustentando
compatibilidade, seguido pelas camadas oficiais. Não foi identificado vazamento
de página, foco invisível, overlay inutilizável ou overflow estrutural causado
pela migração.

Hardcodes existentes de paleta do gráfico e valores equivalentes de
apresentação foram classificados como refinamento ou compatibilidade, sem
substituição massiva. O warning de chunk superior a 500 kB permanece dívida B;
code splitting não pertence a esta fase.

## Acessibilidade e responsividade

As suítes cobrem headings, landmarks, labels, nomes acessíveis, tabs,
`aria-selected`, `aria-expanded`, `aria-controls`, `aria-pressed`, teclado,
foco, dialogs, sheets, Escape e restauração de foco. AppShell cobre navegação
aberta, recolhida, flyout e drawer mobile.

Viewports recorrentes: 1440×900, 1366×768, 1280×720 e 390×844. Testes das
principais jornadas verificam `scrollWidth <= clientWidth`; tabelas financeiras
mantêm scroll horizontal no próprio container.

## Testes, snapshots e determinismo

O repositório possui suítes unitárias/de integração e 17 especificações E2E,
incluindo Golden References, operações, rotas, autenticação, loading e
workflows. Existem 117 snapshots versionados, incluindo evidências históricas
`before-*`.

Não foi adicionada uma especificação transversal: a auditoria confirmou que a
cobertura existente já prova os contratos pretendidos, e um teste adicional
duplicaria jornadas estáveis.

O runner `scripts/run-test-gate.mjs` permanece fail-closed: lock exclusivo,
reset único antes da suíte, PostgreSQL local permitido, porta 55432, banco com
sufixo `_test` e sem seed. Timeouts e snapshots históricos não foram alterados.

## Classificação final

### A — bloqueadores

- Corrigido: `docs/product/design-system.md` descrevia foundations e migrações
  concluídas como trabalho futuro. O documento agora representa o estado atual.
- Restantes: nenhum.

### B — dívidas técnicas

- `TableToolbar` oficial sem consumidor.
- Fachadas `ui.tsx` e `components.tsx` e CSS global de compatibilidade.
- Warning de chunk superior a 500 kB.
- Conversões `Number`/parsing legadas e cálculos de apresentação existentes.
- Paginações e filtros locais mantidos por contrato.
- Fixtures individuais não possuem cleanup completo; o runner garante banco
  limpo por gate.

### C — Refinamento visual pós-Fase 9

- Revisar em rodada própria densidade, spacing, alinhamento, proporções,
  larguras e whitespace.
- Avaliar em conjunto sidebar, topbar, cards, tabelas, formulários, dialogs,
  mobile e microinterações sem reabrir a migração técnica.

### D — evoluções funcionais/domínio

- Decidir o matching de `/app/beneficios/lancamentos?novo=1`.
- Decidir a diferença entre `/app/estagiarios` e Pessoas e o alias
  `/app/beneficios/lote`.
- Rever criação técnica antes de `incluir` e chave de idempotência entre
  tentativas.
- Tratar filtros backend ignorados, Aprendiz/`DESCANSO_ESTAGIO`, seleção em
  massa e mudanças de regras financeiras somente em trabalho de produto.

## Gates

Os resultados finais são registrados após execução no worktree da Fase 9:

| Gate | Resultado |
| --- | --- |
| `pnpm lint` | PASS |
| `pnpm typecheck` | PASS |
| `pnpm test` | PASS — 27 arquivos, 129 testes |
| `pnpm build` | PASS — warning conhecido de chunk registrado como B |
| `pnpm format:check` | PASS |
| `pnpm test:e2e` | PASS — 37 testes, 1 histórico ignorado |
| `git diff --check` | PASS |

## Conclusão

Nenhum bloqueador técnico identificado para consolidação da Fase 9.

Nenhum commit foi criado pela Fase 9.
