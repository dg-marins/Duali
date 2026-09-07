# Decisões de Produto — MVP

Este documento consolida decisões de produto aprovadas para o MVP do Duali e deve ser tratado como fonte de verdade complementar a `visao-produto.md` e `regras-negocio-v1.md`.

## DP-001 — Perfil de acesso

No MVP existe apenas um perfil funcional de acesso: `ADMINISTRADOR`.

O MVP não terá matriz complexa de RBAC. O administrador pode operar os módulos previstos no escopo, inclusive cadastros, vínculos, férias/descanso, benefícios, importação, exportação, auditoria e configurações básicas.

A estrutura deve permanecer evolutiva para permitir múltiplos perfis no futuro sem reescrever o domínio.

## DP-002 — Aprovações

O MVP não possui fluxo de aprovação entre usuários.

As ações do administrador têm efeito direto e devem ser registradas em auditoria quando relevantes.

## DP-003 — Férias CLT

Regra-base do MVP:

- a cada 12 meses completos de vínculo CLT, são adquiridos 30 dias de férias;
- o sistema acompanha aquisição, programação, gozo e saldo;
- o sistema deve identificar férias anteriores ainda pendentes quando uma nova aquisição ocorrer;
- o sistema deve alertar fortemente situações de risco de vencimento ou saldo pendente incompatível com a regra esperada;
- a regra deve ser flexível e não deve bloquear rigidamente toda exceção operacional;
- ajustes excepcionais exigem justificativa e auditoria.

O MVP não pretende substituir interpretação jurídica ou folha de pagamento. A finalidade é controle operacional confiável e rastreável.

## DP-004 — Benefícios e fornecedores/meios

Benefício e fornecedor/meio são conceitos distintos.

Tipos de benefício iniciais:

- TRANSPORTE
- ALIMENTACAO
- CESTA_BASICA
- PREMIACAO
- OUTRO

Fornecedores/meios são configuráveis, por exemplo:

- FLASH
- RIOCARD
- JAE
- SPTRANS
- TDMAX
- MOBILIDADE
- VR
- VA
- OUTRO

Um benefício pode possuir mais de um componente ou fornecedor/meio na mesma competência quando necessário.

A configuração de benefícios deve ser associada à unidade, e não diretamente ao estado. A unidade possui cidade e UF, mas unidades diferentes dentro da mesma UF podem ter regras distintas.

## DP-005 — Gestor e equipe

`Equipe` é um conceito estrutural do MVP e deve possuir cadastro próprio.

`Gestor` é informação secundária e altamente mutável. No MVP, não será tratado como entidade central do domínio.

Quando necessário, o gestor pode ser armazenado como informação opcional do vínculo ou em histórico simples. Não se deve inferir gestor a partir do nome da equipe.

## DP-006 — Duplicidade na importação

Heurística inicial:

- CPF igual: evidência forte de duplicidade;
- nome + data de nascimento: provável duplicidade;
- nome semelhante: requer revisão;
- e-mail e telefone: evidência auxiliar.

Registros ambíguos nunca devem ser fundidos automaticamente sem revisão.

## DP-007 — Exclusão

O MVP não terá hard delete pela interface.

Registros devem ser inativados, cancelados ou encerrados conforme o domínio.

Histórico e rastreabilidade devem ser preservados.

## DP-008 — Auditoria mínima

Devem ser auditadas, no mínimo:

- criação e alteração de pessoa;
- criação e alteração de vínculo;
- mudança de status;
- férias e descanso;
- ajustes manuais de saldo;
- benefícios e apontamentos;
- importações;
- exportações;
- criação ou alteração de usuário;
- alterações estruturais relevantes.

## DP-009 — Primeiro administrador

O primeiro administrador deve ser criado por comando administrativo/seed seguro.

Não deve existir usuário ou senha padrão versionado no código.

Exemplo de interface futura:

```bash
pnpm admin:create
```

O processo deve solicitar os dados necessários e armazenar apenas hash seguro da senha.

## DP-010 — Recuperação de senha

O MVP não precisa implementar fluxo de recuperação por e-mail.

Enquanto houver poucos usuários, a redefinição poderá ocorrer por procedimento administrativo seguro.

Tokens de recuperação, SMTP e telas de "esqueci minha senha" ficam fora do MVP inicial.

## DP-011 — Dashboard inicial

O dashboard do MVP deve priorizar informação operacional, sem gráficos complexos.

Indicadores iniciais:

- pessoas ativas;
- estagiários ativos;
- CLTs ativos;
- férias próximas do prazo;
- descansos de estágio próximos;
- TCE/documentos próximos do vencimento;
- pendências de benefícios;
- inconsistências identificadas;
- últimas alterações relevantes.

## DP-012 — Configuração por unidade

Regras operacionais que variam por localidade devem preferencialmente ser configuradas por `unidade`.

A unidade possui cidade e UF, mas a UF não deve ser usada como única chave de regra quando uma configuração por unidade for mais precisa.

## DP-013 — Perfil da Listagem Estagiários Geral

O arquivo operacional `Listagem Estagiários Geral` possui um perfil de importação próprio. Todas as abas são preservadas e os dados preenchidos são transformados em pessoa, vínculo, estágio, instituição, documento, seguro e movimentação quando houver informação suficiente. Fórmulas não são executadas; resultados já armazenados no arquivo podem ser usados, mantendo fórmula e resultado no staging. Ausência ou ambiguidade em dados obrigatórios permanece para revisão.

Registros válidos são publicados automaticamente e ficam disponíveis nos cadastros enquanto o lote permanece parcial. Registros inválidos e seus dependentes continuam no staging até correção ou rejeição explícita. Reprocessamentos devem ser idempotentes.

## Status

Estas decisões estão aprovadas para o MVP e podem ser utilizadas pelo desenvolvimento sem nova validação, salvo mudança explícita de produto.

## DP-014 — Experiência orientada à pessoa

A navegação operacional usa a pessoa como cadastro mestre e agrega seus vínculos, estágio, descanso, benefícios, documentos, seguros, alertas e histórico em um único perfil. As páginas globais de estágio, férias/descanso e benefícios são consultas especializadas com ações no contexto do domínio. Cadastros auxiliares permanecem separados e exibem seus relacionamentos.

O endereço estruturado é opcional. O endereço legado importado continua preservado em campo próprio e não será interpretado automaticamente.
