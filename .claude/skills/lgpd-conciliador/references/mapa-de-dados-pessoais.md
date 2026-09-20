# Mapa de dados pessoais — inventário vivo

Atualizar **na mesma PR** que adiciona ou muda uma coluna/campo que pode conter
dado pessoal. Migration nova sem linha aqui = finding (auditoria, invariante 5).

Categorias de titular:

- **Cliente** — a empresa contratante e seu representante (quem contrata e
  assina o adendo).
- **Usuário** — pessoa física com login no dashboard (e-mail/senha),
  funcionário ou representante do cliente. É por essa categoria que o produto
  licencia (vende por quantidade de usuários ativos).
- **Cliente/Fornecedor do controlador** — pessoa ou empresa cadastrada como
  cliente ou fornecedor na Omie do controlador, que aparece no DRE/oportunidades.
  Não tem relação com o operador.

Legenda de base legal: ver `references/postura.md`.

## `cliente` e `usuario` — as duas tabelas do produto com dado pessoal

### `cliente`

| Coluna | Contém PII? | Categoria | Base | Retenção | Notas |
|---|---|---|---|---|---|
| `slug`, `nome` | sim (nome empresarial / possível nome de pessoa) | Cliente | V | enquanto durar o contrato + prazo contábil | — |
| `omie_app_key_cif`, `omie_app_secret_cif` | segredo de acesso | Cliente | V | eliminar no encerramento (art. 15) | cifrado AES-256-GCM, chave em `CREDENCIAIS_CHAVE` fora do banco |
| `ativo`, `criado_em`, `atualizado_em` | não | — | — | — | metadados |
| `adendo_lgpd_versao`, `adendo_lgpd_aceito_em` | não (metadado contratual) | — | — | enquanto durar o contrato | registro do aceite do adendo de operador (art. 39); enquanto nulo o cliente não é ativado nem processado |
| `limite_usuarios` | não | — | — | — | teto contratado de usuários ativos (licenciamento por assento) |

### `usuario`

| Coluna | Contém PII? | Categoria | Base | Retenção | Notas |
|---|---|---|---|---|---|
| `email` | sim | Usuário | V | enquanto durar o contrato daquele usuário | identificador de login; único no banco |
| `senha_hash` | segredo de acesso | Usuário | V | idem | scrypt + sal aleatório (`lib/senha.ts`); a senha em texto puro nunca chega ao banco nem ao log |
| `cliente_id`, `ativo`, `criado_em`, `atualizado_em` | não | — | — | — | metadados; `cliente_id` é o vínculo de escopo |

Não há mais nenhuma outra tabela: sem Open Finance/conciliação, o produto não
persiste transação, lançamento nem histórico de execução localmente.

## Fora do banco

| Fluxo | Contém PII? | Categoria | Notas |
|---|---|---|---|
| Respostas cruas da Omie (`omie/financas.ts`, `omie/cadastros.ts`) | sim | Cliente/Fornecedor do controlador | cadastros e movimentos trazem nome e documento (CPF/CNPJ) de clientes/fornecedores do cliente; nunca logar o objeto cru |
| DRE / DRE mensal / fluxo de caixa / oportunidades — em memória e no JSON de resposta HTTP | sim | Cliente/Fornecedor do controlador | resposta vai para o dashboard atrás de `API_TOKEN`; buscado a cada consulta, **nunca persistido** |
| Logs (`lib/logger.ts` + `lib/redacao.ts`) | **deve ser não** | — | redação liga por padrão: mascara CPF/CNPJ/e-mail/telefone/UUID e apaga campo de texto livre; campo de PII com nome fora do padrão ainda é finding (ver `references/auditoria.md` §1) |
| Prévia estática (`npm run previa`) e demo (`npm run demo`) | não | — | dados fabricados em `scripts/`; nunca dado real (regra do CLAUDE.md) |
| Backups do Neon | espelham `cliente` e `usuario` (credencial cifrada, senha em hash) | Cliente / Usuário | conferir retenção, região e acesso do backup (backlog P2) |
| Cookie de sessão (`omie_sessao`, navegador do usuário) | não | — | carrega só `usuarioId`, `clienteId` e validade, assinados por HMAC (`lib/sessao.ts`) — sem e-mail nem senha dentro |

## Transferência internacional

Neon e Render em `oregon` (EUA). Transferência internacional de dado pessoal
(art. 33). Amparo prático: cláusulas contratuais no adendo com cada suboperador +
autorização do controlador no adendo LGPD. Anotar a região de cada suboperador em
`references/suboperadores.md` e manter alinhada ao `render.yaml`.
