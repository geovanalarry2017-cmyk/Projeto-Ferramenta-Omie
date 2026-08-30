import pg from 'pg';
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';

/**
 * Pool unico de conexoes.
 *
 * Neon e Supabase exigem TLS. `sslmode=require` na URL nao basta para o driver
 * `pg` no Node — ele precisa da opcao `ssl` explicita, senao a conexao cai com
 * "no pg_hba.conf entry ... no encryption".
 *
 * `rejectUnauthorized: true` valida a cadeia do certificado de verdade. Sem
 * isso a conexao continua criptografada, mas aceita qualquer certificado —
 * ou seja, nao protege contra man-in-the-middle, que e justamente o risco de
 * trafegar dado financeiro por rede publica. Neon e Supabase usam certificado
 * de CA publica, entao a validacao passa sem configuracao extra.
 */

const precisaSsl = /sslmode=(require|verify)|neon\.tech|supabase\.(co|com)/i.test(env.DATABASE_URL);

export const pool = new pg.Pool({
  connectionString: env.DATABASE_URL,
  ...(precisaSsl ? { ssl: { rejectUnauthorized: true } } : {}),
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
