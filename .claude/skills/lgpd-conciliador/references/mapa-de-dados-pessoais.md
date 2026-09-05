# Mapa de dados pessoais — inventário vivo

Atualizar **na mesma PR** que adiciona ou muda uma coluna/campo que pode conter
dado pessoal. Migration nova sem linha aqui = finding (auditoria, invariante 5).

Categorias de titular:

- **Cliente** — a empresa contratante e seu representante (quem detém o `API_TOKEN`
  e as credenciais).
- **Contraparte** — pagador/recebedor que aparece nas transações do cliente. Não
  tem relação com o operador. É o dado mais sensível de tratar por isso.

Legenda de base legal: ver `references/postura.md`.

## `cliente`

| Coluna | Contém PII? | Categoria | Base | Retenção | Notas |
|---|---|---|---|---|---|
| `slug`, `nome` | sim (nome empresarial / possível nome de pessoa) | Cliente | V | enquanto durar o contrato + prazo contábil | — |
| `omie_app_key_cif`, `omie_app_secret_cif`, `pluggy_client_id_cif`, `pluggy_client_secret_cif` | segredo de acesso | Cliente | V | eliminar no encerramento (art. 15) | cifrado AES-256-GCM, chave em `CREDENCIAIS_CHAVE` fora do banco |
| `ativo`, `criado_em`, `atualizado_em` | não | — | — | — | metadados |

## `cliente_conta`

| Coluna | Contém PII? | Categoria | Base | Retenção | Notas |
|---|---|---|---|---|---|
| `apelido` | baixo (texto livre do operador do cliente) | Cliente | V | contrato | evitar pôr nome de pessoa aqui |
| `pluggy_account_id`, `omie_codigo_conta_corrente` | identificador de conta | Cliente | V | contrato | não é dado bancário completo, é ID interno do agregador/ERP |

## `conciliacao_execucao`

| Coluna | Contém PII? | Categoria | Base | Retenção | Notas |
|---|---|---|---|---|---|
| `cliente_id`, `periodo_de`, `periodo_ate`, `status`, `disparo`, contadores | não | — | IX | **operacional** — expurgar junto com a execução | é a âncora de escopo por cliente |
| `erro` | **risco** — mensagem de erro pode carregar trecho de payload | Contraparte | IX | operacional | auditoria invariante 11: erro não pode ecoar descrição/credencial |

## `conciliacao_item`  ← ponto quente

| Coluna | Contém PII? | Categoria | Base | Retenção | Notas |
|---|---|---|---|---|---|
| `banco_descricao` | **sim** — nome de contraparte, chave PIX (pode ser CPF/telefone/e-mail), nº documento | Contraparte | II + IX | **definir com o controlador**; separar registro contábil de dado operacional | candidato a mascaramento de padrão PIX na ingestão (backlog P2) |
| `omie_descricao` | **sim** — idem, lado ERP | Contraparte | II + IX | idem | — |
| `banco_tx_id`, `omie_lancamento_id` | identificador | Contraparte/Cliente | II + IX | idem | pseudônimo, mas religável |
| `banco_data`, `omie_data`, `*_valor_centavos`, `diferenca_centavos`, `score`, `status`, `motivo` | não isoladamente | — | II + IX | idem | `motivo` é texto gerado pelo matcher — conferir que não concatena descrição crua |
| `conta_apelido` | ver `cliente_conta.apelido` | Cliente | V | idem | — |

## Fora do banco

| Fluxo | Contém PII? | Categoria | Notas |
|---|---|---|---|
| Respostas cruas do Pluggy (`pluggy/client.ts`) | sim | Contraparte | minimizar antes de persistir; nunca logar o objeto cru |
| Respostas cruas da Omie (`omie/financas.ts`, `omie/cadastros.ts`) | sim | Contraparte/Cliente | idem; cadastros trazem nome e documento de clientes/fornecedores do cliente |
| DRE / fluxo / oportunidades em memória e no JSON de resposta HTTP | sim | Contraparte/Cliente | resposta vai para o dashboard atrás de `API_TOKEN` |
| Logs (`lib/logger.ts` + `lib/redacao.ts`) | **deve ser não** | — | redação liga por padrão: mascara CPF/CNPJ/e-mail/telefone/UUID e apaga campo de texto livre; campo de PII com nome fora do padrão ainda é finding (ver `references/auditoria.md` §1) |
| Prévia estática (`npm run previa`) e demo (`npm run demo`) | não | — | dados fabricados em `scripts/`; nunca dado real (regra do CLAUDE.md) |
| Backups do Neon | espelham `conciliacao_item` | Contraparte | conferir retenção, região e acesso do backup (backlog P2) |

## Transferência internacional

Neon e Render em `oregon` (EUA). Transferência internacional de dado pessoal
(art. 33). Amparo prático: cláusulas contratuais no adendo com cada suboperador +
autorização do controlador no adendo LGPD. Anotar a região de cada suboperador em
`references/suboperadores.md` e manter alinhada ao `render.yaml`.
