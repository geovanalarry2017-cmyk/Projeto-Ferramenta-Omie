import cron from 'node-cron';
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';
import { executarParaTodosClientes, janelaPadrao } from '../conciliacao/service.js';

/**
 * Job diario de conciliacao.
 *
 * Fica desligado por padrao (CRON_ATIVO=false). Ligar so depois de conferir o
 * resultado manualmente com `npm run conciliar` — um matcher mal calibrado
 * rodando sozinho todo dia so produz relatorio errado em volume.
 */

/** Trava simples: se a rodada anterior ainda nao terminou, a proxima nao entra. */
let executando = false;

export function agendarConciliacao(): void {
  if (!env.CRON_ATIVO) {
    logger.warn(
      { expressao: env.CRON_EXPRESSAO },
      'cron desativado (CRON_ATIVO=false) — conciliacao so roda por CLI ou HTTP',
    );
    return;
  }

  if (!cron.validate(env.CRON_EXPRESSAO)) {
    throw new Error(`CRON_EXPRESSAO invalida: "${env.CRON_EXPRESSAO}"`);
  }

  cron.schedule(
    env.CRON_EXPRESSAO,
    () => {
      if (executando) {
        logger.warn('conciliacao anterior ainda em andamento, pulando esta execucao');
        return;
      }

      const { de, ate } = janelaPadrao();
      executando = true;

      void executarParaTodosClientes(de, ate, 'CRON')
        .then(({ sucessos, falhas }) => {
          logger.info(
            {
              clientesOk: sucessos.length,
              clientesComFalha: falhas.length,
              falhas: falhas.length > 0 ? falhas : undefined,
            },
            'conciliacao agendada concluida',
          );
        })
        .catch((erro: Error) => {
          // Nao relancar: excecao dentro do cron derruba o processo inteiro.
          logger.error({ erro: erro.message }, 'conciliacao agendada falhou');
        })
        .finally(() => {
          executando = false;
        });
    },
    { timezone: env.CRON_TIMEZONE },
  );

  logger.info(
    { expressao: env.CRON_EXPRESSAO, timezone: env.CRON_TIMEZONE },
    'conciliacao agendada',
  );
}
