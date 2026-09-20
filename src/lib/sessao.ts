import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Token de sessao de usuario: um JWT minimo, feito com node:crypto para nao
 * trazer dependencia nova (mesma logica de `lib/cripto.ts`). Assinado com
 * HMAC-SHA256 — nao cifra o conteudo (nao ha segredo dentro do payload, so
 * ids e validade), so garante que ninguem forja ou adultera um token sem
 * conhecer a SESSAO_CHAVE.
 */

export interface PayloadSessao {
  usuarioId: number;
  clienteId: number;
  /** Validade em epoch-segundos. */
  exp: number;
}

const SETE_DIAS_EM_SEGUNDOS = 7 * 24 * 60 * 60;

function assinar(corpoB64: string, chave: string): string {
  return createHmac('sha256', chave).update(corpoB64).digest('base64url');
}

export function criarTokenSessao(
  dados: Pick<PayloadSessao, 'usuarioId' | 'clienteId'>,
  chave: string,
  duracaoSegundos = SETE_DIAS_EM_SEGUNDOS,
): string {
  const payload: PayloadSessao = {
    ...dados,
    exp: Math.floor(Date.now() / 1000) + duracaoSegundos,
  };
  const corpoB64 = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  return `${corpoB64}.${assinar(corpoB64, chave)}`;
}

/** Devolve o payload se o token for autentico e ainda valido; senao, null. */
export function verificarTokenSessao(token: string, chave: string): PayloadSessao | null {
  const partes = token.split('.');
  if (partes.length !== 2) return null;
  const [corpoB64, assinatura] = partes as [string, string];

  const esperada = assinar(corpoB64, chave);
  const bufA = Buffer.from(assinatura, 'utf8');
  const bufB = Buffer.from(esperada, 'utf8');
  if (bufA.length !== bufB.length || !timingSafeEqual(bufA, bufB)) return null;

  let payload: PayloadSessao;
  try {
    payload = JSON.parse(Buffer.from(corpoB64, 'base64url').toString('utf8')) as PayloadSessao;
  } catch {
    return null;
  }

  if (
    typeof payload.usuarioId !== 'number' ||
    typeof payload.clienteId !== 'number' ||
    typeof payload.exp !== 'number'
  ) {
    return null;
  }
  if (payload.exp < Math.floor(Date.now() / 1000)) return null;

  return payload;
}
