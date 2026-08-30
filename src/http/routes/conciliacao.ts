import { Router, type Request, type Response } from 'express';
import { listarClientes } from '../../clientes/repository.js';
import { ehDataISO } from '../../lib/dates.js';
import { logger } from '../../lib/logger.js';
import { executarConciliacao, janelaPadrao } from '../../conciliacao/service.js';
import { buscarExecucao, listarExecucoes, listarItens } from '../../db/repository.js';
import {
  exigirToken,
  resolverCliente,
  type RequisicaoComCliente,
} from '../middleware.js';

export const rotasConciliacao = Router();

rotasConciliacao.get(
  '/clientes',
  exigirToken,
  async (_req: Request, res: Response): Promise<void> => {
    // listarClientes devolve ClienteResumo, que nao carrega credencial.
    res.json(await listarClientes());
  },
);

/**
 * Dispara a conciliacao de um cliente.
 *
 * Responde 202 e segue processando: o free tier do Render derruba requisicao
 * longa, e a conciliacao de varios dias passa disso. O resultado se acompanha
 * por GET /clientes/:cliente/conciliacao.
 */
rotasConciliacao.post(
  '/clientes/:cliente/conciliacao/executar',
  exigirToken,
  resolverCliente,
  (req: RequisicaoComCliente, res: Response): void => {
    const cliente = req.cliente!;
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
      mensagem: `Conciliacao de "${cliente.slug}" iniciada.`,
      periodo: { de, ate },
    });

    void executarConciliacao(cliente.id, de, ate, 'HTTP').catch((erro: Error) => {
      logger.error(
        { erro: erro.message, cliente: cliente.slug, de, ate },
        'conciliacao disparada por HTTP falhou',
      );
    });
  },
);

rotasConciliacao.get(
  '/clientes/:cliente/conciliacao',
  exigirToken,
  resolverCliente,
  async (req: RequisicaoComCliente, res: Response): Promise<void> => {
    res.json(await listarExecucoes(req.cliente!.id));
  },
);

rotasConciliacao.get(
  '/clientes/:cliente/conciliacao/:id',
  exigirToken,
  resolverCliente,
  async (req: RequisicaoComCliente, res: Response): Promise<void> => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ erro: 'Id invalido.' });
      return;
    }

    // A busca ja filtra por cliente_id: um id de outro cliente devolve 404,
    // nao os dados dele.
    const execucao = await buscarExecucao(req.cliente!.id, id);
    if (!execucao) {
      res.status(404).json({ erro: 'Execucao nao encontrada para este cliente.' });
      return;
    }

    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    res.json({ execucao, itens: await listarItens(id, status) });
  },
);
