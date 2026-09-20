# Adendo de Tratamento de Dados Pessoais (LGPD)

> Template. Anexo ao contrato de prestação de serviço firmado no onboarding.
> Preencher os campos `«…»` com dados reais e remover as notas em bloco de
> citação antes de enviar. Uma via assinada por cliente; o aceite é registrado
> no sistema (ver seção 9).

Este Adendo integra o Contrato de Prestação de Serviços entre:

- **Controlador**: «razão social do cliente», CNPJ «…», doravante "Controlador";
- **Operador**: «razão social do fornecedor do conciliador», CNPJ «…», doravante
  "Operador".

## 1. Objeto

O Operador trata dados pessoais **exclusivamente em nome e sob instrução do
Controlador**, para prestar o serviço de apuração de DRE, fluxo de caixa e mapa
de oportunidades a partir dos dados da conta Omie do Controlador.

## 2. Papéis (LGPD art. 5º, VI e VII)

O Controlador decide a finalidade e os meios essenciais do tratamento e responde
perante os titulares e a ANPD. O Operador executa o tratamento conforme este
Adendo e as instruções documentadas do Controlador, sem tomar decisões próprias
sobre os dados.

## 3. Dados tratados e titulares

| Categoria de dado | Origem | Titulares |
|---|---|---|
| Lançamentos financeiros, categorias, cadastros de clientes e fornecedores (nome, documento) | Omie (conta do Controlador) | clientes e fornecedores do Controlador |
| Credenciais de acesso Omie | fornecidas pelo Controlador | representante do Controlador |

Nada do que é lido é gravado pelo Operador: cada consulta busca de novo na Omie
e devolve o resultado — não há histórico nem cópia local desses dados.

O Operador **não** trata dados sensíveis (art. 11). Caso o Controlador identifique
dado sensível trafegando nos cadastros, comunicará o Operador para tratamento
específico.

## 4. Finalidade e instruções (art. 39)

O tratamento se limita às operações descritas na cláusula 1. Instruções
adicionais ou alteração de finalidade só valem por escrito, como aditivo a este
Adendo. O Operador informará o Controlador se, na sua avaliação, uma instrução
violar a LGPD.

## 5. Bases legais

O Controlador declara que o tratamento se ampara em: «obrigação legal —
escrituração contábil/fiscal (art. 7º, II)», «execução de contrato (art. 7º, V)»
e/ou «legítimo interesse (art. 7º, IX)», e que cumpriu seus deveres de
transparência perante os titulares. A definição e a comunicação da base legal aos
titulares são de responsabilidade do Controlador.

## 6. Suboperadores (art. 39)

O Controlador **autoriza** o uso dos seguintes suboperadores, todos submetidos a
obrigações de proteção equivalentes às deste Adendo:

| Suboperador | Função | Local de tratamento |
|---|---|---|
| Omie | ERP de origem dos dados | Brasil |
| Neon | banco de dados gerenciado | Estados Unidos (Oregon) |
| Render | hospedagem da aplicação | Estados Unidos (Oregon) |

Novo suboperador só entra após comunicação ao Controlador, que poderá se opor no
prazo de «15» dias. A lista atual fica em «URL/anexo».

## 7. Transferência internacional (art. 33)

Há tratamento nos Estados Unidos (Neon e Render). A transferência se ampara em
cláusulas contratuais específicas com esses suboperadores e na autorização desta
cláusula. O Operador manterá as cláusulas vigentes enquanto durar o serviço.

## 8. Segurança (art. 46-49)

O Operador mantém, no mínimo:

- credenciais do Controlador cifradas em repouso (AES-256-GCM), com chave fora do
  banco de dados;
- isolamento lógico por cliente em todas as consultas;
- transporte cifrado (TLS) entre serviço, banco e APIs externas;
- redação de dados pessoais e segredos nos registros de log;
- controle de acesso ao serviço por segredo de API e restrição de acesso ao
  banco de dados a pessoal autorizado.

## 9. Registro do aceite

O aceite deste Adendo é registrado no sistema no cadastro do Controlador:
`adendo_lgpd_versao` (versão deste documento, abaixo) e `adendo_lgpd_aceito_em`
(data/hora do aceite, preenchida programaticamente na assinatura — **não** fixada
neste arquivo). O cliente não é ativado para tratamento antes desse registro. A
data da assinatura em si vai no campo "Local e data" ao final.

Versão deste Adendo: **v2 — 2026-09-20** (v2: escopo reduzido a DRE/fluxo de
caixa/oportunidades a partir da Omie, sem conciliação bancária/Open Finance).

## 10. Direitos do titular (art. 18)

Requisições de titular são recebidas e respondidas pelo **Controlador**. O
Operador auxilia em até «10» dias úteis, fornecendo exportação, correção ou
eliminação dos dados do Controlador, escopadas ao seu cadastro. O Operador não
responde diretamente a titulares.

## 11. Incidente de segurança (art. 48)

O Operador comunica o Controlador **sem demora injustificada** ao tomar
conhecimento de incidente envolvendo dados tratados sob este Adendo, com as
informações do art. 48, §1º disponíveis. A comunicação à ANPD e aos titulares é
conduzida pelo Controlador. Procedimento em «runbook-incidente».

## 12. Término (art. 15, 16)

Encerrado o contrato, o Operador, conforme instrução do Controlador em até «30»
dias: (a) exporta e devolve os dados e (b) os elimina em definitivo de suas bases
e as dos suboperadores, salvo obrigação legal de guarda, informando por escrito a
conclusão.

## 13. Encarregado

Encarregado do Operador: «nome», «e-mail/canal».
Encarregado do Controlador: «nome», «e-mail/canal».

---

Local e data: __________________________

Controlador: __________________________  Operador: __________________________
