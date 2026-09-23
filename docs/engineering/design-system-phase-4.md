# Design System — Fase 4

## Escopo entregue

A listagem de Pessoas tornou-se a primeira Golden Reference de página. A implementação permanece isolada em `features/people`, usa os componentes oficiais da Fase 3 e mantém o formulário atual de Pessoa sem antecipar o wizard da Fase 5.

## Arquitetura

- `PeoplePage.tsx`: consulta, URL, estados operacionais, segmentos, filtros, tabela, paginação e preservação de contexto.
- `usePeopleOptions.ts`: carregamento das opções existentes de unidade, equipe e instituição.
- `people.css`: somente composição e comportamento responsivo da página.
- `Operational.tsx`: reexporta a página e injeta o `PersonForm` atual.

`Todos` significa ausência de `tipo`. Os únicos segmentos enviados ao backend continuam `CLT`, `ESTAGIO`, `APRENDIZ`, `TRAINEE`, `SEM_VINCULO` e `INATIVO`. As contagens continuam independentes da seleção do segmento.

## URL e contexto

A página lê e preserva `q`, `status`, `tipo`, `segmento` (compatibilidade de leitura), `instituicaoId`, `unidadeId`, `equipeId` e `page`. Alterar filtro ou segmento retorna à página 1.

`/app/pessoas/nova` representa o formulário atual aberto. Fechar, cancelar ou salvar retorna à listagem com query, rolagem e foco preservados. A navegação para o perfil mantém a mesma estratégia de retorno.

## DataTable

A estratégia responsiva é `expandable`. Pessoa, vínculo e situação permanecem na linha compacta mobile; unidade, equipe e os dados específicos de Estágio ficam no detalhe. O controle possui nome acessível, `aria-expanded`, `aria-controls` e bloqueio de propagação. Nome, clique na linha, Enter e Espaço continuam abrindo o perfil.

No contexto de Estágio, a tabela acrescenta instituição, início e término. Instituições usam `Sigla - nome`, com truncamento visual e título completo. Nenhuma regra `nth-child` foi adicionada.

## Estados operacionais

Initial loading, refreshing, empty database, empty filter, initial error e refresh error possuem apresentações e testes separados. Refreshing e refresh error preservam os dados anteriores.

## Compatibilidade

O alias de classe `.golden-people` permanece para testes e integrações legadas. Os snapshots históricos do AppShell não foram atualizados; seu teste aceita a mudança intencional do conteúdo de Pessoas enquanto continua verificando diretamente todas as dimensões e interações do shell.

## Limite

O `PersonForm` e seus estilos permanecem legados e inalterados. A Fase 5 não foi iniciada.
