import type { ClienteComCredenciais, ContaDoCliente } from '../clientes/types.js';
import { buscarComCredenciais, listarClientes } from '../clientes/repository.js';
import { env } from '../config/env.js';
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
 * Tudo e escopado por cliente — nunca ha uma execucao "do sistema".
 */

export interface ResultadoExecucao {
  execucaoId: number;
  cliente: { id: number; slug: string; nome: string };
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

function resumoZerado(): ResumoConciliacao {
  return {
    totalBanco: 0,
    totalOmie: 0,
    conciliados: 0,
    revisar: 0,
    pendenteOmie: 0,
    pendenteBanco: 0,
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
  clienteId: number,
  de: DataISO,
  ate: DataISO,
  disparo: OrigemDisparo = 'MANUAL',
): Promise<ResultadoExecucao> {
  const cliente = await buscarComCredenciais(clienteId);

  if (!cliente) {
    throw new Error(`Cliente ${clienteId} nao encontrado.`);
  }
  if (cliente.contas.length === 0) {
    throw new Error(
      `Cliente "${cliente.slug}" nao tem conta mapeada. ` +
        `Rode: npm run clientes -- mapear --cliente ${cliente.slug}`,
    );
  }

  const execucaoId = await abrirExecucao(clienteId, de, ate, disparo);
  logger.info(
    { execucaoId, cliente: cliente.slug, de, ate, disparo, contas: cliente.contas.length },
    'conciliacao iniciada',
  );

  const total = resumoZerado();
  const porConta: ResultadoExecucao['porConta'] = [];

  try {
    for (const conta of cliente.contas) {
      const { itens, resumo } = await conciliarConta(cliente, conta, de, ate);

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
    logger.info({ execucaoId, cliente: cliente.slug, ...total }, 'conciliacao concluida');

    return {
      execucaoId,
      cliente: { id: cliente.id, slug: cliente.slug, nome: cliente.nome },
      periodo: { de, ate },
      resumo: total,
      porConta,
    };
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    await marcarExecucaoComErro(execucaoId, mensagem).catch(() => undefined);
    logger.error({ execucaoId, cliente: cliente.slug, erro: mensagem }, 'conciliacao falhou');
    throw erro;
  }
}

/**
 * Roda a conciliacao para todos os clientes ativos.
 *
 * A falha de um cliente nao pode derrubar os demais: no job diario, uma
 * credencial expirada num cliente deixaria todos os outros sem conciliacao.
 */
export async function executarParaTodosClientes(
  de: DataISO,
  ate: DataISO,
  disparo: OrigemDisparo = 'CRON',
): Promise<{
  sucessos: ResultadoExecucao[];
  falhas: Array<{ cliente: string; erro: string }>;
}> {
  const clientes = await listarClientes(true);
  const sucessos: ResultadoExecucao[] = [];
  const falhas: Array<{ cliente: string; erro: string }> = [];

  logger.info({ clientes: clientes.length, de, ate }, 'iniciando conciliacao de todos os clientes');

  for (const cliente of clientes) {
    try {
      sucessos.push(await executarConciliacao(cliente.id, de, ate, disparo));
    } catch (erro) {
      const mensagem = erro instanceof Error ? erro.message : String(erro);
      falhas.push({ cliente: cliente.slug, erro: mensagem });
      logger.error({ cliente: cliente.slug, erro: mensagem }, 'cliente falhou, seguindo adiante');
    }
  }

  return { sucessos, falhas };
}

async function conciliarConta(
  cliente: ClienteComCredenciais,
  conta: ContaDoCliente,
  de: DataISO,
  ate: DataISO,
): Promise<{ itens: ItemConciliacao[]; resumo: ResumoConciliacao }> {
  // Os dois lados sao independentes: buscar em paralelo corta quase pela
  // metade o tempo da conta, e o rate limit da Omie ja e tratado no client.
  const [transacoes, extrato] = await Promise.all([
    listarTransacoes(cliente.pluggy, conta.pluggyAccountId, de, ate),
    listarExtrato(cliente.omie, conta.omieCodigoContaCorrente, de, ate),
  ]);

  const movimentosBanco = normalizarTransacoesBanco(transacoes);
  const lancamentosOmie = normalizarMovimentosOmie(extrato.movimentos, {
    sinalPorNatureza: env.OMIE_EXTRATO_SINAL_POR_NATUREZA,
  });

  logger.info(
    {
      cliente: cliente.slug,
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
