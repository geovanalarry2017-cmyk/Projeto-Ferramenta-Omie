-- LGPD: o produto e operador; cada cliente e o controlador. Antes de tratar
-- dados pessoais reais de um cliente, o adendo de tratamento (art. 39) precisa
-- estar assinado. Estas colunas registram esse aceite contratual: a versao do
-- documento assinado e a data/hora em que o aceite foi registrado no sistema.
--
-- NAO e consentimento de titular. E o aceite do controlador, versionado.

ALTER TABLE cliente
  ADD COLUMN IF NOT EXISTS adendo_lgpd_versao    TEXT,
  ADD COLUMN IF NOT EXISTS adendo_lgpd_aceito_em TIMESTAMPTZ;

-- Clientes que ja existiam (todos de desenvolvimento) ficam com o adendo
-- pendente: adendo_lgpd_aceito_em nulo. Enquanto nulo, o cliente nao pode ser
-- ativado nem ter dados processados. Registrar com:
--   npm run clientes -- aceite --cliente <slug> --versao <versao do adendo assinado>
