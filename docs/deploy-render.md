# Deploy da Fase 1 no Render

Passo a passo do primeiro deploy. O `render.yaml` na raiz é um **Blueprint**: o
Render lê ele e cria o serviço já configurado. Este documento cobre o que o
arquivo não faz sozinho — os segredos, o banco de produção e a conferência.

Contexto que não muda com o deploy:

- **Ainda não há cliente real.** O sistema sobe com o banco vazio. Nenhum dado
  pessoal é tratado até alguém rodar `clientes -- criar` + `clientes -- aceite`
  (ver passo 7). O código recusa ativar cliente sem o aceite do adendo LGPD
  registrado.
- **Os segredos de desenvolvimento não vão para produção.** `CREDENCIAIS_CHAVE`
  e `API_TOKEN` de produção são novos, gerados no passo 2.

---

## Pré-requisitos

- Conta no [Render](https://render.com) e no [Neon](https://neon.tech).
- Conta no GitHub (o repositório vai privado).
- O repositório local na branch `master`, `npm run typecheck` e `npm test`
  verdes.

---

## Passo 1 — Banco de produção no Neon

1. No Neon, **New Project**. Região: **AWS us-west-2 (Oregon)** — a mesma do
   `region: oregon` do `render.yaml`. Banco na mesma região do serviço evita
   latência a cada query e transferência entre regiões.
2. Copie a connection string (**Connection Details** → *Pooled connection*).
3. Confirme que ela termina com **`?sslmode=require`**. Se não tiver, acrescente.
   Sem isso o serviço **não sobe** em produção (`NODE_ENV=production` liga a
   checagem em `src/config/env.ts`).
4. Guarde a string. Ela é a `DATABASE_URL` do passo 4.

Não rode migration agora — o `preDeployCommand` (`node dist/db/migrate.js`) roda
sozinho no primeiro deploy e em todos os seguintes. As migrations são
idempotentes (tabela `schema_migrations`).

---

## Passo 2 — Gerar os segredos de produção

Dois valores novos, **diferentes** dos de desenvolvimento:

```sh
# CREDENCIAIS_CHAVE — 32 bytes em hex. Cifra as credenciais Omie/Pluggy dos
# clientes. Se for perdida, o que estiver cifrado no banco fica irrecuperável.
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# API_TOKEN — protege o disparo de conciliação via HTTP e o dashboard.
node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"
```

Guarde os dois num gerenciador de senhas. Eles não ficam no repositório nem no
`render.yaml`.

---

## Passo 3 — Repositório privado no GitHub

1. Crie um repositório **privado** (o histórico de sessões e os fixtures não
   podem ir para um repo público).
2. Aponte o remote e suba a `master`:

   ```sh
   git remote add origin git@github.com:<voce>/<repo>.git
   git push -u origin master
   ```

Confira que `.env` **não** está entre os arquivos (o `.gitignore` já cobre; o
repositório sempre esteve limpo).

---

## Passo 4 — Criar o serviço no Render

1. Render → **New** → **Blueprint**.
2. Conecte a conta do GitHub e escolha o repositório. O Render encontra o
   `render.yaml` e mostra o serviço `omie-orquestrador` (Web, plano Starter,
   Oregon).
3. Em **Environment Variables**, preencha os três marcados como *sync: false*:
   | Variável | Valor |
   |---|---|
   | `DATABASE_URL` | connection string do passo 1 (com `?sslmode=require`) |
   | `CREDENCIAIS_CHAVE` | hex do passo 2 |
   | `API_TOKEN` | token do passo 2 |

   As demais (`NODE_ENV`, `OMIE_BASE_URL`, tolerâncias, `CRON_ATIVO=false`…) já
   vêm do `render.yaml`.
4. **Apply** / **Create**. O primeiro deploy começa.

---

## Passo 5 — Acompanhar o primeiro deploy

Na aba **Logs**, na ordem:

1. **Build** — `npm ci && npm run build` (compila e copia as migrations para
   `dist/db/migrations`).
2. **Pre-Deploy** — `node dist/db/migrate.js`. Deve listar
   `migration aplicada` para `001`, `002` e `003` e terminar com
   `migrations concluidas`.
3. **Deploy / Start** — `node dist/index.js` → `servidor no ar`. O log de cron
   diz `cron desativado (CRON_ATIVO=false)` — é o esperado.
4. **Health check** — o Render chama `/health` até responder `200`. Fica
   **Live** quando responde `{ "status": "ok", "banco": "ok" }`.

Se parar no Pre-Deploy: quase sempre é `DATABASE_URL` errada ou sem
`sslmode=require`.

---

## Passo 6 — Conferência pós-deploy

Na URL pública do serviço (`https://omie-orquestrador.onrender.com` ou similar):

- `GET /health` → `{ "status": "ok", "banco": "ok" }`.
- `/` abre o dashboard. O rodapé da lateral mostra o link **Política de
  Privacidade** (rascunho) e "Encarregado (DPO): a definir".
- `GET /clientes` com o header `X-API-Token: <API_TOKEN>` → `[]` (banco vazio).
- Sem o header, a mesma rota → `401`. É o esperado.

Se o dashboard abrir com erro vago ("algo deu errado", tela em branco): antes de
mexer em credencial, desligue a tradução automática do navegador e recarregue —
ela reescreve o DOM e quebra a página.

---

## Passo 7 — Primeiro cliente e o cron

Só quando houver um cliente real, com o adendo LGPD assinado:

```sh
# Localmente, apontando para o banco de PRODUÇÃO (DATABASE_URL de produção no
# shell), ou por um shell do Render:
npm run clientes -- criar --slug <slug> --nome "<Razão Social>"
npm run clientes -- aceite --cliente <slug> --versao <versão do adendo assinado>
npm run clientes -- contas  --cliente <slug> --item <itemId do Pluggy>
npm run clientes -- mapear  --cliente <slug> --conta <accountId> --omie <nCodCC>
```

Rode uma conciliação manual de um período curto e confira os números (a conta de
caixa fecha com o DRE — ver `CLAUDE.md`). **Só depois disso** vale ligar o cron:
em **Environment** no Render, `CRON_ATIVO=true`, e salvar (dispara um redeploy).

---

## Notas

- **autoDeploy** está `true`: todo push em `master` redeploya. As migrations
  rodam no Pre-Deploy antes de a instância nova receber tráfego.
- **Rollback**: aba **Deploys** → **Rollback** para a versão anterior. Não há
  down-migration — mudança de schema é sempre para frente.
- **Plano Starter** (não free): sem cold start. O `/health` ainda serve de alvo
  para um ping externo se quiser monitorar de fora.
- **Perder `CREDENCIAIS_CHAVE`** de produção torna as credenciais dos clientes
  irrecuperáveis — seria preciso recadastrar todos. Trocá-la sem re-cifrar tem o
  mesmo efeito.
