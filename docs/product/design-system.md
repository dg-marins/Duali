# Duali Design System — Modern SaaS

## Estado atual

O Design System do Duali está propagado pelo produto. Foundations, AppShell,
componentes oficiais, Golden References e páginas operacionais foram concluídos
nas Fases 1–8. Este documento descreve o estado atual; os documentos em
`docs/engineering/` preservam o histórico e as decisões de cada fase.

O sistema prioriza clareza, velocidade, previsibilidade, baixa carga cognitiva
e redução de erros. Componentes visuais padronizam apresentação sem substituir
regras de domínio, contratos de API ou cálculos do backend.

## Foundations

As foundations ficam em `apps/web/src/styles/foundations/` e definem cores,
tipografia, espaçamento, dimensões, radius, sombras, movimento, foco e camadas.

- Espaçamento: 4, 8, 12, 16, 20, 24, 32, 40 e 48 pixels (`--space-1` a
  `--space-9`).
- Sidebar: 248px aberta e 72px recolhida.
- Controle: 40px; linha confortável de tabela: 44–48px.
- Radius: `--duali-radius-sm`, `--duali-radius-md` e `--duali-radius-lg`.
- Elevação: `--duali-shadow-sm` e `--duali-shadow-md`.
- Movimento: 120, 180 e 240ms, respeitando `prefers-reduced-motion`.
- Foco: anel global visível e variante `.ds-focus-on-dark`.
- Layers: base, sticky, dropdown, overlay, modal, toast e tooltip.

A tipografia usa uma stack local e de sistema. As classes oficiais incluem
`.ds-page-title`, `.ds-section-title`, `.ds-body`, `.ds-secondary`,
`.ds-auxiliary` e `.ds-kpi`.

## Cores e semântica

Os tokens distinguem navegação, ação, estrutura e texto. Estados usam famílias
semânticas explícitas:

- `success`: ativo, pago, concluído e programado;
- `warning`: pendente, a programar, afastado e atenção;
- `danger`: erro, cancelado, inconsistência e crítico;
- `info`: previsto, informação e conferido;
- `review`: revisão humana ou categoria especial;
- `neutral`: estado sem definição específica.

`StatusBadge` consulta `STATUS_DEFINITIONS` e usa fallback neutro para valores
desconhecidos. Cor nunca substitui o texto do estado.

## AppShell

O AppShell oficial implementa navegação desktop aberta e recolhida, drawer
mobile, grupos persistentes durante a sessão, item ativo, tooltips, conta,
logout, foco e movimento reduzido. O router permanece manual sobre o histórico
do navegador; o Design System não introduziu uma nova arquitetura de rotas.

## Componentes oficiais

Os componentes ficam em `apps/web/src/components/ui/` e seus estilos em
`apps/web/src/styles/components/`.

- Ações: `Button`, `IconButton` e `ActionMenu`.
- Formulários: `FormField`, `Input`, `SearchInput`, `Select`, `DateInput`,
  `Textarea`, `Checkbox` e `CurrencyInput`.
- Dados: `DataTable`, `Pagination`, `FilterBar`, `FilterChip` e `TableToolbar`.
- Feedback: `StatusBadge`, `Notice`, `EmptyState`, `LoadingSkeleton`,
  `RefreshingContent`, toast e métricas.
- Overlays: `Dialog`, `ConfirmDialog` e `Sheet`, baseados em Radix Dialog.
- Fluxos e tempo: `Stepper` e `Timeline`, ambos apresentacionais.

`DataTable` oferece as estratégias `priority`, `expandable` e `scroll`, com
prioridades declaradas pelo consumidor. Sorting só aparece quando há suporte
funcional. `TableToolbar` é oficial, mas atualmente não possui consumidor; não
é aplicado artificialmente. Não existe um componente `SummaryPanel`.

## Golden References

As quatro Golden References concluídas definem a linguagem oficial:

1. Pessoas: PageHeader, busca, filtros, tabela, paginação, estados e
   responsividade.
2. Cadastro de Pessoa: página dedicada, Stepper apresentacional, revisão e
   proteção de alterações não salvas.
3. Benefícios e Competências: conceitos financeiros separados, gráficos,
   detalhe e operações preservadas.
4. Férias e Descansos: saldo contábil, dias comprometidos, disponível para
   programar, histórico e programação.

O cadastro principal não reintroduz nome social ou endereço. Férias mantém o
saldo calculado pelo backend e não inventa datas de transição. A decisão de
domínio sobre Aprendiz e `DESCANSO_ESTAGIO` continua pendente.

## Propagação das páginas

A linguagem das Golden References foi aplicada a:

- cadastros de Unidades, Equipes, Instituições e Fornecedores, seus detalhes e
  Usuários;
- Perfil e edição de Pessoa;
- Dashboard e Pendências;
- Relatórios e Auditoria;
- Importações;
- Lançamentos, Fechamento e Configurações de Benefícios;
- Fazer pedido.

Cada fluxo preserva seus endpoints, payloads, permissões, cálculos e estados de
domínio. Operações financeiras continuam backend-authoritative, com
`Prisma.Decimal` no backend e strings decimais nos contratos de frontend.

## Arquitetura e compatibilidade

Features vivem em `apps/web/src/features/`; estilos de página ficam em
`apps/web/src/styles/pages/`. Permanecem ativos:

- `ui.tsx`, como fachada de compatibilidade para exports oficiais;
- `components.tsx`, com `Records`, `RecordForm`, `Lookup` e contratos legados
  ainda consumidos;
- `Operational.tsx`, que mantém `InternsPage` e `OperationalList`;
- `MonthlyBenefitChart`;
- `navigationGuard`, compartilhado por Cadastro de Pessoa, Edição de Pessoa,
  Importações e Fazer pedido.

Não há implementações paralelas de `RecordForm`, `Lookup` ou dirty state.

## Cascade e CSS

A ordem de carregamento é preservada:

1. `style.css` de compatibilidade;
2. foundations;
3. shell;
4. componentes;
5. estilos de página.

Código novo usa tokens e classes oficiais. CSS global e seletores legados
continuam somente onde existem consumidores reais. Os aliases de tokens
legados permanecem para compatibilidade e não devem ser usados por código novo.

## Rotas compatíveis

Três comportamentos históricos permanecem deliberadamente sem alteração:

- `/app/beneficios/lote` continua alias de Fazer pedido;
- `/app/estagiarios` mantém seu comportamento próprio e não foi unificada com
  Pessoas;
- `/app/beneficios/lancamentos?novo=1` mantém o matching histórico e segue como
  decisão funcional pendente.

Esses contratos são cobertos por regressão. Sua manutenção não implica que
sejam o destino recomendado para novos links.

## Acessibilidade e estados

Os componentes oficiais preservam labels, mensagens de erro, nomes acessíveis,
foco visível, teclado, focus trap, Escape e restauração de foco. Tabs,
expansões e ações expõem os atributos ARIA correspondentes.

As páginas diferenciam, quando suportado pelo contrato existente, carregamento
inicial, atualização com conteúdo anterior, vazio global, vazio filtrado, erro
inicial, erro de atualização e erro de mutação. Erro financeiro ou de saldo não
é apresentado como zero.

## Situação após as Fases 1–8

A migração técnica está concluída. Permanecem dívidas de compatibilidade e
decisões funcionais documentadas, sem bloquear o uso do Design System. Ajustes
de densidade, espaçamento, proporção, alinhamento, shell, cards, tabelas,
formulários, dialogs, mobile e microinterações pertencem à rodada de
refinamento visual pós-Fase 9.
