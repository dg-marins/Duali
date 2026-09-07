# Experiência operacional do Duali

## Objetivo

A interface principal é organizada pelos fluxos diários de RH. A pessoa é o ponto de entrada para consultar vínculos, estágio, férias ou descanso, benefícios, documentos e histórico, sem duplicar seu cadastro.

## Navegação

- `/app`: central operacional e primeiro uso.
- `/app/pessoas`: busca por nome, CPF, e-mail ou matrícula, com filtros combináveis.
- `/app/pessoas/:id`: perfil consolidado com vínculo atual e timelines.
- `/app/estagiarios`: acompanhamento especializado de estágio, documentos, seguro e saldo.
- `/app/ferias`: saldo reconstruído, alertas, programação e ajustes.
- `/app/beneficios`: competências, valores, divergências, adesões e ajustes.
- `/app/importacoes`: fluxo de tipo, arquivo, análise e revisão.
- `/app/relatorios`: consulta filtrada e exportação auditada.
- `/app/cadastros/*`: cadastros auxiliares e seus relacionamentos.
- `/app/admin/*`: administradores e auditoria.

A listagem de pessoas mantém busca, filtros e página na URL. Ao voltar do perfil pelo breadcrumb, o estado anterior do navegador é restaurado. No desktop a barra lateral pode ser recolhida; em telas menores ela funciona como drawer.

## Vínculo atual e inconsistências

O vínculo atual é o vínculo ativo com admissão mais recente. Na ausência de vínculo ativo, é apresentado o vínculo mais recente. Mais de um vínculo ativo da mesma pessoa gera um alerta no perfil e na listagem.

## Dados pessoais

O endereço estruturado é opcional e possui CEP, logradouro, número, complemento, bairro, cidade e UF. O campo legado `endereco` continua preservado e é exibido separadamente quando preenchido; o sistema não tenta decompô-lo automaticamente.

## Importações

O fluxo mostra as etapas e os totais por estado e decisão. A publicação parcial continua automática: dados válidos aparecem nas telas operacionais e somente erros ou dependências permanecem no staging. O perfil dedicado da Listagem de Estagiários Geral continua sendo reconhecido automaticamente.
