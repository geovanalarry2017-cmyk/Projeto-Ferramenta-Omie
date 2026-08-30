import { readFile, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { logger } from '../lib/logger.js';
import { encerrarPool, pool } from './pool.js';

/**
 * Migrador minimo: roda os .sql de migrations/ em ordem alfabetica e registra
 * o que ja rodou. Nao ha down-migration de proposito — reverter schema em
 * producao com script automatico costuma dar mais dor do que resolve.
 */

const AQUI = dirname(fileURLToPath(import.meta.url));
const PASTA_MIGRATIONS = join(AQUI, 'migrations');

async function garantirTabelaDeControle(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      nome        TEXT PRIMARY KEY,
      aplicada_em TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
}

export async function migrar(): Promise<void> {
  await garantirTabelaDeControle();

  const arquivos = (await readdir(PASTA_MIGRATIONS))
    .filter((n) => n.endsWith('.sql'))
    .sort();

  const { rows } = await pool.query<{ nome: string }>('SELECT nome FROM schema_migrations');
  const jaAplicadas = new Set(rows.map((r) => r.nome));

  let aplicadas = 0;

  for (const arquivo of arquivos) {
    if (jaAplicadas.has(arquivo)) {
      logger.debug({ arquivo }, 'migration ja aplicada, pulando');
      continue;
    }

    const sql = await readFile(join(PASTA_MIGRATIONS, arquivo), 'utf8');
    const cliente = await pool.connect();

    try {
      // Cada migration e atomica: ou aplica inteira, ou nao aplica.
      await cliente.query('BEGIN');
      await cliente.query(sql);
      await cliente.query('INSERT INTO schema_migrations (nome) VALUES ($1)', [arquivo]);
      await cliente.query('COMMIT');
      logger.info({ arquivo }, 'migration aplicada');
      aplicadas += 1;
    } catch (erro) {
      await cliente.query('ROLLBACK');
      throw new Error(`Falha na migration ${arquivo}: ${(erro as Error).message}`, { cause: erro });
    } finally {
      cliente.release();
    }
  }

  logger.info({ aplicadas, total: arquivos.length }, 'migrations concluidas');
}

/**
 * true quando este arquivo e o ponto de entrada do processo.
 * Comparar com `file://${argv[1]}` na mao quebra no Windows, onde o caminho vem
 * como C:\... e a URL como file:///C:/... — pathToFileURL resolve isso.
 */
const executadoDiretamente =
  process.argv[1] !== undefined && pathToFileURL(process.argv[1]).href === import.meta.url;

// Executado direto por `npm run db:migrate`.
if (executadoDiretamente) {
  migrar()
    .then(() => encerrarPool())
    .then(() => process.exit(0))
    .catch(async (erro: Error) => {
      logger.error({ erro: erro.message }, 'migracao falhou');
      await encerrarPool().catch(() => undefined);
      process.exit(1);
    });
}
