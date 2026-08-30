import { describe, expect, it } from 'vitest';
import { ehMensagemDeListaVazia, esperaPorBloqueioTemporario } from '../src/omie/faults.js';

describe('bloqueios temporarios da Omie', () => {
  it('extrai os segundos da mensagem real da API', () => {
    // Mensagem literal capturada da API em 30/08/2026.
    expect(
      esperaPorBloqueioTemporario(
        'ERROR: Consumo redundante detectado. Aguarde 13 segundos para tentar novamente (REDUNDANT).',
      ),
    ).toBe(14); // 13 + 1 de margem
  });

  it('usa margem padrao quando a mensagem nao traz o numero', () => {
    expect(esperaPorBloqueioTemporario('Consumo redundante detectado (REDUNDANT).')).toBe(16);
  });

  it('reconhece a trava de requisicao concorrente', () => {
    // Mensagem literal capturada em 30/08/2026, depois de um processo ser morto
    // no meio de uma chamada: a Omie segue considerando ela em andamento.
    expect(
      esperaPorBloqueioTemporario(
        'ERROR: Já existe uma requisição desse método sendo executada e você pode tentar novamente em alguns instantes. (1)',
      ),
    ).toBe(8);
  });

  it('reconhece a trava mesmo sem acento', () => {
    expect(
      esperaPorBloqueioTemporario('Ja existe uma requisicao desse metodo sendo executada'),
    ).toBe(8);
  });

  it('ignora falhas que nao sao bloqueio temporario', () => {
    // Credencial errada nao pode virar retentativa infinita.
    expect(esperaPorBloqueioTemporario('App Key invalido')).toBeNull();
    expect(esperaPorBloqueioTemporario('Nao existem registros para listar')).toBeNull();
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
