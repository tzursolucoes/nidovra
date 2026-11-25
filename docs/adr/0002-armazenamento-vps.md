# ADR 0002 — Documentos privados no VPS

**Decisão de 25/11/2026.** Armazenar os documentos originais em um bucket privado do Garage no VPS do proprietário. Este ADR atualiza o destino dos documentos definido no [ADR 0001](0001-infraestrutura-hospedada.md). A SPA continua no Cloudflare Pages, a API Hono continua no Cloudflare Workers e o banco e a identidade permanecem no projeto Neon do Nidovra em São Paulo.

## Motivo

A ativação do R2 na conta exige cadastro de um meio de pagamento. O VPS já está disponível ao proprietário e permite manter o contrato de armazenamento compatível com S3 por HTTPS. O Neon não oferece Object Storage em `aws-sa-east-1`. [Regiões do Neon](https://neon.com/docs/introduction/regions)

## Contrato e operação

- A API autoriza cada acesso pela sessão e pelo vínculo com a família. O Garage recebe as operações via HTTPS, autenticadas com uma chave S3 própria e limitada ao bucket. As credenciais ficam no gerenciador de segredos do Worker.
- O PostgreSQL guarda metadados e o vínculo dos arquivos com as famílias. O Garage guarda os arquivos originais. Use volume persistente e mantenha cópia verificável fora do VPS. Um Garage em nó único opera sem replicação. [Garage em nó único](https://garagehq.deuxfleurs.fr/documentation/quick-start/)
- Teste as operações S3 utilizadas com o runtime do Worker, o isolamento entre famílias e a restauração de backup antes de ativar uploads. Preserve o serviço sem acesso anônimo.

## Estado da entrega

O proprietário informou o acesso administrativo, registrado em [Operação](../operations.md#vps-de-documentos). Conectividade, espaço, domínio, TLS, bucket e integração com o Worker ainda precisam ser verificados. A implementação do login pode avançar enquanto o armazenamento é preparado.
