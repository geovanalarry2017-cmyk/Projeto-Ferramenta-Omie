-- Login por usuario: cada cliente (empresa) pode ter varios usuarios, cada
-- um com o proprio e-mail/senha. E isso que viabiliza vender por assento
-- (quantidade de usuarios), nao so por cliente.
--
-- `senha_hash` guarda so o hash (scrypt com sal aleatorio, src/lib/senha.ts)
-- -- a senha em texto puro nunca chega a ficar no banco nem em log.
-- `limite_usuarios` em `cliente` e o teto contratado de usuarios ativos.

ALTER TABLE cliente
  ADD COLUMN IF NOT EXISTS limite_usuarios INTEGER NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS usuario (
  id            SERIAL PRIMARY KEY,
  cliente_id    INTEGER NOT NULL REFERENCES cliente(id),
  email         TEXT NOT NULL UNIQUE,
  senha_hash    TEXT NOT NULL,
  ativo         BOOLEAN NOT NULL DEFAULT true,
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS usuario_cliente_id_idx ON usuario (cliente_id);
