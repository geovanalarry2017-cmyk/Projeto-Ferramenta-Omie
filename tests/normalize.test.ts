import { describe, expect, it } from 'vitest';
import { calcularSinalOmie, normalizarMovimentoOmie, normalizarTransacaoBanco } from '../src/conciliacao/normalize.js';
import { normalizarDocumento, similaridadeTokens, tokenizarDescricao } from '../src/lib/documento.js';
import { deFormatoOmie, deTimestampISO, diferencaEmDias, paraFormatoOmie } from '../src/lib/dates.js';
import { paraCentavos } from '../src/lib/money.js';
import type { MovimentoExtrato } from '../src/omie/types.js';
import type { Transaction } from '../src/pluggy/client.js';

describe('money', () => {
  it('converte reais para centavos sem erro de float', () => {
    expect(paraCentavos(0.1 + 0.2)).toBe(30);
    expect(paraCentavos(1234.56)).toBe(123_456);
    expect(paraCentavos(-99.9)).toBe(-9_990);
  });

  it('aceita string em formato brasileiro e americano', () => {
    expect(paraCentavos('1.234,56')).toBe(123_456);
    expect(paraCentavos('1234.56')).toBe(123_456);
    expect(paraCentavos('')).toBe(0);
    expect(paraCentavos(null)).toBe(0);
  });
});

describe('datas', () => {
  it('converte entre o formato da Omie e ISO', () => {
    expect(deFormatoOmie('05/08/2026')).toBe('2026-08-05');
    expect(paraFormatoOmie('2026-08-05')).toBe('05/08/2026');
    expect(deFormatoOmie('')).toBeNull();
    expect(deFormatoOmie('2026-08-05')).toBeNull();
  });

  it('extrai a data do timestamp sem deslocar por fuso', () => {
    // O corte e textual justamente para a transacao das 23h nao virar o dia.
    expect(deTimestampISO('2026-08-05T23:30:00.000Z')).toBe('2026-08-05');
    expect(deTimestampISO(new Date('2026-08-05T02:00:00.000Z'))).toBe('2026-08-05');
  });

  it('calcula diferenca em dias', () => {
    expect(diferencaEmDias('2026-08-10', '2026-08-12')).toBe(2);
    expect(diferencaEmDias('2026-08-12', '2026-08-10')).toBe(2);
    expect(diferencaEmDias('2026-03-01', '2026-02-28')).toBe(1);
  });
});

describe('documento', () => {
  it('normaliza CPF e CNPJ para so digitos', () => {
    expect(normalizarDocumento('12.345.678/0001-90')).toBe('12345678000190');
    expect(normalizarDocumento('123.456.789-00')).toBe('12345678900');
  });

  it('descarta documento invalido ou placeholder', () => {
    expect(normalizarDocumento('123')).toBeNull();
    expect(normalizarDocumento('00000000000')).toBeNull();
    expect(normalizarDocumento(null)).toBeNull();
  });

  it('tokeniza removendo acento e palavra generica de extrato', () => {
    const tokens = tokenizarDescricao('PAGAMENTO PIX Distribuição ACME LTDA');
    expect(tokens.has('distribuicao')).toBe(true);
    expect(tokens.has('acme')).toBe(true);
    // "pagamento", "pix" e "ltda" aparecem em toda linha e nao distinguem nada.
    expect(tokens.has('pagamento')).toBe(false);
    expect(tokens.has('pix')).toBe(false);
    expect(tokens.has('ltda')).toBe(false);
  });

  it('mede similaridade entre descricoes', () => {
    const a = tokenizarDescricao('TED ACME DISTRIBUIDORA');
    const b = tokenizarDescricao('Acme Distribuidora Comercio');
    expect(similaridadeTokens(a, b)).toBeGreaterThan(0);
    expect(similaridadeTokens(a, tokenizarDescricao('Zeta Servicos'))).toBe(0);
    expect(similaridadeTokens(new Set(), b)).toBe(0);
  });
});

describe('normalizacao do lado Omie', () => {
  const base: MovimentoExtrato = {
    nCodLancamento: 987,
    dDataLancamento: '10/08/2026',
    nValorDocumento: 150.5,
    cDesCliente: 'Acme Distribuidora',
    cDocCliente: '12.345.678/0001-90',
  };

  it('aplica sinal negativo para natureza de saida', () => {
    expect(calcularSinalOmie({ ...base, cNatureza: 'D' }, { sinalPorNatureza: true })).toBe(-15_050);
    expect(calcularSinalOmie({ ...base, cNatureza: 'P' }, { sinalPorNatureza: true })).toBe(-15_050);
  });

  it('aplica sinal positivo para natureza de entrada', () => {
    expect(calcularSinalOmie({ ...base, cNatureza: 'C' }, { sinalPorNatureza: true })).toBe(15_050);
    expect(calcularSinalOmie({ ...base, cNatureza: 'R' }, { sinalPorNatureza: true })).toBe(15_050);
  });

  it('respeita o sinal original quando a natureza e desconhecida', () => {
    // Rede de seguranca: valor de cNatureza fora do previsto nao pode inverter
    // o sinal silenciosamente.
    expect(calcularSinalOmie({ ...base, nValorDocumento: -150.5, cNatureza: 'X' }, { sinalPorNatureza: true })).toBe(-15_050);
    expect(calcularSinalOmie({ ...base, cNatureza: '' }, { sinalPorNatureza: true })).toBe(15_050);
  });

  it('usa o sinal proprio quando configurado assim', () => {
    expect(calcularSinalOmie({ ...base, nValorDocumento: -150.5, cNatureza: 'C' }, { sinalPorNatureza: false })).toBe(-15_050);
  });

  it('monta o lancamento completo', () => {
    const lanc = normalizarMovimentoOmie(
      { ...base, cNatureza: 'D', dDataConciliacao: '11/08/2026' },
      { sinalPorNatureza: true },
    );

    expect(lanc).not.toBeNull();
    expect(lanc!.id).toBe('987');
    expect(lanc!.data).toBe('2026-08-10');
    expect(lanc!.valorCentavos).toBe(-15_050);
    expect(lanc!.documento).toBe('12345678000190');
    expect(lanc!.jaConciliado).toBe(true);
  });

  it('descarta movimento sem data valida', () => {
    expect(normalizarMovimentoOmie({ ...base, dDataLancamento: '' }, { sinalPorNatureza: true })).toBeNull();
  });

  it('descarta as linhas sinteticas de saldo do extrato', () => {
    // Payload real: listaMovimentos intercala uma linha de saldo por dia,
    // sem nCodLancamento. Sem o filtro, cada dia vira um lancamento fantasma.
    const linhaDeSaldo = {
      cDesCliente: 'SALDO ANTERIOR',
      dDataLancamento: '30/07/2026',
      nSaldo: 0,
      nSaldoPrev: 0,
      nValorDocumento: 0,
    } as MovimentoExtrato;

    expect(normalizarMovimentoOmie(linhaDeSaldo, { sinalPorNatureza: true })).toBeNull();
  });

  it('marca lancamento previsto como nao realizado', () => {
    const lanc = normalizarMovimentoOmie(
      { ...base, cNatureza: 'R', cSituacao: 'Previsto' },
      { sinalPorNatureza: true },
    );

    expect(lanc!.ehPrevisao).toBe(true);
    expect(lanc!.situacao).toBe('Previsto');
  });

  it('nao marca lancamento liquidado como previsao', () => {
    const lanc = normalizarMovimentoOmie(
      { ...base, cNatureza: 'R', cSituacao: 'Liquidado' },
      { sinalPorNatureza: true },
    );

    expect(lanc!.ehPrevisao).toBe(false);
  });
});

describe('normalizacao do lado banco', () => {
  function transacao(parcial: Partial<Transaction>): Transaction {
    return {
      id: 'tx-1',
      accountId: 'conta-1',
      date: new Date('2026-08-10T12:00:00.000Z'),
      description: 'PAGAMENTO',
      descriptionRaw: null,
      type: 'DEBIT',
      amount: 150.5,
      balance: 0,
      currencyCode: 'BRL',
      category: null,
      ...parcial,
    } as Transaction;
  }

  it('usa type e nao o sinal de amount para decidir a direcao', () => {
    // Conectores divergem no sinal de amount; type e consistente.
    expect(normalizarTransacaoBanco(transacao({ type: 'DEBIT', amount: 150.5 }))!.valorCentavos).toBe(-15_050);
    expect(normalizarTransacaoBanco(transacao({ type: 'DEBIT', amount: -150.5 }))!.valorCentavos).toBe(-15_050);
    expect(normalizarTransacaoBanco(transacao({ type: 'CREDIT', amount: 150.5 }))!.valorCentavos).toBe(15_050);
  });

  it('extrai o documento da contraparte', () => {
    const mov = normalizarTransacaoBanco(
      transacao({
        paymentData: {
          receiver: { documentNumber: { value: '12.345.678/0001-90', type: 'CNPJ' } },
          boletoMetadata: null,
        },
      }),
    );

    expect(mov!.documento).toBe('12345678000190');
  });

  it('prefere descriptionRaw quando disponivel', () => {
    const mov = normalizarTransacaoBanco(
      transacao({ description: 'Pagamento', descriptionRaw: 'TED ACME DISTRIBUIDORA' }),
    );

    expect(mov!.descricao).toBe('TED ACME DISTRIBUIDORA');
    expect(mov!.tokens.has('acme')).toBe(true);
  });
});
