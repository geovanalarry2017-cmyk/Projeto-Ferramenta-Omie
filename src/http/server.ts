import express, { type NextFunction, type Request, type Response } from 'express';
import { logger } from '../lib/logger.js';
import { pool } from '../db/pool.js';
import { rotasConciliacao } from './routes/conciliacao.js';

/**
 * Falha de conexao do `pg` costuma chegar como AggregateError de mensagem
 * vazia (varias tentativas de socket falharam). Um healthcheck que responde
 * `banco: ""` nao ajuda ninguem a diagnosticar, entao cavamos o motivo real.
 */
function descreverErro(erro: unknown): string {
  if (erro instanceof AggregateError && erro.errors.length > 0) {
    const causas = erro.errors
      .map((e: unknown) => descreverErro(e))
      .filter(Boolean);
    if (causas.length > 0) return causas.join('; ');
  }

  if (erro instanceof Error) {
    const codigo = (erro as NodeJS.ErrnoException).code;
    if (erro.message) return codigo ? `${codigo}: ${erro.message}` : erro.message;
    if (codigo) return codigo;
    return erro.name;
  }

  return String(erro);
}

export function criarServidor() {
  const app = express();

  app.use(express.json({ limit: '1mb' }));

  /**
   * O free tier do Render dorme apos 15 min de inatividade. Este endpoint e o
   * alvo do ping externo que mantem o servico acordado, e tambem o healthcheck
   * da plataforma — por isso confere o banco, nao so responde 200.
   */
  app.get('/health', async (_req: Request, res: Response) => {
    try {
      await pool.query('SELECT 1');
      res.json({ status: 'ok', banco: 'ok' });
    } catch (erro) {
      res.status(503).json({ status: 'degradado', banco: descreverErro(erro) });
    }
  });

  app.use(rotasConciliacao);

  app.use((_req: Request, res: Response) => {
    res.status(404).json({ erro: 'Rota nao encontrada.' });
  });

  // Handler de erro do Express 5 — precisa dos 4 parametros para ser reconhecido.
  app.use((erro: Error, _req: Request, res: Response, _next: NextFunction) => {
    logger.error({ erro: erro.message, stack: erro.stack }, 'erro nao tratado na requisicao');
    res.status(500).json({ erro: 'Erro interno.' });
  });

  return app;
}
