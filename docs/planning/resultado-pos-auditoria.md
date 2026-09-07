# Resultado pós-auditoria — 2026-09-07

## Estado preservado

As migrations aditivas foram aplicadas sem republicar o lote real. A conferência direta no PostgreSQL após a implementação registrou:

| Situação do staging | Quantidade |
| --- | ---: |
| Importado | 1.369 |
| Em revisão | 84 |
| Duplicidade | 1 |
| Aguardando dependência | 45 |

Os destinos existentes também foram preservados: 273 pessoas, 246 vínculos, 235 estágios, 44 instituições, 314 documentos, 195 seguros e 59 movimentações de seguro.

## Entregas

- `APRENDIZ` passou a ser um tipo de vínculo válido em cadastros, filtros, perfil, dashboard e relatórios. Ele não recebe direitos automáticos de estágio.
- Escala pertence ao vínculo e horário permanece no estágio.
- Instituições podem receber regras informativas por unidade, periodicidade e duração máxima.
- Benefícios possuem fechamento por unidade e competência nos estados aberta, em revisão e fechada. Lançamentos de uma competência fechada ficam bloqueados; a reabertura exige motivo e gera auditoria.
- O cálculo de benefício expõe base calculada, total de ajustes, valor final e divergência contra o valor informado, mantendo `Decimal` no backend.
- A cesta básica histórica possui períodos próprios e não é convertida artificialmente em meses.
- A Central de Pendências agrega staging e alertas operacionais calculados, com resumo, paginação e filtros.
- A auditoria recebe `requestId`; logs continuam sem registrar conteúdo pessoal desnecessário.
- A navegação usa React Router, inclui Pendências e Fechamento de Benefícios, mantém filtros de revisão na URL e recebeu a base de componentes compatíveis com shadcn/ui.
- A revisão de importação mostra dados normalizados, existentes, inconsistências e dependências, mantendo a publicação parcial idempotente.

## Profiles de importação

O registro de profiles reconhece `listagem-estagiarios-geral`, `ferias-funcionarios`, `descanso-estagiarios` e `beneficios-2026`. Arquivo, aba, linha, dados originais, normalizações, inconsistências e decisões permanecem no staging. Fórmulas são preservadas como evidência e nunca executadas.

Os profiles de férias e benefícios usam publicação conservadora. Correspondência somente por nome exige revisão. No profile de benefícios, uma pessoa ausente nunca é criada somente a partir do nome; os filhos aguardam a identificação ou decisão do administrador.

Verificação estrutural dos arquivos externos, sem versionar PII:

- `Planilha de Férias Funcionários.xlsx`: reconhecida; DF 15 linhas, Cesta Básica DF 14, RJ 26, SP 4, Arquivadas 14 e A descontar 14.
- `Benefícios - 2026.xlsx`: reconhecida; RJ Estagiários 761, DF Estagiários 431, SP Estagiários 358, SP CLT 69, RJ CLT 478 e DF CLT 276.
- `Férias_Planilha Definitiva RJ (1).xlsx`: o conteúdo é XLS/OLE protegido por senha. O importador responde 422 com orientação para salvar uma cópia XLSX sem senha. A validação semântica desse profile depende dessa cópia.

Use o verificador local com arquivos externos:

```powershell
pnpm.cmd verify:audited-import -- "C:\caminho\arquivo.xlsx"
```

## Migrations

As migrations pós-auditoria são:

- `202609070003_post_audit_domain`
- `202609070004_audit_request_context`

A sequência completa contém 11 migrations. Ela foi validada no banco existente e em banco PostgreSQL vazio; `prisma migrate status` informou que o schema está atualizado.

## Evidências técnicas

Executados localmente:

- `pnpm.cmd install --frozen-lockfile`: passou.
- `pnpm.cmd lint`: passou.
- `pnpm.cmd typecheck`: passou.
- `pnpm.cmd test`: 26 testes em 13 arquivos passaram, incluindo inicialização não bloqueante da API.
- `pnpm.cmd build`: passou; o Vite mantém um aviso não bloqueante de chunk principal acima de 500 kB.
- `pnpm.cmd test:e2e`: passou para o fluxo operacional, incluindo Pendências e Fechamento de Benefícios.
- `pnpm.cmd format:check`: passou.
- `pnpm.cmd audit`: nenhuma vulnerabilidade conhecida.
- Teste específico dos profiles: 4 cenários passaram, incluindo a proteção contra criação de pessoa baseada apenas no nome.

O workflow do GitHub Actions possui jobs de qualidade, E2E com PostgreSQL limpo e auditoria de dependências. A execução remota continua pendente.

## Execução local

Com `.env` configurado e o PostgreSQL disponível:

```powershell
pnpm.cmd install --frozen-lockfile
docker compose up -d --wait
pnpm.cmd db:generate
pnpm.cmd db:migrate
pnpm.cmd dev
```

As variáveis operacionais estão documentadas em `docs/engineering/execucao-local.md`. A API usa `API_PORT`; a porta web usa `WEB_PORT` na configuração Vite. Crie ou redefina administradores com `pnpm.cmd admin:create` e `pnpm.cmd admin:reset`.

## Pendências para homologação

- Exportar a planilha de descanso protegida como XLSX sem senha e repetir a validação real.
- Revisar as 84 pendências, a duplicidade e as 45 dependências do lote atual com o RH.
- Conferir amostras funcionais de RJ, SP e DF para férias, descanso, benefícios e aprendizes.
- Executar o CI remoto e o piloto em infraestrutura de homologação.
- Exercitar backup e restore no ambiente que será usado pelo piloto e definir retenção, RPO e RTO.
- Configurar e validar domínio, VPS, Nginx e HTTPS reais.

O código está tecnicamente preparado para a homologação operacional dentro dessas limitações. A aprovação funcional pelo RH e a liberação de produção não foram realizadas nesta entrega.
