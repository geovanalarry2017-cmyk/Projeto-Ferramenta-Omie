import { Router, type Response } from 'express';
import { apurarOrcamento } from '../../orcamento/service.js';
import { exigirSessao, resolverCliente, type RequisicaoComCliente } from '../middleware.js';

export const rotasOrcamento = Router();

/**
 * Previsto x realizado do mês, por categoria — direto do orçamento de caixa
 * cadastrado na Omie. Diferente das outras rotas de dado, não aceita `de`/`ate`
 * (a Omie só entrega por mês fechado), e sim `ano`/`mes`.
 */
rotasOrcamento.get(
  '/clientes/:cliente/orcamento',
  exigirSessao,
  resolverCliente,
  async (req: RequisicaoComCliente, res: Response): Promise<void> => {
    const ano = Number(req.query.ano);
    const mes = Number(req.query.mes);

    if (!Number.isInteger(ano) || ano < 2000 || ano > 2100) {
      res.status(400).json({ erro: 'Informe ano no formato AAAA.' });
      return;
    }
    if (!Number.isInteger(mes) || mes < 1 || mes > 12) {
      res.status(400).json({ erro: 'Informe mes de 1 a 12.' });
      return;
    }

    res.json(await apurarOrcamento(req.cliente!.id, ano, mes));
  },
);
