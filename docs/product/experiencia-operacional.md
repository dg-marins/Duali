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
- `/app/beneficios/aquisicao`: Fazer pedido. Seleciona competência, unidade e benefício, carrega elegíveis e emite todos os pedidos por fornecedor na mesma transação.
- `/app/beneficios/competencias`: acompanhamento dos pedidos, confirmações parciais, rejeições, cancelamentos, reversões e fechamento por unidade e mês.
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

Fazer pedido é o único ponto de entrada operacional de benefícios. A seleção segue Competência → Unidade → Categoria → Pessoas e valores e não exige adesão previamente cadastrada. No primeiro mês, os vínculos ativos são selecionados; nos meses seguintes, participantes, fornecedores e valores do mês anterior são sugeridos. Vínculos afastados exigem inclusão manual com motivo, enquanto pessoas inativas e desligadas não são elegíveis.

Ao gerar, o sistema cria na mesma transação o registro técnico interno, a competência, seus snapshots e os pedidos agrupados por fornecedor. Transporte mantém a distribuição explícita por condução e fornecedor, alimentação aceita cálculo diário ou total mensal e as demais categorias usam quantidade × valor unitário. O perfil apresenta somente competências e histórico mensal; a configuração de fornecedores continua em Cadastros > Benefícios.

## Benefícios: pedido e competências

Em Alimentação, cada linha do pedido usa uma base exclusiva: **Dias trabalhados**, que calcula dias × valor diário, ou **Valor mensal**, que registra o total contratado. A troca de base não mistura os cálculos.

Em Fazer pedido, a equipe não é exibida como filtro ou coluna. Ao adicionar transporte, o RH escolhe condução (incluindo **Outros**), fornecedor e valor diário; os três campos começam sem preenchimento e são obrigatórios para emitir o pedido.

Competências inicia com cards por unidade. Cada categoria resume lançamentos, previsto, comprado e valores em pedido; o detalhe da categoria abre em modal com os pedidos e as ações de confirmação, cancelamento e reversão.

O cancelamento de um pedido pendente preserva o pedido e os valores originais no histórico. Quando só existem pedidos cancelados, o lançamento criado pelo pedido direto sai dos valores operacionais do mês e pode ser reutilizado em uma nova emissão. Pedidos com compra registrada exigem os fluxos próprios de saldo e reversão.
