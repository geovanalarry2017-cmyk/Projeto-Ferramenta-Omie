import { PluggyClient, type Account, type Item, type Transaction } from 'pluggy-sdk';
import type { CredenciaisPluggy } from '../clientes/types.js';
import type { DataISO } from '../lib/dates.js';
import { logger } from '../lib/logger.js';

/**
 * Wrapper fino sobre o SDK oficial do Pluggy.
 *
 * O SDK ja cuida do que da trabalho: troca clientId/clientSecret pela apiKey
 * (que expira em 2h) e renova sozinho, e itera a paginacao por cursor.
 * Aqui so isolamos o resto do projeto do tipo `PluggyClient`, para o dia em que
 * trocar de agregador (Belvo, Quanto) custar um arquivo e nao o codebase inteiro.
 *
 * Cada cliente do produto tem a sua conta Pluggy, entao ha uma instancia por
 * clientId — nao um singleton. O cache existe porque cada instancia carrega a
 * apiKey de 2h; recriar a cada chamada faria uma autenticacao a mais por
 * requisicao, sem necessidade.
 */

const instancias = new Map<string, PluggyClient>();

export function obterClientePluggy(credenciais: CredenciaisPluggy): PluggyClient {
  const existente = instancias.get(credenciais.clientId);
  if (existente) return existente;

  const novo = new PluggyClient({
    clientId: credenciais.clientId,
    clientSecret: credenciais.clientSecret,
  });

  instancias.set(credenciais.clientId, novo);
  return novo;
}

/** Descarta a instancia em cache — use ao trocar as credenciais de um cliente. */
export function esquecerClientePluggy(clientId: string): void {
  instancias.delete(clientId);
}

/** Contas de um item (uma conexao com uma instituicao financeira). */
export async function listarContas(
  credenciais: CredenciaisPluggy,
  itemId: string,
): Promise<Account[]> {
  const resposta = await obterClientePluggy(credenciais).fetchAccounts(itemId);
  return resposta.results;
}

export function obterItem(credenciais: CredenciaisPluggy, itemId: string): Promise<Item> {
  return obterClientePluggy(credenciais).fetchItem(itemId);
}

/** Uma conta especifica, pelo UUID. */
export function obterConta(
  credenciais: CredenciaisPluggy,
  accountId: string,
): Promise<Account> {
  return obterClientePluggy(credenciais).fetchAccount(accountId);
}

/**
 * Todas as transacoes de uma conta no periodo.
 *
 * Usa `fetchAllTransactions`, que percorre a paginacao por cursor sozinho.
 * O metodo antigo por pagina esta deprecado no SDK e e instavel em listas
 * longas — nao voltar para ele.
 */
export async function listarTransacoes(
  credenciais: CredenciaisPluggy,
  accountId: string,
  de: DataISO,
  ate: DataISO,
): Promise<Transaction[]> {
  const transacoes = await obterClientePluggy(credenciais).fetchAllTransactions(accountId, {
    dateFrom: de,
    dateTo: ate,
  });

  logger.debug(
    { accountId, de, ate, quantidade: transacoes.length },
    'transacoes recuperadas do Pluggy',
  );

  return transacoes;
}

export type { Account, Item, Transaction };
