import 'dotenv/config';
import { z } from 'zod';

/**
 * Toda configuracao passa por aqui e e validada no boot.
 * Se faltar credencial ou vier lixo no .env, o processo morre na hora com
 * mensagem clara — melhor do que descobrir as 3h da manha no meio do cron.
 */

/** "true"/"false" no .env viram boolean de verdade. */
const booleano = (padrao: boolean) =>
  z
    .string()
    .default(padrao ? 'true' : 'false')
    .transform((v) => v.trim().toLowerCase() === 'true');

/**
 * Variavel obrigatoria com mensagem propria.
 * Sem o `error` explicito, o zod reporta "expected string, received undefined",
 * que nao diz a quem le o que fazer.
 */
const obrigatoria = (ondeConseguir: string) =>
  z
    .string({ error: `ausente. ${ondeConseguir}` })
    .min(1, { message: `vazia. ${ondeConseguir}` });

/** TLS exigido na string de conexao — Neon aceita qualquer um destes. */
const EXIGE_TLS = /[?&]sslmode=(require|verify-ca|verify-full)(&|$)/;

export const envSchema = z
  .object({
  NODE_ENV: z.string().optional(),

  // As credenciais de Omie e Pluggy NAO ficam aqui: sao por cliente e vivem
  // cifradas no banco (tabela `cliente`). O ambiente guarda so o que e do
  // servidor, valido para todos os clientes.
  OMIE_BASE_URL: z.string().min(1).default('https://app.omie.com.br/api/v1'),

  DATABASE_URL: obrigatoria('String de conexao do Postgres (Neon/Supabase).'),

  CREDENCIAIS_CHAVE: obrigatoria(
    'Chave de 32 bytes que cifra as credenciais dos clientes. Gere com: ' +
      'node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))". ' +
      'Perder esta chave torna as credenciais guardadas irrecuperaveis.',
  ),

  CONCILIACAO_TOLERANCIA_DIAS: z.coerce.number().int().min(0).max(15).default(2),
  CONCILIACAO_TOLERANCIA_VALOR_CENTAVOS: z.coerce.number().int().min(0).default(500),
  CONCILIACAO_SCORE_MINIMO: z.coerce.number().min(0).max(1).default(0.6),
  CONCILIACAO_JANELA_DIAS: z.coerce.number().int().min(1).max(90).default(3),
  OMIE_EXTRATO_SINAL_POR_NATUREZA: booleano(true),

  CRON_ATIVO: booleano(false),
  CRON_EXPRESSAO: z.string().default('0 3 * * *'),
  CRON_TIMEZONE: z.string().default('America/Sao_Paulo'),

  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  API_TOKEN: obrigatoria('Invente um valor secreto; protege o disparo via HTTP.'),
  })
  .superRefine((cfg, ctx) => {
    // Em producao o transporte ate o banco tem que ser cifrado (LGPD art. 46-49).
    // Neon aceita conexao sem TLS se a URL nao pedir — aqui a gente exige.
    if (cfg.NODE_ENV === 'production' && !EXIGE_TLS.test(cfg.DATABASE_URL)) {
      ctx.addIssue({
        code: 'custom',
        path: ['DATABASE_URL'],
        message:
          'em producao a conexao com o Postgres tem que exigir TLS: inclua ' +
          '"?sslmode=require" na URL (LGPD art. 46-49).',
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

function carregar(): Env {
  const resultado = envSchema.safeParse(process.env);

  if (!resultado.success) {
    const problemas = resultado.error.issues
      .map((i) => `  - ${i.path.join('.') || '(raiz)'}: ${i.message}`)
      .join('\n');
    console.error(`\nConfiguracao invalida. Corrija o .env:\n${problemas}\n`);
    process.exit(1);
  }

  return resultado.data;
}

export const env = carregar();
