# CLAUDE.md

Backend orquestrador entre a Omie e serviços externos. **Produto multi-cliente**,
não ferramenta interna de uma empresa só.

O [`README.md`](./README.md) é a documentação real: o que o conciliador faz, como
cadastrar cliente, todas as rotas, as sete visualizações do dashboard, as decisões
de projeto e o mapa de `src/`. **Leia-o antes de mexer em qualquer coisa** — este
arquivo só cobre o que ele não cobre. O briefing original está em
[`projeto-omie-integracoes.md`](./projeto-omie-integracoes.md).

## Estado atual (01/09/2026)

Fase 1 entregue e verde: **99 testes em 7 arquivos, `npm run typecheck` limpo.**

O que está pronto: conciliador bancário, DRE (caixa e competência), DRE mês a mês,
fluxo de caixa, mapa de oportunidades, dashboard com sete gráficos e tema
claro/escuro, e a prévia estática (`npm run previa`).

**O desenvolvimento está pausado de propósito.** O item pendente é o deploy no
Render, e ele está travado até os clientes aprovarem layout e proposta — investir
em infraestrutura antes do aceite arrisca construir para um formato que ainda pode
mudar. Houve uma reunião de apresentação em 31/08/2026, conduzida por outra pessoa,
no notebook dela.

**Antes de propor retomar o Render ou qualquer pendência, pergunte como foi a
reunião e o que os clientes aprovaram ou pediram para mudar.** Não assuma que o
sinal verde já veio.

Depois do Render, na ordem do briefing: escrita de lançamentos na Omie, WhatsApp,
assinatura digital.

## Regras que não se quebram

**Tudo é escopado por cliente.** Nunca leia credencial do ambiente — receba por
parâmetro. Nunca consulte tabela de conciliação sem filtrar `cliente_id`. Cada
cliente tem sua própria conta Omie **e sua própria conta Pluggy**: o cliente
contrata o Pluggy e entrega as credenciais.

**Credenciais de cliente vivem cifradas no banco**, nunca em `.env`, nunca em log.
Perder `CREDENCIAIS_CHAVE` torna o que está guardado irrecuperável.

**O núcleo é puro e fica puro.** `matcher.ts`, `normalize.ts`, `oportunidades/analisar.ts`
e `lib/` não fazem I/O. Isso é o que permite calibrar com fixtures sem tocar rede, e
o que faz trocar de agregador de Open Finance custar um arquivo em vez do codebase.
Não introduza I/O neles.

**Dinheiro em centavos inteiros. Datas como string `AAAA-MM-DD`.** Float produz
divergência onde não existe; comparar `Date` joga lançamento da meia-noite no dia
errado.

**Dado fictício mora em `scripts/`, nunca em `src/`.** Não pode existir caminho pelo
qual um número fake chegue ao relatório de um cliente.

## As duas armadilhas que não fazem barulho

**Sinal da Omie** (`src/conciliacao/normalize.ts`) — a doc da Omie não lista os
valores de `cNatureza` nem diz se `nValorDocumento` vem assinado. Se a convenção
estiver errada, entrada vira saída e **nada quebra visivelmente**. Confirme com
`npm run smoke:omie -- --cliente X` antes de confiar em resultado.

**Vínculo categoria → DRE** — categoria e conta do DRE usam numerações parecidas e
independentes. O único vínculo válido é o campo `codigo_dre` da categoria, e ele é
opcional na Omie (49 de 142 preenchidas na conta de teste). Por isso o DRE nunca
descarta o que não classifica: joga no painel "Movimentos fora do DRE". Um DRE que
fecha escondendo dinheiro é pior que um que avisa estar incompleto.

## Como conferir que os números estão certos

No regime de caixa, **saldo do fluxo de caixa + total de "Movimentos fora do DRE" =
resultado do DRE**, exato. São dois caminhos independentes sobre os mesmos
movimentos, e só fecham se sinal, rateio e recorte de data estiverem certos nos
dois. Foi essa conta que revelou o rateio de título pago parcialmente entrando no
DRE de caixa pelo valor cheio.

`npm run demo` sobe o dashboard real com dados fabricados determinísticos — mesmo
período, mesmos valores. Serve para conferir enquanto a conta Omie de
desenvolvimento está vazia.

## Ambiente

As contas Omie e Pluggy de agosto/2026 são **só de desenvolvimento**: a Omie está
praticamente vazia (conta "Caixinha", banco 999, um lançamento previsto) e o Pluggy
usa o item de sandbox `Pluggy Bank Business` (conector 8, `user-ok`/`password-ok`).

Banco: Postgres no Neon (nuvem) — não há banco local. Node >= 22.

O Pluggy comercial custa **a partir de R$ 2.500/mês**, contra os ~US$ 5-7/mês que o
briefing orçava para hospedagem. O agregador é o custo dominante do produto, e isso
é decisão comercial, não detalhe de implementação.

## Entregáveis de apresentação

Quando o material é para alguém apresentar, ele tem que abrir **sem conta, sem
servidor e sem internet**: um HTML único. Quem apresenta pode não ter o repositório
nem Node, e o wi-fi da sala não é confiável. `npm run previa` gera exatamente isso a
partir de `public/index.html`. Não ofereça link que dependa de login.

## Segurança do próprio histórico

Os transcripts das sessões (`~/.claude/projects/<caminho-codificado>/*.jsonl`)
contêm `DATABASE_URL` com a senha do Neon, `CREDENCIAIS_CHAVE` e `API_TOKEN` **em
texto puro**. São tão sensíveis quanto o `.env`: nunca por e-mail, WhatsApp, nuvem
pública ou anexo em ticket. O repositório em si está limpo — o `.env` nunca foi
commitado.

## Ao relatar erro em painel web

Se aparecer erro vago num dashboard SaaS (Neon, Render, Pluggy, Omie) — "algo deu
errado", botão que não responde, tela em branco — **sugira desligar a tradução
automática do navegador e recarregar antes de investigar credenciais ou conta.**
A tradução reescreve o DOM e quebra SPAs silenciosamente. Já custou tempo uma vez.
