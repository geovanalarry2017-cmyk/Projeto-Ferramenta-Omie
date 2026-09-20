import { describe, expect, it } from 'vitest';
import { montarOrcamento } from '../src/orcamento/montar.js';
import type { DataISO } from '../src/lib/dates.js';
import type { OrcamentoDoMes } from '../src/orcamento/types.js';

describe('montarOrcamento', () => {
  it('calcula desvio em centavos e em percentual num único mês', () => {
    const porMes: OrcamentoDoMes[] = [
      {
        chave: '2026-09',
        categorias: [
          { cCodCateg: '3.02.01', cDesCateg: 'Aluguel', nValorPrevisto: 1000, nValorRealilzado: 1200 },
        ],
      },
    ];

    const resultado = montarOrcamento('2026-09-01' as DataISO, '2026-09-30' as DataISO, porMes);

    expect(resultado.linhas).toHaveLength(1);
    expect(resultado.linhas[0]).toMatchObject({
      codigo: '3.02.01',
      descricao: 'Aluguel',
      previstoCentavos: 100_000,
      realizadoCentavos: 120_000,
      desvioCentavos: 20_000,
      desvioPercentual: 20,
    });
  });

  it('soma a mesma categoria entre vários meses', () => {
    const porMes: OrcamentoDoMes[] = [
      { chave: '2026-01', categorias: [{ cCodCateg: '1', cDesCateg: 'Aluguel', nValorPrevisto: 100, nValorRealilzado: 80 }] },
      { chave: '2026-02', categorias: [{ cCodCateg: '1', cDesCateg: 'Aluguel', nValorPrevisto: 100, nValorRealilzado: 70 }] },
    ];

    const resultado = montarOrcamento('2026-01-01' as DataISO, '2026-02-28' as DataISO, porMes);

    expect(resultado.linhas).toHaveLength(1);
    expect(resultado.linhas[0]!.previstoCentavos).toBe(20_000);
    expect(resultado.linhas[0]!.realizadoCentavos).toBe(15_000);
    expect(resultado.totalPrevistoCentavos).toBe(20_000);
    expect(resultado.totalRealizadoCentavos).toBe(15_000);
  });

  it('monta um MesOrcamento por mes, com o total daquele mes', () => {
    const porMes: OrcamentoDoMes[] = [
      { chave: '2026-01', categorias: [{ cCodCateg: '1', nValorPrevisto: 100, nValorRealilzado: 80 }] },
      { chave: '2026-02', categorias: [{ cCodCateg: '1', nValorPrevisto: 200, nValorRealilzado: 250 }] },
    ];

    const resultado = montarOrcamento('2026-01-01' as DataISO, '2026-02-28' as DataISO, porMes);

    expect(resultado.meses).toEqual([
      { chave: '2026-01', previstoCentavos: 10_000, realizadoCentavos: 8_000, desvioCentavos: -2_000, temOrcamento: true },
      { chave: '2026-02', previstoCentavos: 20_000, realizadoCentavos: 25_000, desvioCentavos: 5_000, temOrcamento: true },
    ]);
  });

  it('mes sem orcamento cadastrado na Omie fica com temOrcamento false e zerado', () => {
    const porMes: OrcamentoDoMes[] = [
      { chave: '2026-01', categorias: [{ cCodCateg: '1', nValorPrevisto: 100, nValorRealilzado: 100 }] },
      { chave: '2026-02', categorias: [] },
    ];

    const resultado = montarOrcamento('2026-01-01' as DataISO, '2026-02-28' as DataISO, porMes);

    expect(resultado.meses[1]).toEqual({
      chave: '2026-02',
      previstoCentavos: 0,
      realizadoCentavos: 0,
      desvioCentavos: 0,
      temOrcamento: false,
    });
  });

  it('previsto zero nao divide por zero — desvio percentual fica null', () => {
    const porMes: OrcamentoDoMes[] = [
      { chave: '2026-09', categorias: [{ cCodCateg: '1', cDesCateg: 'Sem previsao', nValorPrevisto: 0, nValorRealilzado: 500 }] },
    ];

    const resultado = montarOrcamento('2026-09-01' as DataISO, '2026-09-30' as DataISO, porMes);

    expect(resultado.linhas[0]!.desvioPercentual).toBeNull();
    expect(resultado.linhas[0]!.desvioCentavos).toBe(50_000);
  });

  it('aceita o campo sem o erro de grafia como alias', () => {
    const porMes: OrcamentoDoMes[] = [
      { chave: '2026-09', categorias: [{ cCodCateg: '1', cDesCateg: 'X', nValorPrevisto: 100, nValorRealizado: 90 }] },
    ];

    const resultado = montarOrcamento('2026-09-01' as DataISO, '2026-09-30' as DataISO, porMes);

    expect(resultado.linhas[0]!.realizadoCentavos).toBe(9_000);
  });

  it('descarta categoria sem codigo', () => {
    const porMes: OrcamentoDoMes[] = [
      {
        chave: '2026-09',
        categorias: [
          { cDesCateg: 'Lixo sem codigo', nValorPrevisto: 100, nValorRealilzado: 100 },
          { cCodCateg: '1', cDesCateg: 'Valida', nValorPrevisto: 100, nValorRealilzado: 100 },
        ],
      },
    ];

    const resultado = montarOrcamento('2026-09-01' as DataISO, '2026-09-30' as DataISO, porMes);

    expect(resultado.linhas).toHaveLength(1);
    expect(resultado.linhas[0]!.codigo).toBe('1');
  });

  it('decodifica entidade HTML na descricao', () => {
    const porMes: OrcamentoDoMes[] = [
      { chave: '2026-09', categorias: [{ cCodCateg: '1', cDesCateg: '&lt;Sem categoria&gt;', nValorPrevisto: 10, nValorRealilzado: 10 }] },
    ];

    const resultado = montarOrcamento('2026-09-01' as DataISO, '2026-09-30' as DataISO, porMes);

    expect(resultado.linhas[0]!.descricao).toBe('<Sem categoria>');
  });

  it('periodo sem nenhum mes com orcamento na Omie nao quebra', () => {
    const porMes: OrcamentoDoMes[] = [{ chave: '2026-09', categorias: [] }];

    const resultado = montarOrcamento('2026-09-01' as DataISO, '2026-09-30' as DataISO, porMes);

    expect(resultado.linhas).toEqual([]);
    expect(resultado.totalPrevistoCentavos).toBe(0);
    expect(resultado.totalRealizadoCentavos).toBe(0);
    expect(resultado.totalDesvioCentavos).toBe(0);
  });

  it('ordena as linhas por descricao', () => {
    const porMes: OrcamentoDoMes[] = [
      {
        chave: '2026-09',
        categorias: [
          { cCodCateg: '1', cDesCateg: 'Zebra', nValorPrevisto: 1, nValorRealilzado: 1 },
          { cCodCateg: '2', cDesCateg: 'Abacate', nValorPrevisto: 1, nValorRealilzado: 1 },
        ],
      },
    ];

    const resultado = montarOrcamento('2026-09-01' as DataISO, '2026-09-30' as DataISO, porMes);

    expect(resultado.linhas.map((l) => l.descricao)).toEqual(['Abacate', 'Zebra']);
  });
});
