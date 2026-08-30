import { deFormatoOmie, deTimestampISO } from '../lib/dates.js';
import { normalizarDocumento, tokenizarDescricao } from '../lib/documento.js';
import { paraCentavos } from '../lib/money.js';
import type { MovimentoExtrato } from '../omie/types.js';
import type { Transaction } from '../pluggy/client.js';
import type { LancamentoOmie, MovimentoBanco } from './types.js';

/**
 * Traducao dos dois formatos de API para o formato comum.
 *
 * TODO O RISCO DE SINAL MORA NESTE ARQUIVO. Se o conciliador comecar a marcar
 * entrada como saida, e aqui que se corrige — nao no matcher.
 */

// ---------- lado banco (Pluggy) ----------

/**
 * No Pluggy, `type` e a fonte de verdade da direcao (DEBIT = saiu, CREDIT =
 * entrou). O sinal de `amount` varia por conector — alguns mandam debito
 * negativo, outros positivo. Por isso tomamos o modulo e aplicamos o sinal a
 * partir de `type`, que e consistente.
 */
export function normalizarTransacaoBanco(tx: Transaction): MovimentoBanco | null {
  const data = deTimestampISO(tx.date);
  if (!data) return null;

  const magnitude = Math.abs(paraCentavos(tx.amount));
  const valorCentavos = tx.type === 'DEBIT' ? -magnitude : magnitude;

  const descricao = tx.descriptionRaw?.trim() || tx.description?.trim() || '';

  // A contraparte pode estar em qualquer um dos lados, dependendo da direcao.
  const documento =
    normalizarDocumento(tx.paymentData?.payer?.documentNumber?.value) ??
    normalizarDocumento(tx.paymentData?.receiver?.documentNumber?.value) ??
    normalizarDocumento(tx.merchant?.cnpj) ??
    null;

  // O nome da contraparte costuma ser mais distintivo que a descricao crua.
  const nomesContraparte = [
    tx.paymentData?.payer?.name,
    tx.paymentData?.receiver?.name,
    tx.merchant?.name,
    tx.merchant?.businessName,
  ]
    .filter(Boolean)
    .join(' ');

  return {
    id: tx.id,
    data,
    valorCentavos,
    descricao,
    documento,
    tokens: tokenizarDescricao(`${descricao} ${nomesContraparte}`),
  };
}

// ---------- lado Omie ----------

/**
 * Valores de `cNatureza` que representam saida de dinheiro.
 *
 * A documentacao da Omie descreve o campo apenas como "Natureza da operacao",
 * sem listar os valores. Estas sao as convencoes usuais (D = debito,
 * P = pagar, S = saida). Rode `npm run smoke:omie` e confira contra o extrato
 * real antes de confiar: se aparecer um valor fora desta lista, ele cai no
 * caminho do sinal proprio de nValorDocumento.
 */
const NATUREZAS_DE_SAIDA = new Set(['D', 'P', 'S']);
const NATUREZAS_DE_ENTRADA = new Set(['C', 'R', 'E']);

export interface OpcoesNormalizacaoOmie {
  /**
   * true  = a Omie manda valor sempre positivo e o sinal vem de cNatureza.
   * false = nValorDocumento ja vem com sinal proprio.
   */
  sinalPorNatureza: boolean;
}

export function normalizarMovimentoOmie(
  mov: MovimentoExtrato,
  opcoes: OpcoesNormalizacaoOmie,
): LancamentoOmie | null {
  const data = deFormatoOmie(mov.dDataLancamento);
  if (!data) return null;

  const valorCentavos = calcularSinalOmie(mov, opcoes);

  const descricao = [mov.cDesCliente, mov.cRazCliente, mov.cObservacoes, mov.cDesCategoria]
    .filter(Boolean)
    .join(' ')
    .trim();

  return {
    id: String(mov.nCodLancamento),
    data,
    valorCentavos,
    descricao,
    documento: normalizarDocumento(mov.cDocCliente),
    tokens: tokenizarDescricao(descricao),
    jaConciliado: Boolean(mov.dDataConciliacao?.trim()),
  };
}

/** Isolado e exportado justamente para ser o unico ponto a ajustar. */
export function calcularSinalOmie(
  mov: MovimentoExtrato,
  opcoes: OpcoesNormalizacaoOmie,
): number {
  const bruto = paraCentavos(mov.nValorDocumento);

  if (!opcoes.sinalPorNatureza) return bruto;

  const natureza = mov.cNatureza?.trim().toUpperCase() ?? '';
  const magnitude = Math.abs(bruto);

  if (NATUREZAS_DE_SAIDA.has(natureza)) return -magnitude;
  if (NATUREZAS_DE_ENTRADA.has(natureza)) return magnitude;

  // Natureza desconhecida ou vazia: confia no sinal que veio.
  return bruto;
}

export function normalizarMovimentosOmie(
  movimentos: MovimentoExtrato[],
  opcoes: OpcoesNormalizacaoOmie,
): LancamentoOmie[] {
  return movimentos
    .map((m) => normalizarMovimentoOmie(m, opcoes))
    .filter((m): m is LancamentoOmie => m !== null);
}

export function normalizarTransacoesBanco(transacoes: Transaction[]): MovimentoBanco[] {
  return transacoes
    .map(normalizarTransacaoBanco)
    .filter((t): t is MovimentoBanco => t !== null);
}
