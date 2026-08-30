# Projeto: Integrações + Financeiro Omie

## Contexto e motivação

O ERP usado é a **Omie** (API REST documentada em https://developer.omie.com.br/service-list/). Os módulos de vendas, compras, estoque e marketplaces já funcionam nativamente dentro da Omie e **não precisam ser reconstruídos**. O problema real está na camada financeira: os relatórios e a visualização de DRE e fluxo de caixa da Omie são fracos, a conciliação bancária é manual, e não há integração com WhatsApp nem com assinatura digital de documentos.

Este projeto é um **backend próprio** que funciona como orquestrador: fica entre a Omie e serviços externos, resolvendo essas lacunas.

## Escopo do projeto

### Foco principal (fase 1)
1. **Conciliador bancário automático** — roda todo dia de madrugada, compara o extrato real do banco (via Open Finance) com os lançamentos da Omie, e sinaliza ou corrige divergências.
2. **Dashboard financeiro** — gráficos de DRE e fluxo de caixa melhores que os nativos da Omie, usando os dados que a própria Omie já expõe.

### Escopo secundário
3. **Envio de documentos via WhatsApp** — usar a API oficial do WhatsApp Business para mandar qualquer documento (boleto, NF-e, contrato) direto pro cliente.
4. **Assinatura digital de documentos** — integrar com um provedor de assinatura (Clicksign ou Autentique), e depois anexar o documento assinado na oportunidade correspondente dentro da Omie.

### Fora de escopo
- Integração com marketplaces (Mercado Livre, Shopee, etc.) — a Omie já resolve isso nativamente.
- Módulos de vendas, compras e estoque — usar os já existentes na Omie.

## Arquitetura

```
Omie API  <----->  Backend (orquestrador)
                         |
        -----------------------------------
        |            |            |        |
   WhatsApp API  Assinatura   Open Finance  |
   (envia docs)  digital      (extrato      |
                 (Clicksign)   bancário)     |
                                    |        |
                              Conciliador  Dashboard
                              (cron diário) (DRE/caixa)
```

- **Backend**: Node.js (Express) rodando fora da Omie, autenticado com App Key/App Secret da Omie.
- **Hospedagem**: começar no free tier do Render (sem cartão de crédito, mas o serviço "dorme" após 15 min de inatividade) ou Railway (usage-based, precisa de cartão). Migrar pro plano pago (~US$5-7/mês) quando os webhooks (WhatsApp, assinatura) precisarem responder na hora sem atraso de "acordar" o servidor.
- **Banco de dados**: necessário para guardar histórico de conciliação e logs — considerar Postgres gerenciado (free tier costuma expirar em ~90 dias, então planejar upgrade).

## Endpoints relevantes da API Omie

**Financeiro** (base para conciliador e dashboard):
- `Extrato de Conta Corrente` — `/api/v1/financas/extrato/` — extrato de conta corrente
- `Contas a Pagar - Lançamentos` — `/api/v1/financas/contapagar/`
- `Contas a Receber - Lançamentos` — `/api/v1/financas/contareceber/`
- `Movimentos Financeiros` — `/api/v1/financas/mf/`
- `Orçamento de Caixa` (Previsto x Realizado) — `/api/v1/financas/caixa/`
- `Resumo de Finanças` — `/api/v1/financas/resumo/`
- `Contas do DRE` — `/api/v1/geral/dre/`

**Anexos e CRM** (para assinatura digital):
- `Documentos Anexos` — `/api/v1/geral/anexo/` — cria/edita/consulta/exclui anexos
- `Tipos de Anexos` — `/api/v1/geral/tiposanexo/`
- `Oportunidades` — `/api/v1/crm/oportunidades/` — vincular o documento assinado à oportunidade

## Fluxo do conciliador automático (cron diário, ex: 3h da manhã)

1. Buscar movimentações do dia anterior via API do agregador Open Finance (ex: Pluggy).
2. Buscar lançamentos correspondentes na Omie (`Extrato de Conta Corrente` + `Contas a Pagar/Receber`).
3. Comparar linha a linha: valor + data próxima (±1-2 dias) + CPF/CNPJ ou parte da descrição.
4. Classificar cada movimento:
   - Bateu certinho → marcar como conciliado.
   - Bateu com diferença pequena (taxa bancária, etc.) → sinalizar para revisão.
   - Não encontrado na Omie → criar lançamento automaticamente ou colocar em fila de pendências.
5. Enviar resumo do resultado (ex: via WhatsApp, usando a integração da fase secundária): quantos bateram, quantos ficaram pendentes.
6. As regras de "match" (passo 3) não ficam perfeitas de primeira — calibrar ao longo das primeiras semanas de uso real.

## Stack sugerida

- **Linguagem**: Node.js (Express) — bom suporte a bibliotecas de agendamento (`node-cron`) e integrações HTTP.
- **Agendamento**: `node-cron` dentro do próprio backend, ou um cron externo (cron-job.org) chamando um endpoint protegido.
- **Open Finance**: Pluggy (ou Belvo/Quanto como alternativas).
- **Assinatura digital**: Clicksign ou Autentique.
- **WhatsApp**: API oficial do WhatsApp Business (Meta Cloud API) ou provedor (Z-API, Twilio).
- **Dashboard**: frontend simples consumindo os dados financeiros da Omie e renderizando gráficos (ex: Chart.js ou Recharts).

## Próximos passos

1. Estruturar o projeto no VS Code: cliente de autenticação da Omie, cliente do Pluggy, lógica de matching, e o job de cron.
2. Validar o fluxo do conciliador com dados reais de um período pequeno antes de automatizar 100%.
3. Depois, montar o dashboard de DRE/fluxo de caixa.
4. Por último, WhatsApp + assinatura digital (fase secundária).
