# Estratégia de Testes — Duali MVP

## Objetivo

Definir uma estratégia pragmática de testes para reduzir regressões sem tornar o MVP pesado.

## Pirâmide inicial

### Testes unitários

Usar para regras puras e cálculos, por exemplo:

- aquisição de 15 dias a cada 6 meses para estágio;
- aquisição de 30 dias a cada 12 meses para CLT;
- cálculo de saldo;
- classificação de inconsistência;
- heurística de duplicidade;
- cálculos de benefício quando aplicável.

### Testes de integração

Usar para fluxos que cruzam aplicação e banco:

- criação de pessoa e vínculo;
- autenticação;
- persistência de férias/descanso;
- importação e staging;
- auditoria;
- benefícios por competência.

### Testes E2E

Playwright deve cobrir os fluxos críticos quando as telas correspondentes existirem:

- login;
- cadastro de pessoa/vínculo;
- consulta e atualização;
- férias/descanso;
- importação com revisão e confirmação;
- exportação.

## Regressões obrigatórias

Toda correção de bug relevante deve incluir teste que reproduza o problema quando viável.

## Dados de teste

- Não usar dados pessoais reais.
- Fixtures devem ser sintéticas.
- Não versionar planilhas de produção com PII como fixture.

## Banco de teste

Testes de integração devem usar ambiente isolado e descartável sempre que possível.

Nunca executar testes destrutivos contra banco de produção.

## Gates

Antes de concluir uma task:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Quando houver fluxo E2E aplicável:

```bash
pnpm test:e2e
```

## Critério de cobertura

Não existe meta percentual rígida no MVP.

Priorizar cobertura de regras críticas e caminhos de maior risco em vez de perseguir número artificial.
