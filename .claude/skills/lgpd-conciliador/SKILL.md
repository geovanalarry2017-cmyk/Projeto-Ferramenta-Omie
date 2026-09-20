---
name: lgpd-conciliador
description: >-
  Conformidade LGPD do orquestrador Omie, que atua como OPERADOR de dados
  pessoais em nome de cada cliente (o controlador). Use ao revisar código que
  toca dado pessoal (nome/CPF/CNPJ de cliente ou fornecedor vindo da Omie,
  credencial de cliente), ao adicionar integração externa ou coluna de banco,
  ao preparar deploy com dados reais, ou quando pedirem política de privacidade,
  adendo LGPD de operador, ROPA, RIPD ou runbook de requisição de titular / de
  incidente.
---

# LGPD no visualizador de dados Omie

> O produto já foi um conciliador bancário via Open Finance (Pluggy); essa
> parte foi removida. O nome da skill ficou (é o path do diretório), mas o
> conteúdo abaixo já reflete só o que existe hoje: DRE, fluxo de caixa e mapa
> de oportunidades, todos a partir da conta Omie do cliente.

## Postura em uma frase

Este produto é **operador** (LGPD art. 5º, VII). Cada cliente contratante é o
**controlador**: ele define finalidade e meios, contrata a Omie, e responde
perante os titulares. O produto trata dado pessoal **só sob instrução
documentada do controlador** (art. 39) e o mínimo para apurar DRE, fluxo de
caixa e mapear oportunidades.

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

O maior volume de PII **não é do cliente** — são os **clientes e fornecedores
dele**, cadastrados na Omie e expostos nas telas de DRE/oportunidades.
Inventário vivo em
[`references/mapa-de-dados-pessoais.md`](references/mapa-de-dados-pessoais.md).
Pontos quentes:

| Local | Dado |
|---|---|
| Respostas de DRE / DRE mensal / fluxo de caixa / oportunidades | nomes e documentos (CPF/CNPJ) de clientes e fornecedores do cliente, vindos da Omie — buscado a cada consulta, **nunca gravado no Postgres** |
| `cliente.omie_app_key_cif` / `omie_app_secret_cif` | credencial de acesso à Omie do cliente — cifrada AES-256-GCM |

`cliente` é hoje a **única tabela do produto com dado pessoal** — não há mais
nenhuma tabela de transação ou histórico local.

Suboperadores (recebem dado pessoal): **Omie, Neon, Render**. Lista com o que
cada um recebe e onde fica em [`references/suboperadores.md`](references/suboperadores.md).

## Os três modos

### 1. Auditoria (ao revisar um diff)

Rodar o checklist de invariantes de [`references/auditoria.md`](references/auditoria.md)
sobre a mudança. Encaixa no fluxo do `/code-review`. Resumo dos gatilhos de
finding:

- dado pessoal chegando a `logger.*` num campo cujo nome escapa da redação de
  `src/lib/redacao.ts` (sufixos de texto livre + padrões CPF/CNPJ/e-mail/
  telefone/UUID), ou nome de pessoa montado na string da mensagem;
- rota nova de dado (`/dre`, `/dre-mensal`, `/fluxo-caixa`, `/oportunidades`…)
  sem passar por `resolverCliente` (middleware);
- gravação em coluna de credencial sem passar por `lib/cripto.ts`, ou log do
  valor decifrado;
- `fetch` / SDK novo para host fora de `references/suboperadores.md`;
- migration que adiciona coluna capaz de conter PII sem entrada no mapa de dados;
- campo lido da Omie e devolvido ao dashboard sem uso em DRE/oportunidades
  (minimização — art. 6º, III);
- redação / minimização escrita dentro do núcleo puro (`dre/montar.ts`,
  `oportunidades/analisar.ts`, `lib/`) — tem de ficar no limite de I/O.

### 2. Scaffold (ao gerar um documento)

Copiar o template de `assets/` para `docs/` e preencher com os dados reais do
mapa e da lista de suboperadores. Não entregar o template em branco.

| Pedido | Template |
|---|---|
| Política de privacidade | [`assets/politica-de-privacidade.md`](assets/politica-de-privacidade.md) — versão servida (rascunho) já existe em `public/politica-de-privacidade.html`, ligada no rodapé do dashboard; preencher os `«...»` e tirar o aviso de rascunho para publicar |
| Adendo LGPD de operador (onboarding) | [`assets/adendo-lgpd-operador.md`](assets/adendo-lgpd-operador.md) — processo de envio/assinatura (manual, via DocuSign) em [`docs/processo-assinatura-adendo.md`](../../../docs/processo-assinatura-adendo.md) |
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
