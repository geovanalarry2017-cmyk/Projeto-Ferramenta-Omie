import { describe, expect, it } from 'vitest';
import { conciliar } from '../src/conciliacao/matcher.js';
import { REGRAS_PADRAO, lancamentoOmie, movimentoBanco } from './helpers.js';

describe('conciliar', () => {
  it('fecha quando valor e data batem exatamente', () => {
    const { itens, resumo } = conciliar(
      [movimentoBanco({ id: 'b1', data: '2026-08-10', valorCentavos: -150_00, descricao: 'PAGAMENTO FORNECEDOR ACME' })],
      [lancamentoOmie({ id: 'o1', data: '2026-08-10', valorCentavos: -150_00, descricao: 'Acme Distribuidora' })],
      REGRAS_PADRAO,
    );

    expect(resumo.conciliados).toBe(1);
    expect(resumo.revisar).toBe(0);
    expect(itens[0]!.status).toBe('CONCILIADO');
    expect(itens[0]!.diferencaCentavos).toBe(0);
  });

  it('manda para revisao quando ha tarifa bancaria na diferenca', () => {
    // Banco debitou R$ 3,00 a mais que o titulo — o caso classico de tarifa.
    const { itens, resumo } = conciliar(
      [movimentoBanco({ id: 'b1', data: '2026-08-10', valorCentavos: -503_00 })],
      [lancamentoOmie({ id: 'o1', data: '2026-08-10', valorCentavos: -500_00 })],
      REGRAS_PADRAO,
    );

    expect(resumo.conciliados).toBe(0);
    expect(resumo.revisar).toBe(1);
    expect(itens[0]!.status).toBe('REVISAR');
    expect(itens[0]!.diferencaCentavos).toBe(-300);
    expect(itens[0]!.motivo).toMatch(/tarifa/i);
  });

  it('nao casa quando a diferenca de valor passa da tolerancia', () => {
    const { resumo } = conciliar(
      [movimentoBanco({ id: 'b1', data: '2026-08-10', valorCentavos: -600_00 })],
      [lancamentoOmie({ id: 'o1', data: '2026-08-10', valorCentavos: -500_00 })],
      REGRAS_PADRAO,
    );

    expect(resumo.pendenteOmie).toBe(1);
    expect(resumo.pendenteBanco).toBe(1);
    expect(resumo.conciliados).toBe(0);
  });

  it('casa com defasagem de data dentro da janela', () => {
    const { itens } = conciliar(
      [movimentoBanco({ id: 'b1', data: '2026-08-12', valorCentavos: 200_00, descricao: 'TED CLIENTE BETA LTDA' })],
      [lancamentoOmie({ id: 'o1', data: '2026-08-10', valorCentavos: 200_00, descricao: 'Beta Comercio' })],
      REGRAS_PADRAO,
    );

    expect(itens[0]!.status).toBe('CONCILIADO');
    expect(itens[0]!.motivo).toMatch(/2 dia/);
  });

  it('nao casa alem da janela de dias', () => {
    const { resumo } = conciliar(
      [movimentoBanco({ id: 'b1', data: '2026-08-15', valorCentavos: 200_00 })],
      [lancamentoOmie({ id: 'o1', data: '2026-08-10', valorCentavos: 200_00 })],
      REGRAS_PADRAO,
    );

    expect(resumo.conciliados).toBe(0);
    expect(resumo.pendenteOmie).toBe(1);
  });

  it('nunca casa entrada com saida, mesmo com valor e data iguais', () => {
    const { resumo } = conciliar(
      [movimentoBanco({ id: 'b1', data: '2026-08-10', valorCentavos: 150_00 })],
      [lancamentoOmie({ id: 'o1', data: '2026-08-10', valorCentavos: -150_00 })],
      REGRAS_PADRAO,
    );

    expect(resumo.conciliados).toBe(0);
    expect(resumo.pendenteOmie).toBe(1);
    expect(resumo.pendenteBanco).toBe(1);
  });

  it('faz atribuicao 1:1 com valores repetidos no mesmo dia', () => {
    // Dois boletos identicos. Sem 1:1, os dois casariam com a mesma transacao
    // e a conciliacao fecharia com um movimento fantasma.
    const { itens, resumo } = conciliar(
      [
        movimentoBanco({ id: 'b1', data: '2026-08-10', valorCentavos: -99_90 }),
        movimentoBanco({ id: 'b2', data: '2026-08-10', valorCentavos: -99_90 }),
      ],
      [
        lancamentoOmie({ id: 'o1', data: '2026-08-10', valorCentavos: -99_90 }),
        lancamentoOmie({ id: 'o2', data: '2026-08-10', valorCentavos: -99_90 }),
      ],
      REGRAS_PADRAO,
    );

    expect(resumo.conciliados).toBe(2);
    expect(resumo.pendenteOmie).toBe(0);
    expect(resumo.pendenteBanco).toBe(0);

    const idsOmieUsados = new Set(itens.map((i) => i.omie?.id));
    expect(idsOmieUsados.size).toBe(2);
  });

  it('sobra vira pendencia quando ha mais no banco que na Omie', () => {
    const { resumo } = conciliar(
      [
        movimentoBanco({ id: 'b1', data: '2026-08-10', valorCentavos: -99_90 }),
        movimentoBanco({ id: 'b2', data: '2026-08-10', valorCentavos: -99_90 }),
      ],
      [lancamentoOmie({ id: 'o1', data: '2026-08-10', valorCentavos: -99_90 })],
      REGRAS_PADRAO,
    );

    expect(resumo.conciliados).toBe(1);
    expect(resumo.pendenteOmie).toBe(1);
    expect(resumo.pendenteBanco).toBe(0);
  });

  it('prefere o par com CPF/CNPJ igual quando o valor empata', () => {
    const { itens } = conciliar(
      [
        movimentoBanco({
          id: 'b1',
          data: '2026-08-10',
          valorCentavos: -300_00,
          documento: '12345678000190',
        }),
      ],
      [
        lancamentoOmie({ id: 'o-errado', data: '2026-08-10', valorCentavos: -300_00, documento: '99999999000199' }),
        lancamentoOmie({ id: 'o-certo', data: '2026-08-10', valorCentavos: -300_00, documento: '12345678000190' }),
      ],
      REGRAS_PADRAO,
    );

    const par = itens.find((i) => i.banco?.id === 'b1');
    expect(par?.omie?.id).toBe('o-certo');
    expect(par?.status).toBe('CONCILIADO');
  });

  it('rebaixa para revisao quando os documentos conhecidos divergem', () => {
    const { itens } = conciliar(
      [movimentoBanco({ id: 'b1', data: '2026-08-10', valorCentavos: -300_00, documento: '12345678000190' })],
      [lancamentoOmie({ id: 'o1', data: '2026-08-10', valorCentavos: -300_00, documento: '99999999000199' })],
      REGRAS_PADRAO,
    );

    expect(itens[0]!.status).toBe('REVISAR');
    expect(itens[0]!.score).toBeLessThan(REGRAS_PADRAO.scoreMinimo);
  });

  it('explica a pendencia de item ja conciliado na Omie', () => {
    const { itens } = conciliar(
      [],
      [lancamentoOmie({ id: 'o1', data: '2026-08-10', valorCentavos: -300_00, jaConciliado: true })],
      REGRAS_PADRAO,
    );

    expect(itens[0]!.status).toBe('PENDENTE_BANCO');
    expect(itens[0]!.motivo).toMatch(/ja marcado como conciliado/i);
  });

  it('e deterministico: mesma entrada, mesmo resultado', () => {
    const banco = [
      movimentoBanco({ id: 'b1', data: '2026-08-10', valorCentavos: -50_00 }),
      movimentoBanco({ id: 'b2', data: '2026-08-11', valorCentavos: -50_00 }),
    ];
    const omie = [
      lancamentoOmie({ id: 'o1', data: '2026-08-10', valorCentavos: -50_00 }),
      lancamentoOmie({ id: 'o2', data: '2026-08-11', valorCentavos: -50_00 }),
    ];

    const primeiro = conciliar(banco, omie, REGRAS_PADRAO);
    const segundo = conciliar(banco, omie, REGRAS_PADRAO);

    const chave = (r: typeof primeiro) =>
      r.itens.map((i) => `${i.banco?.id ?? '-'}:${i.omie?.id ?? '-'}:${i.status}`).join('|');

    expect(chave(primeiro)).toBe(chave(segundo));
  });

  it('lida com listas vazias dos dois lados', () => {
    const { itens, resumo } = conciliar([], [], REGRAS_PADRAO);
    expect(itens).toHaveLength(0);
    expect(resumo.conciliados).toBe(0);
  });
});
