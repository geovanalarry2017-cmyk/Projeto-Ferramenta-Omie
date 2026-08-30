import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { cifrar, compararSegredos, decifrar, derivarChave } from '../src/lib/cripto.js';

const CHAVE = randomBytes(32);

describe('derivarChave', () => {
  it('aceita hex de 64 caracteres', () => {
    const hex = CHAVE.toString('hex');
    expect(derivarChave(hex).equals(CHAVE)).toBe(true);
  });

  it('aceita base64 de 32 bytes', () => {
    expect(derivarChave(CHAVE.toString('base64')).equals(CHAVE)).toBe(true);
  });

  it('recusa chave de tamanho errado em vez de completar com zeros', () => {
    // Aceitar chave curta silenciosamente daria a impressao de seguranca.
    expect(() => derivarChave('curta')).toThrow(/32 bytes/);
    expect(() => derivarChave('ab'.repeat(20))).toThrow(/32 bytes/);
  });
});

describe('cifrar e decifrar', () => {
  it('faz a volta completa', () => {
    const segredo = 'c2ede89f43676d25448789ad02007201';
    expect(decifrar(cifrar(segredo, CHAVE), CHAVE)).toBe(segredo);
  });

  it('preserva acento e caractere especial', () => {
    const texto = 'senha com acentuação e $ímbolo #1';
    expect(decifrar(cifrar(texto, CHAVE), CHAVE)).toBe(texto);
  });

  it('gera texto cifrado diferente a cada vez', () => {
    // IV aleatorio por chamada: cifrar a mesma credencial duas vezes nao pode
    // gerar o mesmo texto, senao da para saber que dois clientes usam a mesma.
    const a = cifrar('mesmo-segredo', CHAVE);
    const b = cifrar('mesmo-segredo', CHAVE);
    expect(a).not.toBe(b);
    expect(decifrar(a, CHAVE)).toBe(decifrar(b, CHAVE));
  });

  it('nao deixa o segredo aparecer no texto cifrado', () => {
    const cifrado = cifrar('app-secret-visivel', CHAVE);
    expect(cifrado).not.toContain('app-secret-visivel');
  });

  it('falha com chave errada em vez de devolver lixo', () => {
    const cifrado = cifrar('segredo', CHAVE);
    expect(() => decifrar(cifrado, randomBytes(32))).toThrow(/decifrar/i);
  });

  it('detecta adulteracao do texto cifrado', () => {
    // GCM autentica: mexer num byte tem que falhar, nao decifrar torto.
    const cifrado = cifrar('segredo', CHAVE);
    const [iv, tag, dados] = cifrado.split('.') as [string, string, string];
    const adulterado = Buffer.from(dados, 'base64');
    adulterado[0] = adulterado[0]! ^ 0xff;

    expect(() => decifrar([iv, tag, adulterado.toString('base64')].join('.'), CHAVE)).toThrow();
  });

  it('recusa formato invalido', () => {
    expect(() => decifrar('nao-e-cifrado', CHAVE)).toThrow(/invalido/i);
    expect(() => decifrar('a.b', CHAVE)).toThrow(/invalido/i);
  });
});

describe('compararSegredos', () => {
  it('reconhece iguais e diferentes', () => {
    expect(compararSegredos('token-abc', 'token-abc')).toBe(true);
    expect(compararSegredos('token-abc', 'token-abd')).toBe(false);
  });

  it('nao quebra com tamanhos diferentes', () => {
    expect(compararSegredos('curto', 'bem mais comprido')).toBe(false);
    expect(compararSegredos('', 'x')).toBe(false);
  });
});
