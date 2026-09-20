import { Router, type Response } from 'express';
import { apurarOrcamento } from '../../orcamento/service.js';
import {
  exigirSessao,
  lerPeriodo,
  resolverCliente,
  type RequisicaoComCliente,
} from '../middleware.js';

export const rotasOrcamento = Router();

/**
 * Previsto x realizado do período, por categoria — direto do orçamento de
 * caixa cadastrado na Omie. Mesmos parâmetros `de`/`ate` das outras rotas de
 * dado; por baixo, um mês fechado por vez (a Omie não aceita período livre
 * aqui), somados no service.
 */
rotasOrcamento.get(
  '/clientes/:cliente/orcamento',
  exigirSessao,
  resolverCliente,
  async (req: RequisicaoComCliente, res: Response): Promise<void> => {
    const periodo = lerPeriodo(req, res);
    if (!periodo) return;

    res.json(await apurarOrcamento(req.cliente!.id, periodo.de, periodo.ate));
  },
);
