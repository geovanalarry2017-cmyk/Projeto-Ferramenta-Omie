import { describe, expect, it } from 'vitest';
import { analisarOportunidades } from '../src/oportunidades/analisar.js';
import { montarDRE, montarDREMensal, montarFluxoDeCaixa } from '../src/dre/montar.js';
import type { Categoria, ContaDRE, MovimentoFinanceiro } from '../src/omie/types.js';

/**
 * Plano de contas minimo, com uma linha de receita e duas de despesa — o
 * suficiente para exercitar cada analise sem virar fixture ilegivel.
 */
const CONTAS: ContaDRE[] = [
  { codigoDRE: '1', descricaoDRE: 'Lucro Bruto', nivelDRE: 1, sinalDRE: '', totalizaDRE: 'S', naoExibirDRE: 'N' },
  { codigoDRE: '1.01', descricaoDRE: 'Receita Liquida', nivelDRE: 2, sinalDRE: '', totalizaDRE: 'S', naoExibirDRE: 'N' },
  { codigoDRE: '1.01.01', descricaoDRE: 'Vendas', nivelDRE: 3, sinalDRE: '+', totalizaDRE: 'N', naoExibirDRE: 'N' },
  { codigoDRE: '1.01.02', descricaoDRE: 'Servicos', nivelDRE: 3, sinalDRE: '+', totalizaDRE: 'N', naoExibirDRE: 'N' },
  { codigoDRE: '2', descricaoDRE: 'Despesas', nivelDRE: 1, sinalDRE: '', totalizaDRE: 'S', naoExibirDRE: 'N' },
  { codigoDRE: '2.01', descricaoDRE: 'Operacionais', nivelDRE: 2, sinalDRE: '', totalizaDRE: 'S', naoExibirDRE: 'N' },
  { codigoDRE: '2.01.01', descricaoDRE: 'Marketing', nivelDRE: 3, sinalDRE: '-', totalizaDRE: 'N', naoExibirDRE: 'N' },
  { codigoDRE: '2.01.02', descricaoDRE: 'Aluguel', nivelDRE: 3, sinalDRE: '-', totalizaDRE: 'N', naoExibirDRE: 'N' },
  { codigoDRE: '2.01.03', descricaoDRE: 'Folha', nivelDRE: 3, sinalDRE: '-', totalizaDRE: 'N', naoExibirDRE: 'N' },
  { codigoDRE: '2.01.04', descricaoDRE: 'Tarifas', nivelDRE: 3, sinalDRE: '-', totalizaDRE: 'N', naoExibirDRE: 'N' },
];

const CATEGORIAS: Categoria[] = [
  { codigo: 'C-VENDAS', descricao: 'Vendas', codigo_dre: '1.01.01' },
  { codigo: 'C-SERVICOS', descricao: 'Servicos', codigo_dre: '1.01.02' },
  { codigo: 'C-MKT', descricao: 'Marketing', codigo_dre: '2.01.01' },
  { codigo: 'C-ALUGUEL', descricao: 'Aluguel', codigo_dre: '2.01.02' },
  { codigo: 'C-FOLHA', descricao: 'Folha', codigo_dre: '2.01.03' },
  { codigo: 'C-TARIFAS', descricao: 'Tarifas', codigo_dre: '2.01.04' },
  { codigo: 'C-SOLTA', descricao: 'Transferencia entre contas' },
];

/** `natureza` R entra no caixa, P sai — é o que o fluxo de caixa lê. */
function mov(
  data: string,
  categoria: string,
  valor: number,
  natureza: 'R' | 'P',
): MovimentoFinanceiro {
  return {
    detalhes: { cCodCateg: categoria, nValorTitulo: valor, dDtPagamento: data, cNatureza: natureza },
    resumo: { nValPago: valor },
  };
}

const DE = '2026-01-01';
const ATE = '2026-04-30';

function analisar(movimentos: MovimentoFinanceiro[], de = DE, ate = ATE) {
  const opcoes = { de, ate, regime: 'caixa' as const };
  return analisarOportunidades({
    dre: montarDRE(CONTAS, CATEGORIAS, movimentos, opcoes),
    mensal: montarDREMensal(CONTAS, CATEGORIAS, movimentos, opcoes),
    fluxo: montarFluxoDeCaixa(movimentos, de, ate),
    de,
    ate,
  });
}

const acharItem = (r: ReturnType<typeof analisar>, id: string) =>
  r.itens.find((i) => i.id === id || i.id.startsWith(`${id}:`));

/** Quatro meses de operação saudável, para servir de base aos testes. */
function mesesNormais(): MovimentoFinanceiro[] {
  const movimentos: MovimentoFinanceiro[] = [];
  for (const mes of ['01', '02', '03', '04']) {
    movimentos.push(mov(`05/${mes}/2026`, 'C-VENDAS', 10_000, 'R'));
    movimentos.push(mov(`06/${mes}/2026`, 'C-SERVICOS', 8_000, 'R'));
    movimentos.push(mov(`10/${mes}/2026`, 'C-MKT', 1_000, 'P'));
    movimentos.push(mov(`11/${mes}/2026`, 'C-ALUGUEL', 2_000, 'P'));
    movimentos.push(mov(`12/${mes}/2026`, 'C-FOLHA', 5_000, 'P'));
    movimentos.push(mov(`13/${mes}/2026`, 'C-TARIFAS', 100, 'P'));
  }
  return movimentos;
}

describe('analisarOportunidades', () => {
  it('nao inventa alerta quando o negocio esta saudavel', () => {
    const r = analisar(mesesNormais());

    // Concentracao de saidas e informativa e sempre aparece; o que nao pode
    // aparecer e alerta de problema onde nao ha problema.
    expect(r.itens.filter((i) => i.severidade === 'alta')).toHaveLength(0);
    expect(acharItem(r, 'despesa-em-alta')).toBeUndefined();
    expect(acharItem(r, 'margem-caindo')).toBeUndefined();
    expect(acharItem(r, 'meses-no-vermelho')).toBeUndefined();
  });

  it('aponta o dinheiro que ficou fora do DRE', () => {
    const r = analisar([...mesesNormais(), mov('20/03/2026', 'C-SOLTA', 4_000, 'P')]);
    const item = acharItem(r, 'fora-do-dre');

    expect(item?.severidade).toBe('alta');
    expect(item?.valorCentavos).toBe(400_000);
    expect(item?.acao).toMatch(/vincule/i);
  });

  it('acusa despesa que disparou contra a media dos meses anteriores', () => {
    const r = analisar([...mesesNormais(), mov('20/04/2026', 'C-MKT', 6_000, 'P')]);
    const item = acharItem(r, 'despesa-em-alta');

    // Marketing: 1.000 nos tres primeiros meses, 7.000 no ultimo.
    expect(item?.titulo).toContain('Marketing');
    expect(item?.valorCentavos).toBe(600_000);
  });

  it('nao fala em tendencia com menos de tres meses', () => {
    // Um mes so: qualquer variacao seria ruido, e afirmar tendencia aqui seria
    // dizer mais do que o dado sustenta.
    const curto = [
      mov('05/01/2026', 'C-VENDAS', 10_000, 'R'),
      mov('10/01/2026', 'C-MKT', 9_000, 'P'),
    ];
    const r = analisar(curto, '2026-01-01', '2026-01-31');

    expect(acharItem(r, 'despesa-em-alta')).toBeUndefined();
    expect(acharItem(r, 'margem-caindo')).toBeUndefined();
    expect(r.diagnostico.precisaMaisMeses).toBe(true);
  });

  it('marca os meses que fecharam no vermelho', () => {
    const r = analisar([...mesesNormais(), mov('25/02/2026', 'C-FOLHA', 40_000, 'P')]);
    const item = acharItem(r, 'meses-no-vermelho');

    expect(item?.severidade).toBe('alta');
    expect(item?.achado).toContain('2026-02');
  });

  it('avisa quando o caixa fica negativo, com o pior dia', () => {
    // Despesa grande no dia 2, antes de qualquer recebimento do mes.
    const r = analisar(
      [mov('02/01/2026', 'C-FOLHA', 30_000, 'P'), mov('20/01/2026', 'C-VENDAS', 50_000, 'R')],
      '2026-01-01',
      '2026-01-31',
    );
    const item = acharItem(r, 'caixa-negativo');

    expect(item?.severidade).toBe('alta');
    expect(item?.achado).toContain('2026-01-02');
    expect(item?.valorCentavos).toBe(3_000_000);
  });

  it('avisa sobre receita concentrada numa linha so', () => {
    const r = analisar([
      ...mesesNormais(),
      mov('15/03/2026', 'C-VENDAS', 200_000, 'R'),
    ]);
    const item = acharItem(r, 'concentracao-receita');

    expect(item?.titulo).toContain('concentrada');
    expect(item?.achado).toContain('Vendas');
  });

  it('mostra onde a negociacao rende mais', () => {
    const item = acharItem(analisar(mesesNormais()), 'concentracao-saidas');

    expect(item?.severidade).toBe('informativa');
    expect(item?.achado).toMatch(/Folha|Aluguel|Marketing/);
  });

  it('poe o mais grave em primeiro e soma o que esta em jogo', () => {
    const r = analisar([
      ...mesesNormais(),
      mov('20/03/2026', 'C-SOLTA', 4_000, 'P'),
      mov('25/02/2026', 'C-FOLHA', 40_000, 'P'),
    ]);

    expect(r.itens[0]?.severidade).toBe('alta');
    expect(r.resumo.alta).toBeGreaterThanOrEqual(2);
    expect(r.resumo.emJogoCentavos).toBeGreaterThan(0);
  });

  it('devolve lista vazia sem movimento nenhum', () => {
    const r = analisar([]);

    expect(r.itens).toHaveLength(0);
    expect(r.resumo.emJogoCentavos).toBe(0);
  });
});
