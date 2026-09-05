# Postura LGPD — operador vs controlador e bases legais

## Por que operador

Critério da LGPD (art. 5º, VI e VII): **controlador** decide sobre o tratamento;
**operador** trata em nome do controlador.

No conciliador:

- Quem escolhe conciliar, apurar DRE e olhar oportunidades é **o cliente**. Ele
  contrata Pluggy e Omie, é titular dessas contas e define o período e o escopo.
- O produto executa: puxa extrato do Pluggy do cliente, puxa lançamentos da Omie
  do cliente, cruza, guarda o resultado. Não decide finalidade nova, não
  reaproveita dado de um cliente para outro, não vende nem enriquece base.

Logo: **operador**. O cliente é o controlador. Se algum dia o produto passar a
tratar dado por conta própria (marketing para os titulares, produto derivado de
dados agregados, score vendido a terceiro), a classificação muda e este arquivo
tem de ser revisto **antes** de a funcionalidade entrar.

## O que ser operador obriga

| Obrigação | Onde vive |
|---|---|
| Tratar só sob instrução documentada do controlador (art. 39) | adendo LGPD assinado no onboarding — `assets/adendo-lgpd-operador.md` |
| Manter registro das operações de tratamento (art. 37) | ROPA — `assets/registro-operacoes-tratamento.md` |
| Garantir segurança (art. 46-49) | credencial cifrada, escopo por `cliente_id`, TLS, redação de log |
| Comunicar incidente ao controlador sem demora | `assets/runbook-incidente.md` |
| Só usar suboperador com autorização do controlador (art. 39) | lista + cláusula no adendo — `references/suboperadores.md` |
| Ajudar o controlador a atender o titular (art. 39) | export / correção / eliminação escopados — `assets/runbook-requisicao-titular.md` |
| Eliminar ou devolver os dados ao fim do contrato (art. 15, 16) | comando de exclusão + política de retenção (backlog P1) |

O que **não** é obrigação do operador aqui: definir base legal perante o titular,
publicar aviso ao titular como controlador, responder diretamente a titular,
colher consentimento. Isso é do cliente. A política de privacidade do produto
(`assets/politica-de-privacidade.md`) descreve o papel de operador e os
suboperadores — serve de transparência e de anexo ao contrato, não substitui o
aviso que o controlador dá aos seus titulares.

## Bases legais por atividade (mapa para a ROPA)

A base é do controlador; o operador registra qual é para saber o que pode e o que
não pode fazer com o dado.

| Atividade | Dado | Base legal típica (art. 7º / 11) | Observação |
|---|---|---|---|
| Conciliação bancária | transações do extrato, lançamentos Omie, valores, datas, descrições com nome/documento de contraparte | II (obrigação legal — escrituração contábil/fiscal) + V (execução de contrato) + IX (legítimo interesse na conferência) | contraparte é titular que **não** tem relação com o operador — cuidado redobrado com minimização e retenção |
| Apuração de DRE / fluxo de caixa | categorias, títulos, nomes de clientes e fornecedores do cliente | II + V | idem |
| Mapa de oportunidades | mesmos dados do DRE, agregados | IX (legítimo interesse) | tratamento automatizado — pesa no RIPD |
| Guarda de credenciais do cliente | app key/secret Omie, client id/secret Pluggy | V (execução de contrato) | são segredo de acesso, cifrados; tratar como dado de representante da empresa |
| Log operacional | metadados de execução (contadores, status, erro) | IX | **não** deve conter descrição de transação nem documento — ver `references/auditoria.md` |

**Dado sensível (art. 11):** não é esperado. Chave PIX pode *revelar* um CPF, mas
CPF não é dado sensível. Se em algum momento entrar dado de saúde, biometria,
origem racial, filiação sindical etc. (por exemplo, descrição de transação de
plano de saúde ou sindicato), isso é art. 11 e exige base própria e RIPD — parar
e reavaliar.

## Retenção — princípio

Separar dois tipos de dado que hoje moram juntos em `conciliacao_item`:

1. **Registro contábil/fiscal** — o que comprova a escrituração. A obrigação de
   guarda é do controlador e costuma ser longa (tipicamente 5 anos para fins
   fiscais, às vezes mais). Fica.
2. **Dado operacional de conciliação** — descrição crua de transação, itens que
   nunca fecharam, execuções antigas repetidas. Não precisa da mesma janela.
   Expurgar assim que deixa de ser útil ao controlador (art. 15, I e art. 6º, III
   — necessidade).

O prazo concreto de cada categoria é definido **com cada controlador** e anotado
no `references/mapa-de-dados-pessoais.md`. Sem prazo anotado e sem rotina de
expurgo, o dado fica para sempre — isso é finding de auditoria.
