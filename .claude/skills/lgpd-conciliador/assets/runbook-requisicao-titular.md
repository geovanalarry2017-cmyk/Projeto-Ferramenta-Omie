# Runbook — requisição de titular (art. 18)

> Como operador, o produto **não atende titular diretamente**. A requisição chega
> pelo controlador (o cliente). Este runbook cobre o que o time faz ao receber um
> pedido encaminhado por um cliente.

## Princípios

- Só agir sobre pedido de um **cliente identificado** (controlador). Pedido que
  chega direto de um titular: responder que ele deve procurar a empresa
  controladora, e avisar essa empresa se ela for identificável.
- Prazo de auxílio ao controlador: 10 dias úteis (mesmo prazo do adendo, §10).
- Toda ação escopada por `cliente_id`. Nunca varrer o banco inteiro.
- Registrar a ação (quem executou, quando, qual cliente, qual pedido) **sem** PII
  do titular no registro.

## Confirmação / acesso (art. 18, I e II)

O que o titular pode ver está no `references/mapa-de-dados-pessoais.md`. Hoje o
produto **não guarda histórico** — DRE, fluxo de caixa e oportunidades são
buscados na Omie a cada consulta e nunca persistidos. Na prática:

- rodar a mesma consulta que o dashboard faria (`GET /clientes/:cliente/dre`
  etc.) para o período pedido, e entregar o resultado ao **controlador**;
- se o pedido for sobre um dado específico de cadastro (nome, documento), o
  caminho mais direto costuma ser o controlador consultar a própria Omie —
  ela é a fonte, não o produto.

Entregar ao **controlador** em formato legível (JSON/CSV). O controlador repassa
ao titular. Comando: «`npm run clientes -- exportar <slug> [--filtro …]`» quando o
backlog P1 entregar.

## Correção (art. 18, III)

Dado vem da Omie — é a fonte da verdade. Correção é feita lá e reflete na
próxima consulta (não há cópia local para corrigir).

## Eliminação (art. 18, VI)

- **Eliminação de um cliente inteiro** (encerramento / pedido do controlador):
  `npm run clientes -- excluir <slug>` (backlog P1) — `DELETE FROM cliente`.
  `cliente` não tem mais tabela filha, então não há cascade a verificar.
  `desativar` **não** cumpre eliminação (é soft).
- **Eliminação de um titular específico** (cliente/fornecedor do controlador):
  não há linha local para apagar — o dado vive só na Omie do controlador.
  Encaminhar o pedido a ele.
- Exceção: dado que o controlador precisa reter por obrigação legal (fiscal) não
  é eliminado — informar o titular via controlador.

## Fechamento

Responder ao controlador com o que foi feito e a data. Atualizar o registro de
requisições. Se o pedido revelou uma falha (dado a mais do que deveria, retenção
vencida), abrir item no `docs/lgpd-pendencias.md`.
