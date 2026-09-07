# UX/UI oficial do MVP

O Duali usa React, Tailwind e primitivos compatíveis com shadcn/ui. A linguagem visual é sóbria, operacional e não depende apenas de cor para comunicar estados.

O app shell possui sidebar recolhível, header, conteúdo e drawer móvel. O menu principal contém Visão Geral, Pendências, Pessoas, Estagiários, Férias e Descanso, Benefícios, Importações e Relatórios. Cadastros reúne unidades, equipes, instituições, fornecedores e configurações; Administração reúne usuários e auditoria.

As rotas usam React Router. O perfil `/app/pessoas/:id` reúne Visão Geral, Vínculo, Férias/Descanso, Benefícios, Documentos e Histórico. Aprendiz aparece como vínculo próprio, sem conceitos exclusivos de estágio.

Páginas devem apresentar carregamento, vazio, erro e conteúdo, com foco visível, labels e operação por teclado.
