import { describe, expect, it } from 'vitest';
import { hashSenha, verificarSenha } from '../src/lib/senha.js';

describe('hashSenha e verificarSenha', () => {
  it('faz a volta completa', async () => {
    const hash = await hashSenha('senha-forte-123');
    expect(await verificarSenha('senha-forte-123', hash)).toBe(true);
  });

  it('recusa senha errada', async () => {
    const hash = await hashSenha('senha-forte-123');
    expect(await verificarSenha('senha-errada', hash)).toBe(false);
  });

  it('gera hash diferente a cada vez (sal aleatório)', async () => {
    const a = await hashSenha('mesma-senha-123');
    const b = await hashSenha('mesma-senha-123');
    expect(a).not.toBe(b);
    expect(await verificarSenha('mesma-senha-123', a)).toBe(true);
    expect(await verificarSenha('mesma-senha-123', b)).toBe(true);
  });

  it('não deixa a senha aparecer no hash', async () => {
    const hash = await hashSenha('segredo-visivel-123');
    expect(hash).not.toContain('segredo-visivel-123');
  });

  it('recusa senha curta demais', async () => {
    await expect(hashSenha('curta')).rejects.toThrow(/8 caracteres/);
  });

  it('não lança em hash de formato inválido — devolve false', async () => {
    expect(await verificarSenha('qualquer', 'nao-e-um-hash')).toBe(false);
    expect(await verificarSenha('qualquer', 'a.b')).toBe(false);
    expect(await verificarSenha('qualquer', '')).toBe(false);
  });
});
