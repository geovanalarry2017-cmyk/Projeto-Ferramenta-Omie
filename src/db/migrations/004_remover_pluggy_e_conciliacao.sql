-- O produto deixa de fazer Open Finance/conciliacao bancaria e vira um
-- visualizador dos dados do cliente na Omie. Essas tabelas so existiam para a
-- conciliacao; sem ela, nao ha mais o que guardar nelas.
--
-- Depois desta migration, `cliente` fica sendo a UNICA tabela com dado pessoal
-- do produto, sem nenhuma tabela filha — os dados de DRE/fluxo/oportunidades
-- sao buscados na Omie a cada consulta e nunca gravados no Postgres.

DROP TABLE IF EXISTS conciliacao_item CASCADE;
DROP TABLE IF EXISTS conciliacao_execucao CASCADE;
DROP TABLE IF EXISTS cliente_conta CASCADE;

ALTER TABLE cliente DROP COLUMN IF EXISTS pluggy_client_id_cif;
ALTER TABLE cliente DROP COLUMN IF EXISTS pluggy_client_secret_cif;
