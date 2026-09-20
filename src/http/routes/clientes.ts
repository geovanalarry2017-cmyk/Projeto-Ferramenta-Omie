import { Router, type Request, type Response } from 'express';
import { listarClientes } from '../../clientes/repository.js';
import { exigirToken } from '../middleware.js';

export const rotasClientes = Router();

rotasClientes.get(
  '/clientes',
  exigirToken,
  async (_req: Request, res: Response): Promise<void> => {
    // listarClientes devolve ClienteResumo, que nao carrega credencial.
    res.json(await listarClientes());
  },
);
