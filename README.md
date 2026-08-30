# Omie — Backend orquestrador

Backend que fica **entre a Omie e serviços externos**, cobrindo as lacunas do
módulo financeiro. Vendas, compras, estoque e marketplaces continuam na Omie e
não são tocados aqui.

**É um produto multi-cliente.** Cada cliente tem sua própria conta Omie, sua
própria conta Pluggy e seus próprios dados, isolados dos demais. Nada de
credencial de cliente em variável de ambiente: elas vivem **cifradas no banco**.

**Esta fase entrega só o conciliador bancário automático.** O briefing completo
do projeto está em [`projeto-omie-integracoes.md`](./projeto-omie-integracoes.md).

## O que o conciliador faz

1. Busca o extrato real do banco via Open Finance (Pluggy).
2. Busca os lançamentos do mesmo período na Omie (`ListarExtrato`).
3. Casa os dois lados por valor, data, CPF/CNPJ e descrição.
4. Classifica cada movimento e grava o diagnóstico no Postgres.

| Status | Significa |
|---|---|
| `CONCILIADO` | Valor exato e confiança acima do limiar. |
| `REVISAR` | Casou, mas com diferença de valor (tarifa, juro) ou confiança baixa. |
| `PENDENTE_OMIE` | Está no banco e não achamos lançamento na Omie. |
| `PENDENTE_BANCO` | Está na Omie e não apareceu no extrato do banco. |

**Ele não escreve nada de volta na Omie.** Só lê, classifica e reporta. Criar
lançamento automático é o passo seguinte, e só vale depois que as regras de
match estiverem calibradas — senão o job suja o ERP em volume.

## Começando

```bash
npm install
cp .env.example .env    # DATABASE_URL + CREDENCIAIS_CHAVE
npm run db:migrate
```

> ⚠️ **`CREDENCIAIS_CHAVE` cifra as credenciais de todos os clientes.**
> Perdê-la torna o que está guardado irrecuperável e obriga a recadastrar
> todo mundo. Guarde uma cópia num cofre de senhas antes do primeiro cliente real.

### 1. Cadastre um cliente

```bash
npm run clientes -- criar --slug acme --nome "Acme Ltda"
```

Ele pergunta as quatro credenciais (Omie App Key/Secret, Pluggy Client
ID/Secret) e as cifra antes de gravar. As credenciais são pedidas no prompt, não
por argumento — argumento de linha de comando fica no histórico do shell.

### 2. Ligue as contas bancárias às contas da Omie

```bash
npm run clientes -- contas --cliente acme --item <itemIdDoPluggy>
npm run clientes -- mapear --cliente acme --conta <accountId> --omie <nCodCC> --apelido "Itau PJ"
```

O `itemId` do Pluggy vem do dashboard (Applications > Items) ou do callback do
Pluggy Connect — a API não tem listagem de items.

### 3. Confirme a convenção de sinal da Omie ⚠️

**Faça isso antes de confiar em qualquer resultado.** A documentação da Omie
descreve o campo `cNatureza` apenas como "Natureza da operação", sem listar os
valores possíveis, e não diz se `nValorDocumento` já vem com sinal.

Se a convenção estiver errada, o conciliador troca entrada por saída e **nada
quebra visivelmente** — só o resultado fica errado.

`npm run smoke:omie -- --cliente acme` imprime uma tabela cruzando `cNatureza`
com o sinal observado e diz qual configuração usar. Se aparecer um valor de
`cNatureza` fora de `D`/`P`/`S` (saída) e `C`/`R`/`E` (entrada), ajuste as listas
em [`src/conciliacao/normalize.ts`](./src/conciliacao/normalize.ts) — é o único
lugar onde o sinal é decidido.

### 4. Rode manualmente e confira

```bash
npm run conciliar -- --cliente acme --de 2026-08-01 --ate 2026-08-07 --detalhes
```

Compare o resultado com o extrato real de um período curto. **Só ligue o cron
(`CRON_ATIVO=true`) depois que este passo bater** — ele roda todos os clientes ativos.

## Comandos

| Comando | O que faz |
|---|---|
| `npm run clientes -- listar` | Lista os clientes. |
| `npm run clientes -- criar --slug X --nome "Y"` | Cadastra cliente e pede as credenciais. |
| `npm run clientes -- contas --cliente X [--item Y]` | Mostra contas da Omie e do Pluggy. |
| `npm run clientes -- mapear ...` | Liga uma conta do banco a uma da Omie. |
| `npm run clientes -- ativar\|desativar --cliente X` | Liga/desliga o cliente no cron. |
| `npm run conciliar -- --cliente X --de A --ate B` | Execução manual. `--detalhes` lista o que não fechou. |
| `npm run conciliar -- --todos --de A --ate B` | Todos os clientes ativos, como o cron faz. |
| `npm run dev` | Servidor com reload. |
| `npm run build` / `npm start` | Compila e roda a versão de produção. |
| `npm test` | Testes offline, sem credencial nem banco. |
| `npm run typecheck` | Checa tipos de `src`, `tests` e `scripts`. |
| `npm run db:migrate` | Aplica migrations pendentes. |
| `npm run smoke:omie\|smoke:pluggy -- --cliente X` | Inspeciona os dados crus de um cliente. |

## API

Tudo exceto `/health` exige o header `X-API-Token`, e toda rota de dados é
escopada por cliente.

| Rota | Descrição |
|---|---|
| `GET /health` | Healthcheck (testa o banco). Também serve de alvo para o ping que mantém o free tier do Render acordado. |
| `GET /clientes` | Lista os clientes (sem credenciais). |
| `POST /clientes/:cliente/conciliacao/executar` | Dispara. Corpo opcional `{"de":"AAAA-MM-DD","ate":"AAAA-MM-DD"}`. Responde **202** e processa em background. |
| `GET /clientes/:cliente/conciliacao` | Últimas execuções do cliente. |
| `GET /clientes/:cliente/conciliacao/:id` | Detalhe. Aceita `?status=REVISAR`. |

Pedir uma execução de outro cliente devolve **404**, não os dados dele: a
consulta filtra por `cliente_id`, não só pelo id da execução.

## Calibração

As regras de match não ficam boas de primeira. Todos os limiares são
configuráveis, e o matcher é uma função pura sem I/O — dá para testar variações
com fixtures, rápido, sem tocar em rede.

| Variável | Padrão | Efeito |
|---|---|---|
| `CONCILIACAO_TOLERANCIA_DIAS` | `2` | Defasagem aceita entre a data do banco e a da Omie. |
| `CONCILIACAO_TOLERANCIA_VALOR_CENTAVOS` | `500` | Diferença ainda tratada como o mesmo movimento (tarifa). |
| `CONCILIACAO_SCORE_MINIMO` | `0.6` | Abaixo disso vai para `REVISAR` em vez de `CONCILIADO`. |
| `CONCILIACAO_JANELA_DIAS` | `3` | Quantos dias o job diário reprocessa. |

Como o score é montado (`src/conciliacao/matcher.ts`): valor 40%, data 25%,
CPF/CNPJ 20%, similaridade de descrição 15%. Quando algum lado não informa
documento, o peso dele é redistribuído — senão um par perfeito sem CPF/CNPJ
nunca passaria de 0,80. Documentos conhecidos e **divergentes** derrubam o score
a 40% do valor original.

Se aparecer muito falso `PENDENTE_OMIE`, aumente a tolerância de dias. Se
aparecer par errado, aumente o `SCORE_MINIMO`.

## Decisões de projeto

- **Credenciais de cliente cifradas em repouso** (AES-256-GCM, chave no
  ambiente). Um dump do banco vazado não pode virar acesso ao ERP e ao Open
  Finance de todos os clientes de uma vez. GCM autentica além de cifrar: dado
  adulterado falha na decifragem em vez de devolver lixo.
- **Nenhuma consulta de conciliação sem `cliente_id`.** `buscarExecucao` exige o
  cliente como parâmetro — não existe versão "só pelo id", justamente para não
  bastar incrementar um número na URL para ver o financeiro de outro cliente.
- **Fila de chamadas da Omie por App Key**, não global: o limite de taxa é por
  app, e uma fila única faria um cliente esperar pelo outro no job diário.
- **Falha de um cliente não derruba os outros** no job. Uma credencial expirada
  deixaria todos os demais sem conciliação naquele dia.
- **Dinheiro em centavos inteiros.** Float faz `0.1 + 0.2 !== 0.3` e produz
  divergência onde não existe.
- **Datas como string `AAAA-MM-DD`.** O banco manda UTC, a Omie fala Brasília;
  comparar `Date` faria lançamento da meia-noite cair no dia errado.
- **Atribuição 1:1 no match.** Dois boletos idênticos no mesmo dia casariam
  ambos com a mesma transação, e a conciliação fecharia com um movimento
  fantasma.
- **Direção do dinheiro pelo `type` do Pluggy**, não pelo sinal de `amount` —
  conectores divergem no sinal, mas `type` é consistente.
- **Cada execução é um retrato completo** do período. Reprocessar o mesmo
  intervalo gera uma nova execução com todos os itens, em vez de tentar remendar
  a anterior — o histórico fica auditável e um índice único impede duplicata
  dentro da mesma execução.
- **Chamadas à Omie são serializadas** com intervalo mínimo, porque a API limita
  taxa por app e devolve o estouro como erro genérico 5xx.

## Estrutura

```
src/
  config/env.ts        valida o .env no boot e mata o processo se faltar algo
  lib/                 dinheiro, datas, documentos, HTTP com retry, cripto, log
  clientes/            clientes do produto e suas credenciais cifradas
  omie/                cliente (envelope call/app_key/app_secret) e finanças
  pluggy/              wrapper sobre o SDK oficial, uma instância por cliente
  conciliacao/
    normalize.ts       ⚠️ onde mora toda a decisão de sinal
    matcher.ts         núcleo puro, sem I/O — é o que se calibra
    service.ts         orquestra busca, match e persistência, por cliente
  db/                  pool, migrations e repositório
  jobs/scheduler.ts    cron diário, todos os clientes (desligado por padrão)
  http/                Express, rotas escopadas por cliente
  cli/clientes.ts      cadastro de clientes e mapeamento de contas
  cli/conciliar.ts     execução manual
```

## Ainda não feito

Dashboard de DRE/fluxo de caixa, envio por WhatsApp, assinatura digital,
escrita de lançamentos na Omie e deploy. Nessa ordem, conforme o briefing.
