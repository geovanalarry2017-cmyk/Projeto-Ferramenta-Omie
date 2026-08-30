import pg from 'pg';
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';

/**
 * Pool unico de conexoes.
 *
 * Neon e Supabase exigem TLS. `sslmode=require` na URL nao basta para o driver
 * `pg` no Node — ele precisa da opcao `ssl` explicita, senao a conexao cai com
 * "no pg_hba.conf entry ... no encryption".
 */

const precisaSsl = /sslmode=require|neon\.tech|supabase\.(co|com)/i.test(env.DATABASE_URL);

export const pool = new pg.Pool({
  connectionString: env.DATABASE_URL,
  ...(precisaSsl ? { ssl: { rejectUnauthorized: false } } : {}),
  max: 5,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 15_000,
});

pool.on('error', (erro) => {
  // Conexao ociosa derrubada pelo servidor nao deve matar o processo.
  logger.error({ erro: erro.message }, 'erro em conexao ociosa do pool');
});

export async function encerrarPool(): Promise<void> {
  await pool.end();
}
