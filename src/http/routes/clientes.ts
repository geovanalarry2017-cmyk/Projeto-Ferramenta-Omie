import { Router, type Response } from 'express';
import { buscarPorId } from '../../clientes/repository.js';
import { exigirSessao, type RequisicaoComSessao } from '../middleware.js';

export const rotasClientes = Router();

/**
 * Lista "os clientes" do usuario logado — hoje isso e sempre um so: o
 * cliente da propria sessao. O dashboard consome esta rota para preencher o
 * seletor de cliente, que existe desde a epoca em que um token so via varios
 * clientes; com login por usuario, cada um so ve o proprio.
 */
rotasClientes.get(
  '/clientes',
  exigirSessao,
  async (req: RequisicaoComSessao, res: Response): Promise<void> => {
    const cliente = await buscarPorId(req.sessao!.clienteId);
    // buscarPorId devolve ClienteResumo, que nao carrega credencial.
    res.json(cliente ? [cliente] : []);
  },
);
