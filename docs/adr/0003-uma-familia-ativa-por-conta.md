# ADR 0003 — Uma família ativa por conta

## Decisão

Cada conta verificada do Nidovra pode participar de uma família ativa por vez. O administrador ativo pode alterar o nome da família existente. Vínculos encerrados preservam o histórico, permitindo ingressar em outro espaço após o encerramento do vínculo ativo. A transferência de titularidade continua sujeita à regra FAM-04.

## Implementação

O Neon Managed Better Auth resolve a identidade estável da conta. A migração `001a_identity_single_family.sql` usa um índice único parcial em `memberships.auth_user_id` para impedir dois vínculos ativos, inclusive em solicitações simultâneas. O controle usa a conta verificada e a aceitação ainda exige o e-mail do destinatário. O Nidovra mantém a responsabilidade do provedor pela unicidade do e-mail.

A API aplica a regra tanto na criação de família quanto na aceitação de convite. Quando a aceitação conflita com um vínculo ativo, a transação preserva o código de convite. Ao gerar um código, o administrador não recebe informações sobre eventual participação do destinatário em outro espaço.

## Dados existentes

A migração aborta se encontrar contas em mais de uma família, preservando as linhas e os vínculos existentes. Qualquer resolução de conflitos requer identificar as famílias envolvidas e confirmar a escolha do titular. Nenhuma limpeza automática é executada.
