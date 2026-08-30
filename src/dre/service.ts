import { buscarComCredenciais } from '../clientes/repository.js';
import type { DataISO } from '../lib/dates.js';
import { logger } from '../lib/logger.js';
import { listarCategorias, listarContasDRE } from '../omie/cadastros.js';
import { listarMovimentos } from '../omie/financas.js';
import { montarDRE, montarFluxoDeCaixa } from './montar.js';
import type { Regime, ResultadoDRE, ResultadoFluxoCaixa } from './types.js';

/**
 * Orquestra a apuracao: busca cadastros e movimentos na Omie, e entrega para a
 * montagem. Toda a regra de calculo vive em montar.ts.
 */

/**
 * Cadastros de DRE e categorias mudam raramente, mas o dashboard e recarregado
 * o tempo todo. Sem cache, cada F5 refaz duas chamadas caras a Omie — e a
 * paginacao de categorias sozinha ja sao varias requisicoes contra uma API que
 * limita taxa e bloqueia chamada repetida.
 */
const TTL_CADASTROS_MS = 10 * 60 * 1000;

interface CadastrosEmCache {
  contasDRE: Awaited<ReturnType<typeof listarContasDRE>>;
  categorias: Awaited<ReturnType<typeof listarCategorias>>;
  expiraEm: number;
}

const cacheCadastros = new Map<number, CadastrosEmCache>();

async function obterCadastros(clienteId: number) {
  const agora = Date.now();
  const emCache = cacheCadastros.get(clienteId);
  if (emCache && emCache.expiraEm > agora) return emCache;

  const cliente = await buscarComCredenciais(clienteId);
  if (!cliente) throw new Error(`Cliente ${clienteId} nao encontrado.`);

  // Sequencial de proposito: a Omie bloqueia chamada repetida em janela curta,
  // e disparar as duas juntas so aumenta a chance de bater no limite.
  const contasDRE = await listarContasDRE(cliente.omie);
  const categorias = await listarCategorias(cliente.omie);

  const novo: CadastrosEmCache = {
    contasDRE,
    categorias,
    expiraEm: agora + TTL_CADASTROS_MS,
  };
  cacheCadastros.set(clienteId, novo);

  logger.debug(
    { clienteId, contasDRE: contasDRE.length, categorias: categorias.length },
    'cadastros de DRE carregados',
  );

  return novo;
}

/** Descarta o cache — usar quando o cliente mexer no plano de contas da Omie. */
export function invalidarCacheCadastros(clienteId?: number): void {
  if (clienteId === undefined) cacheCadastros.clear();
  else cacheCadastros.delete(clienteId);
}

export async function apurarDRE(
  clienteId: number,
  de: DataISO,
  ate: DataISO,
  regime: Regime = 'caixa',
): Promise<ResultadoDRE> {
  const cliente = await buscarComCredenciais(clienteId);
  if (!cliente) throw new Error(`Cliente ${clienteId} nao encontrado.`);

  const { contasDRE, categorias } = await obterCadastros(clienteId);

  if (contasDRE.length === 0) {
    throw new Error(
      'A Omie deste cliente nao tem plano de contas do DRE cadastrado. ' +
        'Configure em Financas > DRE antes de apurar.',
    );
  }

  const movimentos = await listarMovimentos(cliente.omie, de, ate, regime === 'caixa');
  const resultado = montarDRE(contasDRE, categorias, movimentos, { de, ate, regime });

  logger.info(
    {
      cliente: cliente.slug,
      de,
      ate,
      regime,
      movimentos: movimentos.length,
      naoClassificados: resultado.naoClassificado.categorias.length,
    },
    'DRE apurado',
  );

  return resultado;
}

export async function apurarFluxoDeCaixa(
  clienteId: number,
  de: DataISO,
  ate: DataISO,
): Promise<ResultadoFluxoCaixa> {
  const cliente = await buscarComCredenciais(clienteId);
  if (!cliente) throw new Error(`Cliente ${clienteId} nao encontrado.`);

  // Fluxo de caixa e sempre regime de caixa: data de pagamento.
  const movimentos = await listarMovimentos(cliente.omie, de, ate, true);

  return montarFluxoDeCaixa(movimentos, de, ate);
}
