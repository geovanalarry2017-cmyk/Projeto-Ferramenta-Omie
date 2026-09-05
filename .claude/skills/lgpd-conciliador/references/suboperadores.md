# Suboperadores — quem recebe dado pessoal

Suboperador = terceiro que trata dado pessoal por conta do operador (art. 39).
Uso depende de **autorização do controlador** (registrada no adendo LGPD) e de
cláusulas de proteção equivalentes no contrato com o suboperador.

Regra de auditoria (invariante 4): qualquer `fetch` / SDK / conexão nova para um
host que não esteja nesta tabela exige atualizar a tabela **e** avaliar se é
suboperador novo (precisa de aditivo de autorização com os controladores).

| Suboperador | O que recebe | Papel | Região | Amparo p/ transferência internacional |
|---|---|---|---|---|
| **Pluggy** (`pluggy-sdk`) | credenciais Pluggy do cliente; em troca, extrato bancário com transações (valor, data, descrição, contraparte, chave PIX) | agregador de Open Finance; fonte do lado "banco" | conforme contrato Pluggy | contrato do cliente com a Pluggy (o cliente é titular da conta Pluggy) + cláusula no adendo |
| **Omie** (`app.omie.com.br/api/v1`) | credenciais Omie do cliente; em troca, lançamentos financeiros, categorias, cadastros de clientes/fornecedores (nome, documento) | ERP; fonte do lado "Omie" e destino futuro de escrita | Brasil | dado tratado no Brasil; sem transferência internacional |
| **Neon** (Postgres, driver `pg`) | tudo que é persistido: `cliente`, `cliente_conta`, `conciliacao_execucao`, `conciliacao_item` | banco de dados gerenciado | `oregon` / AWS us-west-2 (EUA) — alinhar ao `render.yaml` | cláusulas contratuais + DPA da Neon + autorização do controlador |
| **Render** | processo Node em execução (dado pessoal em memória durante a conciliação e nas respostas HTTP); logs da aplicação | hospedagem do serviço | `oregon` (EUA) — `render.yaml` | cláusulas contratuais + DPA da Render + autorização do controlador |

## Não são suboperadores (mas checar)

- **GitHub (repo privado)** — não recebe dado pessoal de titular; recebe código.
  Confirmar que nenhum fixture com dado real foi commitado (regra do CLAUDE.md:
  dado fictício só em `scripts/`).
- **ANPD** — destinatário de comunicação de incidente, não suboperador.

## Ao trocar de suboperador

Trocar de agregador de Open Finance (o núcleo puro permite — é um arquivo em
`src/pluggy/`) **não** é só mudança técnica:

1. novo suboperador entra nesta tabela;
2. aditivo de autorização com cada controlador;
3. cláusulas de proteção no contrato com o novo suboperador;
4. atualizar política de privacidade e ROPA;
5. se muda a região, reavaliar transferência internacional (art. 33).
