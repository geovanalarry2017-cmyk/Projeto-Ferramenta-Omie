import { PluggyClient, type Account, type Transaction } from 'pluggy-sdk';
import { env } from '../config/env.js';
import type { DataISO } from '../lib/dates.js';
import { logger } from '../lib/logger.js';

/**
 * Wrapper fino sobre o SDK oficial do Pluggy.
 *
 * O SDK ja cuida do que da trabalho: troca clientId/clientSecret pela apiKey
 * (que expira em 2h) e renova sozinho, e itera a paginacao por cursor.
 * Aqui so isolamos o resto do projeto do tipo `PluggyClient`, para o dia em que
 * trocar de agregador (Belvo, Quanto) custar um arquivo e nao o codebase inteiro.
 */

let instancia: PluggyClient | null = null;

export function obterClientePluggy(): PluggyClient {
  if (!instancia) {
    instancia = new PluggyClient({
      clientId: env.PLUGGY_CLIENT_ID,
      clientSecret: env.PLUGGY_CLIENT_SECRET,
    });
  }
  return instancia;
}

/** Contas de um item (uma conexao com uma instituicao financeira). */
export async function listarContas(itemId: string): Promise<Account[]> {
  const resposta = await obterClientePluggy().fetchAccounts(itemId);
  return resposta.results;
}

/** Uma conta especifica, pelo UUID. */
export function obterConta(accountId: string): Promise<Account> {
  return obterClientePluggy().fetchAccount(accountId);
}

/**
 * Todas as transacoes de uma conta no periodo.
 *
 * Usa `fetchAllTransactions`, que percorre a paginacao por cursor sozinho.
 * O metodo antigo por pagina esta deprecado no SDK e e instavel em listas
 * longas — nao voltar para ele.
 */
export async function listarTransacoes(
  accountId: string,
  de: DataISO,
  ate: DataISO,
): Promise<Transaction[]> {
  const transacoes = await obterClientePluggy().fetchAllTransactions(accountId, {
    dateFrom: de,
    dateTo: ate,
  });

  logger.debug(
    { accountId, de, ate, quantidade: transacoes.length },
    'transacoes recuperadas do Pluggy',
  );

  return transacoes;
}

export type { Account, Transaction };
