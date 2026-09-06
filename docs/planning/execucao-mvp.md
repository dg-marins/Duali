# Execução aprovada do MVP

Em 2026-09-06 foi autorizada a execução sequencial das Sprints 0 a 7, com commits pequenos e gates reais entre etapas. Esta autorização substitui a restrição anterior de avanço automático para esta execução.

## Decisões complementares
- Importação XLSX/CSV assistida por mapeamento de colunas e aba, com históricos e grupos repetidos explícitos. Compatibilidade com arquivos reais exige homologação posterior com amostras representativas.
- Dias consumidos e prazo concessivo são informados pelo administrador. Sugerir dias corridos inclusivos; divergências exigem motivo. Prazo ausente é pendência.
- Aquisições por aniversário da admissão, limitadas pelo desligamento; fim de mês usa último dia válido. Afastamento não suspende automaticamente aquisições.
- Consumo é explícito, separado de programação, com alocação por direito. Exceções exigem motivo e auditoria.
- Alertas configuráveis por unidade, inicialmente 30 dias.
- Sessões opacas persistidas no PostgreSQL, revogáveis, cookie HttpOnly/SameSite=Lax e Secure em produção; CSRF nas mutações.
- Entrega local com PostgreSQL isolado e preparação Linux/Nginx. Sem publicação produtiva nesta execução.
- Documentos de estágio têm metadados; anexos, PDF, SMTP, notificações externas, folha e regras jurídicas especiais ficam fora.

## Inventário inicial
Somente documentação, diretórios com README e configuração raiz. Sem aplicações, dependências instaladas, migrations, testes ou CI.

## Sequência
0. Fundação; 1. Autenticação/pessoas; 2. Estágio; 3. Descanso; 4. Benefícios; 5. Importação; 6. Relatórios; 7. Hardening.

Cada etapa exige instalação, migrations aplicáveis, lint, typecheck, testes e build. E2E acompanha fluxos críticos. Evidências finais em docs/planning/resultado-mvp.md.

