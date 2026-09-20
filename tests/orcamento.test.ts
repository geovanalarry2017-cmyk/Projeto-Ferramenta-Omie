import { describe, expect, it } from 'vitest';
import { montarOrcamento } from '../src/orcamento/montar.js';
import type { OrcamentoCategoria } from '../src/omie/types.js';

describe('montarOrcamento', () => {
  it('calcula desvio em centavos e em percentual', () => {
    const categorias: OrcamentoCategoria[] = [
      { cCodCateg: '3.02.01', cDesCateg: 'Aluguel', nValorPrevisto: 1000, nValorRealilzado: 1200 },
    ];

    const resultado = montarOrcamento(2026, 9, categorias);

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

  it('soma os totais do mes', () => {
    const categorias: OrcamentoCategoria[] = [
      { cCodCateg: '1', cDesCateg: 'A', nValorPrevisto: 100, nValorRealilzado: 80 },
      { cCodCateg: '2', cDesCateg: 'B', nValorPrevisto: 50, nValorRealilzado: 70 },
    ];

    const resultado = montarOrcamento(2026, 9, categorias);

    expect(resultado.totalPrevistoCentavos).toBe(15_000);
    expect(resultado.totalRealizadoCentavos).toBe(15_000);
    expect(resultado.totalDesvioCentavos).toBe(0);
  });

  it('previsto zero nao divide por zero — desvio percentual fica null', () => {
    const categorias: OrcamentoCategoria[] = [
      { cCodCateg: '1', cDesCateg: 'Sem previsao', nValorPrevisto: 0, nValorRealilzado: 500 },
    ];

    const resultado = montarOrcamento(2026, 9, categorias);

    expect(resultado.linhas[0]!.desvioPercentual).toBeNull();
    expect(resultado.linhas[0]!.desvioCentavos).toBe(50_000);
  });

  it('aceita o campo sem o erro de grafia como alias', () => {
    const categorias: OrcamentoCategoria[] = [
      { cCodCateg: '1', cDesCateg: 'X', nValorPrevisto: 100, nValorRealizado: 90 },
    ];

    const resultado = montarOrcamento(2026, 9, categorias);

    expect(resultado.linhas[0]!.realizadoCentavos).toBe(9_000);
  });

  it('descarta categoria sem codigo', () => {
    const categorias: OrcamentoCategoria[] = [
      { cDesCateg: 'Lixo sem codigo', nValorPrevisto: 100, nValorRealilzado: 100 },
      { cCodCateg: '1', cDesCateg: 'Valida', nValorPrevisto: 100, nValorRealilzado: 100 },
    ];

    const resultado = montarOrcamento(2026, 9, categorias);

    expect(resultado.linhas).toHaveLength(1);
    expect(resultado.linhas[0]!.codigo).toBe('1');
  });

  it('decodifica entidade HTML na descricao', () => {
    const categorias: OrcamentoCategoria[] = [
      { cCodCateg: '1', cDesCateg: '&lt;Sem categoria&gt;', nValorPrevisto: 10, nValorRealilzado: 10 },
    ];

    const resultado = montarOrcamento(2026, 9, categorias);

    expect(resultado.linhas[0]!.descricao).toBe('<Sem categoria>');
  });

  it('mes vazio (cliente sem orcamento cadastrado na Omie) nao quebra', () => {
    const resultado = montarOrcamento(2026, 9, []);

    expect(resultado.linhas).toEqual([]);
    expect(resultado.totalPrevistoCentavos).toBe(0);
    expect(resultado.totalRealizadoCentavos).toBe(0);
    expect(resultado.totalDesvioCentavos).toBe(0);
  });

  it('ordena por descricao', () => {
    const categorias: OrcamentoCategoria[] = [
      { cCodCateg: '1', cDesCateg: 'Zebra', nValorPrevisto: 1, nValorRealilzado: 1 },
      { cCodCateg: '2', cDesCateg: 'Abacate', nValorPrevisto: 1, nValorRealilzado: 1 },
    ];

    const resultado = montarOrcamento(2026, 9, categorias);

    expect(resultado.linhas.map((l) => l.descricao)).toEqual(['Abacate', 'Zebra']);
  });
});
