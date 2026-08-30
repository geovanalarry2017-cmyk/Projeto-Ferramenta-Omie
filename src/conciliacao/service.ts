import { env, type ContaMapeada } from '../config/env.js';
import { hojeEmSaoPaulo, somarDias, type DataISO } from '../lib/dates.js';
import { logger } from '../lib/logger.js';
import { formatarBRL } from '../lib/money.js';
import { listarExtrato } from '../omie/financas.js';
import { listarTransacoes } from '../pluggy/client.js';
import {
  abrirExecucao,
  fecharExecucao,
  gravarItens,
  marcarExecucaoComErro,
  type OrigemDisparo,
} from '../db/repository.js';
import { conciliar } from './matcher.js';
import { normalizarMovimentosOmie, normalizarTransacoesBanco } from './normalize.js';
import type { ItemConciliacao, RegrasConciliacao, ResumoConciliacao } from './types.js';

/**
 * Orquestracao: busca os dois lados, normaliza, casa e persiste.
 *
 * Toda a decisao de match esta em matcher.ts; aqui so ha I/O e coordenacao.
 */

export interface ResultadoExecucao {
  execucaoId: number;
  periodo: { de: DataISO; ate: DataISO };
  resumo: ResumoConciliacao;
  porConta: Array<{ conta: string; resumo: ResumoConciliacao }>;
}

function regrasAtuais(): RegrasConciliacao {
  return {
    toleranciaDias: env.CONCILIACAO_TOLERANCIA_DIAS,
    toleranciaValorCentavos: env.CONCILIACAO_TOLERANCIA_VALOR_CENTAVOS,
    scoreMinimo: env.CONCILIACAO_SCORE_MINIMO,
  };
}

/**
 * Janela padrao do job diario: alguns dias para tras, nao so ontem.
 * Lancamento entra no extrato com atraso, e o banco reclassifica movimento
 * pendente depois de compensar — reprocessar a janela captura isso.
 */
export function janelaPadrao(): { de: DataISO; ate: DataISO } {
  const ate = somarDias(hojeEmSaoPaulo(), -1);
  const de = somarDias(ate, -(env.CONCILIACAO_JANELA_DIAS - 1));
  return { de, ate };
}

export async function executarConciliacao(
  de: DataISO,
  ate: DataISO,
  disparo: OrigemDisparo = 'MANUAL',
): Promise<ResultadoExecucao> {
  const contas = env.CONTAS_MAPEADAS;

  if (contas.length === 0) {
    throw new Error(
      'Nenhuma conta em CONTAS_MAPEADAS. Rode `npm run smoke:pluggy` e `npm run smoke:omie` ' +
        'para descobrir os IDs e preencha o .env.',
    );
  }

  const execucaoId = await abrirExecucao(de, ate, disparo);
  logger.info({ execucaoId, de, ate, disparo, contas: contas.length }, 'conciliacao iniciada');

  const total: ResumoConciliacao = {
    totalBanco: 0,
    totalOmie: 0,
    conciliados: 0,
    revisar: 0,
    pendenteOmie: 0,
    pendenteBanco: 0,
  };
  const porConta: ResultadoExecucao['porConta'] = [];

  try {
    for (const conta of contas) {
      const { itens, resumo } = await conciliarConta(conta, de, ate);

      await gravarItens(execucaoId, itens, conta.apelido);

      total.totalBanco += resumo.totalBanco;
      total.totalOmie += resumo.totalOmie;
      total.conciliados += resumo.conciliados;
      total.revisar += resumo.revisar;
      total.pendenteOmie += resumo.pendenteOmie;
      total.pendenteBanco += resumo.pendenteBanco;

      porConta.push({ conta: conta.apelido, resumo });
    }

    await fecharExecucao(execucaoId, total);
    logger.info({ execucaoId, ...total }, 'conciliacao concluida');

    return { execucaoId, periodo: { de, ate }, resumo: total, porConta };
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    await marcarExecucaoComErro(execucaoId, mensagem).catch(() => undefined);
    logger.error({ execucaoId, erro: mensagem }, 'conciliacao falhou');
    throw erro;
  }
}

async function conciliarConta(
  conta: ContaMapeada,
  de: DataISO,
  ate: DataISO,
): Promise<{ itens: ItemConciliacao[]; resumo: ResumoConciliacao }> {
  // Os dois lados sao independentes: buscar em paralelo corta quase pela
  // metade o tempo da conta, e o rate limit da Omie ja e tratado no client.
  const [transacoes, extrato] = await Promise.all([
    listarTransacoes(conta.pluggyAccountId, de, ate),
    listarExtrato(conta.omieCodigoContaCorrente, de, ate),
  ]);

  const movimentosBanco = normalizarTransacoesBanco(transacoes);
  const lancamentosOmie = normalizarMovimentosOmie(extrato.movimentos, {
    sinalPorNatureza: env.OMIE_EXTRATO_SINAL_POR_NATUREZA,
  });

  logger.info(
    {
      conta: conta.apelido,
      de,
      ate,
      transacoesBanco: movimentosBanco.length,
      lancamentosOmie: lancamentosOmie.length,
      saldoOmie: extrato.resposta.nSaldoAtual
        ? formatarBRL(Math.round(extrato.resposta.nSaldoAtual * 100))
        : undefined,
    },
    'dados carregados para conciliacao',
  );

  const resultado = conciliar(movimentosBanco, lancamentosOmie, regrasAtuais());

  return { itens: resultado.itens, resumo: resultado.resumo };
}
