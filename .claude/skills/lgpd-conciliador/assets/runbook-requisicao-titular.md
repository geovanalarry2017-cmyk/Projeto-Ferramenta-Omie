# Runbook — requisição de titular (art. 18)

> Como operador, o produto **não atende titular diretamente**. A requisição chega
> pelo controlador (o cliente). Este runbook cobre o que o time faz ao receber um
> pedido encaminhado por um cliente.

## Princípios

- Só agir sobre pedido de um **cliente identificado** (controlador). Pedido que
  chega direto de um titular: responder que ele deve procurar a empresa
  controladora, e avisar essa empresa se ela for identificável.
- Prazo de auxílio ao controlador: «10» dias úteis (alinhar ao adendo).
- Toda ação escopada por `cliente_id`. Nunca varrer o banco inteiro.
- Registrar a ação (quem executou, quando, qual cliente, qual pedido) **sem** PII
  do titular no registro.

## Confirmação / acesso (art. 18, I e II)

O que o titular pode ver está no `references/mapa-de-dados-pessoais.md`. Gerar
extração escopada:

- execuções e itens de conciliação do `cliente_id` no período pedido;
- filtrar por identificador de contraparte / documento / trecho de descrição
  quando o controlador fornecer o critério.

Entregar ao **controlador** em formato legível (JSON/CSV). O controlador repassa
ao titular. Comando: «`npm run clientes -- exportar <slug> [--filtro …]`» quando o
backlog P1 entregar.

## Correção (art. 18, III)

Dado vem da Omie e do Pluggy — a fonte da verdade é o sistema do cliente. Correção
estrutural é feita lá e reflete na próxima conciliação. Se houver dado gerado só
aqui (ex.: `motivo`, `conta_apelido`) que esteja errado, corrigir por operação
pontual, registrada.

## Eliminação (art. 18, VI)

- **Eliminação de um cliente inteiro** (encerramento / pedido do controlador):
  `npm run clientes -- excluir <slug>` (backlog P1) — hard delete de `cliente`
  com cascade para `cliente_conta`, `conciliacao_execucao` e `conciliacao_item`.
  `desativar` **não** cumpre eliminação (é soft).
- **Eliminação de um titular específico** dentro de um cliente: avaliar com o
  controlador. Apagar linha de `conciliacao_item` quebra a conta de conferência
  do período; o caminho usual é anonimizar a descrição (remover nome/documento,
  manter valor/data) em vez de deletar a linha. Registrar a decisão.
- Exceção: dado que o controlador precisa reter por obrigação legal (fiscal) não
  é eliminado — informar o titular via controlador.

## Oposição / revisão de decisão automatizada (art. 18, §2º; art. 20)

O score da conciliação tem efeito jurídico baixo (organiza fila de revisão
humana). Havendo pedido, explicar o critério (valor, data, documento, similaridade
de texto — ver `matcher.ts`) e revisar manualmente o item.

## Fechamento

Responder ao controlador com o que foi feito e a data. Atualizar o registro de
requisições. Se o pedido revelou uma falha (dado a mais do que deveria, retenção
vencida), abrir item no `docs/lgpd-pendencias.md`.
