import { beforeAll, describe, expect, it } from 'vitest';

type EnvSchema = (typeof import('../src/config/env.js'))['envSchema'];

let envSchema: EnvSchema;

beforeAll(async () => {
  // `config/env.js` valida o ambiente no boot e mata o processo se faltar algo.
  // Preenche o minimo antes do import (sem sobrepor um .env real, que tambem serve).
  process.env.DATABASE_URL ||= 'postgresql://u:p@localhost/db?sslmode=require';
  process.env.CREDENCIAIS_CHAVE ||= 'a'.repeat(64);
  process.env.SESSAO_CHAVE ||= 'b'.repeat(64);
  process.env.API_TOKEN ||= 'token-de-teste';
  ({ envSchema } = await import('../src/config/env.js'));
});

/** Minimo para o schema passar: so as quatro obrigatorias. */
const base = {
  DATABASE_URL: 'postgresql://u:p@localhost/db',
  CREDENCIAIS_CHAVE: 'a'.repeat(64),
  SESSAO_CHAVE: 'b'.repeat(64),
  API_TOKEN: 'segredo-de-teste',
};

describe('envSchema — TLS obrigatorio no banco em producao', () => {
  it('fora de producao, aceita conexao sem sslmode', () => {
    expect(envSchema.safeParse(base).success).toBe(true);
  });

  it('em producao, recusa DATABASE_URL sem sslmode', () => {
    const r = envSchema.safeParse({ ...base, NODE_ENV: 'production' });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.path.join('.') === 'DATABASE_URL')).toBe(true);
    }
  });

  it('em producao, aceita ?sslmode=require', () => {
    const r = envSchema.safeParse({
      ...base,
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://u:p@host/db?sslmode=require',
    });
    expect(r.success).toBe(true);
  });

  it('em producao, aceita sslmode=verify-full no meio da query', () => {
    const r = envSchema.safeParse({
      ...base,
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://u:p@host/db?sslmode=verify-full&connect_timeout=10',
    });
    expect(r.success).toBe(true);
  });

  it('em producao, "sslmode=disable" nao passa', () => {
    const r = envSchema.safeParse({
      ...base,
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://u:p@host/db?sslmode=disable',
    });
    expect(r.success).toBe(false);
  });
});
