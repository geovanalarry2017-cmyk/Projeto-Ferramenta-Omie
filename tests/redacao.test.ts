import { describe, expect, it } from 'vitest';
import { redigirTexto, redigirValor } from '../src/lib/redacao.js';

describe('redigirTexto', () => {
  it('mascara CPF com e sem pontuacao', () => {
    expect(redigirTexto('cliente 123.456.789-09 pagou')).toBe('cliente [REDIGIDO:CPF] pagou');
    expect(redigirTexto('doc 12345678909 fim')).toBe('doc [REDIGIDO:CPF] fim');
  });

  it('mascara CNPJ com e sem pontuacao', () => {
    expect(redigirTexto('de 12.345.678/0001-90 para')).toBe('de [REDIGIDO:CNPJ] para');
    expect(redigirTexto('12345678000190')).toBe('[REDIGIDO:CNPJ]');
  });

  it('mascara e-mail', () => {
    expect(redigirTexto('fala com joao.silva@empresa.com.br agora')).toBe(
      'fala com [REDIGIDO:EMAIL] agora',
    );
  });

  it('mascara chave PIX aleatoria (UUID)', () => {
    expect(redigirTexto('pix e2a9c1f0-5b3d-4c7a-9e1f-1a2b3c4d5e6f ok')).toBe(
      'pix [REDIGIDO:UUID] ok',
    );
  });

  it('mascara telefone em formatos comuns', () => {
    expect(redigirTexto('zap +55 11 98765-4321')).toBe('zap [REDIGIDO:TELEFONE]');
    expect(redigirTexto('ligar (11) 3123-4567')).toBe('ligar [REDIGIDO:TELEFONE]');
  });

  it('nao mexe em valor em centavos, data ISO nem score', () => {
    const linha = 'valor 12345 em 2026-09-05 score 0.87';
    expect(redigirTexto(linha)).toBe(linha);
  });

  it('nao corta digitos no meio de um id longo', () => {
    const linha = 'tx 900000000000123456789 fim';
    expect(redigirTexto(linha)).toBe(linha);
  });

  it('deixa texto sem PII e string vazia intactos', () => {
    expect(redigirTexto('')).toBe('');
    expect(redigirTexto('conciliacao concluida')).toBe('conciliacao concluida');
  });
});

describe('redigirValor', () => {
  it('apaga inteiro os campos de texto livre do extrato/ERP', () => {
    const entrada = {
      banco_descricao: 'PIX RECEBIDO DE JOAO DA SILVA',
      omie_descricao: 'Pagto fornecedor Maria',
      historico: 'transferencia recebida',
      observacao: 'cliente ligou',
      complemento: 'ref boleto',
    };
    expect(redigirValor(entrada)).toEqual({
      banco_descricao: '[REDIGIDO]',
      omie_descricao: '[REDIGIDO]',
      historico: '[REDIGIDO]',
      observacao: '[REDIGIDO]',
      complemento: '[REDIGIDO]',
    });
  });

  it('preserva contadores, ids numericos e slug', () => {
    const entrada = { execucaoId: 42, cliente: 'acme', conciliados: 10, revisar: 3, score: 0.9 };
    expect(redigirValor(entrada)).toEqual(entrada);
  });

  it('mascara PII em campo comum via padrao, sem apagar o campo', () => {
    expect(redigirValor({ erro: 'falha ao tratar 123.456.789-09' })).toEqual({
      erro: 'falha ao tratar [REDIGIDO:CPF]',
    });
  });

  it('recorre em objeto aninhado e em array', () => {
    const entrada = { param: [{ filtro: { email: 'a@b.com' }, descricao: 'nome da pessoa' }] };
    expect(redigirValor(entrada)).toEqual({
      param: [{ filtro: { email: '[REDIGIDO:EMAIL]' }, descricao: '[REDIGIDO]' }],
    });
  });

  it('nao entra em laco com referencia circular', () => {
    const raiz: Record<string, unknown> = { rotulo: 'x' };
    raiz.self = raiz;
    const saida = redigirValor(raiz) as Record<string, unknown>;
    expect(saida.self).toBe('[REDIGIDO:CICLO]');
  });

  it('corta profundidade excessiva em vez de recorrer sem fim', () => {
    let no: Record<string, unknown> = { fim: 'ok' };
    for (let i = 0; i < 12; i += 1) no = { filho: no };
    expect(JSON.stringify(redigirValor(no))).toContain('[REDIGIDO:PROFUNDO]');
  });

  it('preserva Date como ISO e Error com a mensagem redigida', () => {
    const quando = new Date('2026-09-05T12:00:00.000Z');
    expect(redigirValor({ quando })).toEqual({ quando: '2026-09-05T12:00:00.000Z' });

    const saida = redigirValor(new Error('cpf 123.456.789-09 invalido')) as Record<string, unknown>;
    expect(saida.message).toBe('cpf [REDIGIDO:CPF] invalido');
  });

  it('deixa identificador tecnico conhecido passar mesmo com cara de UUID', () => {
    const entrada = { accountId: 'e2a9c1f0-5b3d-4c7a-9e1f-1a2b3c4d5e6f' };
    expect(redigirValor(entrada)).toEqual(entrada);
  });

  it('passa primitivo nao-string adiante', () => {
    expect(redigirValor(42)).toBe(42);
    expect(redigirValor(null)).toBe(null);
    expect(redigirValor(true)).toBe(true);
  });
});
