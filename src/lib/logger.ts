import { pino } from 'pino';
import { env } from '../config/env.js';

const emDesenvolvimento = process.env.NODE_ENV !== 'production';

export const logger = pino({
  level: env.LOG_LEVEL,
  // Nunca deixar credencial vazar pro log — o cron roda sozinho e o log fica.
  redact: {
    paths: [
      'app_key',
      'app_secret',
      '*.app_key',
      '*.app_secret',
      'clientId',
      'clientSecret',
      'apiKey',
      'req.headers["x-api-token"]',
      'req.headers.authorization',
    ],
    censor: '[oculto]',
  },
  ...(emDesenvolvimento
    ? {
        transport: {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname' },
        },
      }
    : {}),
});

export type Logger = typeof logger;
