import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

/**
 * Hash de senha de usuario (login do dashboard).
 *
 * scrypt em vez de bcrypt/argon2 para nao trazer dependencia nova so para
 * isso — node:crypto ja tem tudo que precisa, e o projeto ja usa o modulo
 * para cifrar credencial (lib/cripto.ts). Sal aleatorio por senha: duas
 * pessoas com a mesma senha nunca geram o mesmo hash.
 */

const scryptAsync = promisify(scrypt);

const TAMANHO_SAL = 16;
const TAMANHO_DERIVADO = 64;
const TAMANHO_MINIMO_SENHA = 8;

/** Formato do resultado: base64(sal) . base64(hash), separados por ponto. */
export async function hashSenha(senha: string): Promise<string> {
  if (senha.length < TAMANHO_MINIMO_SENHA) {
    throw new Error(`A senha precisa ter pelo menos ${TAMANHO_MINIMO_SENHA} caracteres.`);
  }

  const sal = randomBytes(TAMANHO_SAL);
  const derivado = (await scryptAsync(senha, sal, TAMANHO_DERIVADO)) as Buffer;
  return [sal.toString('base64'), derivado.toString('base64')].join('.');
}

/**
 * Confere a senha contra o hash guardado.
 * Nunca lanca em senha errada — devolve false, para o chamador sempre tratar
 * "nao bate" e "formato invalido" do mesmo jeito (login invalido).
 */
export async function verificarSenha(senha: string, hash: string): Promise<boolean> {
  const partes = hash.split('.');
  if (partes.length !== 2) return false;

  const [salB64, derivadoB64] = partes as [string, string];
  const sal = Buffer.from(salB64, 'base64');
  const esperado = Buffer.from(derivadoB64, 'base64');
  if (sal.length !== TAMANHO_SAL || esperado.length !== TAMANHO_DERIVADO) return false;

  const derivado = (await scryptAsync(senha, sal, TAMANHO_DERIVADO)) as Buffer;
  return timingSafeEqual(derivado, esperado);
}
