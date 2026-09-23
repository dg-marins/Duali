# Design System — Fase 3

## Matriz de consolidação

| Componente  | Antes                                   | Depois                        | Estado legado                          | Consumidores migrados             |
| ----------- | --------------------------------------- | ----------------------------- | -------------------------------------- | --------------------------------- |
| Button      | Implementação CVA isolada               | Componente oficial por tokens | Variantes antigas aceitas              | Importadores do caminho histórico |
| IconButton  | Classes locais                          | API oficial exclusiva         | Classes antigas permanecem nas páginas | Novos overlays oficiais           |
| Campos      | Inputs HTML e CurrencyInput em `ui.tsx` | Controles opt-in oficiais     | Inputs de página preservados           | CurrencyInput via fachada         |
| StatusBadge | Classificação por regex                 | Registro explícito            | Nenhuma segunda implementação          | Todos via fachada                 |
| Feedback    | Implementações em dois arquivos         | Implementação oficial única   | Exports antigos reexportam             | Consumidores compartilhados       |
| DataTable   | Contrato mobile implícito               | Três estratégias explícitas   | Adaptador `mobile`                     | Consumidores via fachada          |
| Overlays    | Overlay interno em `ui.tsx`             | Dialog e Sheet oficiais       | FormDialog/FormSheet aliases           | Consumidores via fachada          |

## DataTable

O contrato oficial oferece prioridades `primary`, `secondary`, `desktop` e `always`; estratégias `priority`, `expandable` e `scroll`; sorting controlado; loading; refreshing; empty state; ação de linha e coluna de ações. O contrato legado `mobile` continua aceito. Consumidores existentes sem estratégia usam o adaptador expansível atual. CSS legado baseado em `nth-child` permanece apenas para páginas ainda não migradas.

## StatusBadge

O registro frontend cobre os estados auditados de vínculo, documentos, seguro, férias, benefícios, aquisição, fechamento e importação. Os tons são success, warning, danger, info, review e neutral. Estado desconhecido é normalizado para texto legível e recebe neutral.

## CurrencyInput

Os testes cobrem vazio, zero, digitação progressiva, colagem com `R$`, separadores brasileiros, decimal normalizado, formatação BRL e valor entregue ao consumidor. A API financeira continua entregando uma string decimal.
