# Deploy do visualizador no Render

Passo a passo do primeiro deploy. O `render.yaml` na raiz é um **Blueprint**: o
Render lê ele e cria o serviço já configurado. Este documento cobre o que o
arquivo não faz sozinho — os segredos, o banco de produção e a conferência.

Contexto que não muda com o deploy:

- **Ainda não há cliente real.** O sistema sobe com o banco vazio. Nenhum dado
  pessoal é tratado até alguém rodar `clientes -- criar` + `clientes -- aceite`
  (ver passo 7). O código recusa ativar cliente sem o aceite do adendo LGPD
  registrado. Mesmo depois disso, o Postgres não guarda dado de transação
  nenhum — DRE, fluxo de caixa e oportunidades são buscados na Omie a cada
  consulta.
- **Os segredos de desenvolvimento não vão para produção.**
  `CREDENCIAIS_CHAVE`, `SESSAO_CHAVE` e `API_TOKEN` de produção são novos,
  gerados no passo 2.

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

Não rode migration agora — ela roda sozinha a cada start do servidor (ver passo
5). O plano Free não suporta `preDeployCommand`, então a migration entra no
início do `startCommand`; é idempotente (tabela `schema_migrations`), então
rodar em todo boot é seguro.

---

## Passo 2 — Gerar os segredos de produção

Dois valores novos, **diferentes** dos de desenvolvimento:

```sh
# CREDENCIAIS_CHAVE — 32 bytes em hex. Cifra a App Key/Secret da Omie de cada
# cliente. Se for perdida, o que estiver cifrado no banco fica irrecuperável.
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# SESSAO_CHAVE — 32 bytes em hex, mesmo comando. Assina o cookie de login dos
# usuários. Perdê-la só desloga todo mundo — nenhuma credencial se perde.
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# API_TOKEN — para automação/scripts internos via header X-API-Token (não é
# o que o dashboard usa; o dashboard loga por usuário).
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
   `render.yaml` e mostra o serviço `omie-orquestrador` (Web, plano Free,
   Oregon). Duas pegadinhas já vistas nessa tela:
   - Se o `render.yaml` pedir `plan: starter`, o Render exige cartão cadastrado
     antes de provisionar, mesmo com uso baixo — usar `free` evita essa tela.
   - O plano Free **não suporta `preDeployCommand`** — se o Blueprint reclamar
     disso, é sinal de que o `render.yaml` do repo ainda tem essa chave; a
     migration precisa estar embutida no `startCommand` (já é o caso na versão
     atual do arquivo).
3. Em **Environment Variables**, preencha os quatro marcados como *sync: false*:
   | Variável | Valor |
   |---|---|
   | `DATABASE_URL` | connection string do passo 1 (com `?sslmode=require`) |
   | `CREDENCIAIS_CHAVE` | hex do passo 2 |
   | `SESSAO_CHAVE` | hex do passo 2 |
   | `API_TOKEN` | token do passo 2 |

   As demais (`NODE_ENV`, `OMIE_BASE_URL`, `LOG_LEVEL`) já vêm do `render.yaml`.
4. **Apply** / **Create**. O primeiro deploy começa.

---

## Passo 5 — Acompanhar o primeiro deploy

Na aba **Logs**, na ordem:

1. **Build** — `npm ci --include=dev && npm run build` (compila e copia as
   migrations para `dist/db/migrations`). O `--include=dev` é necessário porque
   `NODE_ENV=production` faria o `npm ci` pular as devDependencies (TypeScript
   e os `@types/*`), e o `tsc` quebraria por falta de tipo.
2. **Deploy / Start** — `node dist/db/migrate.js && node dist/index.js`. O log
   deve listar `migration aplicada` para `001` a `005`, terminar com
   `migrations concluidas`, e então `servidor no ar`.
3. **Health check** — o Render chama `/health` até responder `200`. Fica
   **Live** quando responde `{ "status": "ok", "banco": "ok" }`.

Se o start morrer antes de "servidor no ar": quase sempre é `DATABASE_URL`
errada ou sem `sslmode=require` — a migration falha e o `&&` impede o servidor
de subir.

---

## Passo 6 — Conferência pós-deploy

Na URL pública do serviço (`https://omie-orquestrador.onrender.com` ou similar):

- `GET /health` → `{ "status": "ok", "banco": "ok" }`.
- `/` abre a tela de login. O rodapé da lateral mostra o link **Política de
  Privacidade** (rascunho) e o encarregado (DPO).
- `GET /clientes` sem cookie de sessão → `401`. É o esperado — nenhum cliente
  nem usuário existe ainda no banco de produção. Cadastre o primeiro com
  `npm run clientes -- criar`, `clientes -- aceite` e `usuarios -- criar`
  (localmente, apontando a `DATABASE_URL` para a de produção) e faça login em
  `/` com o e-mail/senha desse usuário.

Se o dashboard abrir com erro vago ("algo deu errado", tela em branco): antes de
mexer em credencial, desligue a tradução automática do navegador e recarregue —
ela reescreve o DOM e quebra a página.

---

## Passo 7 — Primeiro cliente

Só quando houver um cliente real, com o adendo LGPD assinado:

```sh
# Localmente, apontando para o banco de PRODUÇÃO (DATABASE_URL de produção no
# shell), ou por um shell do Render:
npm run clientes -- criar  --slug <slug> --nome "<Razão Social>"
npm run clientes -- aceite --cliente <slug> --versao <versão do adendo assinado>
```

Depois disso o cliente aparece em `GET /clientes` e o dashboard já busca DRE,
fluxo de caixa e oportunidades direto na conta Omie dele — não há passo de
mapear conta nem job para ligar.

---

## Notas

- **autoDeploy** está `true`: todo push em `master` redeploya. As migrations
  rodam a cada start (parte do `startCommand`), antes do servidor escutar.
- **Rollback**: aba **Deploys** → **Rollback** para a versão anterior. Não há
  down-migration — mudança de schema é sempre para frente.
- **Plano Free**: dorme após ~15 min sem requisição; a próxima leva ~30s-1min
  para acordar, sem perda de dado (o banco é serviço separado). Um monitor
  externo (UptimeRobot etc.) batendo em `/health` periodicamente evita isso, se
  incomodar. Trocar `plan: free` para `plan: starter` no `render.yaml` quando
  valer a pena pagar (~US$ 7/mês) por ficar sempre no ar.
- **Perder `CREDENCIAIS_CHAVE`** de produção torna as credenciais dos clientes
  irrecuperáveis — seria preciso recadastrar todos. Trocá-la sem re-cifrar tem o
  mesmo efeito.
