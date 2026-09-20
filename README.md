# Omie — Backend orquestrador

Backend que fica **entre a Omie e o cliente**, funcionando como visualizador de
dados financeiros: DRE, fluxo de caixa e mapa de oportunidades a partir do que
já está cadastrado na Omie. Vendas, compras, estoque e marketplaces continuam
na Omie e não são tocados aqui. Não escreve nada de volta — só lê, apura e
reporta.

**É um produto multi-cliente.** Cada cliente tem sua própria conta Omie e seus
próprios dados, isolados dos demais. Nada de credencial de cliente em variável
de ambiente: ela vive **cifrada no banco**.

O briefing completo do projeto está em
[`projeto-omie-integracoes.md`](./projeto-omie-integracoes.md) — esta fase
entrega a parte de visualização; escrita de lançamento, WhatsApp e assinatura
digital vêm depois (ver "Ainda não feito").

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

Ele pergunta a App Key e o App Secret da Omie e as cifra antes de gravar. As
credenciais são pedidas no prompt, não por argumento — argumento de linha de
comando fica no histórico do shell.

O cliente **nasce inativo**. Para processá-lo é preciso registrar o aceite do
adendo LGPD de operador:

```bash
npm run clientes -- aceite --cliente acme --versao v1
```

Sem isso, `ativar` recusa e as rotas de dados respondem `403`. A data do aceite é
gravada na hora; `--versao` é a versão do documento assinado.

### 2. Suba o servidor e veja os dados

```bash
npm run dev
```

Acesse `/` — o dashboard já busca DRE, fluxo de caixa e mapa de oportunidades
direto na conta Omie do cliente cadastrado. Sem conta Omie de teste com dado à
mão, `npm run demo` sobe a mesma tela com números fictícios (ver "Dashboard de
DRE" mais abaixo).

## Comandos

| Comando | O que faz |
|---|---|
| `npm run clientes -- listar` | Lista os clientes. |
| `npm run clientes -- criar --slug X --nome "Y"` | Cadastra cliente (inativo) e pede a credencial Omie. |
| `npm run clientes -- aceite --cliente X --versao V` | Registra o aceite do adendo LGPD e ativa o cliente. |
| `npm run clientes -- ativar\|desativar --cliente X` | Liga/desliga o cliente na API. |
| `npm run demo` | Dashboard com dados fictícios, sem banco nem Omie. |
| `npm run dev` | Servidor com reload. |
| `npm run build` / `npm start` | Compila e roda a versão de produção. |
| `npm test` | Testes offline, sem credencial nem banco. |
| `npm run typecheck` | Checa tipos de `src`, `tests` e `scripts`. |
| `npm run db:migrate` | Aplica migrations pendentes. |

## API

Tudo exceto `/health` exige o header `X-API-Token`, e toda rota de dados é
escopada por cliente.

| Rota | Descrição |
|---|---|
| `GET /health` | Healthcheck: testa o banco (`SELECT 1`). O Render usa como health check do deploy; também serve de alvo para um ping de monitoração externo. |
| `GET /clientes` | Lista os clientes (sem credenciais). |
| `GET /clientes/:cliente/dre` | DRE do período. `?de=&ate=&regime=caixa\|competencia`. |
| `GET /clientes/:cliente/dre-mensal` | O mesmo DRE em matriz, uma coluna por mês (máx. 36). Mesmos parâmetros. |
| `GET /clientes/:cliente/oportunidades` | Mapa de oportunidades do período. `?de=&ate=`. Sempre regime de caixa. |
| `GET /clientes/:cliente/fluxo-caixa` | Entradas, saídas e saldo acumulado por dia. `?de=&ate=`. |
| `POST /clientes/:cliente/cadastros/recarregar` | Descarta o cache do plano de contas (10 min). |

O dashboard em si é servido na raiz (`/`) pelo mesmo processo.

## Dashboard de DRE

Acesse `/` com o servidor no ar. Escolha cliente, período e regime. O botão de
sol/lua no canto superior alterna claro e escuro; a escolha fica salva no
navegador e vence a preferência do sistema operacional nas duas direções. Sem
escolha salva, vale o sistema.

Sete visualizações, ligadas e desligadas nos chips acima dos painéis. A escolha
fica salva no navegador — dá para montar a tela com o que cada cliente quer ver:

| Visualização | Responde |
|---|---|
| **Fluxo de caixa** | Como o dinheiro entrou e saiu ao longo do tempo, com o saldo acumulado. Agrupa por dia até ~10 semanas e por mês acima disso — um ano em barras diárias não se lê. |
| **Saldo acumulado** | A mesma curva sozinha, sem as barras em volta. |
| **Entradas × saídas** | Os dois lados lado a lado, sem a linha de saldo por cima. |
| **Da receita ao resultado** | Cascata: cada barra parte de onde a anterior terminou, e a soma fecha exata no resultado do período. |
| **Para onde o dinheiro vai** | As dez maiores linhas que subtraem, da maior para a menor. |
| **Composição das saídas** | Parte-do-todo em rosca: as cinco maiores fatias e o resto em "Outros" — nunca mais de seis, senão as fatias vizinhas borram. |
| **DRE mês a mês** | Matriz com uma coluna por mês e mapa de calor, mais o total do período fixo à direita. Exporta em CSV. |

A matriz vem de `GET /clientes/:cliente/dre-mensal`, que busca os movimentos
**uma vez** e fatia por mês em memória — apurar mês a mês chamando a Omie doze
vezes seriam doze rodadas numa API que limita taxa por app. Ela só é buscada
quando o painel está ligado, e a soma das colunas bate com o DRE do período
inteiro (há teste para isso).

O mapa de calor é de tom fraco de propósito, e o valor está escrito em cada
célula: a cor é dica de varredura para achar o mês fora da curva, não a
informação.

As cores passaram por validador (contraste, faixa de luminosidade e separação
sob daltonismo). Verde x vermelho é inevitavelmente fraco sob protanopia, então
**a leitura nunca depende só da cor**: entrada fica acima do eixo e saída
abaixo, cada barra da cascata traz o valor escrito na ponta, e a tabela do DRE
diz o mesmo em texto.

**Regime de caixa** conta o que foi efetivamente pago (`nValPago`, data de
pagamento). **Competência** conta o que foi faturado (`nValorTitulo`, data de
emissão). Um título de R$ 1.000 com R$ 400 pagos aparece como 400 no caixa e
1.000 na competência.

### Ver o dashboard com números fictícios

```bash
npm run demo        # http://localhost:3001
```

Sobe o dashboard **de verdade** alimentado por dados fabricados: sem banco, sem
credencial, sem `.env` e sem uma única chamada à Omie. Serve para conferir o
relatório enquanto a conta Omie de desenvolvimento ainda está vazia.

O que é substituído é só a *fonte* dos dados —
[`montarDRE` e `montarFluxoDeCaixa`](./src/dre/montar.ts) são os mesmos que o
servidor real chama. Se a conta fechar errado no demo, fecha errado em produção.

Os números são **determinísticos**: o mesmo período devolve sempre os mesmos
valores, então dá para conferir conta e comparar entre execuções. Os dados
cobrem de propósito os casos que valem olhar: títulos em aberto (aparecem na
competência e não no caixa), pagamento parcial, rateio entre categorias,
despesa fixa mensal e categorias **sem vínculo de DRE**, que acionam o painel
"Movimentos fora do DRE".

Tudo isso vive em `scripts/`, nunca em `src/` — não existe caminho pelo qual um
número fake chegue ao relatório de um cliente. A página ganha uma faixa de
aviso injetada na resposta; `public/index.html` fica intocado.

**Como conferir se o número está certo:** no regime de caixa, o saldo do fluxo
de caixa mais o total do painel "Movimentos fora do DRE" tem que dar exatamente
o resultado do DRE. São dois caminhos independentes sobre os mesmos movimentos,
e eles só fecham se sinal, rateio e recorte de data estiverem certos nos dois.
Foi essa conta que revelou o rateio de título pago parcialmente entrando no DRE
de caixa pelo valor cheio.

## Mapa de Oportunidades

A segunda aba da barra lateral. Lê o DRE, o DRE mês a mês e o fluxo de caixa do
período e devolve **o que merece atenção**, cada achado com o número que o
sustenta e o que fazer a respeito — sem a linha "o que fazer" é diagnóstico, não
oportunidade.

O que ele procura hoje:

| Achado | Quando aparece |
|---|---|
| Dinheiro fora do DRE | Há categoria sem vínculo de DRE, ou seja, resultado incompleto. |
| Caixa ficou negativo | O saldo acumulado passou abaixo de zero em algum dia. |
| Meses no vermelho | Algum mês do período fechou negativo. |
| Despesa acima do normal | Uma linha subiu 40% ou mais contra a média dos meses anteriores. |
| Margem caiu | A margem do último mês caiu 5 pontos ou mais contra a média. |
| Receita concentrada | Uma linha responde por mais da metade da receita. |
| Onde a negociação rende mais | As três maiores linhas de saída e quanto concentram. |

**Sempre em regime de caixa**, e o seletor de regime some nessa aba: a análise
fala do dinheiro que de fato entrou e saiu, que é sobre o que dá para agir. Um
alerta de "caixa negativo" apurado por competência seria sobre dinheiro que
ninguém viu.

**Com menos de três meses, as análises de tendência não rodam** e a tela diz
isso. Afirmar que uma despesa "subiu" comparando dois meses é confundir variação
normal com tendência — e um alerta falso custa a confiança nos verdadeiros.

Os limiares são constantes nomeadas no topo de
[`src/oportunidades/analisar.ts`](./src/oportunidades/analisar.ts), para dar
para discutir e ajustar sem caçar número no meio do código. A função é pura e
testada: cada regra é um julgamento sobre o negócio do cliente, e julgamento sem
teste vira palpite.

### A armadilha do vínculo categoria → DRE ⚠️

Categoria e conta do DRE usam **numerações parecidas e independentes**. Na conta
de teste, `1.01.02` é *"Clientes - Serviços Prestados"* como categoria e
*"Impostos"* como conta do DRE. Usar o código da categoria como se fosse o do
DRE colocaria receita na linha de imposto — e ela seria **subtraída**, calada.

O único vínculo válido é o campo `codigo_dre` da categoria, e ele é opcional na
Omie. Na conta de teste, **49 de 142** categorias têm o vínculo preenchido.

Por isso o DRE nunca descarta o que não consegue classificar: movimentos de
categorias sem vínculo aparecem no painel **"Movimentos fora do DRE"**, com
valor e quantidade. *Um DRE que fecha escondendo dinheiro é pior que um que
avisa estar incompleto.* Para corrigir, vincule a categoria a uma conta do DRE
no cadastro da Omie.

### Como o sinal funciona

Vem da própria Omie: folhas (`totalizaDRE = "N"`) têm `sinalDRE` `+` ou `-`;
totalizadores valem a soma dos filhos, que já chegam assinados. Assim "Custos"
(filhos todos `-`) vira negativo e `Lucro Bruto = Receita + Receita Indireta +
Custos` fecha somando, sem regra especial em lugar nenhum.

## Decisões de projeto

- **Credenciais de cliente cifradas em repouso** (AES-256-GCM, chave no
  ambiente). Um dump do banco vazado não pode virar acesso ao ERP de todos os
  clientes de uma vez. GCM autentica além de cifrar: dado adulterado falha na
  decifragem em vez de devolver lixo.
- **Nenhuma rota de dado sem escopo de cliente.** Toda consulta de DRE, fluxo
  de caixa ou oportunidades passa pelo `resolverCliente` (middleware), que
  resolve o cliente pelo slug da rota — não existe versão "sem cliente" dessas
  consultas.
- **Fila de chamadas da Omie por App Key**, não global: o limite de taxa é por
  app, e uma fila única faria um cliente esperar pelo outro.
- **Dinheiro em centavos inteiros.** Float faz `0.1 + 0.2 !== 0.3` e produz
  divergência onde não existe.
- **Datas como string `AAAA-MM-DD`.** O banco manda UTC, a Omie fala Brasília;
  comparar `Date` faria lançamento da meia-noite cair no dia errado.
- **Chamadas à Omie são serializadas** com intervalo mínimo, porque a API limita
  taxa por app e devolve o estouro como erro genérico 5xx.

## Estrutura

```
src/
  config/env.ts        valida o .env no boot e mata o processo se faltar algo
  lib/                 dinheiro, datas, HTTP com retry, cripto, log, adendo LGPD
  clientes/            clientes do produto e sua credencial Omie cifrada
  omie/                cliente (envelope call/app_key/app_secret) e finanças
  dre/                 apuração de DRE, DRE mensal e fluxo de caixa
  http/                Express, rotas escopadas por cliente
  oportunidades/       o que merece atenção nos números, e o que fazer
    analisar.ts        núcleo puro; os limiares são as constantes do topo
  db/                  pool e migrations
  cli/clientes.ts      cadastro de clientes e aceite do adendo LGPD

scripts/
  dados-fake.ts        dados fictícios no formato da Omie (só demonstração)
  servidor-demo.ts     o dashboard real servido com esses dados
```

## Deploy

Hospedagem no [Render](https://render.com) via **Blueprint**: o
[`render.yaml`](./render.yaml) na raiz descreve o serviço e o Render o cria já
configurado. Web Service Node no plano **Free**, região **Oregon**.

O plano Free dorme depois de ~15 min sem requisição; a próxima leva ~30s-1min
para acordar. Não perde dado nenhum — o banco (Neon) é serviço separado e não
dorme junto. Um monitor externo (ex. UptimeRobot) batendo em `/health` de tempos
em tempos evita o cold start, se isso incomodar. Trocar para `plan: starter` no
`render.yaml` quando fizer sentido pagar (~US$ 7/mês) por ficar sempre no ar.

- **Banco:** projeto **Neon de produção**, separado do Neon de desenvolvimento
  que este repositório trata como descartável, na mesma região do serviço. A
  `DATABASE_URL` precisa terminar em **`?sslmode=require`** — com
  `NODE_ENV=production` o boot recusa subir sem TLS no banco
  ([`src/config/env.ts`](./src/config/env.ts)).
- **Segredos:** `DATABASE_URL`, `CREDENCIAIS_CHAVE` e `API_TOKEN` entram como
  `sync: false` — preenchidos uma vez no painel do Render, nunca no arquivo. Os
  de produção são **novos**, gerados na hora; não se reaproveita os de
  desenvolvimento.
- **Migrations:** `preDeployCommand` roda `node dist/db/migrate.js` antes de cada
  troca de instância. São idempotentes (`schema_migrations`).
- **LGPD:** sem cliente cadastrado, o serviço sobe com o banco vazio e não trata
  dado pessoal. Um cliente só passa a ser processado depois de
  `npm run clientes -- aceite --cliente X --versao <adendo>`, que registra o
  aceite do adendo de operador; antes disso ele nasce inativo e as rotas
  respondem `403`.

Passo a passo completo — Neon, repositório privado, painel do Render e
conferência pós-deploy — em [`docs/deploy-render.md`](./docs/deploy-render.md).

## Ainda não feito

Escrita de lançamentos na Omie, envio por WhatsApp e assinatura digital. Nessa
ordem, conforme o briefing.
