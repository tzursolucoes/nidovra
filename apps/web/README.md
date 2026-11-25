# Aplicação web Nidovra

A SPA usa Vue 3, TypeScript e Vite. A entrada `src/main.ts` monta a interface inicial em português brasileiro. O navegador acessa a API local pelo proxy de desenvolvimento de `/api` para `127.0.0.1:3001`. A compilação gera arquivos estáticos em `dist/`.

A interface inicial ainda não consulta dados nem grava estado. Não há contratos de UI autenticada, tabelas acessadas ou cache de dados. Execute `pnpm typecheck` e `pnpm build` da raiz. Para verificar o fallback local, inicie `pnpm dev` e abra uma rota sem arquivo correspondente no host web.
