# Segurança — Duali MVP

## Objetivo

Definir a baseline de segurança do MVP sem criar complexidade desnecessária.

## Autenticação

- Sessão segura com cookie HttpOnly.
- Cookie `Secure` em produção.
- `SameSite` apropriado ao fluxo da aplicação.
- Não armazenar token de autenticação em `localStorage`.
- Sessões devem poder ser invalidadas no servidor.

## Senhas

- Nunca armazenar senha em texto claro.
- Usar algoritmo de hash apropriado, preferencialmente Argon2id.
- Não criar senha padrão no código ou seed.
- Primeiro administrador criado por processo administrativo seguro.

## Autorização

No MVP existe apenas o perfil `ADMINISTRADOR`.

Mesmo assim, rotas protegidas devem verificar sessão/autenticação no servidor. A ausência de múltiplos perfis não elimina a necessidade de controle de acesso.

## Validação

Toda entrada externa deve ser validada no servidor.

Isso inclui dados vindos de:

- formulários;
- querystring;
- parâmetros de rota;
- uploads/importações;
- variáveis de ambiente.

## Rate limiting

Aplicar rate limit especialmente em endpoints sensíveis, como login e operações administrativas de autenticação.

## Dados pessoais

O Duali processa PII. Aplicar minimização de exposição:

- não registrar dados pessoais completos sem necessidade;
- evitar CPF, RG, endereço e contatos em logs comuns;
- restringir payloads ao necessário para cada tela/operação;
- exportações devem ser auditadas.

## Importação

- Tratar todo arquivo importado como entrada não confiável.
- Validar extensão, tamanho e conteúdo esperado.
- Nunca executar conteúdo vindo da planilha.
- Usar staging antes da persistência definitiva.
- Preservar valor original para rastreabilidade.
- Não corrigir ambiguidades silenciosamente.

## Exportação

Exportações de dados pessoais devem exigir sessão válida e gerar evento de auditoria.

## Banco de dados

- Usar usuário de banco com privilégios mínimos necessários.
- Credenciais somente por ambiente/secret store.
- Não expor PostgreSQL diretamente à internet em produção.
- Migrations devem ser versionadas.

## HTTP e infraestrutura

Produção deve operar via HTTPS atrás de Nginx ou equivalente.

Aplicar headers de segurança compatíveis com a aplicação.

Não expor stack traces ou mensagens internas ao usuário.

## Auditoria

Eventos relevantes devem incluir, quando aplicável:

- usuário;
- ação;
- entidade;
- identificador;
- timestamp;
- antes/depois para alterações sensíveis;
- IP quando tecnicamente apropriado.

Nunca registrar secrets na auditoria.

## Exclusão

O MVP não terá hard delete pela interface. Preservar histórico por inativação, cancelamento ou encerramento.

## Dependências

Dependências devem ser mantidas atualizáveis e não devem ser adicionadas sem necessidade clara.

Vulnerabilidades críticas conhecidas devem bloquear release até avaliação/correção.

## Fora do MVP inicial

Não são requisitos obrigatórios neste momento:

- 2FA;
- SSO;
- recuperação de senha por e-mail;
- IAM complexo;
- múltiplos perfis de autorização.

A arquitetura não deve impedir evolução futura.
