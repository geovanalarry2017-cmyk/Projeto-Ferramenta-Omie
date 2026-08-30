import { Router, type NextFunction, type Request, type Response } from 'express';
import { env } from '../../config/env.js';
import { ehDataISO } from '../../lib/dates.js';
import { logger } from '../../lib/logger.js';
import { executarConciliacao, janelaPadrao } from '../../conciliacao/service.js';
import { buscarExecucao, listarExecucoes, listarItens } from '../../db/repository.js';

export const rotasConciliacao = Router();

/**
 * A conciliacao le dados financeiros e roda por minutos. Deixar o disparo
 * aberto seria convite a abuso, entao exige um token compartilhado.
 * Nao substitui autenticacao de verdade — e o minimo para nao expor o endpoint.
 */
function exigirToken(req: Request, res: Response, next: NextFunction): void {
  const token = req.header('x-api-token');
  if (token !== env.API_TOKEN) {
    res.status(401).json({ erro: 'Token invalido ou ausente no header X-API-Token.' });
    return;
  }
  next();
}

/**
 * Dispara a conciliacao.
 *
 * Responde 202 e segue processando: o free tier do Render derruba requisicao
 * longa, e a conciliacao de varios dias passa disso. O resultado se acompanha
 * por GET /conciliacao/:id.
 */
rotasConciliacao.post(
  '/conciliacao/executar',
  exigirToken,
  (req: Request, res: Response): void => {
    const corpo = req.body as { de?: string; ate?: string } | undefined;
    const padrao = janelaPadrao();
    const de = corpo?.de ?? padrao.de;
    const ate = corpo?.ate ?? padrao.ate;

    if (!ehDataISO(de) || !ehDataISO(ate)) {
      res.status(400).json({ erro: 'Datas devem estar no formato AAAA-MM-DD.' });
      return;
    }
    if (de > ate) {
      res.status(400).json({ erro: 'A data inicial nao pode ser maior que a final.' });
      return;
    }

    res.status(202).json({
      mensagem: 'Conciliacao iniciada. Acompanhe em GET /conciliacao/execucoes.',
      periodo: { de, ate },
    });

    void executarConciliacao(de, ate, 'HTTP').catch((erro: Error) => {
      logger.error({ erro: erro.message, de, ate }, 'conciliacao disparada por HTTP falhou');
    });
  },
);

rotasConciliacao.get(
  '/conciliacao/execucoes',
  exigirToken,
  async (_req: Request, res: Response): Promise<void> => {
    res.json(await listarExecucoes());
  },
);

rotasConciliacao.get(
  '/conciliacao/execucoes/:id',
  exigirToken,
  async (req: Request, res: Response): Promise<void> => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ erro: 'Id invalido.' });
      return;
    }

    const execucao = await buscarExecucao(id);
    if (!execucao) {
      res.status(404).json({ erro: 'Execucao nao encontrada.' });
      return;
    }

    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    res.json({ execucao, itens: await listarItens(id, status) });
  },
);
