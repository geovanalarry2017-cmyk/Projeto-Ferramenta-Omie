import { describe, expect, it } from 'vitest';
import { ehMensagemDeListaVazia, esperaPorConsumoRedundante } from '../src/omie/faults.js';

describe('consumo redundante da Omie', () => {
  it('extrai os segundos da mensagem real da API', () => {
    // Mensagem literal capturada da API em 30/08/2026.
    expect(
      esperaPorConsumoRedundante(
        'ERROR: Consumo redundante detectado. Aguarde 13 segundos para tentar novamente (REDUNDANT).',
      ),
    ).toBe(14); // 13 + 1 de margem
  });

  it('usa margem padrao quando a mensagem nao traz o numero', () => {
    expect(esperaPorConsumoRedundante('Consumo redundante detectado (REDUNDANT).')).toBe(16);
  });

  it('ignora falhas que nao sao de consumo redundante', () => {
    expect(esperaPorConsumoRedundante('App Key invalido')).toBeNull();
    expect(esperaPorConsumoRedundante('Nao existem registros para listar')).toBeNull();
  });
});

describe('lista vazia da Omie', () => {
  it('reconhece as variacoes de "sem registros"', () => {
    // A Omie sinaliza periodo sem movimento como erro, nao como array vazio.
    expect(ehMensagemDeListaVazia('Nao existem registros para a listagem!')).toBe(true);
    expect(ehMensagemDeListaVazia('Nao foram encontrados registros')).toBe(true);
    expect(ehMensagemDeListaVazia('Nenhum registro encontrado')).toBe(true);
  });

  it('nao confunde erro real com lista vazia', () => {
    // Se isso passasse, uma credencial errada viraria "conciliado, 0 itens".
    expect(ehMensagemDeListaVazia('App Key invalido')).toBe(false);
    expect(ehMensagemDeListaVazia('Consumo redundante detectado')).toBe(false);
  });
});
