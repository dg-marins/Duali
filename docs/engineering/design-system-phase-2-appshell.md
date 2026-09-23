# Duali Design System — Fase 2 AppShell

## Arquitetura

O shell autenticado foi separado em `AppShell`, `Sidebar`, `SidebarGroup`,
`SidebarItem` e `Topbar`. Autenticação, roteamento manual, aliases e conteúdo
das páginas permanecem em seus fluxos anteriores.

Os estilos vivem em `apps/web/src/styles/shell/` e consomem os tokens da Fase
1. A sidebar usa 248px aberta e 72px recolhida. Em viewports de até 850px, ela
é substituída por um drawer Radix Dialog.

## Comportamento e acessibilidade

- A navegação ocupa a região rolável entre marca e conta fixa.
- O destino atual usa `aria-current="page"` e superfície off-white.
- Grupos expandidos usam `aria-expanded` e `aria-controls`.
- No modo recolhido, destinos usam tooltips e grupos usam flyouts Radix.
- Flyouts e drawer fecham por Escape e restauram foco.
- O drawer prende foco e torna o conteúdo de fundo indisponível.
- Os movimentos respeitam `prefers-reduced-motion`.

O estado dos grupos é preservado apenas enquanto o `AppShell` permanece
naturalmente montado. Nenhuma mudança foi feita no roteamento para prolongar
esse estado.

## Inspeção visual

Foram verificados nos snapshots novos:

- contraste da sidebar `#063d32` com o item ativo `#f3f8f6`;
- ativo compacto, sem sombra ou destaque excessivo;
- agrupadores com menor contraste e peso que destinos;
- alinhamento e stroke dos ícones Lucide;
- ritmo vertical e scroll interno em baixa altura;
- sidebar recolhida com 72px;
- flyout alinhado ao acionador, com borda e elevação discretas;
- conta e logout acessíveis no rodapé;
- topbar branca com 60px;
- drawer e backdrop em 390×844;
- ausência de overflow horizontal;
- foco visível em sidebar, ativo, flyout e drawer.

## Limites preservados

Não houve mudança de API, banco, domínio, cálculos, dependências ou arquitetura
de rotas. Componentes e conteúdo das páginas não foram migrados. Os snapshots
`before-*` permanecem como referência histórica e não foram atualizados.

A migração dos componentes fundamentais pertence à Fase 3 e não foi iniciada.
