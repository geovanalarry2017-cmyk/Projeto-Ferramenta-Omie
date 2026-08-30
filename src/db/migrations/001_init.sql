-- Historico de conciliacao.
-- Uma linha em conciliacao_execucao por rodada do job; uma linha em
-- conciliacao_item por movimento analisado (dos dois lados).

CREATE TABLE IF NOT EXISTS conciliacao_execucao (
  id               BIGSERIAL   PRIMARY KEY,
  periodo_de       DATE        NOT NULL,
  periodo_ate      DATE        NOT NULL,
  iniciada_em      TIMESTAMPTZ NOT NULL DEFAULT now(),
  finalizada_em    TIMESTAMPTZ,
  status           TEXT        NOT NULL DEFAULT 'EXECUTANDO'
                     CHECK (status IN ('EXECUTANDO', 'CONCLUIDA', 'ERRO')),
  erro             TEXT,
  disparo          TEXT        NOT NULL DEFAULT 'MANUAL'
                     CHECK (disparo IN ('MANUAL', 'CRON', 'HTTP')),
  total_banco      INTEGER     NOT NULL DEFAULT 0,
  total_omie       INTEGER     NOT NULL DEFAULT 0,
  conciliados      INTEGER     NOT NULL DEFAULT 0,
  revisar          INTEGER     NOT NULL DEFAULT 0,
  pendente_omie    INTEGER     NOT NULL DEFAULT 0,
  pendente_banco   INTEGER     NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS conciliacao_item (
  id                    BIGSERIAL PRIMARY KEY,
  execucao_id           BIGINT NOT NULL
                          REFERENCES conciliacao_execucao(id) ON DELETE CASCADE,
  conta_apelido         TEXT,
  status                TEXT   NOT NULL
                          CHECK (status IN ('CONCILIADO', 'REVISAR', 'PENDENTE_OMIE', 'PENDENTE_BANCO')),
  motivo                TEXT,
  score                 NUMERIC(4, 3),

  -- lado banco (Pluggy)
  banco_tx_id           TEXT,
  banco_data            DATE,
  banco_valor_centavos  BIGINT,
  banco_descricao       TEXT,

  -- lado Omie
  omie_lancamento_id    TEXT,
  omie_data             DATE,
  omie_valor_centavos   BIGINT,
  omie_descricao        TEXT,

  diferenca_centavos    BIGINT,
  criado_em             TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Uma transacao do banco nao pode aparecer duas vezes na mesma execucao.
CREATE UNIQUE INDEX IF NOT EXISTS ux_item_execucao_banco_tx
  ON conciliacao_item (execucao_id, banco_tx_id)
  WHERE banco_tx_id IS NOT NULL;

-- Filtro mais comum do relatorio: "o que sobrou para revisar".
CREATE INDEX IF NOT EXISTS ix_item_status ON conciliacao_item (status);

-- Usado para pular, em reexecucoes, o que ja fechou antes.
CREATE INDEX IF NOT EXISTS ix_item_banco_tx_conciliado
  ON conciliacao_item (banco_tx_id)
  WHERE status = 'CONCILIADO' AND banco_tx_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS ix_execucao_periodo
  ON conciliacao_execucao (periodo_de, periodo_ate);
