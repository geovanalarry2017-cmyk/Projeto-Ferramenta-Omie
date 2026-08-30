import type { NextFunction, Request, Response } from 'express';
import { buscarPorSlug } from '../clientes/repository.js';
import type { ClienteResumo } from '../clientes/types.js';
import { env } from '../config/env.js';
import { compararSegredos } from '../lib/cripto.js';

/** O cliente resolvido pela rota, anexado a requisicao. */
export interface RequisicaoComCliente extends Request {
  cliente?: ClienteResumo;
}

/**
 * As rotas leem dados financeiros. Deixa-las abertas seria convite a abuso,
 * entao exigem um token compartilhado. Nao substitui autenticacao de verdade —
 * e o minimo para nao expor os endpoints.
 */
export function exigirToken(req: Request, res: Response, next: NextFunction): void {
  const token = req.header('x-api-token');

  // Comparacao em tempo constante: `!==` vazaria, pelo tempo de resposta,
  // quantos caracteres iniciais bateram.
  if (!token || !compararSegredos(token, env.API_TOKEN)) {
    res.status(401).json({ erro: 'Token invalido ou ausente no header X-API-Token.' });
    return;
  }
  next();
}

/**
 * Resolve :cliente (slug) e anexa a requisicao.
 *
 * Toda rota de dados passa por aqui. Com varios clientes no mesmo banco, uma
 * consulta que nao filtre por cliente entrega dado financeiro de um cliente
 * para outro.
 */
export async function resolverCliente(
  req: RequisicaoComCliente,
  res: Response,
  next: NextFunction,
): Promise<void> {
  // No Express 5 um parametro de rota pode chegar como array; so string serve.
  const slug = req.params.cliente;
  if (typeof slug !== 'string' || slug.length === 0) {
    res.status(400).json({ erro: 'Cliente nao informado na rota.' });
    return;
  }

  const cliente = await buscarPorSlug(slug);
  if (!cliente) {
    res.status(404).json({ erro: `Cliente "${slug}" nao encontrado.` });
    return;
  }

  req.cliente = cliente;
  next();
}

/** Valida e devolve o periodo pedido na query string. */
export function lerPeriodo(
  req: Request,
  res: Response,
): { de: string; ate: string } | null {
  const de = typeof req.query.de === 'string' ? req.query.de : '';
  const ate = typeof req.query.ate === 'string' ? req.query.ate : '';

  if (!/^\d{4}-\d{2}-\d{2}$/.test(de) || !/^\d{4}-\d{2}-\d{2}$/.test(ate)) {
    res.status(400).json({ erro: 'Informe de e ate no formato AAAA-MM-DD.' });
    return null;
  }
  if (de > ate) {
    res.status(400).json({ erro: 'A data inicial nao pode ser maior que a final.' });
    return null;
  }

  return { de, ate };
}
