import { pino } from 'pino';
import type { DestinationStream, LoggerOptions } from 'pino';
import { env } from '../config/env.js';
import { redigirTexto, redigirValor } from './redacao.js';

const emDesenvolvimento = process.env.NODE_ENV !== 'production';

const opcoesBase: LoggerOptions = {
  level: env.LOG_LEVEL,
  // Credencial e segredo: apagados por caminho conhecido (rapido, via fast-redact).
  // O cron roda sozinho e o log fica.
  redact: {
    paths: [
      'app_key',
      'app_secret',
      '*.app_key',
      '*.app_secret',
      'clientId',
      'clientSecret',
      'apiKey',
      'senha',
      'password',
      'token',
      '*.senha',
      '*.password',
      '*.token',
      'DATABASE_URL',
      'connectionString',
      'CREDENCIAIS_CHAVE',
      'req.headers["x-api-token"]',
      'req.headers.authorization',
    ],
    censor: '[oculto]',
  },
  // Dado pessoal: mascarado por padrao (CPF/CNPJ/e-mail/telefone/PIX) e os campos
  // de texto livre do extrato/ERP apagados inteiros. `formatters.log` cobre o
  // objeto; `hooks.logMethod` cobre a string da mensagem. Ver lib/redacao.ts.
  formatters: {
    log: (objeto) => redigirValor(objeto) as Record<string, unknown>,
  },
  hooks: {
    logMethod(args, metodo) {
      for (let i = 0; i < args.length; i += 1) {
        const argumento = args[i];
        if (typeof argumento === 'string') {
          args[i] = redigirTexto(argumento);
        }
      }
      return metodo.apply(this, args);
    },
  },
};

const opcoesDesenvolvimento: LoggerOptions = {
  ...opcoesBase,
  transport: {
    target: 'pino-pretty',
    options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname' },
  },
};

/**
 * Cria um logger com a redacao de PII ja ligada.
 * `destino` serve ao teste, que injeta um stream para inspecionar a saida — e,
 * quando presente, desliga o transport bonito (os dois nao coexistem).
 */
export function criarLogger(destino?: DestinationStream) {
  if (destino) return pino(opcoesBase, destino);
  return pino(emDesenvolvimento ? opcoesDesenvolvimento : opcoesBase);
}

export const logger = criarLogger();

export type Logger = typeof logger;
