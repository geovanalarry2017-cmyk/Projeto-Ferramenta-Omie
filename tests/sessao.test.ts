import { describe, expect, it } from 'vitest';
import { criarTokenSessao, verificarTokenSessao } from '../src/lib/sessao.js';

const CHAVE = 'chave-de-teste-nao-usar-em-producao';

describe('criarTokenSessao e verificarTokenSessao', () => {
  it('faz a volta completa', () => {
    const token = criarTokenSessao({ usuarioId: 7, clienteId: 3 }, CHAVE);
    const payload = verificarTokenSessao(token, CHAVE);
    expect(payload).toMatchObject({ usuarioId: 7, clienteId: 3 });
  });

  it('recusa token assinado com outra chave', () => {
    const token = criarTokenSessao({ usuarioId: 7, clienteId: 3 }, CHAVE);
    expect(verificarTokenSessao(token, 'outra-chave')).toBeNull();
  });

  it('detecta adulteração do corpo', () => {
    const token = criarTokenSessao({ usuarioId: 7, clienteId: 3 }, CHAVE);
    const [corpo, assinatura] = token.split('.') as [string, string];
    const payload = JSON.parse(Buffer.from(corpo, 'base64url').toString('utf8'));
    payload.clienteId = 999; // tenta virar dado de outro cliente
    const corpoAdulterado = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');

    expect(verificarTokenSessao(`${corpoAdulterado}.${assinatura}`, CHAVE)).toBeNull();
  });

  it('expira', () => {
    const token = criarTokenSessao({ usuarioId: 1, clienteId: 1 }, CHAVE, -1);
    expect(verificarTokenSessao(token, CHAVE)).toBeNull();
  });

  it('recusa formato inválido', () => {
    expect(verificarTokenSessao('nao-e-um-token', CHAVE)).toBeNull();
    expect(verificarTokenSessao('a.b.c', CHAVE)).toBeNull();
    expect(verificarTokenSessao('', CHAVE)).toBeNull();
  });
});
