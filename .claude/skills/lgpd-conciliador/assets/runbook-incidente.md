# Runbook — incidente de segurança com dado pessoal (art. 48)

> Como operador, o dever imediato é **comunicar o(s) controlador(es) sem demora
> injustificada**. A comunicação à ANPD e aos titulares é conduzida pelo
> controlador. Não comunicar a ANPD por conta própria em nome do cliente.

## O que conta como incidente

Acesso não autorizado, vazamento, perda, alteração ou destruição de dado pessoal
tratado pelo produto. Exemplos concretos aqui:

- credenciais de cliente expostas (dump de banco, `CREDENCIAIS_CHAVE` vazada,
  transcript de sessão em canal aberto — ver `CLAUDE.md`);
- resposta de API ou log entregando dado de um cliente a outro;
- acesso ao dashboard com `API_TOKEN` de terceiro;
- Neon / Render / Pluggy / Omie comunicando incidente que afete os dados.

## Passos

### 1. Conter (imediato)

- revogar o segredo afetado: girar `API_TOKEN`, `CREDENCIAIS_CHAVE` (atenção:
  girar a chave sem re-cifrar torna credenciais irrecuperáveis — ver `CLAUDE.md`),
  ou credenciais de cliente comprometidas;
- se o vazamento é por rota/query, derrubar a rota ou desativar o cliente
  afetado até corrigir;
- preservar logs e evidência (sem copiar dado pessoal para canal aberto).

### 2. Avaliar

- qual dado, de quantos titulares, de quais **controladores**;
- risco aos titulares (o dado permite fraude, contato indevido, exposição?);
- causa raiz.

### 3. Comunicar o(s) controlador(es) — sem demora

Uma mensagem por controlador afetado, com o que o art. 48, §1º pede, na medida do
que já se sabe:

- descrição da natureza dos dados afetados;
- titulares envolvidos (número/categoria);
- medidas técnicas de proteção já aplicadas;
- riscos relacionados;
- medidas tomadas e a tomar;
- ponto de contato (encarregado do operador).

Não esperar ter todos os detalhes para o primeiro aviso; complementar depois.

### 4. Apoiar

O controlador decide sobre comunicar ANPD e titulares e sobre prazo. Fornecer o
que ele precisar (logs escopados, linha do tempo, parecer técnico).

### 5. Registrar e corrigir

- entrada no registro de incidentes (data, dado, controladores, medidas,
  comunicações) — anexo da ROPA;
- item no `docs/lgpd-pendencias.md` para a correção definitiva;
- se o incidente expôs lacuna nos invariantes, atualizar `references/auditoria.md`.

## Contatos

- Encarregado do operador: «nome», «canal».
- Contatos de incidente dos suboperadores: Neon «…», Render «…», Pluggy «…»,
  Omie «…».
