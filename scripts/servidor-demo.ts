import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import express, { type Request, type Response } from 'express';
import type { DataISO } from '../src/lib/dates.js';
import { montarDRE, montarDREMensal, montarFluxoDeCaixa } from '../src/dre/montar.js';
import { analisarOportunidades } from '../src/oportunidades/analisar.js';
import type { Regime } from '../src/dre/types.js';
import { CATEGORIAS, CONTAS_DRE, listarMovimentosFake } from './dados-fake.js';

/**
 * Servidor de demonstracao: o dashboard de verdade, com numeros fabricados.
 *
 *   npm run demo
 *
 * Serve para ver e conferir o relatorio sem depender da conta Omie real (que
 * hoje esta vazia) e sem banco, credencial ou .env — nada aqui importa
 * `config/env.ts`, `db/pool.ts` nem o cliente HTTP da Omie. O calculo, esse
 * sim, e o de producao: `montarDRE` e `montarFluxoDeCaixa`, os mesmos que o
 * servidor real chama. Se a conta fecha errado aqui, fecha errado la.
 *
 * O que este servidor substitui e so a *fonte* dos dados.
 */

const AQUI = dirname(fileURLToPath(import.meta.url));
const PASTA_PUBLICA = join(AQUI, '..', 'public');

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

const PORTA = Number(lerArgumento('porta') ?? 3001);

/** Mesma validacao da rota real, reescrita aqui para nao arrastar o env junto. */
function lerPeriodo(req: Request, res: Response): { de: DataISO; ate: DataISO } | null {
  const de = typeof req.query.de === 'string' ? req.query.de : '';
  const ate = typeof req.query.ate === 'string' ? req.query.ate : '';

  if (!/^\d{4}-\d{2}-\d{2}$/.test(de) || !/^\d{4}-\d{2}-\d{2}$/.test(ate)) {
    res.status(400).json({ erro: 'Informe de e ate no formato AAAA-MM-DD.' });
    return null;
  }
  if (de > ate) {
    res.status(400).json({ erro: 'A data inicial nao pode ser maior que a final.' });
    return null;
  }

  return { de, ate };
}

/**
 * Deixa evidente na propria tela que o numero e inventado.
 *
 * A injecao acontece so aqui, na resposta: `public/index.html` continua
 * intocado, sem nenhum vestigio de modo demo no arquivo que vai para producao.
 * Este servidor nao exige login (nenhuma rota checa sessao) — o proprio
 * script da pagina, ao achar `/clientes` respondendo, ja esconde a tela de
 * login sozinho.
 */
function comAvisoDeDemo(html: string): string {
  const faixa = `
<div style="position:sticky;top:0;z-index:9;margin:-24px -24px 20px;padding:10px 24px;
            background:#8a5a00;color:#fff;font:600 13px/1.4 system-ui,sans-serif">
  Modo demonstração — todos os valores são fictícios e gerados localmente.
  Nenhuma conta Omie ou banco foi consultado.
</div>`;

  return html.replace('<div class="container">', `<div class="container">${faixa}`);
}

const app = express();

app.get('/', async (_req: Request, res: Response) => {
  const html = await readFile(join(PASTA_PUBLICA, 'index.html'), 'utf8');
  res.type('html').send(comAvisoDeDemo(html));
});

app.get('/clientes', (_req: Request, res: Response) => {
  res.json([CLIENTE_DEMO]);
});

app.get('/clientes/:cliente/dre', (req: Request, res: Response) => {
  const periodo = lerPeriodo(req, res);
  if (!periodo) return;

  const regime: Regime = req.query.regime === 'competencia' ? 'competencia' : 'caixa';
  const movimentos = listarMovimentosFake(periodo.de, periodo.ate, regime === 'caixa');

  res.json(montarDRE(CONTAS_DRE, CATEGORIAS, movimentos, { ...periodo, regime }));
});

app.get('/clientes/:cliente/dre-mensal', (req: Request, res: Response) => {
  const periodo = lerPeriodo(req, res);
  if (!periodo) return;

  const regime: Regime = req.query.regime === 'competencia' ? 'competencia' : 'caixa';
  const movimentos = listarMovimentosFake(periodo.de, periodo.ate, regime === 'caixa');

  res.json(montarDREMensal(CONTAS_DRE, CATEGORIAS, movimentos, { ...periodo, regime }));
});

app.get('/clientes/:cliente/fluxo-caixa', (req: Request, res: Response) => {
  const periodo = lerPeriodo(req, res);
  if (!periodo) return;

  // Fluxo de caixa e sempre regime de caixa: data de pagamento.
  const movimentos = listarMovimentosFake(periodo.de, periodo.ate, true);

  res.json(montarFluxoDeCaixa(movimentos, periodo.de, periodo.ate));
});

app.get('/clientes/:cliente/oportunidades', (req: Request, res: Response) => {
  const periodo = lerPeriodo(req, res);
  if (!periodo) return;

  // Sempre caixa, como no servidor real.
  const opcoes = { ...periodo, regime: 'caixa' as const };
  const movimentos = listarMovimentosFake(periodo.de, periodo.ate, true);

  res.json(
    analisarOportunidades({
      dre: montarDRE(CONTAS_DRE, CATEGORIAS, movimentos, opcoes),
      mensal: montarDREMensal(CONTAS_DRE, CATEGORIAS, movimentos, opcoes),
      fluxo: montarFluxoDeCaixa(movimentos, periodo.de, periodo.ate),
      ...periodo,
    }),
  );
});

app.use(express.static(PASTA_PUBLICA));

app.listen(PORTA, () => {
  console.log(`\n  Dashboard de demonstração: http://localhost:${PORTA}\n`);
  console.log('  Dados fictícios e determinísticos — o mesmo período devolve');
  console.log('  sempre os mesmos números. Sem banco, sem Omie, sem .env.\n');
});
