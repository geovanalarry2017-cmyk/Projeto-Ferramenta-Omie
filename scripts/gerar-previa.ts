import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DataISO } from '../src/lib/dates.js';
import { montarDRE, montarDREMensal, montarFluxoDeCaixa } from '../src/dre/montar.js';
import { analisarOportunidades } from '../src/oportunidades/analisar.js';
import { montarOrcamento } from '../src/orcamento/montar.js';
import { CATEGORIAS, CONTAS_DRE, listarMovimentosFake, listarOrcamentoFake } from './dados-fake.js';

/**
 * Gera uma previa estatica do dashboard, para apresentar sem servidor.
 *
 *   npm run previa
 *
 * O `npm run demo` precisa de Node, do repositorio e de um terminal aberto —
 * requisitos que nao existem no notebook de quem vai apresentar. Esta previa e
 * um arquivo HTML unico, sem back-end e sem rede: da para abrir com clique
 * duplo, mandar por e-mail ou publicar como link.
 *
 * O calculo continua sendo o de producao (montarDRE, montarDREMensal,
 * montarFluxoDeCaixa, analisarOportunidades). O que muda e *quando* ele roda:
 * aqui e agora, na geracao, em vez de a cada requisicao. Os numeros que o
 * cliente ve na reuniao sao os mesmos que o servidor real produziria.
 *
 * public/index.html continua intocado. A previa e montada a partir dele, sem
 * nenhum vestigio de modo demonstracao no arquivo que vai para producao.
 */

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, '..');

/** Versao fixa, a mesma que public/index.html carrega do cdnjs. */
const CHART_JS = 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.5.1/chart.umd.min.js';

const CLIENTE_DEMO = {
  id: 1,
  slug: 'demo',
  nome: 'Empresa Demonstração Ltda (dados fictícios)',
  ativo: true,
};

function lerArgumento(nome: string): string | undefined {
  const i = process.argv.indexOf(`--${nome}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

/**
 * Texto que vai para dentro de <script>. Um "</script>" literal dentro de uma
 * string JS fecha a tag no parser do HTML e quebra a pagina inteira — o
 * navegador nao olha se o trecho esta entre aspas.
 */
function seguroEmScript(texto: string): string {
  return texto.replace(/<\/script/gi, '<\\/script');
}

/**
 * Baixa o Chart.js uma vez e guarda em dist/. Embutir em vez de apontar para o
 * cdnjs e o que faz a previa abrir sem internet — e, numa reuniao, tambem o que
 * a protege de wi-fi de sala e de proxy corporativo bloqueando CDN.
 */
async function obterChartJS(): Promise<string> {
  const cache = join(RAIZ, 'dist', 'chart.umd.min.js');

  try {
    return await readFile(cache, 'utf8');
  } catch {
    // Primeira execucao: ainda nao esta em cache.
  }

  console.log('  Baixando Chart.js...');
  const resposta = await fetch(CHART_JS);
  if (!resposta.ok) {
    throw new Error(
      `Nao foi possivel baixar o Chart.js (HTTP ${resposta.status}). ` +
        'Com internet, rode de novo; o arquivo fica em cache em dist/.',
    );
  }

  const codigo = await resposta.text();
  await mkdir(dirname(cache), { recursive: true });
  await writeFile(cache, codigo, 'utf8');
  return codigo;
}

function apurar(de: DataISO, ate: DataISO) {
  const caixa = { de, ate, regime: 'caixa' as const };
  const competencia = { de, ate, regime: 'competencia' as const };

  const movimentosCaixa = listarMovimentosFake(de, ate, true);
  const movimentosCompetencia = listarMovimentosFake(de, ate, false);

  const fluxo = montarFluxoDeCaixa(movimentosCaixa, de, ate);
  const dreCaixa = montarDRE(CONTAS_DRE, CATEGORIAS, movimentosCaixa, caixa);
  const mensalCaixa = montarDREMensal(CONTAS_DRE, CATEGORIAS, movimentosCaixa, caixa);

  // A pagina pede o orcamento do mes do fim do periodo (mesma regra do
  // carregarOrcamento em public/index.html) — a Omie so entrega mes fechado.
  const [anoOrcamento, mesOrcamento] = ate.split('-').map(Number) as [number, number];
  const orcamento = montarOrcamento(
    anoOrcamento,
    mesOrcamento,
    listarOrcamentoFake(anoOrcamento, mesOrcamento),
  );

  return {
    periodo: { de, ate },
    clientes: [CLIENTE_DEMO],
    dre: {
      caixa: dreCaixa,
      competencia: montarDRE(CONTAS_DRE, CATEGORIAS, movimentosCompetencia, competencia),
    },
    mensal: {
      caixa: mensalCaixa,
      competencia: montarDREMensal(CONTAS_DRE, CATEGORIAS, movimentosCompetencia, competencia),
    },
    fluxo,
    // Oportunidades sao sempre regime de caixa, como na rota real.
    oportunidades: analisarOportunidades({ dre: dreCaixa, mensal: mensalCaixa, fluxo, de, ate }),
    orcamento,
  };
}

/**
 * Faixa de aviso. Usa as variaveis de tema da propria pagina (--aviso-fundo,
 * --aviso-borda) em vez de cor fixa: com cor fixa, a faixa continuaria clara
 * quando o cliente alternasse para o tema escuro na reuniao.
 */
const FAIXA = `
  <div class="aviso" style="margin-bottom:16px">
    <h3>Prévia para apresentação — números fictícios</h3>
    <p>
      Todos os valores desta tela são gerados por computador e não pertencem a
      nenhuma empresa real. O que está sendo apresentado é o formato do
      relatório: quais números aparecem, como se relacionam e o que a ferramenta
      aponta a partir deles. Com o acesso à Omie do cliente, estas mesmas telas
      passam a mostrar os dados dele.
    </p>
  </div>`;

/**
 * Entra antes do script da pagina, entao `fetch` ja esta trocado quando a
 * pagina faz a primeira chamada. A pagina nao sabe que virou estatica: continua
 * pedindo /clientes, /dre, /fluxo-caixa como se houvesse servidor.
 */
function scriptDeDados(dados: unknown): string {
  return `
<script>
const PREVIA = ${seguroEmScript(JSON.stringify(dados))};

// A pagina fala com uma API; aqui a API e um objeto em memoria. Trocar o fetch
// mantem o codigo da tela identico ao de producao — nenhum "se for previa" no
// meio da renderizacao.
window.fetch = async (caminho) => {
  const url = new URL(caminho, location.href);
  const regime = url.searchParams.get('regime') === 'competencia' ? 'competencia' : 'caixa';
  const rota = url.pathname;

  let corpo = null;
  if (rota === '/clientes') corpo = PREVIA.clientes;
  else if (rota.endsWith('/dre')) corpo = PREVIA.dre[regime];
  else if (rota.endsWith('/dre-mensal')) corpo = PREVIA.mensal[regime];
  else if (rota.endsWith('/fluxo-caixa')) corpo = PREVIA.fluxo;
  else if (rota.endsWith('/oportunidades')) corpo = PREVIA.oportunidades;
  else if (rota.endsWith('/orcamento')) corpo = PREVIA.orcamento;

  const achou = corpo !== null;
  return new Response(JSON.stringify(achou ? corpo : { erro: 'Rota fora da prévia.' }), {
    status: achou ? 200 : 404,
    headers: { 'Content-Type': 'application/json' },
  });
};
</script>`;
}

/**
 * Entra depois do script da pagina, porque `periodoPadrao()` roda no meio dele
 * e sobrescreveria as datas se elas fossem ajustadas antes.
 */
const SCRIPT_FINAL = `
<script>
(() => {
  // O periodo e fixo: os numeros foram calculados na geracao do arquivo. Deixar
  // o campo editavel faria a tela responder a uma data nova com os numeros da
  // antiga — pior do que nao deixar mexer.
  for (const id of ['de', 'ate']) {
    const campo = document.getElementById(id);
    campo.value = PREVIA.periodo[id === 'de' ? 'de' : 'ate'];
    campo.disabled = true;
    campo.title = 'Período fixo nesta prévia.';
  }

  // A previa nao tem servidor por tras, entao nao ha sessao de verdade para
  // logar — a tela de login (que comeca visivel por padrao) so atrapalharia.
  // carregarClientes() (chamado pelo proprio script da pagina, la embaixo,
  // contra o fetch ja trocado por PREVIA acima) ja teria escondido a tela
  // sozinho, mas isto garante que nao fica um instante de login a mostra caso
  // a ordem dos scripts mude no futuro.
  esconderTelaLogin();

  const nota = document.createElement('div');
  nota.className = 'sub';
  nota.style.margin = '-8px 0 16px';
  nota.textContent =
    'Prévia com período fixo (janeiro a agosto de 2026). O regime e os gráficos ' +
    'são livres — a ferramenta aceita qualquer intervalo de datas.';
  document.querySelector('.barra').after(nota);
})();
</script>`;

/**
 * Monta o HTML da previa e devolve como texto.
 *
 * Separado da escrita em disco para o teste conseguir carregar a pagina num DOM
 * e conferir que os numeros chegam na tela. E o unico jeito de pegar a falha que
 * importa aqui: a previa monta a tela inteira mesmo quando nenhum dado carrega,
 * entao o arquivo parece certo em qualquer inspecao de texto.
 */
export async function montarPrevia(de: DataISO, ate: DataISO): Promise<string> {
  const [pagina, chartjs] = await Promise.all([
    readFile(join(RAIZ, 'public', 'index.html'), 'utf8'),
    obterChartJS(),
  ]);

  const dados = apurar(de, ate);

  const estilo = pagina.slice(pagina.indexOf('<style>'), pagina.indexOf('</head>'));

  let corpo = pagina.slice(
    pagina.indexOf('>', pagina.indexOf('<body')) + 1,
    pagina.indexOf('</body>'),
  );

  // O primeiro <script> do corpo e o da pagina; os dados precisam vir antes.
  const iScript = corpo.indexOf('<script>');
  if (iScript < 0) throw new Error('Nao achei o <script> da pagina em public/index.html.');

  corpo =
    corpo.slice(0, iScript) + scriptDeDados(dados) + corpo.slice(iScript) + SCRIPT_FINAL;

  corpo = corpo.replace('<div class="container">', `<div class="container">${FAIXA}`);

  // Documento completo, com doctype. Sem ele o Chrome renderiza em modo quirks
  // e o layout em flex da pagina colapsa — a tela abre em branco. O charset
  // precisa vir como meta: o arquivo vai ser aberto de file:// e por anexo de
  // e-mail, onde nao existe cabecalho HTTP dizendo que e UTF-8.
  return [
    '<!doctype html>',
    '<html lang="pt-BR">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<title>Painel Financeiro Omie</title>',
    estilo,
    `<script>${seguroEmScript(chartjs)}</script>`,
    '</head>',
    '<body>',
    corpo,
    '</body>',
    '</html>',
  ].join('\n');
}

async function gerar(): Promise<void> {
  const de = (lerArgumento('de') ?? '2026-01-01') as DataISO;
  const ate = (lerArgumento('ate') ?? '2026-08-31') as DataISO;
  // Na raiz do projeto, e nao em dist/: o arquivo existe para ser achado e
  // anexado num e-mail. Enterrado numa pasta de build, ninguem acha.
  const saida = lerArgumento('saida') ?? join(RAIZ, 'Previa-Financeiro-Omie.html');

  const html = await montarPrevia(de, ate);

  await mkdir(dirname(saida), { recursive: true });
  await writeFile(saida, html, 'utf8');

  const kb = (Buffer.byteLength(html, 'utf8') / 1024).toFixed(0);
  console.log(`\n  Prévia gerada: ${saida} (${kb} KB)`);
  console.log(`  Período: ${de} a ${ate}`);
  console.log('  Arquivo único, sem servidor e sem internet — abre com clique duplo.\n');
}

// Só como CLI. O teste importa `montarPrevia` e nao quer gerar arquivo nenhum.
if (import.meta.main) await gerar();
