-- Multi-cliente: o produto atende varios clientes, cada um com sua conta Omie,
-- sua conta Pluggy e seus dados de conciliacao, isolados dos demais.

CREATE TABLE IF NOT EXISTS cliente (
  id                      BIGSERIAL   PRIMARY KEY,
  -- Identificador curto usado na CLI e nas rotas, ex: "acme".
  slug                    TEXT        NOT NULL UNIQUE,
  nome                    TEXT        NOT NULL,
  ativo                   BOOLEAN     NOT NULL DEFAULT true,

  -- Credenciais cifradas em repouso (AES-256-GCM). A chave fica no ambiente,
  -- nunca no banco: um dump vazado nao pode virar acesso ao ERP do cliente.
  omie_app_key_cif        TEXT        NOT NULL,
  omie_app_secret_cif     TEXT        NOT NULL,
  pluggy_client_id_cif    TEXT        NOT NULL,
  pluggy_client_secret_cif TEXT       NOT NULL,

  criado_em               TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- De/para entre conta do Pluggy e conta corrente da Omie, por cliente.
-- Sai do .env e passa a ser dado, porque agora varia por cliente.
CREATE TABLE IF NOT EXISTS cliente_conta (
  id                        BIGSERIAL PRIMARY KEY,
  cliente_id                BIGINT    NOT NULL REFERENCES cliente(id) ON DELETE CASCADE,
  apelido                   TEXT      NOT NULL,
  pluggy_account_id         TEXT      NOT NULL,
  omie_codigo_conta_corrente BIGINT   NOT NULL,
  ativo                     BOOLEAN   NOT NULL DEFAULT true,
  criado_em                 TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- A mesma conta do Pluggy nao pode estar mapeada duas vezes no mesmo cliente.
  UNIQUE (cliente_id, pluggy_account_id)
);

CREATE INDEX IF NOT EXISTS ix_cliente_conta_cliente ON cliente_conta (cliente_id);

-- ---------------------------------------------------------------------------
-- Escopo por cliente nas tabelas de conciliacao.
-- ---------------------------------------------------------------------------

ALTER TABLE conciliacao_execucao
  ADD COLUMN IF NOT EXISTS cliente_id BIGINT REFERENCES cliente(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS ix_execucao_cliente
  ON conciliacao_execucao (cliente_id, id DESC);

-- Execucoes anteriores a esta migration sao de desenvolvimento, sem cliente.
-- Ficam com cliente_id nulo; nada as referencia.
