# Auditoria LGPD — checklist de invariantes

Rodar sobre o diff em revisão. Cada invariante diz **o que procurar** e **qual
artigo** sustenta. Finding = bloquear merge até resolver ou registrar exceção
justificada na PR.

Núcleo puro, para referência (não pode ganhar I/O nem redação):
`src/dre/montar.ts`, `src/oportunidades/analisar.ts`, `src/lib/**`. Limite de
I/O onde minimização/redação devem morar: `src/dre/service.ts`,
`src/oportunidades/service.ts`, `src/omie/*.ts`, `src/http/routes/**`.

---

## 1. PII em log — art. 6º (segurança), art. 46

`src/lib/logger.ts` liga `src/lib/redacao.ts`: `redact` do pino apaga chaves de
segredo (`app_key`, `token`, `DATABASE_URL`…), e a redação por padrão mascara
CPF/CNPJ/e-mail/telefone/UUID em qualquer string e apaga inteiro campo cujo
nome termina em `descricao`/`description`/`historico`/`observacao`/
`complemento`. Cobre objeto (`formatters.log`) e mensagem (`hooks.logMethod`).

Ainda é finding quando:

- um campo de texto livre **com outro nome** (ex.: `memo`, `detalhe`, `linha`)
  carrega texto cru — a rede por sufixo não pega. Renomear para terminar em um
  dos sufixos, ou adicionar o sufixo a `SUFIXOS_TEXTO_LIVRE` em `redacao.ts`
  com teste;
- nome de pessoa **sem** CPF/e-mail junto entra numa string de mensagem — regex
  não pega nome. Não montar a mensagem com o dado;
- objeto cru de lançamento/cadastro da Omie é logado inteiro só para "ver o que
  veio" — mesmo redigido, é volume de PII desnecessário no log (art. 6º, III).
  Logar id + contadores.

Ao adicionar campo novo que pode conter PII e vai a log, cobrir com caso em
`tests/redacao.test.ts` ou `tests/logger.test.ts`.

## 2. Escopo por cliente — art. 6º, 46; regra do CLAUDE.md

Toda rota de dado (`/dre`, `/dre-mensal`, `/fluxo-caixa`, `/oportunidades`,
`/cadastros/recarregar`) passa por `resolverCliente` (middleware), que resolve
o cliente pelo **slug na URL** — não existe caminho de pegar dado de um cliente
informando o id de outro. Rota nova sob `/clientes/:cliente/**` sem esse
middleware é finding.

O cache de cadastros de DRE (`cacheCadastros`, `Map` por `clienteId`, em
`src/dre/service.ts`) é a única estrutura em memória compartilhada entre
requisições — qualquer mudança nele tem de continuar chaveada por `clienteId`.

## 3. Credencial cifrada — art. 46; regra do CLAUDE.md

- Gravação nas colunas de credencial só via `src/lib/cripto.ts`. As colunas são
  `*_cif`; um `INSERT`/`UPDATE` escrevendo valor cru é finding.
- Valor decifrado nunca vai a log, resposta HTTP ou mensagem de erro.
- `CREDENCIAIS_CHAVE` nunca em log, erro, teste ou fixture.
- Comparação de `API_TOKEN` continua em tempo constante (`compararSegredos`).

## 4. Novo host de saída — art. 33, 39

Qualquer `fetch`, `axios`, `new Pool`, cliente SDK ou webhook novo apontando para
host que não está em `references/suboperadores.md`:

1. atualizar a tabela de suboperadores;
2. decidir se é suboperador novo → precisa de autorização do controlador
   (aditivo ao adendo);
3. checar região → transferência internacional?

## 5. Coluna nova de PII — art. 37; princípio da necessidade

Migration em `src/db/migrations/` que adiciona coluna capaz de conter dado
pessoal (texto livre, nome, documento, contato, identificador de pessoa) exige,
na mesma PR, uma linha em `references/mapa-de-dados-pessoais.md` com categoria de
titular, base legal e retenção. Sem isso, não mergeia. (Hoje `cliente` é a
única tabela com dado pessoal — qualquer tabela nova já é, por si, um evento
grande o bastante para revisar toda a skill, não só esta linha.)

## 6. Minimização na resposta — art. 6º, III

Campo lido da Omie e devolvido pela API (DRE, DRE mensal, fluxo de caixa,
oportunidades) sem uso comprovado na tela = finding. Pergunta de revisão: "o
`dre/montar.ts` ou o `oportunidades/analisar.ts` usam esse campo?" Se não, não
devolve.

Minimização roda no limite de I/O (`dre/service.ts`, `oportunidades/service.ts`,
`omie/*.ts`) — **não** em `dre/montar.ts` nem em `oportunidades/analisar.ts`
(são puros).

## 7. Núcleo puro continua puro — regra do CLAUDE.md

`import` de `pg`, `fs`, `http`, `logger` em `src/dre/montar.ts`,
`src/oportunidades/analisar.ts` ou qualquer arquivo de `src/lib/` é finding.

## 8. Exclusão e exportação — art. 18

Quando o CLI ganhar `excluir` / `exportar` (backlog P1):

- **excluir**: `DELETE FROM cliente WHERE id = $1`. `cliente` não tem mais
  tabela filha (sem `cliente_conta`/`conciliacao_*`), então não há cascade a
  verificar. Registrar linha de auditoria — quem, quando, qual `cliente_id` —
  **sem** PII de titular. Sem soft delete: `desativar` não cumpre eliminação.
- **exportar**: saída escopada por `cliente_id`, formato legível (JSON/CSV).
  Nada de dump global.

## 9. Transporte e superfície — art. 46

- Conexão com o Postgres cifrada. `src/config/env.ts` (`superRefine`) recusa o
  boot em `NODE_ENV=production` se a `DATABASE_URL` não tiver
  `sslmode=require|verify-ca|verify-full`. Finding: qualquer mudança que
  afrouxe essa regra ou adicione um caminho de conexão que a contorne.
- Nenhuma rota de dado sem `exigirToken`. Rota nova em `http/routes/` sem o
  middleware é finding. (Nota de dívida: `API_TOKEN` é único e compartilhado —
  ver backlog P2.)

## 10. Erro não vaza PII — art. 46

`throw new Error(...)` e `res.status(...).json({ erro })` não podem conter nome
ou documento vindo da Omie, credencial ou `DATABASE_URL`. Mensagem de erro
descreve **o quê** falhou, não **com qual dado**.

## 11. Adendo LGPD antes do tratamento — art. 39

Nenhum dado pessoal de um cliente é processado antes do aceite do adendo de
operador estar registrado (`cliente.adendo_lgpd_versao` +
`adendo_lgpd_aceito_em`). A regra vive em `src/lib/adendo.ts`
(`adendoLgpdPendente`), consumida por:

- `criarCliente` — cliente nasce `ativo = false`;
- `definirAtivo(id, true)` / CLI `ativar` e `aceite` — recusa se pendente;
- `resolverCliente` (middleware) — 403 em qualquer rota de dado se
  `!cliente.ativo`.

Finding: novo entrypoint que lê/processa dados do cliente (rota, comando,
serviço de DRE/oportunidades) sem passar por um desses gates, ou mudança que
crie cliente já ativo. Recadastro de credenciais no onboarding pode rodar antes
do aceite — não processa dado de titular.

---

## Saída da auditoria

Reportar como o `/code-review` faz: arquivo:linha, invariante violada, artigo,
cenário concreto de vazamento/violação. Sem finding: dizer que os 11 invariantes
passaram no diff revisado.
