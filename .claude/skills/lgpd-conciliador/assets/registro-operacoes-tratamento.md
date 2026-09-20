# Registro de Operações de Tratamento (ROPA) — art. 37

> Template do registro que o operador deve manter. Preencher a partir de
> `references/mapa-de-dados-pessoais.md` e `references/suboperadores.md` e revisar
> a cada mudança de tratamento (coluna nova, integração nova, mudança de
> retenção). Uma cópia consolidada + um anexo por cliente controlador quando os
> prazos de retenção variarem.

Responsável pelo registro: «encarregado / nome» — Última revisão: 2026-09-20.

## Identificação

- **Operador**: «razão social», CNPJ «…».
- **Encarregado**: «nome», «contato».
- **Controladores**: empresas clientes listadas em «anexo / tabela `cliente`».

## Operações

### OP-1 — Apuração de DRE, fluxo de caixa e mapa de oportunidades

| Campo | Conteúdo |
|---|---|
| Finalidade | demonstrativos financeiros e identificação de oportunidades |
| Natureza | leitura de lançamentos/categorias/cadastros da Omie, agregação, disponibilização em dashboard — buscado a cada consulta, **nunca persistido** |
| Categorias de titular | clientes e fornecedores do cliente |
| Categorias de dado | valores, categorias, nomes e documentos (CPF/CNPJ) |
| Base legal | art. 7º, II + V |
| Compartilhamento | Omie, Neon, Render |
| Transferência internacional | sim — EUA (Neon, Render) |
| Retenção | não se aplica — o produto não guarda o resultado; a Omie do controlador é a fonte e a guarda |
| Observação | o mapa de oportunidades sinaliza padrões (queda de margem, despesa fora da curva etc.) por regra fixa, sem decisão automatizada que produza efeito jurídico sobre pessoa física — ver RIPD |

### OP-2 — Guarda de credencial de acesso

| Campo | Conteúdo |
|---|---|
| Finalidade | autenticar na API da Omie do cliente |
| Categorias de titular | representante do cliente |
| Categorias de dado | app key/secret Omie |
| Base legal | art. 7º, V |
| Segurança | AES-256-GCM em repouso, chave em `CREDENCIAIS_CHAVE` fora do banco |
| Retenção | eliminar no encerramento do contrato |

## Incidentes

Registro de incidentes de segurança em «runbook-incidente / planilha de
incidentes»: data, dado afetado, controladores afetados, medidas, comunicação.
