# Dependências diretas

| Pacote | Versão | Licença | Módulo | Finalidade |
|---|---|---|---|---|
| pnpm | 11.25.0 | MIT | Workspace | Instalação e execução de comandos por pacote |
| `@types/node` | 24.19.4 | MIT | Workspace | Tipos de APIs Node.js |
| TypeScript | 6.0.3 | Apache-2.0 | Workspace | Tipagem estrita e compilação da API |
| Vitest | 5.1.2 | MIT | API e banco | Testes automatizados dos contratos do bootstrap |
| Hono | 4.13.22 | MIT | API | Roteamento HTTP e CORS |
| `@hono/node-server` | 2.1.11 | MIT | API | Servidor Hono sobre Node.js no fluxo local |
| `pg` | 8.23.1 | MIT | Identidade e família | Conexões e transações PostgreSQL |
| `@types/pg` | 8.23.1 | MIT | Identidade e família | Tipagem do cliente PostgreSQL |
| Vue | 3.5.46 | MIT | Web | Renderização de componentes |
| Vite | 8.3.8 | MIT | Web | Servidor de desenvolvimento e compilação da SPA |
| `@vitejs/plugin-vue` | 6.0.11 | MIT | Web | Compilação de componentes `.vue` |
| `vue-tsc` | 3.3.14 | MIT | Web | Verificação de tipos dos componentes |

O `pnpm-lock.yaml` fixa também as resoluções transitivas. As versões e licenças acima correspondem aos manifestos publicados no registro npm.
