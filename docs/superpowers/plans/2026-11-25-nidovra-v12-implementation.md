# Nidovra v1.2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. If the skills are unavailable, preserve the same TDD and review gates manually.

**Goal:** entregar PWA de orçamento familiar compartilhado com importação de extratos Inter/Nubank, faturas e NF-e/NFC-e, conciliação sem duplicidade, aquisições com acompanhamento de pagamentos e dashboard financeiro verificável.

**Architecture:** Vue 3/TypeScript/Vite, Vue Router, Pinia, Tailwind CSS, Cloudflare Pages; Hono/TypeScript em Neon Functions, Neon PostgreSQL, Managed Better Auth, Object Storage; Phosphor, ECharts, parsers locais. API como autoridade; aplicações e dados isolados do MotoHub.

**Spec:** `docs/superpowers/specs/2026-11-25-nidovra-v12-design.md`. Plano vigente: `docs/superpowers/plans/2026-11-25-nidovra-v12-implementation.md`.

**Estado:** preparado, não executado. Caminhos e contratos são propostas para repositório novo; não há código inspecionado, testes rodados, serviços criados ou deploy executado.

## Global Constraints

- Não ampliar escopo: sete módulos; sem rateio, investimentos, Open Finance, microserviços ou IA paga.
- Usar Phosphor, não Lucide; Modern Financial Editorial com tokens da especificação; temas completos. Design visual final passa por revisão, sem copiar MotoHub.
- Não modificar MotoHub. Reutilizar conta Cloudflare e organização Neon; criar obrigatoriamente projeto Neon independente em São Paulo (`aws-sa-east-1`), sem opção de compartilhar projeto. Não usar banco/role/cookies do MotoHub.
- Regime de caixa; compromissos e compras contratadas são projeções distintas. Uma saída financeira por fato; pagar fatura não duplica compras. Parcela vencida não é parcela paga. Nota fiscal não comprova pagamento.
- BRL, centavos inteiros, datas locais de negócio, UTC para auditoria. Sem valores fictícios em produção.
- Online-first, sem dados privados cacheados; nenhum rascunho automático ou gravação offline.
- Comentários, docstrings e documentação explicativa em português; identificadores, bibliotecas, contratos externos, comandos e sintaxe originais.
- TDD por tarefa: teste RED, implementação mínima GREEN, refatoração, revisão de segurança, commit pequeno; nunca marcar concluído sem evidência real.

## 0. Governança obrigatória antes da primeira task

O `AGENTS.md` já está na raiz deste pacote. O coordenador deve confirmar leitura da especificação, regras, skills disponíveis e alvo de execução. Configurar agentes nativos do Codex conforme a versão instalada, sem inventar sintaxe ou declarar agentes instalados antes de verificar. Usar especialistas apenas quando a separação justificar custo; revisão independente obrigatória em conciliação, autorização e migrations. Manter `docs/architecture.md`, `docs/data-dictionary.md`, `docs/erd.md`, `docs/dependencies.md`, `docs/business-rules.md`, `docs/operations.md` e ADRs curtos como fontes vivas. Cada task inclui atualização documental e evidência de testes. Aplicar checklist de governança do AGENTS.md.

## 1. Estratégia e organização

Entregar fatias verticais UI + API + banco + testes. Primeiro identidade e núcleo financeiro; depois cartão, importação bancária e fiscal, aquisições e planejamento; finalizar UX, segurança e implantação. Evitar abstração genérica excessiva. Usar workspace pnpm (proposta), TypeScript strict, lockfile versionado, migrações SQL versionadas e validação de contratos com Zod. Vitest para unidade/integração e Playwright para E2E. Verificar compatibilidade e licenças antes de fixar versões; sem instalar pacotes apenas por conveniência. Dependências devem ter versões fixadas via lockfile. Não escolher versões inexistentes.

```text
apps/
  web/
    src/app/{router,theme,api,pwa}.ts
    src/components/                 # UI reutilizável e acessível
    src/features/{auth,dashboard,transactions,cards,acquisitions,planning,imports,settings}/
    src/workers/                    # leitura local de documentos
    e2e/
  api/
    src/app.ts
    src/middleware/{auth,household,validation,errors}.ts
    src/modules/{identity,accounts,finance,cards,imports,documents,acquisitions,planning,dashboard}/
    src/integrations/{auth,storage,mail}/
    test/
packages/
  domain/src/                       # dinheiro, estados, invariantes puros
  contracts/src/                    # DTOs e validação compartilhada
  db/migrations/                    # SQL versionado, apenas banco novo
  importers/src/{ofx,csv,pdf,fiscal,normalize,match}/
  importers/test/fixtures/          # sintéticos e anonimizados, sem dados reais identificáveis
  ui/src/                           # tokens e componentes somente se reutilização justificar
docs/superpowers/{specs,plans}/
docs/{architecture,operations,security,import-formats}.md
.env.example
.github/workflows/ci.yml
```

## 2. Infraestrutura e configuração

### Dados conhecidos (consulta Neon de 25/11/2026)

| Campo | Valor |
|---|---|
| Organização Neon | `org-young-bar-07539547` |
| Projeto de referência (não utilizar) | MotoHub Homologação |
| Project ID proibido como alvo | `falling-river-62191222` |
| Região do projeto novo | AWS São Paulo (`aws-sa-east-1`, validar na API) |
| Novo projeto | Nidovra — ainda não criado |
| PostgreSQL | 18 |
| Compute | 0,25 CU |
| Cloudflare Pages | novo projeto na mesma conta; ID/nome/URL ainda não provisionados |

Não presumir produção existente. A consulta apenas verificou metadados do projeto de homologação; não verificou branches, credenciais, APIs de Functions/Storage ou limites atuais. Usar projeto Pages independente para a SPA, com branch de produção definida após inspeção do repositório. Criar exclusivamente projeto Neon novo na organização existente, região AWS São Paulo (`aws-sa-east-1`). Validar código regional, quota e disponibilidade de Auth/Functions/Storage antes de provisionar; se algum recurso não estiver disponível no Brasil, bloquear e registrar alternativa para decisão, sem deslocar automaticamente dados ou API. Registrar Project ID real após criação autorizada; proibir expressamente o ID do MotoHub nas verificações de ambiente. Referência: https://neon.com/demos/regional-latency. Identificadores sugeridos (não criados): `nidovra` (Pages), `nidovra` (banco), `nidovra_app` (role sem privilégios administrativos), `nidovra-documents` (namespace privado). CI e homologação devem usar banco/branch isolados; produção nunca serve de fixture de teste.

### Variáveis de ambiente propostas

| Variável | Escopo |
|---|---|
| `VITE_API_BASE_URL` | frontend, URL pública da API |
| `VITE_AUTH_BASE_URL` | frontend, endpoint público de auth se necessário |
| `DATABASE_URL` | segredo servidor, role restrita ao banco próprio |
| `AUTH_BASE_URL` | servidor, integração Managed Better Auth |
| `AUTH_SECRET` | servidor, somente se exigido pelo SDK escolhido |
| `ALLOWED_ORIGINS` | servidor, lista explícita de origens Pages |
| `STORAGE_NAMESPACE` | servidor, namespace próprio |
| `STORAGE_CREDENTIALS` | segredo servidor quando exigido |
| `SMTP_*` | segredos servidor quando exigidos |
| `APP_ENV` | ambiente de execução |

Esses nomes são contratos internos propostos, não nomes oficiais dos provedores. Adaptar integração após verificar documentação oficial e capabilities da conta. Nunca expor connection string, token, senha ou chave privada em variável `VITE_*`. Previews não acessam dados de produção. `.env.example` contém placeholders vazios. Segredos em gerenciadores dos serviços, não no Git. Deploy e migração requerem autorização explícita e verificação do alvo.

## 3. Modelo relacional proposto

Todas as entidades de domínio levam `household_id` obrigatório, FK composta quando aplicável, timestamps e versão para alterações concorrentes. IDs UUID; dinheiro `BIGINT` em centavos (serializar como string decimal em contratos se necessário); datas de negócio `DATE`, instantes `TIMESTAMPTZ`. Índices por família, período, conta, status e chaves de conciliação. Auth IDs referenciam identidade externa sem duplicar senhas. Não gravar saldo derivado sem mecanismo consistente de recomputação.

| Tabela | Campos essenciais e invariantes |
|---|---|
| households | id, name, status, owner reference |
| memberships | household_id, auth_user_id, role, status; unique par |
| invitations | household_id, email, token_hash, expires_at, consumed_at |
| accounts | household_id, name, institution, kind, currency BRL, archived_at |
| balance_anchors | account_id, effective_date, amount_cents, source, status; âncora válida única por referência |
| categories | household_id, name, kind, active |
| cash_movements | account_id, direction, amount_cents > 0, date, kind, status, category_id, source; transferências e liquidação separados |
| transfers | outgoing_id, incoming_id, status; duas pernas válidas, mesmo valor, contas distintas |
| purchases | household_id, merchant, date, contracted_cents nullable, method, status; fato canônico |
| purchase_items | purchase_id, description, quantity decimal, fiscal amount |
| cards | household_id, name, closing_day, due_day, account_id nullable |
| installments | purchase_id, card_id nullable, sequence, amount_cents, due_date, status; unique purchase/sequence |
| invoices | card_id, cycle_key, closing_date, due_date, total_cents, status; unique card/cycle |
| invoice_lines | invoice_id, installment_id nullable, line_kind, amount_cents; vínculo de parcela único ativo |
| settlements | cash_movement_id, invoice_id nullable, purchase_id nullable, amount_cents, status; vínculo único por operação |
| allocations | settlement_id, installment_id ou invoice_line_id, amount_cents; soma não excede liquidação nem obrigação |
| acquisitions | purchase_id unique, title, category_id, warranty_until nullable, visibility/status |
| documents | household_id, object_key unique, sha256, mime, size, fiscal_key nullable, metadata, status |
| purchase_documents | purchase_id, document_id; unique par, chave fiscal evita compra fiscal duplicada sem bloquear XML+PDF |
| import_batches | household_id, target, file_hash, format, adapter_version, status, revision, summary |
| import_rows | batch_id, row_no, external_id nullable, normalized payload, match_state, canonical reference |
| source_links | household_id, source_kind, source_scope, external_key, canonical_id; unique origem estável |
| categorization_rules | household_id, normalized merchant/description, category_id, active |
| recurring_rules | household_id, direction, expected_cents, cadence, next_due, status |
| planned_occurrences | recurring_rule_id, due_date, expected_cents, linked_fact, status; unique regra/data |
| budgets | household_id, month, category_id nullable, amount_cents; unique mensal por escopo incluindo total |
| notifications | household_id, user_id nullable, source, event_key, read_at; idempotência por evento |
| audit_events | household_id, actor_id, action, resource_type, resource_id, created_at, metadata mínima |
| idempotency_keys | household_id, actor_id, operation, key, payload_hash, result; unique escopo |

Preferir FKs e checks explícitos. Em alocações, garantir exatamente um alvo e igualdade de família; não usar FK polimórfica sem validação robusta. Uma linha de extrato pode liquidar fatura com várias compras; uma compra pode ter múltiplas evidências. Extratos/faturas/notas não são lançamentos independentes. Documentos com mesma chave fiscal vinculam ao fato canônico; diferença de total exige revisão. Dados brutos sensíveis com retenção mínima e acesso restrito.

### Documentação obrigatória do schema

A tabela acima é modelo lógico, não schema executado. Antes de aprovar cada migration, documentar em português brasileiro todas as tabelas e colunas próprias (tipo, nulabilidade, default, significado, unidade, dados sensíveis), PKs, FKs, cardinalidade, exclusão/atualização, índices, checks, uniques e dependências. Usar `COMMENT ON TABLE`, `COMMENT ON COLUMN`, `COMMENT ON CONSTRAINT`, `COMMENT ON INDEX`, `COMMENT ON FUNCTION` e comentários em views quando aplicável. Não alterar objetos internos gerenciados pelo provedor; documentar sua interface e propriedade separadamente. Dicionário e ERD devem corresponder ao catálogo real, não a um desenho presumido.

Exemplo de padrão (ilustrativo, não migration pronta):
```sql
COMMENT ON TABLE purchases IS 'Compra canônica da família, vinculada a documentos e compromissos financeiros.';
COMMENT ON COLUMN purchases.contracted_cents IS 'Valor contratado em centavos de real; nulo quando ainda não confirmado.';
```

CI consulta `pg_catalog` e `col_description`/`obj_description` para falhar em tabela ou coluna própria sem comentário; testes verificam FKs compostas por família, cardinalidade, exclusão e restrições. Revisão humana verifica precisão dos comentários. Não gerar documentação fictícia de objetos não implementados. Migrations e documentação atualizadas no mesmo commit.

### Semântica de projeções

`realizedIncome`: entradas efetivas de receita; `realizedExpense`: pagamentos diretos categorizados + alocações efetivas de faturas + pagamentos de cartão ainda não alocados + encargos efetivos − estornos correspondentes. Nunca somar a liquidação integral novamente após alocação. `accountBalance`: âncora válida mais movimentos efetivos posteriores. `purchaseProgress`: soma líquida de alocações efetivas / valor contratado vigente. `remaining`: obrigações não liquidadas, não simplesmente parcelas ainda não vencidas. `forecast`: saldo atual + receitas previstas − compromissos ainda não pagos; agrupar fatura e parcelas como mesma obrigação. Projeções de leitura não gravam despesa duplicada.

## 4. Contratos da API (proposta)

Prefixo `/api/v1`; escopo de família derivado de sessão e membership validada, nunca confiar no ID do corpo. Se houver seletor de família, validar contexto em cada request. Paginação cursor, filtros e ordenação estáveis. Erros `{code,message,fieldErrors?,requestId}`; 401 sem sessão, 403/404 acesso indevido sem revelar existência, 409 conflito de versão/idempotência, 422 dado inválido, 429 limitação. `Idempotency-Key` em comandos de criação/confirmação; revisão esperada em alterações. Valores monetários nunca passam por float.

| Método / rota | Responsabilidade |
|---|---|
| GET `/session/context` | identidade e memberships autorizadas |
| POST `/households` | criar família |
| POST `/households/:id/invitations` | convite |
| POST `/invitations/accept` | aceitar token |
| DELETE `/households/:id/members/:memberId` | revogar acesso |
| GET/POST `/accounts` | listar/criar conta |
| POST `/accounts/:id/anchors` | conciliar saldo de referência |
| GET/POST `/movements` | consultar/criar movimento |
| PATCH `/movements/:id` | correção com versão |
| POST `/movements/:id/reverse` | estorno |
| POST `/transfers` | duas pernas atômicas |
| GET/POST `/cards` | configuração |
| GET/POST `/purchases` | compra canônica, agenda informada |
| GET `/cards/:id/invoices` | faturas e compromissos |
| POST `/invoices/:id/settlements` | liquidar por evidência |
| POST `/settlements/:id/allocations` | alocação explícita |
| GET/POST `/acquisitions` | galeria/criar ou vincular compra |
| GET `/acquisitions/:id` | detalhe e progresso |
| POST `/imports/preview` | normalizar, validar e sugerir matches |
| PATCH `/imports/:id/review` | resolver exceções |
| POST `/imports/:id/confirm` | commit atômico com revisão |
| POST `/imports/:id/reverse` | reversão com análise de dependências |
| GET `/imports` | histórico |
| POST `/documents` | upload privado controlado |
| GET `/documents/:id/download` | autorização e download |
| GET/POST `/budgets` | orçamento |
| GET/POST `/recurrences` | recorrências |
| GET `/planning/forecast` | calendário e projeção |
| GET `/dashboard?month=YYYY-MM` | indicadores com referência/cobertura |
| GET `/reports/movements.csv` | exportação contextual autorizada |

Rotas de login e recuperação seguem SDK Better Auth, não duplicar protocolos externos. Endpoint de upload e preview deve suportar processamento local, sem confiar no resultado enviado pelo cliente. Especificar OpenAPI ou documentação equivalente antes do merge de cada módulo.

## 5. Tasks de implementação

### Task 0 — Preflight, isolamento e bootstrap

**Files:** workspace, `.env.example`, workflows, docs de operação, `apps/web`, `apps/api`, `packages/db`.

**Interfaces:** `loadConfig()`, `createApp()`, `assertEnvironmentIsolation()`.

- [ ] Step 1: conferir especificação, inspecionar repositório/alvo, verificar documentação e disponibilidade real de Neon Functions, Better Auth, Storage, Pages, quotas e limites; identificar Pages/branch/URLs sem imprimir segredos.
- [ ] Step 2: verificar região São Paulo, quota e isolamento com novo projeto Neon, role/database/auth/storage próprios e novo projeto Pages; após autorização de implementação, provisionar e registrar IDs reais. Bloquear se não suportado. Nunca criar no projeto MotoHub.
- [x] Step 3: escrever testes falhos de configuração ausente, health check sem dados privados e bloqueio de alvo errado de migração; executar RED.
- [x] Step 4: implementar scaffold Vue/Hono, TS strict, scripts e CI; testar GREEN, build e smoke local; configurar SPA fallback e ambiente isolado.
- [x] Step 5: revisar e registrar o bootstrap local no commit `7539a88`.

### Task 1 — Identidade e família (AC-01/02)

**Files:** `modules/identity/*`, `middleware/auth.ts`, `middleware/household.ts`, `features/auth/*`, `features/settings/*`, `001_identity.sql`.

**Interfaces:** `requireSession`, `requireMembership`, `requireAdmin`, `acceptInvitation`.

- [x] Step 1: RED para sessão ausente, terceiro com ID forjado, convite expirado/reutilizado, e-mail incorreto, revogação e administrador removendo a si sem sucessão.
- [ ] Step 2: implementar integração Managed Better Auth, verificação de e-mail, recuperação, revogação, convites transacionais e controle de acesso servidor em todos os caminhos.
- [ ] Step 3: implementar telas login, convite, criação de família e gestão de integrantes; testar GREEN e E2E dois usuários.
- [ ] Step 4: revisão de cookies, CSRF, CORS, rate limit, enumeração de usuários e logs; commit `feat(auth): shared household and scoped access`.

### Task 2 — Núcleo financeiro, contas e categorias (AC-03/14)

**Files:** `modules/accounts/*`, `modules/finance/*`, `domain/money.ts`, `002_finance.sql`, `features/transactions/*`.

**Interfaces:** `recordMovement`, `transferFunds`, `reconcileBalance`, `reverseMovement`, `getRealizedTotals`.

- [ ] Step 1: RED para transferência atômica, tarifa separada, saldo inicial não receita, retroativo, âncora divergente, moeda inválida, concorrência e versão desatualizada.
- [ ] Step 2: implementar schema, constraints, valores em centavos, FK por família, transações e projeções. Verificar rollback após falha entre pernas.
- [ ] Step 3: UI de contas, extrato, filtros, categorias e formulários rápidos; estados de cobertura parcial.
- [ ] Step 4: GREEN unidade, PostgreSQL real isolado e E2E; commit `feat(finance): canonical cash movements and balances`.

### Task 3 — Compras, parcelas, faturas e liquidação (AC-08/10/11)

**Files:** `modules/cards/*`, `domain/installments.ts`, `003_cards.sql`, `features/cards/*`.

**Interfaces:** `createPurchase`, `scheduleInstallments`, `attachInvoiceLine`, `settleInvoice`, `allocateSettlement`, `reverseSettlement`.

- [ ] Step 1: RED compra 6x400, valores desiguais, data de fechamento, fatura paga uma vez, pagamento parcial sem alocação, estorno, juros e concorrência de liquidação.
- [ ] Step 2: implementar compra canônica e agenda explícita; fatura agrupa obrigações; alocação com locks/constraints, soma limitada, correção atômica. Não inferir pagamento por data.
- [ ] Step 3: implementar telas cartões, faturas, compra e detalhes; separar contratado/realizado/previsto.
- [ ] Step 4: GREEN, reconciliar totais e revisar casos de centavo; commit `feat(cards): installments and single-source settlement`.

### Task 4 — Infraestrutura de importação e documentos (AC-05/15/17)

**Files:** `modules/imports/*`, `modules/documents/*`, `integrations/storage/*`, `004_imports.sql`, `features/imports/*`, `workers/*`.

**Interfaces:** `detectFormat`, `previewBatch`, `reviewBatch`, `confirmBatch`, `reverseBatch`, `authorizeDocumentDownload`.

- [ ] Step 1: RED para hash repetido, confirmação concorrente, preview obsoleto, MIME falso, arquivo grande, download cruzado, falha storage/DB e reversão com dependência manual.
- [ ] Step 2: implementar estado `uploaded/preview/review/confirmed/reversed/failed`, SHA-256, upload privado, staging e limpeza de órfãos; transação de confirmação, idempotência e proveniência. Limite 20 MiB e limites adicionais por parser.
- [ ] Step 3: montar prévia de lotes com classificação de novos/vinculados/duplicados/pendentes/rejeitados, correções e histórico; sem execução de conteúdo de arquivo.
- [ ] Step 4: GREEN integração e E2E; testar falha intermediária; commit `feat(imports): private document pipeline and atomic batches`.

### Task 5 — Extratos Inter/Nubank e faturas (AC-04/05/06/14)

**Files:** `packages/importers/src/{ofx,csv,pdf,normalize,match}/*`, fixtures anonimizados, `modules/imports/adapters/*`.

**Interfaces:** `parseStatement(file,adapter): NormalizedStatement`, `parseCardInvoice`, `suggestMatches`, `applyStatement`.

- [ ] Step 1: obter amostras reais anonimizadas de OFX/CSV/PDF para cada banco e fatura disponível; documentar formatos, datas, encoding, saldo final e sinais. Não alegar suporte antes de teste. Criar fixtures sintéticos para limites, parcelas e erros.
- [ ] Step 2: RED para BOM, decimal brasileiro, OFX SGML/XML, FITID por conta, arquivos sobrepostos, duas transações legítimas iguais, transferência bilateral, saldo divergente, PDF com linhas quebradas, fatura com parcelas, fechamento e estorno.
- [ ] Step 3: implementar adaptadores OFX (parser escolhido após avaliar fixtures), Papa Parse para CSV, PDF.js, Tesseract.js apenas para documento sem texto e com consentimento de processamento local. Normalizar moeda, data e direção. Fallback OFX/CSV com mapeamento revisável.
- [ ] Step 4: deduplicar identificadores fortes; fingerprint apenas sugere; reconciliar fatura/extrato sem nova despesa; aplicar regras de categoria por família e oferecer revisão de exceções.
- [ ] Step 5: GREEN comparar soma de linhas e saldo com arquivo de referência para cada layout; E2E importação repetida e transferências. Documentar layouts suportados e os não testados.
- [ ] Step 6: commit `feat(importers): validated Inter and Nubank statements and invoices` somente após testes dos formatos prometidos.

### Task 6 — NF-e/NFC-e e vínculo de compras (AC-07/08/15)

**Files:** `packages/importers/src/fiscal/*`, `modules/documents/fiscal.ts`, `features/imports/fiscal/*`, `005_fiscal.sql`.

**Interfaces:** `parseFiscalXml`, `extractDanfe`, `findFiscalPurchase`, `attachFiscalDocument`.

- [ ] Step 1: RED para namespaces XML, nfeProc/NFe, NFC-e, múltiplos itens, descontos e frete, chave duplicada, XML com DTD, DANFE incompleto, documento escaneado e total fiscal diferente de contratado.
- [ ] Step 2: validar tamanho/estrutura antes de parse; rejeitar DTD/entidades externas; extrair chave, emitente, data, itens, totais e pagamento informado com fast-xml-parser configurado defensivamente. Não usar rede nem validar autenticidade fiscal por mera extração.
- [ ] Step 3: PDF.js para DANFE textual, OCR local para scan, confiança por campo e revisão humana; ausência de parcelas/pagamento vira pendência.
- [ ] Step 4: vincular XML/PDF à mesma compra por chave e evidência; manter original privado; criar compromisso quando não há pagamento, ou enriquecer lançamento conciliado.
- [ ] Step 5: GREEN e E2E XML → fatura → extrato, e ordem inversa, garantindo fato único; commit `feat(fiscal): fiscal documents linked to canonical purchases`.

### Task 7 — Aquisições e infográficos (AC-09/11)

**Files:** `modules/acquisitions/*`, `domain/progress.ts`, `006_acquisitions.sql`, `features/acquisitions/*`.

**Interfaces:** `createAcquisitionFromPurchase`, `getAcquisitionProgress`, `getAcquisitionCommitments`.

- [ ] Step 1: RED para fogão 6x400 (1 paga = 16,67%, saldo 2.000), pagamento desigual, parcial, estorno, cancelamento, valor desconhecido e compra à vista.
- [ ] Step 2: implementar associação 1:1 aquisição/compra, progresso derivado, garantia opcional, histórico e filtros; nenhuma nova despesa criada pelo módulo.
- [ ] Step 3: implementar galeria com cards, barra segmentada, valor pago/restante, próxima parcela, documentos e timeline; gráfico ECharts de parcelas futuras e totais por categoria. Supermercado não entra automaticamente em Aquisições.
- [ ] Step 4: GREEN, teste de acessibilidade dos gráficos com alternativa textual, E2E conciliação altera progresso; commit `feat(acquisitions): visual payment progress and purchase history`.

### Task 8 — Planejamento, orçamento e alertas (AC-12/13)

**Files:** `modules/planning/*`, `007_planning.sql`, `features/planning/*`.

**Interfaces:** `materializeOccurrences`, `confirmOccurrence`, `getForecast`, `getBudgetUsage`.

- [ ] Step 1: RED para recorrência repetida, fim de mês, pausa, receita prevista fora de saldo, projeção com fatura+parcelas e alertas duplicados.
- [ ] Step 2: implementar ocorrências com chave regra/data; projeção de compromissos não liquidados; orçamento mensal e alertas internos deduplicados. Não depender de scheduler indisponível; materializar horizonte sob demanda. Push opcional só se viável, sem prometer entrega.
- [ ] Step 3: UI de orçamento, calendário, projeção e avisos; indicar hipóteses, atrasos e dados insuficientes.
- [ ] Step 4: GREEN e E2E, commit `feat(planning): household budget and commitments`.

### Task 9 — Dashboard, relatórios e experiência visual (AC-16)

**Files:** `modules/dashboard/*`, `features/dashboard/*`, `app/theme.ts`, componentes e rotas, `e2e/theme.spec.ts`.

**Interfaces:** `getDashboardSnapshot`, `exportMovementsCsv`, `setTheme`.

- [ ] Step 1: RED para filtro de mês, dados ausentes, saldo desatualizado, totais por categoria, CSV com fórmulas injetáveis, tema e navegação por teclado.
- [ ] Step 2: implementar consultas consistentes por snapshot, cobertura de extrato e status; CSV com escaping e mitigação de formula injection. Gráficos ECharts lazy, Phosphor Regular/Fill, tokens conforme spec.
- [ ] Step 3: construir dashboard Modern Financial Editorial, barra inferior mobile, bottom sheet +, sidebar desktop, formulários dedicados; apresentar protótipo nos dois temas para validação visual antes da publicação.
- [ ] Step 4: testar responsividade 360/390/768/1280px, Android Chrome, desktop Chrome/Firefox, teclado, contraste, estados de loading/erro e desempenho; GREEN. Commit `feat(ui): financial editorial dashboard and reports`.

### Task 10 — Hardening, PWA e release (AC-01–18)

**Files:** service worker, headers Pages, CI, `docs/operations.md`, `docs/security.md`, `e2e/critical-flows.spec.ts`.

- [ ] Step 1: RED para cache de dados privados, sessão expirada, IDOR, CSRF, origem indevida, XML malicioso, XSS em documentos/descritivos, duplo clique, reimportação concorrente, rollback e isolamento do MotoHub.
- [ ] Step 2: implementar headers, CSP compatível com auth/worker, rate limit, cache apenas assets públicos, limpeza de sessão e observabilidade redigida; sem armazenamento de dados financeiros offline. Revisar permissões mínimas do banco e storage.
- [ ] Step 3: preparar migrações forward-only e estratégia de rollback da aplicação compatível com schema; testar restauração em ambiente isolado, backup e retenção de documentos; documentar limites de custo e alertas de cota.
- [ ] Step 4: executar CI completo, revisão técnica independente, testes E2E com dois integrantes, importações reais anonimizadas e todos AC. Registrar evidências. Não inventar resultado de teste.
- [ ] Step 5: conferir alvo e autorização antes de criar recursos/deploy. Configurar Pages build (`pnpm --filter web build`, ajustar nome real do pacote; saída `dist`), fallback SPA, API e auth com origem correta. Executar smoke homologação e validar quotas antes de produção.
- [ ] Step 6: commit `chore(release): secure deployment and operational runbook` após gates. Publicar somente quando autorizado.

## 6. Estratégia de testes e comandos

Comandos previstos após bootstrap dos scripts; não são alegações de execução:

```sh
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm test:integration
pnpm test:e2e
pnpm build
```

Migrações somente com URL de banco validada e role apropriada; scripts devem rejeitar projeto/database do MotoHub. PostgreSQL real isolado em integração; mocks apenas para dependências externas com testes de contrato. Fixtures versionados sem CPF, conta, nomes, chave fiscal real ou outros identificadores sensíveis. Cobrir precisão decimal, concorrência e ordem variável de documentos. CI bloqueia merge se algum teste crítico falhar. Não registrar logs com conteúdo de extratos.

| Aceite | Task | Evidência exigida |
|---|---|---|
| AC-01/02 | 1,10 | E2E dois integrantes e revogação |
| AC-03 | 2 | integração saldo e transferência |
| AC-04 | 5 | fixtures reais anonimizados dos bancos |
| AC-05/06 | 4,5 | concorrência, reimportação e falso positivo |
| AC-07/08 | 3,6 | XML/PDF e parcelamento ausente |
| AC-09 | 7 | unidade e E2E progresso 6x400 |
| AC-10/11 | 3,7 | liquidação integral/parcial/estorno |
| AC-12/13 | 8 | recorrência e projeção sem duplicidade |
| AC-14 | 2,5 | divergências e âncora |
| AC-15 | 4,6,10 | XML seguro, storage e autorização |
| AC-16 | 9,10 | responsividade, acessibilidade, cache |
| AC-17 | 4 | reversão transacional com dependências |
| AC-18 | 0,10 | configuração/role/database isolados |

## 7. Critérios de conclusão e review focus

1. Nenhum lançamento duplicado em nota + fatura + extrato, inclusive ordem inversa, correções e importações concorrentes.
2. Saldos conferem com âncoras válidas; ausência de cobertura é visível. Nenhum valor, parcela ou pagamento inventado.
3. Progresso de aquisições consistente com liquidação efetiva, inclusive parcial e estorno.
4. Usuários não autorizados não acessam dados financeiros, documentos ou histórico de importações; revogação aplicada no servidor.
5. Todos AC têm evidência verificável; interfaces aprovadas visualmente; ambientes, custo, recuperação e limites documentados.
6. MotoHub permanece intacto; sem credenciais compartilhadas com frontend ou repositório.

## 8. Execução

Plano preparado para Codex/agentes usando Superpowers. Ler especificação antes de trabalhar, executar uma task por vez, manter checkboxes reais, revisar cada diff, registrar decisões técnicas em ADR quando divergirem do documento. Não implementar funcionalidades extras por iniciativa. Não iniciar deploy ou alterações remotas apenas porque este plano existe. Pendências: identificar conta Cloudflare e provisionar projeto Pages independente e branch, confirmar capabilities/cotas do Neon, obter fixtures reais dos bancos, validar região São Paulo, isolamento e design. Nenhum desses pontos foi concluído nesta sessão.
