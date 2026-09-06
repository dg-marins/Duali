# Roadmap do MVP — Duali

O desenvolvimento deve avançar por etapas pequenas e verificáveis. Não implementar o MVP inteiro em uma única entrega.

## Sprint 0 — Fundação

Objetivo: deixar a base técnica pronta para desenvolvimento incremental.

Escopo:

- monorepo pnpm;
- frontend React/Vite;
- API Fastify;
- PostgreSQL;
- Prisma e migrations;
- validação Zod;
- testes base;
- CI;
- baseline de segurança;
- documentação operacional.

Documento detalhado: `docs/planning/sprint-0.md`.

## Sprint 1 — Autenticação e Pessoas

Objetivo: permitir acesso administrativo e primeiro fluxo vertical útil.

Escopo:

- criação segura do primeiro administrador;
- login/logout;
- sessão segura;
- cadastro de unidades;
- cadastro de equipes;
- cadastro e consulta de pessoas;
- criação e encerramento de vínculos;
- tipos CLT e ESTAGIO;
- dashboard inicial básico;
- auditoria inicial.

Critério de saída: administrador consegue entrar, cadastrar uma pessoa, criar vínculo e consultá-lo novamente.

## Sprint 2 — Estagiários

Objetivo: estruturar os controles hoje espalhados nas planilhas de estágio.

Escopo:

- dados acadêmicos;
- instituição de ensino;
- matrícula;
- bolsa;
- TCE;
- aditivos e renovações como histórico;
- distrato;
- seguro do estágio;
- movimentações de inclusão/exclusão;
- alertas de documentos próximos do vencimento.

Critério de saída: histórico de estágio é controlado sem colunas fixas de renovação.

## Sprint 3 — Férias e Descanso

Objetivo: substituir controles manuais e fórmulas frágeis.

### Estágio

- +15 dias a cada 6 meses completos de vínculo;
- aquisição automática;
- programação;
- gozo;
- ajustes justificados;
- saldo calculado;
- alerta para saldo negativo/inconsistência.

### CLT

- +30 dias a cada 12 meses completos;
- acompanhamento de aquisição e saldo;
- prazo/período concessivo;
- alerta de férias anteriores pendentes ao ocorrer nova aquisição;
- flexibilidade para exceções justificadas e auditadas.

Critério de saída: o saldo pode ser reconstruído a partir de direitos, períodos e ajustes.

## Sprint 4 — Benefícios

Objetivo: substituir as planilhas horizontais mensais por competência.

Escopo:

- tipos de benefício;
- fornecedores/meios configuráveis;
- configuração por unidade;
- vínculo do benefício à pessoa/vínculo;
- competências mensais;
- dias;
- valores unitários;
- valores informados/calculados;
- múltiplos componentes na mesma competência;
- ajustes e apontamentos.

Critério de saída: uma competência mensal pode ser calculada/registrada sem criar novas colunas no banco.

## Sprint 5 — Importação e Qualidade de Dados

Objetivo: trazer os dados históricos para o Duali com segurança.

Escopo:

- upload de planilha;
- staging;
- prévia;
- normalização automática segura;
- classificação de registros;
- detecção de possíveis duplicidades;
- revisão manual;
- confirmação da importação;
- rastreabilidade de arquivo/linha/dado original.

Classificações mínimas:

- válido;
- auto-normalizável;
- precisa revisão;
- possível duplicidade;
- rejeitado.

Critério de saída: nenhum dado ambíguo é incorporado silenciosamente.

## Sprint 6 — Relatórios e Exportações

Objetivo: entregar as visões operacionais necessárias para substituir as planilhas no dia a dia.

Escopo:

- filtros por unidade, vínculo, status e período;
- relatórios de pessoas;
- estagiários;
- férias/descanso;
- benefícios;
- inconsistências;
- exportação Excel/CSV;
- PDF apenas onde fizer sentido operacional;
- auditoria das exportações.

## Sprint 7 — Hardening e Homologação do MVP

Objetivo: preparar operação real.

Escopo:

- fluxos E2E críticos;
- revisão de segurança;
- revisão de logs e PII;
- testes de migrations;
- backup e restore;
- procedimento de deploy;
- rollback/recuperação;
- revisão de auditoria;
- saneamento de pendências bloqueantes;
- validação com dados importados em ambiente controlado.

## Ordem de execução

A ordem é a referência padrão. Uma sprint só deve ser antecipada quando houver motivo explícito e baixo risco de retrabalho.

O agente de programação não deve iniciar automaticamente uma sprint seguinte ao concluir a atual.
