# Relatório de Impacto à Proteção de Dados (RIPD) — esqueleto

> Template. A ANPD pode requisitar o RIPD (art. 38). Ainda vale a pena manter
> pela categoria de titular (clientes/fornecedores do controlador, sem relação
> com o operador), mesmo o volume de dado tendo caído bastante depois da
> remoção do Open Finance/Pluggy — hoje nada é persistido além da credencial e
> do aceite do adendo. Preencher `«…»` com a análise real; não entregar em
> branco.

Elaborado por: Geovana Ferraz — Data: 2026-09-20 — Versão: v2.

## 1. Descrição do tratamento

- **O que faz**: «apuração financeira (DRE, fluxo de caixa, mapa de
  oportunidades) a partir do ERP (Omie) de cada cliente».
- **Papel**: operador, em nome de cada cliente controlador.
- **Dados e titulares**: ver `references/mapa-de-dados-pessoais.md`. Destaque:
  nomes e documentos (CPF/CNPJ) de clientes/fornecedores do cliente, vindos dos
  cadastros da Omie, que não têm relação com o operador.
- **Fluxo**: coleta via API Omie → apuração (núcleo puro, sem I/O,
  `dre/montar.ts`/`oportunidades/analisar.ts`) → exibição no dashboard atrás de
  token. Nada é persistido no Postgres além da credencial cifrada e do aceite
  do adendo, em `cliente`.
- **Suboperadores e regiões**: Omie (BR), Neon (EUA), Render (EUA).

## 2. Necessidade e proporcionalidade

- **Finalidade legítima**: «escrituração contábil/fiscal obrigatória; execução
  do contrato».
- **Minimização**: «a API devolve algum campo da Omie sem uso no DRE/mapa de
  oportunidades? — revisar contra `references/auditoria.md` invariante 6».
- **Base legal**: art. 7º, II + V (do controlador).
- **Alternativa menos intrusiva considerada**: já é a mínima possível — nada é
  persistido, cada consulta busca de novo na Omie.

## 3. Riscos aos titulares

| Risco | Cenário | Probabilidade | Impacto | Medidas |
|---|---|---|---|---|
| Vazamento entre clientes | rota de DRE/fluxo/oportunidades sem `resolverCliente` | «…» | alto | invariante 2 da auditoria; revisão de PR |
| PII em log | nome/documento vindo da Omie em `logger.*` | «…» | médio | redação no logger; invariante 1 |
| Acesso indevido ao dashboard | `API_TOKEN` único compartilhado, sem trilha de acesso | «…» | médio/alto | token por cliente + log de acesso (backlog P2) |
| Transferência internacional sem amparo | Neon/Render nos EUA | baixa | médio | cláusulas contratuais + autorização no adendo |
| Credencial de cliente exposta | dump de banco | baixa | alto | AES-256-GCM, chave fora do banco |

## 4. Medidas e risco residual

- Medidas técnicas e organizacionais: «lista consolidada — cifragem, isolamento,
  TLS, redação, controle de acesso, backups».
- Risco residual após medidas: «baixo / médio — justificar».
- Itens do backlog que reduzem risco e ainda estão abertos: «P0/P1/P2 pendentes».

## 5. Conclusão

«O tratamento é proporcional à finalidade, com risco residual aceitável após as
medidas, condicionado à entrega dos itens P0 antes do processamento de dados
reais em produção.» — revisar esta frase conforme o estado real.

Revisão prevista: a cada mudança relevante de tratamento ou em «12» meses.
