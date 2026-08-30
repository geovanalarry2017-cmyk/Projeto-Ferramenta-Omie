import { Router, type Response } from 'express';
import { apurarDRE, apurarFluxoDeCaixa, invalidarCacheCadastros } from '../../dre/service.js';
import type { Regime } from '../../dre/types.js';
import {
  exigirToken,
  lerPeriodo,
  resolverCliente,
  type RequisicaoComCliente,
} from '../middleware.js';

export const rotasDashboard = Router();

rotasDashboard.get(
  '/clientes/:cliente/dre',
  exigirToken,
  resolverCliente,
  async (req: RequisicaoComCliente, res: Response): Promise<void> => {
    const periodo = lerPeriodo(req, res);
    if (!periodo) return;

    const regime: Regime = req.query.regime === 'competencia' ? 'competencia' : 'caixa';

    res.json(await apurarDRE(req.cliente!.id, periodo.de, periodo.ate, regime));
  },
);

rotasDashboard.get(
  '/clientes/:cliente/fluxo-caixa',
  exigirToken,
  resolverCliente,
  async (req: RequisicaoComCliente, res: Response): Promise<void> => {
    const periodo = lerPeriodo(req, res);
    if (!periodo) return;

    res.json(await apurarFluxoDeCaixa(req.cliente!.id, periodo.de, periodo.ate));
  },
);

/**
 * O plano de contas fica em cache por 10 minutos. Quando o cliente mexe nele
 * na Omie, este endpoint evita ter que esperar o cache vencer.
 */
rotasDashboard.post(
  '/clientes/:cliente/cadastros/recarregar',
  exigirToken,
  resolverCliente,
  (req: RequisicaoComCliente, res: Response): void => {
    invalidarCacheCadastros(req.cliente!.id);
    res.json({ mensagem: 'Cadastros serao recarregados na proxima consulta.' });
  },
);
