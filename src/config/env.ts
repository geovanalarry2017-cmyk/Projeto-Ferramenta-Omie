import 'dotenv/config';
import { z } from 'zod';

/**
 * Toda configuracao passa por aqui e e validada no boot.
 * Se faltar credencial ou vier lixo no .env, o processo morre na hora com
 * mensagem clara — melhor do que descobrir depois de subir em producao.
 */

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

  // A credencial da Omie NAO fica aqui: e por cliente e vive cifrada no banco
  // (tabela `cliente`). O ambiente guarda so o que e do servidor, valido para
  // todos os clientes.
  OMIE_BASE_URL: z.string().min(1).default('https://app.omie.com.br/api/v1'),

  DATABASE_URL: obrigatoria('String de conexao do Postgres (Neon/Supabase).'),

  CREDENCIAIS_CHAVE: obrigatoria(
    'Chave de 32 bytes que cifra as credenciais dos clientes. Gere com: ' +
      'node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))". ' +
      'Perder esta chave torna as credenciais guardadas irrecuperaveis.',
  ),

  // Assina o cookie de sessao do login por usuario (src/lib/sessao.ts).
  // Diferente da CREDENCIAIS_CHAVE de proposito: nao cifra nada guardado no
  // banco, so autentica o cookie — trocar esta aqui apenas desloga todo mundo.
  SESSAO_CHAVE: obrigatoria(
    'Chave que assina o cookie de sessao dos usuarios. Gere com: ' +
      'node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))".',
  ),

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
