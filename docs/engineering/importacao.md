# Importação assistida

Aceita XLSX e CSV UTF-8, até 10 MB, 20 abas, 5.000 linhas e 200 colunas por aba. Cabeçalhos precisam ser preenchidos e únicos. O ZIP do XLSX é verificado antes da leitura, com limite de descompressão de 40 MB.

Selecione aba e domínio. Mapeie cada campo para coluna, valor fixo ou registro de um grupo anterior. Para colunas mensais ou renovações numeradas, adicione um grupo por competência/evento. Grupos filhos podem referenciar a pessoa ou vínculo criado por um grupo anterior da mesma linha.

Normalização inequívoca preserva o original. Datas ambíguas e fórmulas exigem revisão explícita. CPF igual, nomes semelhantes e contatos auxiliam a detecção de duplicidade. Não existe fusão automática.

Na revisão, escolha criar, vincular sem alterar, atualizar com diferenças visíveis ou rejeitar. Informe motivo. A confirmação revalida duplicidades e alterações concorrentes e grava em transação. Uma importação confirmada não pode ser confirmada novamente.

O arquivo original e todas as linhas ficam no PostgreSQL. Fixtures são sintéticas. Compatibilidade operacional com as planilhas reais ainda exige homologação com amostras representativas.
