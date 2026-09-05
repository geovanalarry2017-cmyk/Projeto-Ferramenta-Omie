# Registro de Operações de Tratamento (ROPA) — art. 37

> Template do registro que o operador deve manter. Preencher a partir de
> `references/mapa-de-dados-pessoais.md` e `references/suboperadores.md` e revisar
> a cada mudança de tratamento (coluna nova, integração nova, mudança de
> retenção). Uma cópia consolidada + um anexo por cliente controlador quando os
> prazos de retenção variarem.

Responsável pelo registro: «encarregado / nome» — Última revisão: 2026-09-05.

## Identificação

- **Operador**: «razão social», CNPJ «…».
- **Encarregado**: «nome», «contato».
- **Controladores**: empresas clientes listadas em «anexo / tabela `cliente`».

## Operações

### OP-1 — Conciliação bancária

| Campo | Conteúdo |
|---|---|
| Finalidade | conferir transações do extrato contra lançamentos da Omie |
| Natureza | coleta (Pluggy/Omie), cruzamento, armazenamento, disponibilização em relatório |
| Categorias de titular | contrapartes das transações; representante do cliente (credenciais) |
| Categorias de dado | valor, data, descrição (nome/documento/chave PIX de contraparte), identificadores de transação e lançamento |
| Base legal (do controlador) | art. 7º, II + V + IX |
| Compartilhamento | Pluggy, Omie, Neon, Render (suboperadores) |
| Transferência internacional | sim — EUA (Neon, Render); cláusulas contratuais |
| Retenção | «definir por controlador»; registro contábil retido conforme prazo fiscal, dado operacional expurgado ao fim da necessidade |
| Segurança | cifragem de credencial, isolamento por `cliente_id`, TLS, redação de log |

### OP-2 — Apuração de DRE, fluxo de caixa e mapa de oportunidades

| Campo | Conteúdo |
|---|---|
| Finalidade | demonstrativos financeiros e identificação de oportunidades |
| Natureza | leitura de lançamentos/categorias/cadastros da Omie, agregação, disponibilização em dashboard |
| Categorias de titular | clientes e fornecedores do cliente |
| Categorias de dado | valores, categorias, nomes e documentos |
| Base legal | art. 7º, II + V + IX |
| Compartilhamento | Omie, Neon, Render |
| Transferência internacional | sim — EUA (Neon, Render) |
| Retenção | «definir por controlador» |
| Observação | tratamento automatizado (classificação/score) — ver RIPD |

### OP-3 — Guarda de credenciais de acesso

| Campo | Conteúdo |
|---|---|
| Finalidade | autenticar nas APIs Omie e Pluggy do cliente |
| Categorias de titular | representante do cliente |
| Categorias de dado | app key/secret Omie, client id/secret Pluggy |
| Base legal | art. 7º, V |
| Segurança | AES-256-GCM em repouso, chave em `CREDENCIAIS_CHAVE` fora do banco |
| Retenção | eliminar no encerramento do contrato |

## Incidentes

Registro de incidentes de segurança em «runbook-incidente / planilha de
incidentes»: data, dado afetado, controladores afetados, medidas, comunicação.
