# Nidovra v1.2 — Especificação funcional e técnica

**Data:** 25/11/2026  
**Estado:** escopo consolidado conforme aprovação conceitual do proprietário; decisões técnicas delegadas detalhadas abaixo; validação visual e infraestrutura pendentes.  
**Nome:** Nidovra (nome adotado para desenvolvimento; marca não registrada).  
**Referência:** MotoHub v0.4, especificação consolidada e Implementation Plan de 19/11/2026.

## 1. Produto

PWA privada para gestão financeira doméstica compartilhada. O casal trabalha com um orçamento único; contas individuais são fontes de recursos, não bases de rateio. O objetivo é importar documentos, revisar exceções e conhecer saldo, gastos, compromissos e bens adquiridos. Não há cobrança entre integrantes, percentuais de divisão ou obrigação de registrar cada compra manualmente.

Sete módulos: Visão geral, Movimentações, Cartões, Aquisições, Planejamento, Importações e Configurações. Indicadores e relatórios são contextuais, sem módulos adicionais. BRL e português brasileiro na versão inicial; datas de negócio no fuso America/Sao_Paulo. Valores monetários em centavos inteiros.

## 2. Arquitetura

| Camada | Escolha |
|---|---|
| Frontend | Vue 3, TypeScript, Vite, Vue Router, Pinia, Tailwind CSS; SPA/PWA |
| Hosting | Cloudflare Pages, projeto independente na conta existente |
| API | Hono/TypeScript em Cloudflare Workers |
| Banco | Neon PostgreSQL 18, projeto dedicado na região AWS São Paulo (`aws-sa-east-1`), banco e role exclusivos |
| Identidade | Neon Managed Better Auth, com isolamento de aplicação e sessão |
| Arquivos | Cloudflare R2 privado, bucket e autorização próprios |
| Ícones | Phosphor Icons (`@phosphor-icons/vue`) |
| Gráficos | Apache ECharts, carregamento sob demanda |
| Importadores | PDF.js, Tesseract.js sob demanda, fast-xml-parser, Papa Parse, adaptador OFX |
| E-mail | SMTP transacional substituível, apenas conta/convites |
| Contingência | VPS AlmaLinux apenas se a infraestrutura escolhida for inviável e mediante aprovação |

Infraestrutura: usar projeto Neon dedicado ao Nidovra na organização `org-young-bar-07539547`, região AWS São Paulo (`aws-sa-east-1`), com PostgreSQL 18 e Managed Better Auth. Usar projeto Pages, Worker Hono e bucket R2 privado dedicados ao Nidovra. Confirmar planos, cotas e localização de dados antes de operar. Registrar somente IDs, endpoints e resultados não secretos em `docs/STATUS.md`. Veja o [ADR de infraestrutura](../../adr/0001-infraestrutura-hospedada.md).

## 3. Identidade e ambiente familiar (FAM)

- FAM-01: cadastro com e-mail verificado, login, recuperação e logout; proteção progressiva contra abuso e revogação de sessões anteriores após troca de senha.
- FAM-02: criar ambiente familiar e convidar integrante via token expirável, de uso único, associado ao e-mail. Ambos podem consultar e editar dados financeiros, com credenciais próprias. Administrador gerencia convites e remoção de membros; membro não pode excluir ambiente ou remover administrador.
- FAM-03: revogação de acesso imediata, inclusive documentos; trilha seletiva de ator, data, ação e referência para operações sensíveis. Identidade do autor não representa dívida pessoal.
- FAM-04: exclusão de conta ou ambiente com confirmação explícita; saída individual preserva registros da família; administrador transfere administração antes de sair se houver outros membros. Política de retenção e expurgo de backups documentada antes de produção.

## 4. Visão geral (DAS)

- DAS-01: período mensal selecionável; saldo disponível consolidado por conta na data da última conciliação, receitas efetivas, despesas efetivas, compromissos a vencer e saldo projetado. Mostrar atualização por conta, lacunas e divergências, sem apresentar saldo estimado como confirmado.
- DAS-02: gráficos de distribuição por categoria e evolução mensal, resumo de cartões, próximas contas e aquisições em andamento. Filtros por período e conta quando pertinentes; nenhuma métrica fictícia em estado vazio.
- DAS-03: ações rápidas para importar, lançar receita/despesa, transferir e registrar aquisição; avisos de pendências de revisão.

## 5. Movimentações (MOV)

- MOV-01: contas bancárias Inter/Nubank e outras contas manuais, carteira em espécie; saldo inicial com data de referência, arquivamento sem apagar história. Não armazenar senha bancária.
- MOV-02: receitas, despesas, transferências, ajustes justificados e estornos; descrição, data, valor, conta, categoria, origem e observação. Categorias padrão editáveis; pesquisa e filtros por período, conta, categoria e status.
- MOV-03: lançamento manual ou importado; correção e estorno rastreáveis. Transferências internas representam duas pernas vinculadas e não são receita/despesa; tarifas são despesas separadas. Transferência ainda sem contraparte fica pendente de classificação, sem adivinhar.
- MOV-04: saldo = saldo inicial + movimentos efetivos posteriores, respeitando a data de referência. Extrato com saldo final oferece âncora de conciliação; divergência exige revisão e não gera ajuste silencioso. Extratos sem saldo não podem sobrescrever saldo confirmado. Importação retroativa anterior à âncora não altera seu saldo, mas pode alimentar histórico se validada. Lacunas aparecem como cobertura incompleta.
- MOV-05: relatórios contextuais por período com exportação CSV; valores reais e compromissos futuros separados. PDF/XLSX não são necessários na v1.

## 6. Cartões (CAR)

- CAR-01: cadastrar cartão, conta pagadora opcional, fechamento e vencimento; limite informado opcionalmente, nunca inferido como limite bancário oficial.
- CAR-02: compras à vista e parceladas, faturas por ciclo, fechamento e vencimento, valor de cada parcela. Compra gera compromisso; lançamento em fatura não prova pagamento.
- CAR-03: importar fatura e conciliar compras/parcelas existentes. Pagamento total confirmado liquida parcelas vinculadas; pagamento parcial permanece registrado como crédito de liquidação não alocado até evidência ou alocação explícita. Não presumir quitação proporcional. Juros, tarifas e estornos separados.
- CAR-04: projeção de parcelas futuras, saldo devedor e histórico de faturas. Antecipação e cancelamento corrigem agenda com confirmação e evidência; não marcar como pago apenas porque venceu.

## 7. Aquisições (AQU)

- AQU-01: histórico visual de bens e compras relevantes (móveis, eletrodomésticos, eletrônicos, reformas), manual ou criado de nota fiscal; categoria, título, fornecedor, data, itens, valor contratado, forma de pagamento e documentos associados. Compras comuns de supermercado ficam nas movimentações, com nota consultável; o usuário pode promover uma compra a aquisição.
- AQU-02: aquisição à vista ou parcelada; preço fiscal e custo contratado podem diferir (frete, juros, descontos). Parcelas têm valor e vencimento reais; informação ausente fica pendente. Não inferir garantia ou parcelamento pelo DANFE.
- AQU-03: barra de progresso crescente de quitação e valor restante decrescente, percentual = valor efetivamente liquidado / valor contratado vigente, limitado a 0–100%; número de parcelas quitadas exibido separadamente; pagamentos parciais identificados. Se custo desconhecido, ocultar percentual. Estorno pode reduzir progresso; cancelamento não equivale a quitação.
- AQU-04: status pendente de confirmação, em pagamento, quitada, cancelada; galeria filtrável, detalhes, linha do tempo e consulta privada de XML/PDF. Garantia opcional por data informada; sem busca automática de fabricante.
- AQU-05: total contratado, total pago, saldo a quitar e gráfico mensal de parcelas futuras; filtros por categoria, status e período. Não somar aquisição novamente no financeiro.

Exemplo: fogão R$ 2.400 em 6 parcelas de R$ 400. Após conciliação da primeira: 16,67% quitado, R$ 400 pagos, R$ 2.000 restantes, 1/6 parcelas. Ao pagar a última: 100%, zero restante. Se o pagamento for estornado, recomputar.

## 8. Planejamento (PLN)

- PLN-01: orçamento mensal familiar e limites opcionais por categoria, comparação realizado/planejado.
- PLN-02: receitas e despesas recorrentes com periodicidade mensal/anual, valor esperado editável, vencimento, pausa e encerramento. Ocorrências previstas só se tornam efetivas após confirmação/conciliação.
- PLN-03: calendário de compromissos e projeção de saldo = saldo de referência + entradas previstas − saídas previstas ainda não liquidadas. Excluir transferências internas do consolidado; não duplicar parcelas com fatura prevista. Mostrar horizonte e premissas, indicar projeção incompleta quando faltarem dados.
- PLN-04: avisos internos de vencimento, atraso, orçamento excedido e saldo projetado negativo; Push opcional somente após validação técnica e consentimento, sem promessa de entrega. Sem lembretes por e-mail.

## 9. Importações e conciliação (IMP)

- IMP-01: central de importações com seleção de conta/cartão, detecção de tipo, prévia, validação, confirmação e histórico de lotes. OFX/CSV bancários Inter e Nubank são prioritários; PDF bancário e faturas PDF/CSV/OFX conforme arquivos efetivamente disponíveis. Não afirmar compatibilidade de layout sem fixtures reais. Adaptadores por banco e versão de formato, com fallback genérico para OFX/CSV mapeável.
- IMP-02: OFX extrair identificador FITID quando disponível, datas, valores, descrições, moeda, período e saldo de fechamento quando presente. CSV tratar BOM, delimitadores, encoding, decimal brasileiro e sinais. PDF.js extrai texto; OCR Tesseract.js local só quando necessário, com revisão de campos incertos. Arquivos protegidos ou ilegíveis geram erro orientado; não burlar senha.
- IMP-03: NF-e/NFC-e XML extrair chave, emitente, data, itens, quantidades, descontos, frete, total e informações de pagamento presentes. DANFE PDF extrair dados possíveis e sinalizar confiança; não afirmar autenticidade fiscal a partir do parse. Não acessar SEFAZ automaticamente. Documentos originais preservados de forma privada.
- IMP-04: detectar duplicidade por hash do arquivo, chave fiscal normalizada, identificador externo por conta/cartão e fingerprints de candidatos. Fingerprints sem ID estável são sugestão, pois compras iguais podem ser legítimas. Reimportação idêntica é idempotente; concorrência tratada em transação. Não descartar silenciosamente transações parecidas.
- IMP-05: conciliar nota, compra, parcela, fatura e extrato como evidências do mesmo fato econômico. Suportar relações 1:N/N:1 (nota com vários itens, pagamento de fatura com várias compras). Correspondência inequívoca por identificadores e valores pode ser aplicada automaticamente após confirmação do lote; ambiguidades ficam para revisão. Data, fornecedor e valor aproximado apenas sugerem correspondência.
- IMP-06: sugerir categorias por descrição normalizada e regras aprendidas com correções explícitas, restritas à família. Sem IA externa paga. Permitir desfazer regra.
- IMP-07: confirmação atômica, resumo de novos/vinculados/duplicados/pendentes/rejeitados; lote original e proveniência consultáveis. Reversão de importação com análise de dependências, sem excluir manualmente dados de outras origens; recalcular saldos, projeções e progresso. Não apagar evidência vinculada sem aviso.
- IMP-08: upload privado com limite inicial proposto de 20 MiB por arquivo, validação real de tipo, limites de páginas/itens/expansão e rejeição de XML DTD/entidades externas. Arquivos nunca executados como HTML; processamento em worker local quando possível; servidor valida resultado antes de persistir. Limpar temporários e arquivos órfãos.

## 10. Regime financeiro e invariantes

Usar regime de caixa para indicadores realizados. Exibir compras contratadas e compromissos separadamente; uma compra a crédito não é saída bancária até pagamento. Na fatura paga, classificar despesas pelas parcelas liquidadas e demais encargos; saída bancária do pagamento é liquidação, não nova despesa. Pagamento parcial sem alocação aparece como saída de caixa de cartão não classificada; quando alocado, reclassificar sem aumentar total. Compra à vista paga afeta saldo e despesa uma única vez. Nota fiscal por si só não confirma liquidação; cria compromisso ou enriquece movimento existente. Reembolso externo é reversão de despesa quando vinculado; transferência interna nunca é receita. Ajustes de saldo não entram em receita/despesa. Receitas previstas não compõem saldo efetivo. A API é a autoridade para cálculos, permissões e estados. Toda mutação financeira é atômica, idempotente quando aplicável e auditável. Usar valor decimal exato/centavos e rateio determinístico de arredondamento apenas quando o cronograma for explicitamente informado; parcelas devem fechar no valor contratado.

## 11. Experiência visual — Modern Financial Editorial

Identidade própria, não copiar Graphite Luxury do MotoHub. Visual leve, editorial, doméstico, premium e com elevada legibilidade. Títulos Plus Jakarta Sans; textos Inter com números tabulares; Phosphor Regular por padrão, Fill apenas para navegação ativa. Sem glass excessivo, sem aparência de planilha ou dashboard corporativo denso.

| Token | Claro | Escuro |
|---|---|---|
| Fundo | #F6F7F3 | #101917 |
| Superfície | #FFFFFF | #1C2925 |
| Primário | #183E35 | #74C9A5 |
| Positivo | #27866A | #65B991 |
| Texto | #172B26 | #EEF3F0 |
| Despesa/negativo | #C46B56 | #E49B89 |
| Texto secundário | #52665C | #A8BAB1 |
| Borda | #DFE6E0 | #35473F |

Tema claro inicial, escuro manual persistente. Testar WCAG AA e ajustar cores de texto para contraste sem alterar a direção visual; status não depende apenas de cor. Espaçamento em múltiplos de 4 px, raios 12–20 px, toque mínimo 44 px. Mobile: barra inferior Início, Extrato, +, Compras, Mais. Botão central abre bottom sheet de ações; formulário completo em página dedicada. Desktop: sidebar recolhível, header com período e ambiente, grid responsivo. Dashboard com saldo em destaque, contas, faturas, aquisições e gráficos; Aquisições em cards com barra de progresso e parcelas. Importação em etapas curtas, priorizando exceções. Estados vazios úteis, loading, erro recuperável, confirmação de ações destrutivas. Não salvar rascunhos automaticamente. Preparar mobile e desktop nos dois temas para avaliação exclusiva do proprietário. A automação de desenvolvimento usa análise estática e componentes simulados, conforme AGENTS.md.

## 12. Segurança, qualidade e operação

Online-first, sem gravações financeiras offline na v1; service worker cacheia apenas shell e recursos públicos versionados. Não cachear extratos, anexos, respostas financeiras ou sessão. Autorização server-side por família em toda consulta/mutação e download, inclusive IDs forjados. Cookies seguros conforme integração, CORS restrito, proteção CSRF quando pertinente, rate limit, validação de payload, SQL parametrizado, CSP, segredos apenas no servidor. Logs sem valores de extratos, CPF, documentos, tokens ou conteúdo bancário. Usar arquivos privados com URL de curta duração ou streaming autorizado. Isolar testes de produção; backup e restauração testados conforme recursos do provedor, sem prometer retenção ilimitada. Documentação e comentários explicativos obrigatórios em português do Brasil, incluindo tabelas, colunas, relacionamentos, regras de negócio, lógica não trivial, dependências e módulos. Identificadores, contratos externos, comandos e sintaxe técnicos preservados. Aplicar integralmente o AGENTS.md e os gates de documentação do plano de implementação.

## 13. Critérios de aceite

| ID | Resultado verificável |
|---|---|
| AC-01 | Dois membros autorizados veem o mesmo orçamento; terceiro não acessa nada. |
| AC-02 | Revogação impede consulta, mutação e obtenção de novos links de arquivos. |
| AC-03 | Transferência interna de R$ 500 não muda receita/despesa nem saldo consolidado. |
| AC-04 | Importar extrato Inter e Nubank reais anonimizado e conferir totais/âncoras. |
| AC-05 | Reimportar arquivo ou repetir confirmação concorrente não duplica fatos. |
| AC-06 | Duas compras legítimas iguais sem ID estável não são descartadas automaticamente. |
| AC-07 | Nota XML e DANFE da mesma chave ficam vinculados à mesma compra. |
| AC-08 | Nota sem parcelas ou pagamento não inventa cronograma nem quitação. |
| AC-09 | Fogão 6x400, primeira parcela paga: 16,67%, R$ 2.000 restantes. |
| AC-10 | Fatura e extrato de pagamento não duplicam despesas; parcial não quita itens arbitrariamente. |
| AC-11 | Reversão de pagamento reduz progresso e corrige indicadores. |
| AC-12 | Recorrência prevista não modifica saldo realizado; confirmação única converte ocorrência. |
| AC-13 | Projeção não soma fatura e parcelas correspondentes duas vezes. |
| AC-14 | Extrato com lacuna ou saldo divergente exige revisão, sem ajuste automático. |
| AC-15 | Arquivo inválido, XML com DTD e acesso cruzado a anexos são rejeitados. |
| AC-16 | Interface responsiva nos dois temas, sem dados fictícios, acessível e sem cache privado. |
| AC-17 | Reversão de lote preserva registros manuais e dependências externas. |
| AC-18 | Nenhuma implantação ou migração altera dados do MotoHub. |

## 14. Governança de desenvolvimento

- AGENTS.md obrigatório na raiz; instruções específicas por módulo somente quando necessárias. Agente coordenador distribui tarefas delimitadas a especialistas de arquitetura/dados, backend, frontend/UX, importadores e QA/segurança; revisão independente para operações financeiras e migrações.
- Superpowers: utilizar brainstorming apenas para mudanças de escopo, writing-plans para mudanças aprovadas, subagent-driven-development ou executing-plans, test-driven-development, systematic-debugging, requesting-code-review e verification-before-completion quando disponíveis. Verificar instalação e nomes reais, não fingir execução. Skills Neon e Cloudflare verificadas conforme ferramentas disponíveis; fallback manual documentado.
- Antialucinação: verificar arquivos, schema, versões, documentação oficial e resultados reais; distinguir confirmado, hipótese e pendência; nunca inventar APIs, dados bancários, testes, credenciais ou recursos. Bloquear ações remotas quando alvo ou capacidade não verificável.
- Economia de tokens: leitura seletiva, busca por símbolo, contexto mínimo suficiente, diffs pequenos, saída de testes resumida, reutilização de decisões registradas; não cortar verificações financeiras ou segurança. Não multiplicar agentes para tarefas triviais.
- Documentação viva: dicionário de dados completo, ERD, migrations com COMMENT ON TABLE/COLUMN e comentários de constraints, índices e funções próprias, contratos de API, matriz de dependências, README de módulos e regras rastreáveis a testes. Atualizar na mesma mudança; CI verifica cobertura de comentários de objetos próprios e revisão documental.

## 15. Fora do escopo e pendências

Sem rateio, gestão de investimentos/patrimônio complexo, metas independentes, Open Finance, integração bancária automática, IA paga, fiscal/contábil empresarial, emissão fiscal, múltiplas moedas, aplicativo nativo ou microserviços. Nome provisório, regime de caixa, CSV contextual, limite de arquivo e política offline são decisões delegadas para v1. Pendências técnicas: arquivos de teste reais anonimizados, confirmação de serviços/cotas Neon, identificação da conta Pages e provisionamento do novo projeto Pages, credenciais por segredo e isolamento de auth/storage. Não implementar nem publicar a partir da mera entrega desta documentação.
