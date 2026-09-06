# Definition of Done — Duali

Uma task só pode ser considerada concluída quando os itens aplicáveis abaixo forem atendidos.

## Implementação

- O escopo da task foi implementado integralmente.
- Não foram introduzidas funcionalidades fora do escopo sem necessidade.
- Regras de negócio seguem a documentação vigente.
- Não existem secrets ou credenciais versionadas.

## Qualidade

Executar, quando aplicável:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Fluxos críticos com cobertura E2E disponível devem executar também:

```bash
pnpm test:e2e
```

## Banco de dados

Quando houver alteração de schema:

- migration criada e versionada;
- migration testada em ambiente não produtivo;
- schema e código permanecem compatíveis;
- não houve alteração destrutiva não documentada.

## Segurança

- Entrada externa validada.
- Autenticação/autorização verificadas no servidor quando aplicável.
- Dados pessoais não são expostos desnecessariamente.
- Logs e erros não vazam secrets ou detalhes internos.

## Testes

- Regra nova relevante possui teste apropriado.
- Bug corrigido possui teste de regressão quando viável.
- Fixtures não contêm PII real.

## Documentação

Atualizar documentação quando a task alterar:

- regra de negócio;
- contrato da API;
- modelo de dados;
- arquitetura;
- configuração;
- procedimento operacional.

## Encerramento da task

O agente/desenvolvedor deve informar:

- o que foi alterado;
- testes/gates executados;
- migrations criadas, se houver;
- pendências conhecidas;
- qualquer decisão necessária que permaneça aberta.

Não marcar uma task como concluída apenas porque o código foi escrito.
