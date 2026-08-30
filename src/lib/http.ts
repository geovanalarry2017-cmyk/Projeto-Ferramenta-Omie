import { logger } from './logger.js';

export class ErroHttp extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly corpo: string,
  ) {
    super(message);
    this.name = 'ErroHttp';
  }
}

export interface OpcoesRequisicao {
  timeoutMs?: number;
  tentativas?: number;
  /** Decide se vale a pena tentar de novo. Default: 429 e 5xx. */
  ehRetentavel?: (status: number, corpo: string) => boolean;
}

const RETENTAVEL_PADRAO = (status: number) => status === 429 || status >= 500;

function esperar(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * fetch com timeout e backoff exponencial.
 *
 * As duas APIs deste projeto falham de forma transitoria com alguma frequencia:
 * a Omie limita taxa de requisicao e o Pluggy depende do banco do outro lado.
 * Um job de madrugada que morre no primeiro 502 nao serve.
 */
export async function requisitar(
  url: string,
  init: RequestInit,
  opcoes: OpcoesRequisicao = {},
): Promise<{ status: number; corpo: string }> {
  const { timeoutMs = 30_000, tentativas = 4, ehRetentavel = RETENTAVEL_PADRAO } = opcoes;

  let ultimoErro: unknown;

  for (let tentativa = 1; tentativa <= tentativas; tentativa += 1) {
    const controlador = new AbortController();
    const timer = setTimeout(() => controlador.abort(), timeoutMs);

    try {
      const resposta = await fetch(url, { ...init, signal: controlador.signal });
      const corpo = await resposta.text();

      if (resposta.ok) return { status: resposta.status, corpo };

      if (tentativa < tentativas && ehRetentavel(resposta.status, corpo)) {
        const espera = calcularEspera(tentativa, resposta.headers.get('retry-after'));
        logger.warn(
          { url, status: resposta.status, tentativa, esperaMs: espera },
          'resposta retentavel, tentando de novo',
        );
        await esperar(espera);
        continue;
      }

      throw new ErroHttp(`HTTP ${resposta.status} em ${url}`, resposta.status, corpo);
    } catch (erro) {
      // ErroHttp nao-retentavel sobe direto; o resto (rede, timeout) tenta de novo.
      if (erro instanceof ErroHttp) throw erro;

      ultimoErro = erro;
      if (tentativa < tentativas) {
        const espera = calcularEspera(tentativa, null);
        logger.warn(
          { url, tentativa, esperaMs: espera, erro: (erro as Error).message },
          'falha de rede, tentando de novo',
        );
        await esperar(espera);
        continue;
      }
    } finally {
      clearTimeout(timer);
    }
  }

  throw ultimoErro instanceof Error
    ? ultimoErro
    : new Error(`Falha ao chamar ${url} apos ${tentativas} tentativas`);
}

function calcularEspera(tentativa: number, retryAfter: string | null): number {
  if (retryAfter) {
    const segundos = Number(retryAfter);
    if (Number.isFinite(segundos) && segundos > 0) return Math.min(segundos * 1000, 60_000);
  }
  // 1s, 2s, 4s... com jitter para nao sincronizar retentativas.
  const base = 2 ** (tentativa - 1) * 1000;
  return Math.min(base, 30_000) + Math.floor(Math.random() * 500);
}
