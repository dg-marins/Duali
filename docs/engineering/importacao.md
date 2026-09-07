# Importação assistida

Aceita XLSX e CSV UTF-8, até 10 MB, 20 abas, 5.000 linhas e 200 colunas por aba. Cabeçalhos precisam ser preenchidos e únicos. O ZIP do XLSX é verificado antes da leitura, com limite de descompressão de 40 MB.

Selecione aba e domínio. Mapeie cada campo para coluna, valor fixo ou registro de um grupo anterior. Para colunas mensais ou renovações numeradas, adicione um grupo por competência/evento. Grupos filhos podem referenciar a pessoa ou vínculo criado por um grupo anterior da mesma linha.

Normalização inequívoca preserva o original. Datas ambíguas e fórmulas exigem revisão explícita. CPF igual, nomes semelhantes e contatos auxiliam a detecção de duplicidade. Não existe fusão automática.

Depois da análise, registros válidos são publicados automaticamente em transação e aparecem nos cadastros. Itens inválidos permanecem pendentes; filhos válidos aguardam a dependência sem exigir uma segunda revisão. Cada correção tenta publicar os registros desbloqueados. O processamento é idempotente e revalida duplicidades e alterações concorrentes.

Na revisão, escolha criar, vincular sem alterar, atualizar com diferenças visíveis ou rejeitar e informe o motivo. O lote fica `PARCIAL` enquanto houver pendências e passa a `CONFIRMADA` quando todos os itens estiverem importados ou explicitamente rejeitados. Rejeitar um registro também rejeita filhos que não podem existir sem ele, preservando o staging.

O arquivo original e todas as linhas ficam no PostgreSQL. Fixtures são sintéticas. Compatibilidade operacional com as planilhas reais ainda exige homologação com amostras representativas.

Para conferir o perfil real sem exibir dados pessoais, execute `pnpm verify:intern-import -- <arquivo.xlsx> [lote-id]`. O comando compara as abas com o staging, valida a existência de todos os destinos publicados e informa contagens por domínio, pendências e dependências bloqueadas.
