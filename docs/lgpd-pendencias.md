# LGPD — pendências de produto

Backlog priorizado das mudanças de código e de processo para adequação à LGPD.
Contexto, papéis e critérios em [`.claude/skills/lgpd-conciliador/`](../.claude/skills/lgpd-conciliador/SKILL.md).

Papel definido: o produto é **operador**; cada cliente é o **controlador**.

Ao concluir um item, mover para "Feito" e refletir a mudança no
`references/mapa-de-dados-pessoais.md` e na ROPA se o tratamento mudou.

---

## P0 — antes de dados reais em produção (trava o Render)

Código e trava técnica estão prontos. O que resta é **dado real e revisão**, não
implementação — depende de você / de quem cuida do contrato.

- [ ] **Adendo LGPD de operador assinado no onboarding.** Usar
  `assets/adendo-lgpd-operador.md`. Falta: razão social/CNPJ do operador, e a
  assinatura de cada cliente. A máquina de registrar o aceite já existe (abaixo).
- [x] **Registrar o aceite do adendo no banco.** Migration
  `003_lgpd_adendo.sql` (`adendo_lgpd_versao`, `adendo_lgpd_aceito_em` em
  `cliente`). Regra pura em `src/lib/adendo.ts`. `criarCliente` cria o cliente
  **inativo**; `npm run clientes -- aceite --cliente <s> --versao <v>` registra o
  aceite (data via `now()`) e ativa; `definirAtivo`/`ativar` recusam sem o
  aceite; `resolverCliente` (403) barra tratamento de cliente inativo em toda
  rota de dado. Testes: `tests/adendo.test.ts`. — 2026-09-05
- [x] **Redação de PII no logger.** `src/lib/redacao.ts` (puro) + fiação no
  `src/lib/logger.ts` via `formatters.log` (objeto) e `hooks.logMethod`
  (mensagem). Mascara CPF, CNPJ, e-mail, telefone e chave PIX aleatória (UUID);
  apaga inteiros os campos de texto livre (`descricao`/`historico`/`observacao`/
  `complemento`); `redact.paths` estendido com `DATABASE_URL`, `connectionString`,
  `senha`, `password`, `token`. Testes: `tests/redacao.test.ts` (17) e
  `tests/logger.test.ts` (5). — 2026-09-05
- [ ] **Política de privacidade publicada.** Estrutura pronta: rascunho servido
  em `public/politica-de-privacidade.html`, ligado no rodapé do dashboard
  (`public/index.html`). Falta: preencher os `«...»` (razão social, DPO),
  revisar e remover o aviso de rascunho. Manter em sincronia com
  `assets/politica-de-privacidade.md`.
- [ ] **Nomear encarregado (DPO) e publicar contato.** Decisão sua. Entra na
  política (hoje "a definir" no rodapé), no adendo e na ROPA.
- [ ] **ROPA preenchida** (art. 37) a partir de
  `assets/registro-operacoes-tratamento.md` + mapa de dados. Falta razão
  social/CNPJ, contato do encarregado e prazo de retenção por controlador.
- [x] **Exigir `sslmode=require` no banco em produção.** `src/config/env.ts`
  (`superRefine`) recusa o boot em `NODE_ENV=production` se a `DATABASE_URL` não
  pedir TLS (`require`/`verify-ca`/`verify-full`). Testes: `tests/env.test.ts`.
  Ainda cabe conferir, ao criar o Neon de produção, que a string já vem com ele.
  — 2026-09-05

## P1 — logo após o go-live

- [ ] **`npm run clientes -- excluir <slug>`.** `DELETE FROM cliente` — sem mais
  tabela filha (`cliente_conta`/`conciliacao_*` foram removidas), não há cascade
  a verificar. Confirmação interativa. Linha de auditoria (quem, quando,
  `cliente_id`) sem PII de titular. Atende eliminação (art. 18, VI) e término de
  contrato (art. 15). `desativar` continua sendo só soft.
- [ ] **`npm run clientes -- exportar <slug>`.** Dump JSON/CSV do cadastro do
  cliente em `cliente` (não há mais histórico de transação a exportar — isso
  hoje só existe na Omie do controlador). Atende confirmação/acesso (art. 18,
  I, II) via controlador.
- [ ] **Runbooks versionados em `docs/`.** Copiar
  `assets/runbook-requisicao-titular.md` e `assets/runbook-incidente.md` para
  `docs/`, preencher contatos reais dos suboperadores e do encarregado.
- [ ] **Registro de incidentes** (planilha/arquivo) como anexo da ROPA.

## P2 — endurecimento

- [ ] **Autenticação real no dashboard/API.** Hoje: `API_TOKEN` único,
  compartilhado por todos os clientes, sem identidade individual e sem trilha de
  acesso (`src/http/middleware.ts` — o próprio comentário diz "não substitui
  autenticação de verdade"). Avaliar token por cliente + log de acesso
  (data, cliente, rota) para rastreabilidade (art. 37, 46).
- [ ] **Minimização na resposta da API.** Revisar o que `dre/montar.ts` e
  `oportunidades/analisar.ts` devolvem a partir do que `omie/financas.ts` e
  `omie/cadastros.ts` buscam; cortar campo que a tela não usa (art. 6º, III).
- [ ] **RIPD preenchido.** `assets/ripd-esqueleto.md` com a análise real.
- [ ] **Backups do Neon.** Conferir retenção, região e quem tem acesso; anotar no
  mapa de dados e no adendo.
- [ ] **Transferência internacional.** Guardar cópia das cláusulas contratuais de
  Neon e Render; referenciar no adendo e na ROPA.

---

## Feito

- Skill de conformidade `lgpd-conciliador` criada (postura, auditoria, templates)
  — 2026-09-05.
- Este backlog — 2026-09-05.
- Redação de PII no logger (`src/lib/redacao.ts` + `src/lib/logger.ts`), com
  testes — 2026-09-05. Ver P0 acima.
- Máquina do aceite do adendo LGPD: migration `003_lgpd_adendo.sql`,
  `src/lib/adendo.ts`, `npm run clientes -- aceite`, cliente nasce inativo,
  tratamento barrado sem aceite (`resolverCliente`, `executarConciliacao`) —
  2026-09-05.
- TLS obrigatório no banco em produção (`src/config/env.ts`) — 2026-09-05.
- Rascunho da política de privacidade servido e ligado no rodapé do dashboard
  (`public/politica-de-privacidade.html`) — 2026-09-05. Conteúdo ainda pendente.
- **Remoção do Open Finance/Pluggy e da conciliação bancária** — o produto virou
  um visualizador de dados Omie (DRE, fluxo de caixa, oportunidades). Efeito em
  LGPD: `cliente` passou a ser a única tabela do produto com dado pessoal (sem
  `cliente_conta`/`conciliacao_execucao`/`conciliacao_item`); Pluggy saiu da
  lista de suboperadores; nada mais é persistido além da credencial Omie
  cifrada e do aceite do adendo — DRE/fluxo/oportunidades são buscados na Omie a
  cada consulta. Skill, mapa de dados, auditoria e templates (adendo v2, política
  v2, ROPA, RIPD, runbooks) atualizados; o item P1 de retenção/expurgo e o P2 de
  minimização na ingestão saíram do backlog por não terem mais objeto — ver
  P1/P2 acima. — 2026-09-20
