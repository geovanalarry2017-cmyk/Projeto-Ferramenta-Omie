import { Router, type Response } from 'express';
import { apurarOportunidades } from '../../oportunidades/service.js';
import {
  exigirToken,
  lerPeriodo,
  resolverCliente,
  type RequisicaoComCliente,
} from '../middleware.js';

export const rotasOportunidades = Router();

/**
 * Mapa de oportunidades do período.
 *
 * Não aceita `regime`: a análise é sempre de caixa, e oferecer a escolha
 * sugeriria que os alertas fazem sentido por competência — "caixa negativo"
 * apurado assim seria sobre dinheiro que ninguém viu.
 */
rotasOportunidades.get(
  '/clientes/:cliente/oportunidades',
  exigirToken,
  resolverCliente,
  async (req: RequisicaoComCliente, res: Response): Promise<void> => {
    const periodo = lerPeriodo(req, res);
    if (!periodo) return;

    res.json(await apurarOportunidades(req.cliente!.id, periodo.de, periodo.ate));
  },
);
