# LGPD — pendências de produto

Backlog priorizado das mudanças de código e de processo para adequação à LGPD.
Contexto, papéis e critérios em [`.claude/skills/lgpd-conciliador/`](../.claude/skills/lgpd-conciliador/SKILL.md).

Papel definido: o produto é **operador**; cada cliente é o **controlador**.

Ao concluir um item, mover para "Feito" e refletir a mudança no
`references/mapa-de-dados-pessoais.md` e na ROPA se o tratamento mudou.

---

## P0 — antes de dados reais em produção (trava o Render)

- [ ] **Adendo LGPD de operador assinado no onboarding.** Usar
  `assets/adendo-lgpd-operador.md`. Sem ele não há instrução de tratamento
  documentada (art. 39). Uma via por cliente.
- [ ] **Registrar o aceite do adendo no banco.** Migration: colunas
  `adendo_lgpd_versao TEXT` e `adendo_lgpd_aceito_em TIMESTAMPTZ` em `cliente`.
  `npm run clientes -- criar` passa a exigir os dois antes de deixar `ativo=true`;
  `npm run clientes -- ativar` idem. (Não é consentimento de titular — é o aceite
  contratual do controlador, versionado. Ver `SKILL.md`.)
- [x] **Redação de PII no logger.** `src/lib/redacao.ts` (puro) + fiação no
  `src/lib/logger.ts` via `formatters.log` (objeto) e `hooks.logMethod`
  (mensagem). Mascara CPF, CNPJ, e-mail, telefone e chave PIX aleatória (UUID);
  apaga inteiros os campos de texto livre (`descricao`/`historico`/`observacao`/
  `complemento`); `redact.paths` estendido com `DATABASE_URL`, `connectionString`,
  `senha`, `password`, `token`. Testes: `tests/redacao.test.ts` (17) e
  `tests/logger.test.ts` (5). — 2026-09-05
- [ ] **Política de privacidade publicada.** `assets/politica-de-privacidade.md`
  preenchida → rodapé do dashboard (`public/index.html`) + material de onboarding.
- [ ] **Nomear encarregado (DPO) e publicar contato.** Entra na política, no
  adendo e na ROPA.
- [ ] **ROPA preenchida** (art. 37) a partir de
  `assets/registro-operacoes-tratamento.md` + mapa de dados.
- [ ] **Confirmar `sslmode=require`** na `DATABASE_URL` do Neon de produção.

## P1 — logo após o go-live

- [ ] **`npm run clientes -- excluir <slug>`.** Hard delete de `cliente` com
  cascade verificado (`cliente_conta`, `conciliacao_execucao`,
  `conciliacao_item`). Confirmação interativa. Linha de auditoria (quem, quando,
  `cliente_id`) sem PII de titular. Atende eliminação (art. 18, VI) e término de
  contrato (art. 15). `desativar` continua sendo só soft.
- [ ] **`npm run clientes -- exportar <slug> [--de --ate --filtro]`.** Dump
  JSON/CSV escopado por `cliente_id`. Atende confirmação/acesso/portabilidade
  (art. 18, I, II, V) via controlador.
- [ ] **Política de retenção + expurgo.** Config `RETENCAO_CONCILIACAO_MESES`
  (env, já no formato do `env.ts`). Job no `src/jobs/scheduler.ts` que apaga
  `conciliacao_execucao` além do prazo (cascade limpa `conciliacao_item`).
  Distinguir, com cada controlador, registro contábil (retém pelo prazo fiscal)
  de dado operacional de conciliação (expurga antes) — ver `references/postura.md`.
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
- [ ] **Minimização na ingestão.** Revisar o que `src/pluggy/client.ts` e
  `src/omie/financas.ts` persistem em `conciliacao_item`; cortar campo que não
  entra no matcher nem no DRE (art. 6º, III). Avaliar mascarar padrão de chave
  PIX em `banco_descricao` **antes de gravar**, no limite de I/O
  (`conciliacao/service.ts`) — nunca em `normalize.ts` (núcleo puro; o matcher usa
  a descrição para pontuar).
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
