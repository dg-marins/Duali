# Design System — baseline da Fase 5

## Estado inicial

- Branch: `main`.
- Commit-base: `cc27f15c8f6acb6ec2da934a4775509ef0f1a380`.
- Estado do worktree: limpo.
- Diff rastreado e arquivos não rastreados: nenhum.
- A Fase 4 estava consolidada no commit-base e foi usada integralmente como referência visual e funcional.

## Checkpoint local

O checkpoint não destrutivo está em `artifacts/design-system-phase-5/checkpoint/` e contém:

- commit-base;
- status inicial;
- estatística e patch binário do diff inicial;
- lista dos arquivos não rastreados;
- manifesto SHA-256.

O diretório `artifacts/` permanece ignorado pelo Git. Nenhum commit automático foi criado para iniciar esta fase.

## Limite do diff

As alterações posteriores a este registro pertencem à Fase 5. O trabalho fica restrito ao Cadastro de Pessoa, ao Stepper apresentacional, à proteção genérica e opt-in de navegação e aos testes/documentos diretamente relacionados. A Golden Reference de Pessoas da Fase 4 deve permanecer visualmente inalterada.

## Decisões preservadas

- `/app/pessoas/nova` passa a representar uma página dedicada dentro do AppShell.
- Não reintroduzir nome social nem endereço.
- Não persistir dados antes da confirmação final.
- Preservar o cadastro sem vínculo e os contratos atuais do backend.
- Manter `PersonForm` somente para edição; não redesenhar a edição nesta fase.
- Encerrar a execução ao concluir a Fase 5.
