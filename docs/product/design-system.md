# Duali Design System — Modern SaaS

## Princípios

O Design System do Duali prioriza clareza, velocidade, previsibilidade, baixa
carga cognitiva e redução de erros. A interface deve parecer um produto SaaS
B2B coeso sem transformar todas as informações em cards, dialogs ou wizards.

As foundations são introduzidas antes da migração dos componentes. A presença
de um token não autoriza a alteração visual de uma página nem a mudança de uma
regra de negócio.

## Cores

- Navegação: `--color-sidebar` e `--color-sidebar-hover`.
- Item ativo: `--color-sidebar-active` e
  `--color-sidebar-active-text`.
- Ação primária: `--color-primary`, seus estados e
  `--color-on-primary`.
- Estrutura: `--color-background`, `--color-surface`,
  `--color-surface-subtle`, `--color-border` e
  `--color-border-strong`.
- Texto: `--color-text-primary`, `--color-text-secondary` e
  `--color-text-muted`.

O verde identifica a marca, a navegação, ações primárias e estados positivos.
Ele não deve ser aplicado indiscriminadamente.

## Semântica

Cada família possui cor principal, texto, superfície suave e borda:

- `success`: ativo, pago, concluído e programado;
- `warning`: pendente, a programar, afastado e atenção;
- `danger`: erro, cancelado, inconsistência e crítico;
- `info`: previsto, informação e conferido;
- `review`: revisão humana ou categoria especial;
- `neutral`: estados sem semântica específica.

A migração do `StatusBadge` acontecerá na fase de componentes. Nesta fase os
tokens apenas tornam essa migração possível.

## Espaçamento e dimensões

A escala oficial é de 4, 8, 12, 16, 20, 24, 32, 40 e 48 pixels, exposta por
`--space-1` a `--space-9`.

Referências de dimensão:

- controle: 40px;
- linha confortável de tabela: 44–48px;
- sidebar aberta: 248px;
- sidebar recolhida: 72px;
- topbar: 60px.

Essas referências ainda não são aplicadas ao shell ou às páginas legadas.

## Tipografia

O Duali utiliza uma stack local e de sistema, sem fonte externa. As classes
opt-in são:

- `.ds-page-title`: 26/32, semibold;
- `.ds-section-title`: 18/24, semibold;
- `.ds-body`: 14/21;
- `.ds-secondary`: 13/18;
- `.ds-auxiliary`: 12/16;
- `.ds-kpi`: 28/34, bold.

## Radius, sombras, movimento e foco

- Radius oficial: `--duali-radius-sm`, `--duali-radius-md` e
  `--duali-radius-lg`, com 6, 8 e 12px.
- Elevação: `--duali-shadow-sm` para popovers e dropdowns e
  `--duali-shadow-md` para overlays.
- Movimento: 120, 180 e 240ms, com preferência por transições discretas.
- `prefers-reduced-motion` desativa movimentos opt-in não essenciais.
- O foco visível usa um anel global compatível com superfícies claras e a
  classe `.ds-focus-on-dark` oferece a variante para fundos escuros.

## Layers

A escala oficial é `base`, `sticky`, `dropdown`, `overlay`, `modal`, `toast` e
`tooltip`. Os `z-index` legados serão migrados somente quando seus componentes
forem trabalhados.

## Compatibilidade e legado

`style.css` continua sendo a folha legada e permanece como primeiro import. As
foundations são carregadas depois dela, mas suas classes são opt-in e seus
tokens oficiais ainda não substituem os nomes existentes.

Os aliases abaixo são temporários e depreciados:

- `--brand-soft`;
- `--muted-foreground`;
- `--primary-soft`;
- `--radius`;
- `--surface-muted`;
- `--text`.

Eles existem apenas para resolver consumidores legados que usavam variáveis
sem definição. Código novo deve usar os tokens oficiais. Cada alias será
removido quando seu último consumidor for migrado.

## Decisão sobre o cadastro de Pessoa

O cadastro principal de Pessoa não deve reintroduzir endereço apenas porque
esse campo apareceu em mockups exploratórios. Quando o wizard for implementado,
seus campos serão definidos pelas decisões funcionais aprovadas naquele momento
e pelo domínio real do Duali.

## Componentes fundamentais

Os componentes oficiais ficam em `apps/web/src/components/ui`. O arquivo
`ui.tsx` é uma fachada temporária de compatibilidade, sem implementação
paralela. Os estilos oficiais usam o prefixo `.ds-` em `styles/components/`.

- `Button` possui `primary`, `secondary`, `danger` e `ghost`; `IconButton` é a única API oficial para ações somente com ícone.
- Campos oficiais são opt-in e o `CurrencyInput` preserva seu contrato de string decimal e entrada brasileira.
- `StatusBadge` usa registro explícito no frontend, sem dependência de Prisma.
- `DataTable` permite `priority`, `expandable` ou `scroll`, escolhidos pelo consumidor, e prioridades declarativas por coluna.
- `Dialog`, `ConfirmDialog` e `Sheet` usam Radix Dialog.

## Política de exports

- **official:** exports de `components/ui`;
- **compatible:** fachada `ui.tsx` e caminho histórico de `Button`;
- **deprecated:** variantes antigas de Button, `FormDialog`, `FormSheet`, propriedade `mobile` do DataTable e export de `Notice` por `components.tsx`.

A migração é opt-in. Páginas, inputs e regras `nth-child` legadas permanecem até a respectiva Golden Reference. Nenhuma página deve ser redesenhada apenas para adotar a biblioteca.
