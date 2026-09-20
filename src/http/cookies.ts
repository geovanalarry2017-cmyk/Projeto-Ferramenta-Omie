import type { Request, Response } from 'express';
import { env } from '../config/env.js';

/**
 * Cookie de sessao lido/escrito na mao — o projeto nao tem `cookie-parser`
 * como dependencia, e um cookie so nao justifica trazer uma. HttpOnly sempre
 * (JS da pagina nao pode ler o token); Secure so em producao, senao o
 * `npm run dev` local em http nunca receberia o cookie de volta.
 */

export const NOME_COOKIE_SESSAO = 'omie_sessao';

function atributosComuns(): string[] {
  const atributos = ['HttpOnly', 'Path=/', 'SameSite=Lax'];
  if (env.NODE_ENV === 'production') atributos.push('Secure');
  return atributos;
}

export function lerCookie(req: Request, nome: string): string | null {
  const cabecalho = req.headers.cookie;
  if (!cabecalho) return null;

  for (const parte of cabecalho.split(';')) {
    const separador = parte.indexOf('=');
    if (separador === -1) continue;
    const chave = parte.slice(0, separador).trim();
    if (chave === nome) return decodeURIComponent(parte.slice(separador + 1).trim());
  }
  return null;
}

export function definirCookieSessao(res: Response, token: string, maxIdadeSegundos: number): void {
  const atributos = [
    `${NOME_COOKIE_SESSAO}=${encodeURIComponent(token)}`,
    ...atributosComuns(),
    `Max-Age=${maxIdadeSegundos}`,
  ];
  res.setHeader('Set-Cookie', atributos.join('; '));
}

export function limparCookieSessao(res: Response): void {
  const atributos = [`${NOME_COOKIE_SESSAO}=`, ...atributosComuns(), 'Max-Age=0'];
  res.setHeader('Set-Cookie', atributos.join('; '));
}
