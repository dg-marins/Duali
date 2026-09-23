# Baseline — Duali Design System Fase 0

## Estado inicial

- Branch: `main`.
- Commit base: `b46d414`.
- Worktree inicial: 20 arquivos rastreados modificados e quatro arquivos de
  implementação não rastreados, distribuídos em duas migrations e dois
  serviços/scripts.
- Diff rastreado inicial: aproximadamente 1.305 adições e 143 remoções.
- Origem das alterações: evolução funcional do ciclo e da previsão de
  benefícios, anterior ao Design System.

O conteúdo funcional não foi descartado, sobrescrito ou incluído em um commit
automático. O checkpoint local está em
`artifacts/design-system-phase-0/checkpoint/` e inclui status, diff, patch,
cópia dos arquivos não rastreados e manifesto SHA-256.

## Gates anteriores às foundations

| Gate                | Resultado | Observação                                     |
| ------------------- | --------- | ---------------------------------------------- |
| `pnpm lint`         | PASS      | Sem ocorrências                                |
| `pnpm typecheck`    | PASS      | Quatro projetos verificados                    |
| `pnpm test`         | PASS      | 18 arquivos e 83 testes                        |
| `pnpm build`        | PASS      | Aviso não bloqueante de bundle acima de 500 kB |
| `pnpm format:check` | PASS      | Todos os arquivos verificados                  |
| `pnpm test:e2e`     | PASS      | 16 cenários                                    |

## Baseline visual anterior

O teste `apps/api/e2e/design-system-foundations.spec.ts` mantém dados
idempotentes e snapshots Playwright rastreados com o prefixo `before-`.

| Página                   | Viewport |
| ------------------------ | -------- |
| Shell e Pessoas          | 1440×900 |
| Cadastro atual de Pessoa | 1366×768 |
| Benefícios               | 1280×720 |
| Férias                   | 1366×768 |
| Shell e Pessoas mobile   | 390×844  |

As futuras Golden References deverão usar outros nomes. Os snapshots `before-`
não devem ser atualizados automaticamente durante o redesign.

## Isolamento

O arquivo `apps/web/src/style.css` já estava modificado pelo trabalho funcional
e não será alterado pelas foundations. A integração do Design System acontece
por um import separado em `main.tsx` e por arquivos novos em
`apps/web/src/styles/foundations/`.

Nenhuma API, regra de negócio, migration, dependência ou rota pertence à Fase 0
ou à Fase 1.

## Validação posterior às foundations

| Gate                     | Resultado | Observação                                                    |
| ------------------------ | --------- | ------------------------------------------------------------- |
| `pnpm lint`              | PASS      | Sem ocorrências                                               |
| `pnpm typecheck`         | PASS      | Quatro projetos verificados                                   |
| `pnpm test`              | PASS      | 18 arquivos e 83 testes                                       |
| `pnpm build`             | PASS      | Aviso preexistente e não bloqueante de bundle acima de 500 kB |
| `pnpm format:check`      | PASS      | Todos os arquivos verificados                                 |
| baseline visual dedicado | PASS      | Cinco snapshots comparados sem atualização e sem diferenças   |
| `pnpm test:e2e`          | PASS      | 17 cenários                                                   |

Na primeira execução final da suíte E2E, o cenário de encerramento de
sessão em download excedeu seu tempo de espera. O mesmo cenário passou
isoladamente e a repetição integral passou com 17 de 17 cenários, sem mudança
de código.

Os cinco snapshots anteriores permaneceram idênticos após a importação das
foundations. A verificação estática encontrou zero variáveis CSS utilizadas sem
definição no CSS legado e nas foundations. Não foram adicionadas dependências,
migrations, rotas ou alterações em API e domínio.
