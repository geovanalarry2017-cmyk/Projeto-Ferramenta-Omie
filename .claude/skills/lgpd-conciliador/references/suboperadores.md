# Suboperadores — quem recebe dado pessoal

Suboperador = terceiro que trata dado pessoal por conta do operador (art. 39).
Uso depende de **autorização do controlador** (registrada no adendo LGPD) e de
cláusulas de proteção equivalentes no contrato com o suboperador.

Regra de auditoria (invariante 4): qualquer `fetch` / SDK / conexão nova para um
host que não esteja nesta tabela exige atualizar a tabela **e** avaliar se é
suboperador novo (precisa de aditivo de autorização com os controladores).

| Suboperador | O que recebe | Papel | Região | Amparo p/ transferência internacional |
|---|---|---|---|---|
| **Omie** (`app.omie.com.br/api/v1`) | credenciais Omie do cliente; em troca, lançamentos financeiros, categorias, cadastros de clientes/fornecedores (nome, documento) | ERP; fonte de todos os dados apurados | Brasil | dado tratado no Brasil; sem transferência internacional |
| **Neon** (Postgres, driver `pg`) | tudo que é persistido — hoje só a tabela `cliente` (credencial Omie cifrada, aceite do adendo) | banco de dados gerenciado | `oregon` / AWS us-west-2 (EUA) — alinhar ao `render.yaml` | cláusulas contratuais + DPA da Neon + autorização do controlador |
| **Render** | processo Node em execução (dado pessoal em memória durante a apuração e nas respostas HTTP); logs da aplicação | hospedagem do serviço | `oregon` (EUA) — `render.yaml` | cláusulas contratuais + DPA da Render + autorização do controlador |

## Não são suboperadores (mas checar)

- **GitHub (repo privado)** — não recebe dado pessoal de titular; recebe código.
  Confirmar que nenhum fixture com dado real foi commitado (regra do CLAUDE.md:
  dado fictício só em `scripts/`).
- **ANPD** — destinatário de comunicação de incidente, não suboperador.
