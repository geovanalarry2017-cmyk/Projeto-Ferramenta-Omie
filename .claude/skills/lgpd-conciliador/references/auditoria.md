# Auditoria LGPD — checklist de invariantes

Rodar sobre o diff em revisão. Cada invariante diz **o que procurar** e **qual
artigo** sustenta. Finding = bloquear merge até resolver ou registrar exceção
justificada na PR.

Núcleo puro, para referência (não pode ganhar I/O nem redação):
`src/conciliacao/matcher.ts`, `src/conciliacao/normalize.ts`,
`src/oportunidades/analisar.ts`, `src/lib/**`. Limite de I/O onde
minimização/redação devem morar: `src/conciliacao/service.ts`,
`src/pluggy/client.ts`, `src/omie/*.ts`, `src/db/repository.ts`,
`src/http/routes/**`.

---

## 1. PII em log — art. 6º (segurança), art. 46

`src/lib/logger.ts` liga `src/lib/redacao.ts`: `redact` do pino apaga chaves de
segredo (`app_key`, `clientSecret`, `token`, `DATABASE_URL`…), e a redação por
padrão mascara CPF/CNPJ/e-mail/telefone/UUID em qualquer string e apaga inteiro
campo cujo nome termina em `descricao`/`description`/`historico`/`observacao`/
`complemento`. Cobre objeto (`formatters.log`) e mensagem (`hooks.logMethod`).

Ainda é finding quando:

- um campo de texto livre **com outro nome** (ex.: `memo`, `detalhe`, `linha`)
  carrega descrição crua — a rede por sufixo não pega. Renomear para terminar em
  um dos sufixos, ou adicionar o sufixo a `SUFIXOS_TEXTO_LIVRE` em `redacao.ts`
  com teste;
- nome de pessoa **sem** CPF/e-mail junto entra numa string de mensagem — regex
  não pega nome. Não montar a mensagem com o dado;
- objeto cru de transação Pluggy / lançamento Omie é logado inteiro só para
  "ver o que veio" — mesmo redigido, é volume de PII desnecessário no log
  (art. 6º, III). Logar id + contadores.

Ao adicionar campo novo que pode conter PII e vai a log, cobrir com caso em
`tests/redacao.test.ts` ou `tests/logger.test.ts`.

## 2. Escopo por cliente — art. 6º, 46; regra do CLAUDE.md

Toda leitura/escrita em `conciliacao_execucao`, `conciliacao_item`,
`cliente_conta` tem de amarrar `cliente_id`.

Atenção: **`conciliacao_item` não tem `cliente_id`**. O vínculo é
`conciliacao_item.execucao_id → conciliacao_execucao.cliente_id`. Query que
seleciona de `conciliacao_item` por `banco_tx_id`, `status` ou `id` sem passar
pela execução do cliente certo entrega dado de um cliente a outro.

Procurar: `FROM conciliacao_item` / `UPDATE conciliacao_item` sem `JOIN
conciliacao_execucao` nem `WHERE execucao_id IN (… cliente_id = $x)`. Índices
`ix_item_status` e `ix_item_banco_tx_conciliado` são globais — quem os usa tem de
filtrar cliente por fora.

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
titular, base legal e retenção. Sem isso, não mergeia.

## 6. Retenção sem expurgo — art. 15, 16; art. 6º, III

Se o mapa de dados define prazo para uma categoria e não existe job/rotina/comando
que apague o que passou do prazo, é finding. Hoje **não há** expurgo em lugar
nenhum (`scheduler.ts` só agenda conciliação) — enquanto o backlog P1 não entrega
isso, toda categoria "operacional" no mapa está em violação latente; registrar
como dívida aceita e datada, não ignorar.

## 7. Minimização na ingestão — art. 6º, III

Campo lido de resposta Pluggy/Omie e persistido em `conciliacao_item` (ou em
tabela nova) sem uso comprovado em conciliação, DRE ou oportunidades = finding.
Pergunta de revisão: "o matcher ou o DRE leem esse campo?" Se não, não grava.

Minimização/mascaramento roda em `conciliacao/service.ts` ou nos clientes
`pluggy/`/`omie/` — **não** em `normalize.ts` nem em `matcher.ts` (são puros, e o
matcher usa a descrição para pontuar).

## 8. Núcleo puro continua puro — regra do CLAUDE.md

Repetida aqui porque a tentação de "mascarar antes de comparar" empurra código de
redação para `normalize.ts`. `import` de `pg`, `fs`, `http`, `logger` em qualquer
arquivo do núcleo puro é finding.

## 9. Exclusão e exportação — art. 18

Quando o CLI ganhar `excluir` / `exportar` (backlog P1):

- **excluir**: `DELETE FROM cliente WHERE id = $1` com cascade verificado
  (`cliente → cliente_conta`; `cliente → conciliacao_execucao → conciliacao_item`).
  Confirmar que todas as FKs relevantes são `ON DELETE CASCADE` (hoje: sim).
  Registrar linha de auditoria — quem, quando, qual `cliente_id` — **sem** PII de
  titular. Sem soft delete: `desativar` não cumpre eliminação.
- **exportar**: saída escopada por `cliente_id`, formato legível (JSON/CSV).
  Nada de dump global.

## 10. Transporte e superfície — art. 46

- Conexão Neon com `sslmode=require` (checar `DATABASE_URL` do ambiente de
  produção, não do `.env` de dev).
- Nenhuma rota de dado sem `exigirToken`. Rota nova em `http/routes/` sem o
  middleware é finding. (Nota de dívida: `API_TOKEN` é único e compartilhado —
  ver backlog P2.)

## 11. Erro não vaza PII — art. 46

`throw new Error(...)`, `res.status(...).json({ erro })` e o campo
`conciliacao_execucao.erro` não podem conter descrição de transação, linha de
extrato, credencial ou `DATABASE_URL`. Mensagem de erro descreve **o quê** falhou,
não **com qual dado**.

---

## Saída da auditoria

Reportar como o `/code-review` faz: arquivo:linha, invariante violada, artigo,
cenário concreto de vazamento/violação. Sem finding: dizer que os 11 invariantes
passaram no diff revisado.
