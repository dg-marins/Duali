# Visão do Produto — Duali

## 1. Propósito

O Duali é um sistema web de gestão de pessoas criado para substituir controles operacionais atualmente distribuídos em planilhas. O produto deve centralizar informações, reduzir retrabalho, tornar regras de negócio explícitas e oferecer histórico e rastreabilidade.

## 2. Problema atual

Os controles analisados estão distribuídos em planilhas de férias, estagiários e benefícios, com diferenças de estrutura entre RJ, SP e DF. Há repetição de pessoas e campos, colunas fixas para eventos recorrentes, fórmulas com resultados inconsistentes, observações livres representando eventos de negócio e separação física entre ativos/desligados.

## 3. Objetivos da V1

- Cadastro central de pessoas.
- Gestão de vínculos CLT e estágio.
- Organização por unidade e equipe.
- Gestão das informações específicas de estágio.
- Controle de TCE, renovações, aditivos e seguro.
- Controle de férias/descanso e respectivos saldos.
- Gestão mensal de benefícios.
- Importação assistida das planilhas existentes.
- Exportação de informações para Excel/CSV e, quando aplicável, PDF.
- Usuários individuais, perfis de acesso e auditoria.
- Aplicação web responsiva e multiusuário.

## 4. Princípios

1. Planilhas são fontes de importação/exportação, não o banco de dados do produto.
2. Pessoa e vínculo são conceitos distintos.
3. CLT e estagiário compartilham o cadastro mestre de pessoa.
4. Eventos recorrentes são registros históricos, não colunas numeradas.
5. Valores calculáveis devem ser derivados sempre que possível.
6. Dados ambíguos importados não devem ser corrigidos silenciosamente.
7. Alterações relevantes precisam ser rastreáveis.
8. Histórico operacional não deve depender de abas ou arquivos arquivados.

## 5. Escopo inicial

### Pessoas e vínculos
Cadastro pessoal, documentos, contatos, admissão, desligamento, status, unidade, equipe e tipo de vínculo.

### Estágio
Instituição de ensino, matrícula acadêmica, período, bolsa, TCE, renovações/aditivos, distrato e seguro.

### Férias e descanso
Aquisição de direito, programação, períodos usufruídos, ajustes, saldo e alertas de inconsistência.

### Benefícios
Benefícios por vínculo e competência, quantidade de dias, valores unitários, valores informados/calculados, meios/fornecedores e apontamentos.

### Importação e exportação
Prévia, validação, identificação de possíveis duplicidades, revisão manual e confirmação antes da persistência definitiva.

### Segurança e auditoria
Login individual, autorização por perfil, registro das alterações relevantes e proteção adequada de dados pessoais.

## 6. Fora do escopo neste momento

Funcionalidades não evidenciadas pelas planilhas ou pelo fluxo atual do RH não entram automaticamente na V1. Novos módulos serão avaliados conforme o discovery avance.

## 7. Evolução

O modelo deve permitir evoluir regras, equipes, unidades, tipos de vínculo e benefícios sem depender da estrutura original das planilhas.
