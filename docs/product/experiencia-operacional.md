# Experiência operacional do Duali

## Objetivo

A interface principal é organizada pelos fluxos diários de RH. A pessoa é o ponto de entrada para consultar vínculos, estágio, férias ou descanso, benefícios, documentos e histórico, sem duplicar seu cadastro.

## Navegação

- `/app`: central operacional e primeiro uso.
- `/app/pessoas`: busca por nome, CPF, e-mail ou matrícula, com filtros combináveis.
- `/app/pessoas/:id`: perfil consolidado com vínculo atual e timelines.
- `/app/estagiarios`: acompanhamento especializado de estágio, documentos, seguro e saldo.
- `/app/ferias`: saldo reconstruído, alertas, programação e ajustes.
- `/app/beneficios`: resumo mensal com previsto, comprado líquido, reservas e lançamentos pendentes; gráfico compartilhado com o dashboard.
- `/app/beneficios/lancamentos`: consulta, edição, conferência e cancelamento dos lançamentos mensais, com contexto preservado no retorno ao resumo.
- `/app/importacoes`: fluxo de tipo, arquivo, análise e revisão.
- `/app/relatorios`: consulta filtrada e exportação auditada.
- `/app/cadastros/*`: cadastros auxiliares e seus relacionamentos.
- `/app/admin/*`: administradores e auditoria.

A listagem de pessoas mantém busca, filtros e página na URL. A busca por nome ignora acentos e diferenças entre maiúsculas e minúsculas, sem modificar o nome cadastrado. Ao voltar do perfil pelo breadcrumb, o estado anterior do navegador é restaurado. No desktop a barra lateral pode ser recolhida; em telas menores ela funciona como drawer.

## Vínculo atual e inconsistências

Cada pessoa pode ter somente um vínculo não encerrado (ATIVO ou AFASTADO). Para criar ou reativar outro, o RH deve encerrar o atual. A validação transacional e um índice único parcial protegem essa regra, inclusive contra concorrência.

Os segmentadores de Pessoas são exclusivos: CLT, Estágio, Aprendiz, Trainee, Sem vínculo e Inativas. Nenhum selecionado apresenta todas as pessoas; clicar novamente limpa a seleção. Sem vínculo inclui somente pessoas ativas que nunca tiveram vínculo. Pessoas inativadas ou com apenas vínculos históricos encerrados aparecem em Inativas, preservando o histórico. Afastados permanecem no tipo do vínculo atual. O distrato efetiva a inativação da pessoa na mesma transação do desligamento; sua reversão explícita reativa a pessoa.

As contagens usam a mesma busca e os mesmos filtros secundários, independentemente do segmento selecionado e antes da paginação. Sua soma corresponde ao total dessa população. Unidade, equipe e instituição referem-se exclusivamente ao vínculo atual. Vínculos encerrados permanecem no perfil/histórico, sem determinar KPIs ou dados operacionais atuais.

A rota antiga de Estagiários sem parâmetros abre Pessoas em Estágio. A consulta antiga parametrizada continua disponível para preservar filtros históricos e destinos já existentes.

## Dados pessoais

O endereço estruturado é opcional e possui CEP, logradouro, número, complemento, bairro, cidade e UF. O campo legado `endereco` continua preservado e é exibido separadamente quando preenchido; o sistema não tenta decompô-lo automaticamente.

## Importações

O fluxo mostra as etapas e os totais por estado e decisão. A publicação parcial continua automática: dados válidos aparecem nas telas operacionais e somente erros ou dependências permanecem no staging. O perfil dedicado da Listagem de Estagiários Geral continua sendo reconhecido automaticamente.


## Golden Reference

O shell possui topbar utilitária e sidebar recolhível com a marca atual. O redesign é restrito a Pessoas, Perfil e Cadastros > Benefícios; demais módulos preservam sua apresentação.

Cadastros > Benefícios permite Benefício → Fornecedor → uma ou mais Unidades. Cada associação mantém seu registro existente; a criação multiunidade é transacional e não duplica, sobrescreve ou reativa associações. Edição e inativação permanecem explícitas por associação. Competências, cálculos e compras não são alterados.

O cadastro em lote segue Unidade → Categoria → Fornecedor → Competência → Pessoas e valores → Revisão. Só oferece fornecedores ativos associados à unidade e categoria; em transporte, cada condução pode usar outro fornecedor configurado. Correspondências ambíguas de adesão exigem revisão antes do envio. Os formulários genéricos de criação de competência e de ajuste deixam de ser ações da interface. Ajustes de benefícios são registrados no lançamento da pessoa dentro de Fechamento de competência, com distribuição por condução quando se tratar de transporte. O atalho de ajuste de férias também deixa de ser exibido, sem alteração dos históricos ou APIs.
