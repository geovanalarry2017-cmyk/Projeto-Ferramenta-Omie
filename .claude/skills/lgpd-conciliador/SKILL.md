---
name: lgpd-conciliador
description: >-
  Conformidade LGPD do orquestrador Omie, que atua como OPERADOR de dados
  pessoais em nome de cada cliente (o controlador). Use ao revisar código que
  toca dado pessoal (descrição de transação, CPF/CNPJ, chave PIX, credencial de
  cliente), ao adicionar integração externa ou coluna de banco, ao preparar
  deploy com dados reais, ou quando pedirem política de privacidade, adendo LGPD
  de operador, ROPA, RIPD ou runbook de requisição de titular / de incidente.
---

# LGPD no conciliador Omie

## Postura em uma frase

Este produto é **operador** (LGPD art. 5º, VII). Cada cliente contratante é o
**controlador**: ele define finalidade e meios, contrata Pluggy e Omie, e
responde perante os titulares. O produto trata dado pessoal **só sob instrução
documentada do controlador** (art. 39) e o mínimo para conciliar, apurar DRE e
mapear oportunidades.

Consequências que mudam o que se constrói:

- **Não há consentimento a coletar aqui, nem banner de cookie.** Não existe
  cadastro público (clientes entram pela CLI) e o dashboard não tem rastreador.
  A base legal perante o titular é responsabilidade do controlador — normalmente
  obrigação legal contábil/fiscal (art. 7º, II) + execução de contrato (art. 7º,
  V) + legítimo interesse (art. 7º, IX). Ver [`references/postura.md`](references/postura.md).
- **O que vale é o contrato.** Cada onboarding precisa do adendo LGPD de operador
  assinado — é ele que registra a instrução de tratamento. Template em
  [`assets/adendo-lgpd-operador.md`](assets/adendo-lgpd-operador.md). O aceite é
  registrado no banco (`cliente.adendo_lgpd_versao` / `adendo_lgpd_aceito_em`,
  via `npm run clientes -- aceite`); enquanto não houver, o cliente nasce
  inativo e nenhum entrypoint processa dados dele (regra em `src/lib/adendo.ts`,
  invariante 12 da auditoria).
- **Requisição de titular chega pelo controlador**, nunca direto. O produto tem
  de conseguir cumprir (exportar / corrigir / eliminar) escopado por `cliente_id`.

## Onde o dado pessoal realmente está

O maior volume de PII **não é do cliente** — é de **terceiros**: pagadores e
recebedores nas transações bancárias e nos lançamentos da Omie. Inventário vivo
em [`references/mapa-de-dados-pessoais.md`](references/mapa-de-dados-pessoais.md).
Pontos quentes:

| Local | Dado |
|---|---|
| `conciliacao_item.banco_descricao` / `omie_descricao` | nome de contraparte, **chave PIX (pode ser CPF, telefone ou e-mail)**, nº de documento |
| `lib/documento.ts` | CPF/CNPJ normalizados para o match |
| `cliente.*_cif` | credenciais Omie/Pluggy do cliente — cifradas AES-256-GCM |
| DRE / Oportunidades | nomes de clientes e fornecedores do cliente, vindos da Omie |

Suboperadores (recebem dado pessoal): **Pluggy, Omie, Neon, Render**. Lista com o
que cada um recebe e onde fica em [`references/suboperadores.md`](references/suboperadores.md).

## Os três modos

### 1. Auditoria (ao revisar um diff)

Rodar o checklist de invariantes de [`references/auditoria.md`](references/auditoria.md)
sobre a mudança. Encaixa no fluxo do `/code-review`. Resumo dos gatilhos de
finding:

- dado pessoal chegando a `logger.*` num campo cujo nome escapa da redação de
  `src/lib/redacao.ts` (sufixos de texto livre + padrões CPF/CNPJ/e-mail/
  telefone/UUID), ou nome de pessoa montado na string da mensagem;
- query em `conciliacao_execucao` / `conciliacao_item` / `cliente_conta` sem
  amarrar `cliente_id` (em `conciliacao_item` o vínculo é via `execucao_id`);
- gravação em coluna de credencial sem passar por `lib/cripto.ts`, ou log do
  valor decifrado;
- `fetch` / SDK novo para host fora de `references/suboperadores.md`;
- migration que adiciona coluna capaz de conter PII sem entrada no mapa de dados;
- prazo de retenção no mapa sem caminho de expurgo que o cumpra;
- campo lido de Pluggy/Omie e persistido sem uso em conciliação ou DRE
  (minimização — art. 6º, III);
- redação / minimização escrita dentro do núcleo puro (`matcher.ts`,
  `normalize.ts`, `oportunidades/analisar.ts`, `lib/`) — tem de ficar no limite
  de I/O.

### 2. Scaffold (ao gerar um documento)

Copiar o template de `assets/` para `docs/` e preencher com os dados reais do
mapa e da lista de suboperadores. Não entregar o template em branco.

| Pedido | Template |
|---|---|
| Política de privacidade | [`assets/politica-de-privacidade.md`](assets/politica-de-privacidade.md) — versão servida (rascunho) já existe em `public/politica-de-privacidade.html`, ligada no rodapé do dashboard; preencher os `«...»` e tirar o aviso de rascunho para publicar |
| Adendo LGPD de operador (onboarding) | [`assets/adendo-lgpd-operador.md`](assets/adendo-lgpd-operador.md) |
| Registro de operações de tratamento (ROPA, art. 37) | [`assets/registro-operacoes-tratamento.md`](assets/registro-operacoes-tratamento.md) |
| Relatório de impacto (RIPD, art. 38) | [`assets/ripd-esqueleto.md`](assets/ripd-esqueleto.md) |
| Runbook de requisição de titular | [`assets/runbook-requisicao-titular.md`](assets/runbook-requisicao-titular.md) |
| Runbook de incidente | [`assets/runbook-incidente.md`](assets/runbook-incidente.md) |

### 3. Backlog (mudanças de produto)

Pendências de código priorizadas em [`docs/lgpd-pendencias.md`](../../../docs/lgpd-pendencias.md).
Ao concluir um item, mover para "feito" nesse arquivo e refletir no mapa de dados
/ na ROPA se o tratamento mudou.

## Regras que esta skill não repete

Escopo por `cliente_id`, credencial cifrada no banco, núcleo puro sem I/O,
dinheiro em centavos, transcript de sessão é tão sensível quanto `.env` — tudo
isso já está no `CLAUDE.md` e continua valendo. Esta skill trata do que a LGPD
acrescenta por cima: base legal, papel de operador, direitos do titular,
retenção, suboperadores, incidente.
