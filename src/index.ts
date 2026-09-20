import { env } from './config/env.js';
import { logger } from './lib/logger.js';
import { encerrarPool } from './db/pool.js';
import { criarServidor } from './http/server.js';

const app = criarServidor();
const servidor = app.listen(env.PORT, () => {
  logger.info({ porta: env.PORT }, 'servidor no ar');
});

/** Encerramento limpo: o Render manda SIGTERM antes de trocar a instancia. */
async function encerrar(sinal: string): Promise<void> {
  logger.info({ sinal }, 'encerrando');
  servidor.close();
  await encerrarPool().catch(() => undefined);
  process.exit(0);
}

process.on('SIGTERM', () => void encerrar('SIGTERM'));
process.on('SIGINT', () => void encerrar('SIGINT'));

process.on('unhandledRejection', (motivo) => {
  logger.error({ motivo }, 'promise rejeitada sem tratamento');
});
