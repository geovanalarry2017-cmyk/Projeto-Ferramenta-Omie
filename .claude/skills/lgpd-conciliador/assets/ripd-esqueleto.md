# Relatório de Impacto à Proteção de Dados (RIPD) — esqueleto

> Template. A ANPD pode requisitar o RIPD (art. 38). É recomendável aqui pelo
> volume de dados de Open Finance, por tratar titulares sem relação com o
> operador e por haver tratamento automatizado. Preencher `«…»` com a análise
> real; não entregar em branco.

Elaborado por: «nome» — Data: 2026-09-05 — Versão: v1.

## 1. Descrição do tratamento

- **O que faz**: «conciliação bancária + apuração financeira, cruzando Open
  Finance (Pluggy) e ERP (Omie) por cliente».
- **Papel**: operador, em nome de cada cliente controlador.
- **Dados e titulares**: ver `references/mapa-de-dados-pessoais.md`. Destaque:
  descrições de transação com nome/documento/chave PIX de **contrapartes**, que
  não têm relação com o operador.
- **Fluxo**: coleta via API → normalização (núcleo puro, sem I/O) → matching com
  score → persistência em `conciliacao_item` → exibição no dashboard atrás de
  token.
- **Suboperadores e regiões**: Pluggy «…», Omie (BR), Neon (EUA), Render (EUA).

## 2. Necessidade e proporcionalidade

- **Finalidade legítima**: «conferência contábil/fiscal obrigatória; execução do
  contrato».
- **Minimização**: «o que é coletado além do necessário? há campo persistido sem
  uso no matcher/DRE? — resultado da revisão do backlog P2».
- **Base legal**: art. 7º, II + V + IX (do controlador).
- **Alternativa menos intrusiva considerada**: «ex.: não persistir descrição
  crua, só tokens; mascarar chave PIX na ingestão — avaliar viabilidade».

## 3. Riscos aos titulares

| Risco | Cenário | Probabilidade | Impacto | Medidas |
|---|---|---|---|---|
| Vazamento entre clientes | query em `conciliacao_item` sem escopo de `cliente_id` | «…» | alto | invariante 2 da auditoria; revisão de PR |
| PII em log | descrição de transação em `logger.*` | «…» | médio | redação no logger (backlog P0); invariante 1 |
| Retenção excessiva | dado operacional guardado indefinidamente | «…» (hoje: alta) | médio | política de retenção + expurgo (backlog P1) |
| Acesso indevido ao dashboard | `API_TOKEN` único compartilhado, sem trilha de acesso | «…» | médio/alto | token por cliente + log de acesso (backlog P2) |
| Transferência internacional sem amparo | Neon/Render nos EUA | baixa | médio | cláusulas contratuais + autorização no adendo |
| Credencial de cliente exposta | dump de banco | baixa | alto | AES-256-GCM, chave fora do banco |
| Decisão automatizada afeta titular | classificação/score da conciliação | baixa | baixo | efeito jurídico baixo; revisão humana da fila "REVISAR" |

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
