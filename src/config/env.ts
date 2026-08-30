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

const contaMapeadaSchema = z.object({
  /** Nome livre so pra aparecer no log, ex: "Itau PJ". */
  apelido: z.string().min(1),
  /** UUID da conta no Pluggy — vem de `npm run smoke:pluggy`. */
  pluggyAccountId: z.string().min(1),
  /** nCodCC da conta corrente na Omie — vem de `npm run smoke:omie`. */
  omieCodigoContaCorrente: z.number().int().positive(),
});

export type ContaMapeada = z.infer<typeof contaMapeadaSchema>;

const jsonDeContas = z
  .string()
  .default('[]')
  .transform((texto, ctx) => {
    try {
      return JSON.parse(texto) as unknown;
    } catch {
      ctx.addIssue({
        code: 'custom',
        message: 'CONTAS_MAPEADAS nao e um JSON valido. Veja o exemplo no .env.example.',
      });
      return z.NEVER;
    }
  })
  .pipe(z.array(contaMapeadaSchema));

/**
 * Variavel obrigatoria com mensagem propria.
 * Sem o `error` explicito, o zod reporta "expected string, received undefined",
 * que nao diz a quem le o que fazer.
 */
const obrigatoria = (ondeConseguir: string) =>
  z
    .string({ error: `ausente. ${ondeConseguir}` })
    .min(1, { message: `vazia. ${ondeConseguir}` });

const envSchema = z.object({
  OMIE_APP_KEY: obrigatoria('Pegue em app.omie.com.br > Configuracoes > APIs.'),
  OMIE_APP_SECRET: obrigatoria('Pegue em app.omie.com.br > Configuracoes > APIs.'),
  OMIE_BASE_URL: z.string().min(1).default('https://app.omie.com.br/api/v1'),

  PLUGGY_CLIENT_ID: obrigatoria('Pegue em dashboard.pluggy.ai > Aplicacao.'),
  PLUGGY_CLIENT_SECRET: obrigatoria('Pegue em dashboard.pluggy.ai > Aplicacao.'),

  DATABASE_URL: obrigatoria('String de conexao do Postgres (Neon/Supabase).'),

  CONTAS_MAPEADAS: jsonDeContas,

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
