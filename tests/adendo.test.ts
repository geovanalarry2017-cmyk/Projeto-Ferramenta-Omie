import { describe, expect, it } from 'vitest';
import { adendoLgpdPendente, motivoAdendoPendente } from '../src/lib/adendo.js';

describe('adendoLgpdPendente', () => {
  it('pendente quando nunca houve aceite', () => {
    expect(adendoLgpdPendente({ versao: null, aceitoEm: null })).toBe(true);
  });

  it('pendente quando ha data mas nao ha versao', () => {
    expect(adendoLgpdPendente({ versao: null, aceitoEm: new Date() })).toBe(true);
  });

  it('pendente quando a versao e so espaco em branco', () => {
    expect(adendoLgpdPendente({ versao: '   ', aceitoEm: new Date() })).toBe(true);
  });

  it('pendente quando ha versao mas nao ha data de aceite', () => {
    expect(adendoLgpdPendente({ versao: 'v1', aceitoEm: null })).toBe(true);
  });

  it('nao pendente quando ha versao e data de aceite', () => {
    expect(adendoLgpdPendente({ versao: 'v1', aceitoEm: new Date('2026-09-05') })).toBe(false);
  });
});

describe('motivoAdendoPendente', () => {
  it('nomeia o cliente e o comando para registrar o aceite', () => {
    const msg = motivoAdendoPendente('acme');
    expect(msg).toContain('acme');
    expect(msg).toContain('npm run clientes -- aceite --cliente acme --versao');
  });
});
