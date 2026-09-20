# CLAUDE.md

Backend orquestrador entre a Omie e o cliente. **Produto multi-cliente**, não
ferramenta interna de uma empresa só.

O [`README.md`](./README.md) é a documentação real: o que o produto faz, como
cadastrar cliente, todas as rotas, as sete visualizações do dashboard, as decisões
de projeto e o mapa de `src/`. **Leia-o antes de mexer em qualquer coisa** — este
arquivo só cobre o que ele não cobre. O briefing original está em
[`projeto-omie-integracoes.md`](./projeto-omie-integracoes.md).

## Estado atual (20/09/2026)

**Pivot nesta sessão: o produto deixou de fazer conciliação bancária via Open
Finance (Pluggy) e virou um visualizador de dados Omie** — DRE, fluxo de caixa e
mapa de oportunidades, multi-cliente, cada cliente com sua própria App Key/Secret
da Omie cifrada no banco. Motor de match, wrapper do Pluggy, CLI `conciliar`, job
cron e as tabelas `conciliacao_execucao`/`conciliacao_item`/`cliente_conta` foram
removidos (migration `004_remover_pluggy_e_conciliacao.sql`, **ainda não aplicada
em nenhum banco**). O dashboard não perdeu tela nenhuma — já era 100% Omie antes
do corte.

**Segunda mudança do dia: login por usuário, para vender por assento.** Cada
cliente (empresa) pode ter vários usuários — e-mail/senha próprios
(`src/usuarios/`, tabela `usuario`) — todos vendo os mesmos dados, e é a
quantidade de usuários **ativos** que o contrato limita
(`cliente.limite_usuarios`). Login emite um cookie de sessão assinado por HMAC
(`src/lib/sessao.ts`, sem dependência nova); `exigirSessao` substituiu
`exigirToken` nas rotas que o dashboard consome — `API_TOKEN` continua só para
automação/script interno. `resolverCliente` recusa (403) sessão de um cliente
tentando ler dado de outro. Migration `005_usuarios.sql` **já aplicada no Neon
de dev**. CLI: `npm run usuarios -- listar\|criar\|limite\|ativar\|desativar`.

**107 testes em 11 arquivos, `npm run typecheck` limpo.**

Pronto: DRE (caixa e competência), DRE mês a mês, fluxo de caixa, mapa de
oportunidades, dashboard com sete gráficos, tema claro/escuro e tela de login,
prévia estática (`npm run previa`, sem login), redação de PII no log, e as
travas técnicas do adendo LGPD (cliente nasce inativo) e da sessão (usuário só
vê o próprio cliente).

Layout e proposta foram **aprovados na reunião de 31/08/2026, sem pedidos de
mudança** (isso era sobre a UI, que não mudou de propósito com os dois pivots —
só ganhou a tela de login). O Render segue pendente dos **passos manuais** —
criar o Neon de produção, o repositório privado no GitHub e o serviço no
painel do Render. Runbook em [`docs/deploy-render.md`](./docs/deploy-render.md).

**Ainda não há cliente real.** Com a remoção do Pluggy, `cliente` e `usuario`
são as **duas únicas tabelas do produto com dado pessoal** — nada mais fica
persistido localmente, o que simplifica bastante o backlog de LGPD. Antes do
primeiro cliente: ter o CNPJ do operador, nomear o encarregado (DPO — já
feito), preencher a política de privacidade e a ROPA, e assinar o adendo com o
cliente (registrado por `npm run clientes -- aceite`, seguido de
`npm run usuarios -- criar` para o primeiro login). Backlog em
[`docs/lgpd-pendencias.md`](./docs/lgpd-pendencias.md); contexto na skill
`lgpd-conciliador`.

Depois do Render, na ordem do briefing: escrita de lançamentos na Omie, WhatsApp,
assinatura digital.

## Regras que não se quebram

**Tudo é escopado por cliente.** Nunca leia credencial do ambiente — receba por
parâmetro. Nenhuma rota de DRE/fluxo/oportunidades responde sem passar por
`exigirSessao` + `resolverCliente` (middleware), que resolve o cliente pelo
slug da rota **e confere que é o mesmo cliente da sessão do usuário logado**.
Cada cliente tem sua própria conta Omie; cada usuário pertence a um único
cliente.

**Credenciais de cliente vivem cifradas no banco**, nunca em `.env`, nunca em log.
Perder `CREDENCIAIS_CHAVE` torna o que está guardado irrecuperável. Senha de
usuário nunca em texto puro — só hash (`src/lib/senha.ts`, scrypt + sal);
sessão é um cookie assinado por `SESSAO_CHAVE` (`src/lib/sessao.ts`), não
cifrado (não carrega segredo, só ids e validade).

**O produto é operador de LGPD; cada cliente é o controlador.** Cliente nasce
inativo e nenhum entrypoint processa dados dele antes do aceite do adendo estar
registrado (`src/lib/adendo.ts`; `npm run clientes -- aceite`). PII não vai para
log — `src/lib/redacao.ts` mascara e o pino está fiado nela. Detalhes e checklist
de auditoria na skill `lgpd-conciliador`.

**O núcleo é puro e fica puro.** `dre/montar.ts`, `oportunidades/analisar.ts` e
`lib/` não fazem I/O — recebem o que já foi buscado na Omie e calculam. Isso é o
que permite testar os limiares e as regras de apuração com fixtures, sem tocar
rede. Não introduza I/O neles.

**Dinheiro em centavos inteiros. Datas como string `AAAA-MM-DD`.** Float produz
divergência onde não existe; comparar `Date` joga lançamento da meia-noite no dia
errado.

**Dado fictício mora em `scripts/`, nunca em `src/`.** Não pode existir caminho pelo
qual um número fake chegue ao relatório de um cliente.

## A armadilha que não faz barulho

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

A conta Omie de agosto/2026 é **só de desenvolvimento**: está praticamente vazia
(conta "Caixinha", banco 999, um lançamento previsto).

Banco: Postgres no Neon (nuvem) — não há banco local. Node >= 22 (`.node-version`
fixa 24). Em produção (`NODE_ENV=production`) o boot recusa subir se a
`DATABASE_URL` não exigir TLS (`sslmode=require`).

## Entregáveis de apresentação

Quando o material é para alguém apresentar, ele tem que abrir **sem conta, sem
servidor e sem internet**: um HTML único. Quem apresenta pode não ter o repositório
nem Node, e o wi-fi da sala não é confiável. `npm run previa` gera exatamente isso a
partir de `public/index.html`. Não ofereça link que dependa de login.

## Segurança do próprio histórico

Os transcripts das sessões (`~/.claude/projects/<caminho-codificado>/*.jsonl`)
contêm `DATABASE_URL` com a senha do Neon, `CREDENCIAIS_CHAVE`, `SESSAO_CHAVE`
e `API_TOKEN` **em texto puro**. São tão sensíveis quanto o `.env`: nunca por
e-mail, WhatsApp, nuvem pública ou anexo em ticket. O repositório em si está
limpo — o `.env` nunca foi commitado.

## Ao relatar erro em painel web

Se aparecer erro vago num dashboard SaaS (Neon, Render, Omie) — "algo deu
errado", botão que não responde, tela em branco — **sugira desligar a tradução
automática do navegador e recarregar antes de investigar credenciais ou conta.**
A tradução reescreve o DOM e quebra SPAs silenciosamente. Já custou tempo uma vez.
