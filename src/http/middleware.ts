import type { NextFunction, Request, Response } from 'express';
import { buscarPorSlug } from '../clientes/repository.js';
import type { ClienteResumo } from '../clientes/types.js';
import { env } from '../config/env.js';
import { adendoLgpdPendente } from '../lib/adendo.js';
import { compararSegredos } from '../lib/cripto.js';
import { type PayloadSessao, verificarTokenSessao } from '../lib/sessao.js';
import { lerCookie, NOME_COOKIE_SESSAO } from './cookies.js';

/** O cliente resolvido pela rota, anexado a requisicao. */
export interface RequisicaoComCliente extends Request {
  cliente?: ClienteResumo;
}

/** A sessao do usuario logado, anexada a requisicao. */
export interface RequisicaoComSessao extends Request {
  sessao?: PayloadSessao;
}

/**
 * Rotas de dado exigem um usuario logado (cookie de sessao — ver
 * src/http/routes/auth.ts). Substitui o antigo token compartilhado: agora
 * cada requisicao carrega qual usuario e qual cliente a fizeram.
 */
export function exigirSessao(
  req: RequisicaoComSessao,
  res: Response,
  next: NextFunction,
): void {
  const token = lerCookie(req, NOME_COOKIE_SESSAO);
  const sessao = token ? verificarTokenSessao(token, env.SESSAO_CHAVE) : null;

  if (!sessao) {
    res.status(401).json({ erro: 'Sessao invalida ou expirada. Faca login novamente.' });
    return;
  }

  req.sessao = sessao;
  next();
}

/**
 * Token compartilhado por header, para automacao/scripts internos (fora do
 * dashboard). As rotas voltadas ao usuario final usam `exigirSessao`.
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
 * Toda rota de dados passa por aqui, depois de `exigirSessao`. Com varios
 * clientes no mesmo banco, uma consulta que nao filtre por cliente entrega
 * dado financeiro de um cliente para outro — e com login por usuario, o
 * :cliente da URL tem que ser o mesmo cliente da sessao, senao um usuario
 * logado poderia so trocar o slug na URL para ver dado de outra empresa.
 */
export async function resolverCliente(
  req: RequisicaoComCliente & RequisicaoComSessao,
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

  if (req.sessao && req.sessao.clienteId !== cliente.id) {
    res.status(403).json({ erro: 'Esta sessao nao pertence a este cliente.' });
    return;
  }

  // Toda rota de dados processa dados pessoais do cliente. Cliente inativo nao
  // e processado — e o caso mais comum e o adendo LGPD ainda nao registrado.
  if (!cliente.ativo) {
    const pendente = adendoLgpdPendente({
      versao: cliente.adendoLgpdVersao,
      aceitoEm: cliente.adendoLgpdAceitoEm,
    });
    res.status(403).json({
      erro: pendente
        ? `Cliente "${slug}": adendo LGPD de operador nao registrado. Tratamento bloqueado ate o aceite.`
        : `Cliente "${slug}" esta desativado.`,
    });
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
