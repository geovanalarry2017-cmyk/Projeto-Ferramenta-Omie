# Postura LGPD — operador vs controlador e bases legais

## Por que operador

Critério da LGPD (art. 5º, VI e VII): **controlador** decide sobre o tratamento;
**operador** trata em nome do controlador.

No visualizador:

- Quem escolhe apurar DRE, fluxo de caixa e olhar oportunidades é **o cliente**.
  Ele contrata a Omie, é titular dessa conta e define o período e o escopo.
- O produto executa: puxa lançamentos da Omie do cliente, apura e devolve no
  dashboard. Não persiste o resultado (busca de novo a cada consulta), não
  decide finalidade nova, não reaproveita dado de um cliente para outro, não
  vende nem enriquece base.

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
| Eliminar ou devolver os dados ao fim do contrato (art. 15, 16) | `npm run clientes -- excluir` (backlog P1) |

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
| Apuração de DRE / fluxo de caixa / oportunidades | lançamentos, categorias, nomes e documentos (CPF/CNPJ) de clientes e fornecedores do cliente, vindos da Omie | II (obrigação legal — escrituração contábil/fiscal) + V (execução de contrato) + IX (legítimo interesse) | titular (cliente/fornecedor do controlador) **não** tem relação com o operador; buscado a cada consulta, nunca persistido — ver `references/mapa-de-dados-pessoais.md` |
| Guarda da credencial Omie do cliente | app key/secret Omie | V (execução de contrato) | segredo de acesso, cifrado; tratar como dado de representante da empresa |
| Log operacional | metadados de execução, erro | IX | **não** deve conter nome/documento — ver `references/auditoria.md` |

**Dado sensível (art. 11):** não é esperado. Se em algum momento entrar dado de
saúde, biometria, origem racial, filiação sindical etc. (por exemplo, num
cadastro de cliente/fornecedor da Omie), isso é art. 11 e exige base própria e
RIPD — parar e reavaliar.

## Retenção — princípio

Sem Pluggy/conciliação, o produto não guarda mais dado de transação ou
histórico local — `cliente` é a única tabela com dado pessoal, e o que ela
guarda (credencial cifrada, aceite do adendo) tem ciclo de vida ligado ao
contrato, não a um prazo de retenção separado. O dado de titular
(cliente/fornecedor) que aparece no dashboard vem direto da Omie a cada
consulta: quem retém é o controlador, no próprio sistema dele — não há mais
expurgo a operar aqui.
