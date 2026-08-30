import { describe, expect, it } from 'vitest';
import {
  mesesNoPeriodo,
  montarDRE,
  montarDREMensal,
  montarFluxoDeCaixa,
} from '../src/dre/montar.js';
import type { LinhaDRE, LinhaDREMensal } from '../src/dre/types.js';
import type { Categoria, ContaDRE, MovimentoFinanceiro } from '../src/omie/types.js';

/**
 * Estrutura copiada do plano de contas real da Omie: totalizadores sem sinal,
 * folhas com "+" ou "-".
 */
const CONTAS: ContaDRE[] = [
  { codigoDRE: '1', descricaoDRE: 'Lucro Bruto', nivelDRE: 1, sinalDRE: '', totalizaDRE: 'S', naoExibirDRE: 'N' },
  { codigoDRE: '1.01', descricaoDRE: 'Receita Liquida Operacional', nivelDRE: 2, sinalDRE: '', totalizaDRE: 'S', naoExibirDRE: 'N' },
  { codigoDRE: '1.01.01', descricaoDRE: 'Receita Bruta de Vendas', nivelDRE: 3, sinalDRE: '+', totalizaDRE: 'N', naoExibirDRE: 'N' },
  { codigoDRE: '1.01.02', descricaoDRE: 'Impostos', nivelDRE: 3, sinalDRE: '-', totalizaDRE: 'N', naoExibirDRE: 'N' },
  { codigoDRE: '1.21', descricaoDRE: 'Custos', nivelDRE: 2, sinalDRE: '', totalizaDRE: 'S', naoExibirDRE: 'N' },
  { codigoDRE: '1.21.02', descricaoDRE: 'Custo dos Servicos Prestados', nivelDRE: 3, sinalDRE: '-', totalizaDRE: 'N', naoExibirDRE: 'N' },
  { codigoDRE: '2', descricaoDRE: 'Despesas', nivelDRE: 1, sinalDRE: '', totalizaDRE: 'S', naoExibirDRE: 'N' },
  { codigoDRE: '2.11', descricaoDRE: 'Fixas', nivelDRE: 2, sinalDRE: '', totalizaDRE: 'S', naoExibirDRE: 'N' },
  { codigoDRE: '2.11.01', descricaoDRE: 'Despesas com Pessoal', nivelDRE: 3, sinalDRE: '-', totalizaDRE: 'N', naoExibirDRE: 'N' },
];

/**
 * A armadilha do projeto: a categoria "1.01.02" e uma RECEITA de servicos,
 * enquanto o DRE "1.01.02" e a linha de IMPOSTOS, que subtrai. As numeracoes se
 * parecem e sao independentes — o vinculo correto e o campo codigo_dre.
 */
const CATEGORIAS: Categoria[] = [
  { codigo: '1.01.01', descricao: 'Vendas de mercadoria', codigo_dre: '1.01.01', conta_receita: 'S', totalizadora: 'N' },
  { codigo: '1.01.02', descricao: 'Clientes - Servicos Prestados', codigo_dre: '1.01.01', conta_receita: 'S', totalizadora: 'N' },
  { codigo: '2.01.01', descricao: 'Impostos sobre venda', codigo_dre: '1.01.02', conta_despesa: 'S', totalizadora: 'N' },
  { codigo: '2.02.01', descricao: 'Salarios', codigo_dre: '2.11.01', conta_despesa: 'S', totalizadora: 'N' },
  { codigo: '9.99.99', descricao: 'Categoria sem vinculo de DRE', conta_despesa: 'S', totalizadora: 'N' },
];

function movimento(
  categoria: string,
  valor: number,
  extras: Partial<MovimentoFinanceiro['detalhes']> = {},
): MovimentoFinanceiro {
  return {
    detalhes: { cCodCateg: categoria, nValorTitulo: valor, dDtPagamento: '15/08/2026', ...extras },
    resumo: { nValPago: valor },
  };
}

function acharLinha(linhas: LinhaDRE[], codigo: string): LinhaDRE | undefined {
  for (const linha of linhas) {
    if (linha.codigo === codigo) return linha;
    const achou = acharLinha(linha.filhos, codigo);
    if (achou) return achou;
  }
  return undefined;
}

function acharMensal(linhas: LinhaDREMensal[], codigo: string): LinhaDREMensal | undefined {
  for (const linha of linhas) {
    if (linha.codigo === codigo) return linha;
    const achou = acharMensal(linha.filhos, codigo);
    if (achou) return achou;
  }
  return undefined;
}

const PERIODO = { de: '2026-08-01', ate: '2026-08-31', regime: 'caixa' as const };

describe('montarDRE', () => {
  it('classifica pelo codigo_dre, nao pelo codigo da categoria', () => {
    // Se usasse o codigo da categoria, esta receita cairia na linha de
    // Impostos e seria SUBTRAIDA. E o erro mais caro possivel aqui.
    const dre = montarDRE(CONTAS, CATEGORIAS, [movimento('1.01.02', 1000)], PERIODO);

    expect(acharLinha(dre.linhas, '1.01.01')?.valorCentavos).toBe(100_000);
    expect(acharLinha(dre.linhas, '1.01.02')?.valorCentavos).toBe(0);
  });

  it('aplica o sinal da conta: receita soma, imposto subtrai', () => {
    const dre = montarDRE(
      CONTAS,
      CATEGORIAS,
      [movimento('1.01.01', 1000), movimento('2.01.01', 150)],
      PERIODO,
    );

    expect(acharLinha(dre.linhas, '1.01.01')?.valorCentavos).toBe(100_000);
    expect(acharLinha(dre.linhas, '1.01.02')?.valorCentavos).toBe(-15_000);
    // Receita liquida = 1000 - 150
    expect(acharLinha(dre.linhas, '1.01')?.valorCentavos).toBe(85_000);
  });

  it('totaliza de baixo para cima', () => {
    const dre = montarDRE(
      CONTAS,
      CATEGORIAS,
      [movimento('1.01.01', 1000), movimento('2.01.01', 150), movimento('2.02.01', 300)],
      PERIODO,
    );

    expect(acharLinha(dre.linhas, '1')?.valorCentavos).toBe(85_000); // Lucro Bruto
    expect(acharLinha(dre.linhas, '2')?.valorCentavos).toBe(-30_000); // Despesas
    // Resultado = 850 - 300
    expect(dre.resultadoCentavos).toBe(55_000);
  });

  it('monta a hierarquia a partir do codigo', () => {
    const dre = montarDRE(CONTAS, CATEGORIAS, [], PERIODO);

    expect(dre.linhas.map((l) => l.codigo)).toEqual(['1', '2']);
    expect(acharLinha(dre.linhas, '1')?.filhos.map((f) => f.codigo)).toEqual(['1.01', '1.21']);
    expect(acharLinha(dre.linhas, '1.01')?.filhos.map((f) => f.codigo)).toEqual([
      '1.01.01',
      '1.01.02',
    ]);
  });

  it('separa o que nao tem vinculo de DRE em vez de descartar', () => {
    // Um DRE que "fecha" escondendo dinheiro e pior do que um que avisa.
    const dre = montarDRE(
      CONTAS,
      CATEGORIAS,
      [movimento('1.01.01', 1000), movimento('9.99.99', 250)],
      PERIODO,
    );

    expect(dre.naoClassificado.totalCentavos).toBe(25_000);
    expect(dre.naoClassificado.categorias).toHaveLength(1);
    expect(dre.naoClassificado.categorias[0]!.descricao).toBe('Categoria sem vinculo de DRE');
    expect(dre.resultadoCentavos).toBe(100_000); // nao entra no resultado
  });

  it('trata categoria que aponta para conta de DRE inexistente', () => {
    const orfa: Categoria[] = [
      { codigo: '5.00.00', descricao: 'Aponta pro vazio', codigo_dre: '9.99.99', totalizadora: 'N' },
    ];
    const dre = montarDRE(CONTAS, orfa, [movimento('5.00.00', 100)], PERIODO);

    expect(dre.naoClassificado.totalCentavos).toBe(10_000);
  });

  it('divide o valor entre categorias quando ha rateio', () => {
    // Ignorar o rateio jogaria tudo na primeira categoria e distorceria o DRE.
    const comRateio: MovimentoFinanceiro = {
      detalhes: { cCodCateg: '1.01.01', nValorTitulo: 1000, dDtPagamento: '15/08/2026' },
      resumo: { nValPago: 1000 },
      categorias: [
        { cCodCateg: '1.01.01', nDistrValor: 700 },
        { cCodCateg: '2.02.01', nDistrValor: 300 },
      ],
    };

    const dre = montarDRE(CONTAS, CATEGORIAS, [comRateio], PERIODO);

    expect(acharLinha(dre.linhas, '1.01.01')?.valorCentavos).toBe(70_000);
    expect(acharLinha(dre.linhas, '2.11.01')?.valorCentavos).toBe(-30_000);
  });

  it('reduz o rateio na proporcao do que foi pago, no regime de caixa', () => {
    // Os valores distribuidos vem do titulo cheio (700/300), mas so 500 dos
    // 1000 entraram. No caixa tem que virar 350/150 — contar 700/300 colocaria
    // no DRE dinheiro que nao entrou.
    const parcialRateado: MovimentoFinanceiro = {
      detalhes: { cCodCateg: '1.01.01', nValorTitulo: 1000, dDtPagamento: '15/08/2026' },
      resumo: { nValPago: 500 },
      categorias: [
        { cCodCateg: '1.01.01', nDistrValor: 700 },
        { cCodCateg: '2.02.01', nDistrValor: 300 },
      ],
    };

    const caixa = montarDRE(CONTAS, CATEGORIAS, [parcialRateado], PERIODO);

    expect(acharLinha(caixa.linhas, '1.01.01')?.valorCentavos).toBe(35_000);
    expect(acharLinha(caixa.linhas, '2.11.01')?.valorCentavos).toBe(-15_000);
  });

  it('nao perde centavos ao reescalar um rateio', () => {
    // 1/3 de 1000 nao e exato: as tres fatias reescaladas tem que somar
    // exatamente o valor pago, com a sobra caindo na maior.
    const tercos: MovimentoFinanceiro = {
      detalhes: { cCodCateg: '1.01.01', nValorTitulo: 1000, dDtPagamento: '15/08/2026' },
      resumo: { nValPago: 10 },
      categorias: [
        { cCodCateg: '1.01.01', nDistrValor: 334 },
        { cCodCateg: '1.01.01', nDistrValor: 333 },
        { cCodCateg: '1.01.01', nDistrValor: 333 },
      ],
    };

    const caixa = montarDRE(CONTAS, CATEGORIAS, [tercos], PERIODO);

    expect(acharLinha(caixa.linhas, '1.01.01')?.valorCentavos).toBe(1_000);
  });

  it('usa o percentual quando o rateio nao traz valor', () => {
    const porPercentual: MovimentoFinanceiro = {
      detalhes: { cCodCateg: '1.01.01', nValorTitulo: 1000, dDtPagamento: '15/08/2026' },
      resumo: { nValPago: 1000 },
      categorias: [
        { cCodCateg: '1.01.01', nDistrPercentual: 60 },
        { cCodCateg: '2.02.01', nDistrPercentual: 40 },
      ],
    };

    const dre = montarDRE(CONTAS, CATEGORIAS, [porPercentual], PERIODO);

    expect(acharLinha(dre.linhas, '1.01.01')?.valorCentavos).toBe(60_000);
    expect(acharLinha(dre.linhas, '2.11.01')?.valorCentavos).toBe(-40_000);
  });

  it('no regime de caixa usa o valor pago, na competencia o do titulo', () => {
    // Titulo de 1000 com apenas 400 pagos: os dois regimes tem que divergir.
    const parcial: MovimentoFinanceiro = {
      detalhes: { cCodCateg: '1.01.01', nValorTitulo: 1000, dDtPagamento: '15/08/2026' },
      resumo: { nValPago: 400 },
    };

    const caixa = montarDRE(CONTAS, CATEGORIAS, [parcial], PERIODO);
    const competencia = montarDRE(CONTAS, CATEGORIAS, [parcial], {
      ...PERIODO,
      regime: 'competencia',
    });

    expect(acharLinha(caixa.linhas, '1.01.01')?.valorCentavos).toBe(40_000);
    expect(acharLinha(competencia.linhas, '1.01.01')?.valorCentavos).toBe(100_000);
  });

  it('descarta movimento cuja data cai fora do periodo pedido', () => {
    // Rede de seguranca contra o filtro de data da Omie vir mais frouxo do que
    // o pedido: sem isso, movimento de outro mes entraria no DRE calado.
    const dre = montarDRE(
      CONTAS,
      CATEGORIAS,
      [
        movimento('1.01.01', 1000, { dDtPagamento: '15/08/2026' }),
        movimento('1.01.01', 9999, { dDtPagamento: '15/09/2026' }),
      ],
      PERIODO,
    );

    expect(acharLinha(dre.linhas, '1.01.01')?.valorCentavos).toBe(100_000);
    expect(dre.diagnostico.movimentosForaDoPeriodo).toBe(1);
  });

  it('usa a data de emissao para o corte na competencia', () => {
    const dre = montarDRE(
      CONTAS,
      CATEGORIAS,
      [
        {
          detalhes: {
            cCodCateg: '1.01.01',
            nValorTitulo: 1000,
            dDtEmissao: '10/08/2026',
            dDtPagamento: '10/12/2026',
          },
          resumo: { nValPago: 1000 },
        },
      ],
      { ...PERIODO, regime: 'competencia' },
    );

    // Emitido em agosto, pago em dezembro: entra na competencia de agosto.
    expect(acharLinha(dre.linhas, '1.01.01')?.valorCentavos).toBe(100_000);
    expect(dre.diagnostico.movimentosForaDoPeriodo).toBe(0);
  });

  it('conta movimento sem valor e sem categoria no diagnostico', () => {
    const dre = montarDRE(
      CONTAS,
      CATEGORIAS,
      [
        movimento('1.01.01', 0),
        { detalhes: { nValorTitulo: 100 }, resumo: { nValPago: 100 } },
      ],
      PERIODO,
    );

    expect(dre.diagnostico.movimentosSemValor).toBe(1);
    expect(dre.diagnostico.movimentosSemCategoria).toBe(1);
    expect(dre.diagnostico.categoriasComVinculoDRE).toBe(4);
    expect(dre.diagnostico.categoriasTotais).toBe(5);
  });

  it('devolve estrutura zerada quando nao ha movimento', () => {
    const dre = montarDRE(CONTAS, CATEGORIAS, [], PERIODO);

    expect(dre.resultadoCentavos).toBe(0);
    expect(dre.linhas).toHaveLength(2);
    expect(acharLinha(dre.linhas, '1.01.01')?.valorCentavos).toBe(0);
  });
});

describe('mesesNoPeriodo', () => {
  it('recorta o primeiro e o ultimo mes pelas pontas do periodo', () => {
    const meses = mesesNoPeriodo('2026-01-15', '2026-03-10');

    expect(meses.map((m) => [m.chave, m.de, m.ate])).toEqual([
      ['2026-01', '2026-01-15', '2026-01-31'],
      ['2026-02', '2026-02-01', '2026-02-28'],
      ['2026-03', '2026-03-01', '2026-03-10'],
    ]);
  });

  it('acha o ultimo dia de fevereiro em ano bissexto', () => {
    expect(mesesNoPeriodo('2028-02-01', '2028-02-29')[0]?.ate).toBe('2028-02-29');
  });

  it('atravessa a virada do ano', () => {
    expect(mesesNoPeriodo('2026-11-01', '2027-01-31').map((m) => m.chave)).toEqual([
      '2026-11',
      '2026-12',
      '2027-01',
    ]);
  });
});

describe('montarDREMensal', () => {
  /** Movimento pago numa data especifica, para cair no mes que se quer testar. */
  const pago = (data: string, valor: number, categoria = '1.01.01'): MovimentoFinanceiro =>
    movimento(categoria, valor, { dDtPagamento: data });

  const MENSAL = { de: '2026-01-01', ate: '2026-03-31', regime: 'caixa' as const };

  it('separa os valores por mes', () => {
    const dre = montarDREMensal(
      CONTAS,
      CATEGORIAS,
      [pago('10/01/2026', 100), pago('20/01/2026', 50), pago('05/03/2026', 700)],
      MENSAL,
    );

    expect(dre.meses.map((m) => m.chave)).toEqual(['2026-01', '2026-02', '2026-03']);
    expect(acharMensal(dre.linhas, '1.01.01')?.valores).toEqual([15_000, 0, 70_000]);
  });

  it('a soma dos meses fecha com o total da linha e com o resultado', () => {
    const dre = montarDREMensal(
      CONTAS,
      CATEGORIAS,
      [pago('10/01/2026', 100), pago('05/02/2026', 300), pago('05/03/2026', 700)],
      MENSAL,
    );

    const linha = acharMensal(dre.linhas, '1.01.01');
    expect(linha?.totalCentavos).toBe(110_000);
    expect(linha?.valores.reduce((s, v) => s + v, 0)).toBe(linha?.totalCentavos);
    expect(dre.meses.reduce((s, m) => s + m.resultadoCentavos, 0)).toBe(dre.resultadoCentavos);
  });

  it('bate com o DRE do periodo inteiro apurado de uma vez', () => {
    // A matriz nao pode contar dinheiro diferente do relatorio simples: se
    // divergir, uma das duas telas esta mentindo e nao da para saber qual.
    const movimentos = [
      pago('10/01/2026', 100),
      pago('28/02/2026', 250, '2.01.01'),
      pago('31/03/2026', 700),
    ];

    const mensal = montarDREMensal(CONTAS, CATEGORIAS, movimentos, MENSAL);
    const inteiro = montarDRE(CONTAS, CATEGORIAS, movimentos, MENSAL);

    expect(mensal.resultadoCentavos).toBe(inteiro.resultadoCentavos);
    expect(acharMensal(mensal.linhas, '1.01')?.totalCentavos).toBe(
      acharLinha(inteiro.linhas, '1.01')?.valorCentavos,
    );
  });

  it('mantem o que ficou fora do DRE visivel', () => {
    const dre = montarDREMensal(
      CONTAS,
      CATEGORIAS,
      [pago('10/01/2026', 100, '9.99.99')],
      MENSAL,
    );

    expect(dre.naoClassificadoCentavos).toBe(10_000);
    expect(dre.meses[0]?.naoClassificadoCentavos).toBe(10_000);
  });
});

describe('montarFluxoDeCaixa', () => {
  const movimentos: MovimentoFinanceiro[] = [
    { detalhes: { dDtPagamento: '03/08/2026', cNatureza: 'R' }, resumo: { nValPago: 1000 } },
    { detalhes: { dDtPagamento: '03/08/2026', cNatureza: 'P' }, resumo: { nValPago: 400 } },
    { detalhes: { dDtPagamento: '05/08/2026', cNatureza: 'P' }, resumo: { nValPago: 250 } },
  ];

  it('agrupa por dia separando entrada de saida', () => {
    const fluxo = montarFluxoDeCaixa(movimentos, '2026-08-01', '2026-08-31');

    expect(fluxo.dias).toHaveLength(2);
    expect(fluxo.dias[0]).toMatchObject({
      data: '2026-08-03',
      entradasCentavos: 100_000,
      saidasCentavos: 40_000,
      saldoDoDiaCentavos: 60_000,
    });
  });

  it('acumula o saldo dia a dia', () => {
    const fluxo = montarFluxoDeCaixa(movimentos, '2026-08-01', '2026-08-31');

    expect(fluxo.dias[0]!.saldoAcumuladoCentavos).toBe(60_000);
    expect(fluxo.dias[1]!.saldoAcumuladoCentavos).toBe(35_000);
  });

  it('parte de um saldo inicial quando informado', () => {
    const fluxo = montarFluxoDeCaixa(movimentos, '2026-08-01', '2026-08-31', 100_000);
    expect(fluxo.dias[0]!.saldoAcumuladoCentavos).toBe(160_000);
  });

  it('ignora movimento fora do periodo', () => {
    const fora = [
      ...movimentos,
      { detalhes: { dDtPagamento: '20/09/2026', cNatureza: 'R' }, resumo: { nValPago: 9999 } },
    ];
    const fluxo = montarFluxoDeCaixa(fora, '2026-08-01', '2026-08-31');

    expect(fluxo.dias).toHaveLength(2);
    expect(fluxo.totalEntradasCentavos).toBe(100_000);
  });

  it('totaliza o periodo', () => {
    const fluxo = montarFluxoDeCaixa(movimentos, '2026-08-01', '2026-08-31');

    expect(fluxo.totalEntradasCentavos).toBe(100_000);
    expect(fluxo.totalSaidasCentavos).toBe(65_000);
    expect(fluxo.saldoPeriodoCentavos).toBe(35_000);
  });
});
